// gh-api.js - makes GitHub behave like the old server.js
import { GH } from "./config.js";

const API = "https://api.github.com";
const TKEY = "bbt_gh_token";

let token = null, me = null, dbCache = null, blobSha = null;
let dirty = new Map(), timer = null, listeners = {};

export const ghHasToken = () => !!(token || localStorage.getItem(TKEY));
export function ghSetToken(t) { token = String(t || "").trim(); localStorage.setItem(TKEY, token); }
export function ghClearToken() { token = null; try { localStorage.removeItem(TKEY); } catch (e) {} }
function tok() { return token || (token = localStorage.getItem(TKEY)); }

function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(out);
}
function b64decode(b64) {
  const bin = atob(String(b64).replace(/\s/g, ""));
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(arr);
}

async function gh(path, opt = {}) {
  const r = await fetch(API + path, { ...opt, headers: {
    Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
    Authorization: "Bearer " + tok(), ...(opt.headers || {}) } });
  if (r.status === 401) { const e = new Error("Your access token is invalid or expired."); e.status = 401; throw e; }
  if (r.status === 403 && r.headers.get("x-ratelimit-remaining") === "0") {
    const e = new Error("GitHub rate limit reached. Wait a few minutes."); e.status = 429; throw e;
  }
  if (r.status === 404) { const e = new Error("Not found - check the repo name in config.js and that your token was approved."); e.status = 404; throw e; }
  if (!r.ok) {
    let m = "GitHub error " + r.status; try { m = (await r.json()).message || m; } catch (e) {}
    const e = new Error(m); e.status = r.status; throw e;
  }
  return r.status === 204 ? null : r.json();
}

const blankDb = () => ({ users: {}, cfg: null, entries: {} });

async function fetchDb() {
  const tree = await gh(`/repos/${GH.owner}/${GH.repo}/git/trees/${GH.branch}`);
  const node = (tree.tree || []).find(n => n.path === GH.path);
  if (!node) return { db: blankDb(), sha: null };
  if (node.sha === blobSha && dbCache) return { db: dbCache, sha: blobSha };
  const blob = await gh(`/repos/${GH.owner}/${GH.repo}/git/blobs/${node.sha}`);
  const text = blob.encoding === "base64" ? b64decode(blob.content) : blob.content;
  let db; try { db = JSON.parse(text); } catch (e) { throw new Error("db.json in the repo is not valid JSON."); }
  return { db: Object.assign(blankDb(), db), sha: node.sha };
}

async function currentSha() {
  const tree = await gh(`/repos/${GH.owner}/${GH.repo}/git/trees/${GH.branch}`);
  const node = (tree.tree || []).find(n => n.path === GH.path);
  return node ? node.sha : null;
}

async function commit(apply, message) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { db, sha } = await fetchDb();
    apply(db);
    const body = { message, content: b64encode(JSON.stringify(db, null, 1)), branch: GH.branch };
    if (sha) body.sha = sha;
    try {
      const res = await gh(`/repos/${GH.owner}/${GH.repo}/contents/${GH.path}`,
        { method: "PUT", body: JSON.stringify(body) });
      dbCache = db; blobSha = res.content.sha;
      return db;
    } catch (e) {
      if (e.status === 409 || e.status === 422) { await new Promise(r => setTimeout(r, 300 + attempt * 400)); continue; }
      throw e;
    }
  }
  throw new Error("Could not save - too many people editing at once. Try again.");
}

function queue(key, fn) {
  dirty.set(key, fn);
  clearTimeout(timer);
  listeners.saving && listeners.saving("Saving…");
  timer = setTimeout(flush, 2500);
}
async function flush() {
  if (!dirty.size) return;
  const batch = [...dirty.values()], n = dirty.size; dirty.clear();
  try {
    await commit(db => batch.forEach(f => f(db)),
      `${me ? me.login : "user"}: update ${n} item${n > 1 ? "s" : ""} via tracker`);
    listeners.saving && listeners.saving("");
  } catch (e) {
    batch.forEach((f, i) => dirty.set("retry" + i, f));
    listeners.saving && listeners.saving("Not saved");
    listeners.error && listeners.error(e.message);
  }
}
export const ghFlushNow = flush;
window.addEventListener("beforeunload", e => { if (dirty.size) { flush(); e.preventDefault(); e.returnValue = ""; } });

export function ghOpenEvents(handlers) {
  listeners = handlers || {};
  setInterval(async () => {
    if (dirty.size || !tok()) return;
    try {
      const sha = await currentSha();
      if (sha && sha !== blobSha) { const f = await fetchDb(); dbCache = f.db; blobSha = f.sha; listeners.reload && listeners.reload(); }
    } catch (e) {}
  }, 20000);
}

const publicUser = u => ({ uid: u.login, name: u.name, email: u.email || "", role: u.role, active: u.active, member: u.member || "" });
function ensureUser(db) {
  let u = db.users[me.login];
  if (!u) {
    const first = Object.keys(db.users).length === 0;
    u = db.users[me.login] = { login: me.login, name: me.name || me.login, email: me.email || "",
      role: first ? "admin" : "user", active: first, member: "", createdAt: Date.now() };
  }
  return u;
}

export async function api(path, method = "GET", body) {
  if (path === "/api/login" && method === "POST") {
    ghSetToken(body.token || body.password);
    try { me = await gh("/user"); }
    catch (e) { ghClearToken(); throw new Error("That token did not work. Check you copied all of it."); }
    const f = await fetchDb(); dbCache = f.db; blobSha = f.sha;
    if (!dbCache.users[me.login]) { await commit(db => { ensureUser(db); }, `${me.login}: first sign-in`); }
    return publicUser(dbCache.users[me.login] || ensureUser(dbCache));
  }
  if (path === "/api/logout") { await flush(); ghClearToken(); me = null; dbCache = null; blobSha = null; return { ok: true }; }
  if (path === "/api/signup") throw new Error("Accounts come from GitHub - ask the admin to add you to the data repo.");
  if (path === "/api/me/password") throw new Error("Your sign-in is managed by GitHub, not by this app.");

  if (!tok()) { const e = new Error("Please sign in."); e.status = 401; throw e; }
  if (!me) me = await gh("/user");
  if (!dbCache) { const f = await fetchDb(); dbCache = f.db; blobSha = f.sha; }

  const myRec = dbCache.users[me.login] || { role: "user", active: false, member: "" };
  const isAdmin = myRec.role === "admin";
  const deny = m => { const e = new Error(m); e.status = 403; throw e; };

  if (path === "/api/me") return publicUser(Object.assign({ login: me.login, name: me.name || me.login }, myRec));
  if (!myRec.active) deny("Waiting for approval.");

  if (path === "/api/state") return { cfg: dbCache.cfg, entries: dbCache.entries,
    users: isAdmin ? Object.values(dbCache.users).map(publicUser) : [] };

  if (path === "/api/entry" && method === "PUT") {
    const e = clean(body);
    if (!isAdmin && (!myRec.member || myRec.member !== e.owner)) deny("You can only edit your own allocation.");
    const id = keyOf(e.date, e.owner, e.project, e.task);
    const empty = !e.est && !e.act && !String(e.comment || "").trim();
    const rec = empty ? null : { ...e, updatedAt: Date.now(), updatedBy: me.login, updatedByName: myRec.name || me.login };
    if (empty) delete dbCache.entries[id]; else dbCache.entries[id] = rec;
    queue(id, db => { if (empty) delete db.entries[id]; else db.entries[id] = rec; });
    return { id, data: rec };
  }

  if (path === "/api/entries/bulk" && method === "POST") {
    if (!isAdmin) deny("Admins only.");
    const items = (body.items || []).map(clean);
    const stamp = e => ({ ...e, updatedAt: Date.now(), updatedBy: me.login, updatedByName: myRec.name || me.login });
    items.forEach(e => { dbCache.entries[keyOf(e.date, e.owner, e.project, e.task)] = stamp(e); });
    await commit(db => items.forEach(e => { db.entries[keyOf(e.date, e.owner, e.project, e.task)] = stamp(e); }),
      `${me.login}: import ${items.length} entries`);
    return { saved: items.length, errors: [] };
  }

  if (path === "/api/config" && method === "PUT") {
    if (!isAdmin) deny("Admins only.");
    dbCache.cfg = body;
    queue("__cfg", db => { db.cfg = body; });
    return { ok: true };
  }

  let m2;
  if ((m2 = path.match(/^\/api\/users\/([^/]+)$/)) && method === "PATCH") {
    if (!isAdmin) deny("Admins only.");
    const login = decodeURIComponent(m2[1]);
    if (login === me.login && (body.role === "user" || body.active === false)) throw new Error("You can't remove your own admin access.");
    Object.assign(dbCache.users[login] || {}, body);
    await commit(db => { const u = db.users[login]; if (u) Object.assign(u, body); }, `${me.login}: update ${login}`);
    return publicUser(dbCache.users[login]);
  }
  if ((m2 = path.match(/^\/api\/users\/([^/]+)$/)) && method === "DELETE") {
    if (!isAdmin) deny("Admins only.");
    const login = decodeURIComponent(m2[1]);
    if (login === me.login) throw new Error("You can't delete yourself.");
    delete dbCache.users[login];
    await commit(db => { delete db.users[login]; }, `${me.login}: remove ${login}`);
    return { ok: true };
  }
  if (path.endsWith("/reset")) throw new Error("Sign-in is managed by GitHub. Ask the person to make a new token.");

  const e = new Error("Not found"); e.status = 404; throw e;
}

const slug = s => String(s).trim().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";
const keyOf = (d, o, p, t) => `${d}~${slug(o)}~${slug(p)}~${slug(t)}`;
function clean(x) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(x.date || "")) throw new Error("Bad date");
  const num = v => { if (v === null || v === "" || v === undefined) return null;
    v = +v; if (isNaN(v) || v < 0 || v > 24) throw new Error("Hours must be between 0 and 24"); return Math.round(v * 100) / 100; };
  const e = { date: x.date, owner: String(x.owner || "").trim(), project: String(x.project || "").trim(),
    task: String(x.task || "").trim(), est: num(x.est), act: num(x.act), comment: String(x.comment || "").slice(0, 1000) };
  if (!e.owner || !e.project || !e.task) throw new Error("Owner, project and task are required");
  return e;
}
