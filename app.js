// =====================================================================
//  BFS/ BES Tracker  –  app.js   (hierarchy + checklist templates)
//  Admin signs in with a GitHub token. The team signs in with a
//  username + passphrase (gh-auth.js). Data lives in a private GitHub
//  repo; gh-api.js does all reading and writing.
// =====================================================================
import { APP_NAME } from "./config.js";
import { api, ghOpenEvents } from "./gh-api.js";
import { ghAddTeamLogin, ghRemoveTeamLogin, ghToken } from "./gh-auth.js";

/* ===================== defaults ===================== */
const DEFAULT_CFG = {
  team: ["Anieya", "Anjali", "Sarath", "Gayathri", "Ann", "Varsha"],
  tasks: ["Project", "Client Meeting", "Preparation", "Internal Tracker", "General"],
  projects: [
    { name: "BES", type: "Client", billable: true, planned: 0, cost: "", sf: "" },
    { name: "BFS", type: "Client", billable: true, planned: 0, cost: "", sf: "" },
    { name: "Lilly", type: "Client", billable: true, planned: 0, cost: "", sf: "" },
    { name: "Internal", type: "Internal", billable: false, planned: 0, cost: "", sf: "" },
    { name: "Project 1", type: "BFS 1 - 25 + Insights", billable: true, planned: 51.75, cost: 8250, sf: "" },
    { name: "Project 2", type: "BFS 6-10", billable: true, planned: 48, cost: 4750, sf: "" },
    { name: "Project 3", type: "BFS 1 - 25 + Analysis", billable: true, planned: 63, cost: "T&M", sf: "" },
    { name: "Project 4", type: "BFS 6-10", billable: true, planned: 48, cost: 4750, sf: "" },
    { name: "Project 5", type: "BFS 1-5", billable: true, planned: 12, cost: 2375, sf: "" },
    { name: "Project 6", type: "BFS 1-5", billable: true, planned: 12, cost: 2375, sf: "" },
    { name: "Project 7", type: "BFS 1-5", billable: true, planned: 12, cost: 2375, sf: "" },
    { name: "Project 8", type: "BFS 1 - 25 (Starter) + Insights", billable: true, planned: 64, cost: 8250, sf: "" },
    { name: "Project 9", type: "BFS 1-5", billable: true, planned: 12, cost: 2375, sf: "" },
    { name: "Project 10", type: "BFS 1-5", billable: true, planned: 12, cost: 2375, sf: "" }],
  assign: { Anieya: ["BES", "Lilly", "BFS", "Internal"], Anjali: ["BFS", "BES", "Lilly", "Internal"], Sarath: ["BES", "Internal"],
            Gayathri: ["BFS", "Lilly", "Internal"], Ann: ["Internal", "Lilly", "BFS"], Varsha: ["BFS", "BES", "Internal"] },
  resIds: {},
  nodes: {}, assigns: [], templates: {},
  bllStart: "2026-05-11", bllWeeks: 34
};
const PCOL = ["--p1", "--p2", "--p3", "--p4", "--p5", "--p6"];

/* ===================== dates ===================== */
const P = s => { const [a, b, c] = s.split("-").map(Number); return new Date(Date.UTC(a, b - 1, c)); };
const I = d => d.toISOString().slice(0, 10);
const add = (s, n) => { const d = P(s); d.setUTCDate(d.getUTCDate() + n); return I(d); };
const dow = s => (P(s).getUTCDay() + 6) % 7;
const monday = s => add(s, -dow(s));
const saturdayEnding = s => add(s, 6 - P(s).getUTCDay());
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const fd = s => { const d = P(s); return `${String(d.getUTCDate()).padStart(2, "0")}-${MON[d.getUTCMonth()]}`; };
const fdl = s => `${DAY[dow(s)]} ${fd(s)}-${P(s).getUTCFullYear()}`;
const today = I(new Date(Date.now() - new Date().getTimezoneOffset() * 6e4));
const h = v => { v = Math.round((+v || 0) * 100) / 100; return v ? String(v) : ""; };
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const slug = s => String(s).trim().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";
const keyOf = (d, o, p, t) => `${d}~${slug(o)}~${slug(p)}~${slug(t)}`;
const keyOfIds = (d, o, pid, tid) => `${d}~${slug(o)}~${pid}~${tid}`;
const $ = id => document.getElementById(id);

/* ===================== state ===================== */
const S = { me: null, profile: null, cfg: structuredClone(DEFAULT_CFG), entries: new Map(), users: [], sharedToken: "" };
const isAdmin = () => S.profile?.role === "admin";
const myMember = () => S.profile?.member || "";
const canEditOwner = o => isAdmin() || (!!myMember() && o === myMember());

/* ===================== auth screens ===================== */
let authMode = "team";
function showAuth() {
  ["auth", "pending", "shell"].forEach(x => $(x).classList.add("hide"));
  $("auth").classList.remove("hide");
  const team = authMode === "team";
  $("authTitle").textContent = team ? "Sign in" : "Admin sign-in";
  $("authSub").textContent = team ? "Use the username and passphrase your admin gave you."
                                  : "Paste your GitHub access token.";
  $("userRow").classList.toggle("hide", !team);
  $("passRow").classList.toggle("hide", !team);
  $("tokRow").classList.toggle("hide", team);
  $("toAdmin").textContent = team ? "Admin sign-in with GitHub token" : "Back to team sign-in";
  $("aErr").textContent = "";
}
$("toAdmin").onclick = () => { authMode = authMode === "team" ? "admin" : "team"; showAuth(); };
$("authForm").onsubmit = async e => {
  e.preventDefault();
  $("aErr").textContent = ""; $("aBtn").disabled = true;
  try {
    if (authMode === "admin") await api("/api/login", "POST", { token: $("aPw").value.trim() });
    else await api("/api/login", "POST", { username: $("aUser").value.trim(), passphrase: $("aPass").value.trim() });
    await boot();
  } catch (err) { $("aErr").textContent = err.message || "Something went wrong."; }
  $("aBtn").disabled = false;
};
async function logout() { try { await api("/api/logout", "POST"); } catch (e) {} location.reload(); }
$("pendingOut").onclick = logout;
$("signOut").onclick = logout;

/* ===================== start-up + realtime ===================== */
let es = null;
function showPending() { ["auth", "shell"].forEach(x => $(x).classList.add("hide")); $("pending").classList.remove("hide"); }
async function loadState() {
  const st = await api("/api/state");
  if (st.cfg) S.cfg = { ...DEFAULT_CFG, ...st.cfg };
  S.entries = new Map(Object.entries(st.entries || {}));
  S.users = st.users || [];
  S.sharedToken = st.sharedToken || "";
  const fresh = migrateToNodes();
  const moved = migrateEntries();
  syncLegacy(); decorate();
  if ((fresh || moved) && isAdmin()) {
    saveCfg();
    if (moved) { try { await api("/api/entries/replace", "POST", { entries: Object.fromEntries(S.entries) }); } catch (e) {} }
  }
}
async function boot() {
  try { S.profile = await api("/api/me"); } catch (e) { showAuth(); return; }
  S.me = { uid: S.profile.uid };
  openEvents();
  if (!S.profile.active) { showPending(); return; }
  await loadState(); startApp();
}
function openEvents() {
  if (es) return;
  es = true;
  ghOpenEvents({
    saving: t => setSync(t ? t : undefined),
    error:  m => toast(m),
    reload: async () => {
      const was = S.profile;
      try { S.profile = await api("/api/me"); } catch (e) { return; }
      if (!S.profile.active) { started = false; showPending(); return; }
      await loadState();
      if (!was.active || was.role !== S.profile.role || was.member !== S.profile.member) { started = false; startApp(); return; }
      softRender();
    }
  });
}

/* ===================== app shell ===================== */
let started = false;
function startApp() {
  $("pending").classList.add("hide"); $("auth").classList.add("hide"); $("shell").classList.remove("hide");
  $("meName").textContent = S.profile.name + (S.profile.member && S.profile.member !== S.profile.name ? ` (${S.profile.member})` : "");
  $("meRole").textContent = isAdmin() ? "Admin" : "User"; $("meRole").className = "role" + (isAdmin() ? " admin" : "");
  U.alUser = U.alUser || myMember() || S.cfg.team[0]; U.sfUser = U.sfUser || myMember() || S.cfg.team[0];
  U.bllUser = U.bllUser || (isAdmin() ? "__all" : myMember());
  if (!isAdmin()) U.alUser = myMember();
  if (started) { route(); return; }
  started = true; setSync(); route();
}
function setSync(t) { $("sync").textContent = t || "● Live"; }

const pending = new Map(); let cfgTimer = null;
function setEntry(d, o, pid, tid, patch) {
  if (!canEditOwner(o)) { toast("You can only edit your own allocation."); return; }
  const m = node(pid), t = node(tid); if (!m || !t) return;
  const k = keyOfIds(d, o, pid, tid);
  const cur = S.entries.get(k) || { date: d, owner: o, pid, tid, project: dispName(m), task: dispName(t), est: null, act: null, comment: "" };
  const nx = { ...cur, ...patch, project: dispName(m), task: dispName(t),
               updatedAt: Date.now(), updatedBy: S.me.uid, updatedByName: S.profile.name };
  const empty = !(+nx.est) && !(+nx.act) && !String(nx.comment || "").trim();
  if (empty) S.entries.delete(k); else S.entries.set(k, nx);
  clearTimeout(pending.get(k)); setSync("Saving…");
  pending.set(k, setTimeout(async () => {
    pending.delete(k);
    try { const r = await api("/api/entry", "PUT", { date: d, owner: o, pid, tid, project: nx.project, task: nx.task, est: nx.est, act: nx.act, comment: nx.comment });
          if (!pending.has(k)) { if (r.data) S.entries.set(k, r.data); else S.entries.delete(k); } }
    catch (e) { setSync("Not saved"); toast(e.status === 403 ? "Not allowed – you can only edit your own rows." : "Couldn’t save: " + e.message); }
  }, 500));
}
function saveCfg() {
  if (!isAdmin()) return;
  clearTimeout(cfgTimer); setSync("Saving…");
  cfgTimer = setTimeout(async () => { try { await api("/api/config", "PUT", S.cfg); } catch (e) { toast("Couldn’t save setup: " + e.message); } }, 600);
}

/* ===================== derived ===================== */
const proj = n => S.cfg.projects.find(p => p.name === n);
const isBill = n => { const p = proj(n); return p ? !!p.billable : n !== "Internal"; };
const color = o => `var(${PCOL[Math.max(0, S.cfg.team.indexOf(o)) % 6]})`;
function rows(f = {}) {
  const out = [];
  for (const e of S.entries.values()) {
    const o = String(e.owner).trim();
    if (f.owner && f.owner !== "__all" && o !== f.owner) continue;
    if (f.from && e.date < f.from) continue; if (f.to && e.date > f.to) continue;
    if (f.project && f.project !== "__all" && e.project !== f.project) continue;
    out.push(e);
  }
  return out;
}
const sum = (a, k) => a.reduce((s, e) => s + (+e[k] || 0), 0);
const weeks = () => Array.from({ length: +S.cfg.bllWeeks || 34 }, (_, i) => add(monday(S.cfg.bllStart), 7 * i));
const workdays = (a, b) => { const out = []; for (let d = a; d <= b && out.length < 400; d = add(d, 1)) if (dow(d) < 5) out.push(d); return out; };

/* ===================== HIERARCHY (3 levels, permanent IDs) ===================== */
const TOP_DEFAULT = [
  { id: "BFS", name: "BFS",      mode: "project" },
  { id: "BES", name: "BES",      mode: "project" },
  { id: "INT", name: "Internal", mode: "primary" }
];
function nodes() { return (S.cfg.nodes ??= {}); }
const node = id => nodes()[id];
const childrenOf = (pid, kind) => Object.values(nodes())
  .filter(n => n.parent === pid && (!kind || n.kind === kind))
  .sort((a, b) => (a.ord || 0) - (b.ord || 0) || String(a.name).localeCompare(String(b.name)));
const tops = () => Object.values(nodes()).filter(n => n.kind === "top").sort((a, b) => (a.ord || 0) - (b.ord || 0));
const midLabel  = t => t && t.mode === "primary" ? "Primary task"   : "Project";
const taskLabel = t => t && t.mode === "primary" ? "Secondary task" : "Task";
const topOf = n => { let x = n, g = 0; while (x && x.kind !== "top" && g++ < 5) x = node(x.parent); return x; };
const activeOn = (as, d) => (!as.from || d >= as.from) && (!as.to || d <= as.to);

function nextId(prefix, pad = 3) {
  let i = 1;
  while (nodes()[prefix + String(i).padStart(pad, "0")]) i++;
  return prefix + String(i).padStart(pad, "0");
}
function addTop(name) {
  const base = (slug(name).toUpperCase().replace(/-/g, "").slice(0, 6)) || "TOP";
  let id = base, i = 2; while (nodes()[id]) id = base + (i++);
  nodes()[id] = { id, kind: "top", name, mode: "project", hidden: false, ord: tops().length + 1 };
  return id;
}
function addMid(topId, name) {
  const id = nextId(topId + "_PRJ_");
  nodes()[id] = { id, kind: "mid", parent: topId, name, billable: topId !== "INT",
                  planned: 0, cost: "", sf: "", type: "", hidden: false, ord: childrenOf(topId, "mid").length + 1 };
  return id;
}
function addTask(midId, name) {
  const id = nextId(midId + "_TSK_");
  nodes()[id] = { id, kind: "task", parent: midId, name,
                  billable: node(midId) ? node(midId).billable !== false : true,
                  hidden: false, ord: childrenOf(midId, "task").length + 1 };
  return id;
}
function migrateToNodes() {
  if (S.cfg.nodes && Object.keys(S.cfg.nodes).length) return false;
  S.cfg.nodes = {};
  TOP_DEFAULT.forEach((t, i) => { S.cfg.nodes[t.id] = { ...t, kind: "top", hidden: false, ord: i + 1 }; });
  const map = {};
  (S.cfg.projects || []).forEach(p => {
    const n = String(p.name), ty = String(p.type || "");
    let topId = "BFS";
    if (/^bes$/i.test(n) || /\bBES\b/i.test(ty)) topId = "BES";
    if (/^internal$/i.test(n) || /internal/i.test(ty)) topId = "INT";
    const id = addMid(topId, n);
    Object.assign(S.cfg.nodes[id], { billable: !!p.billable, planned: +p.planned || 0,
      cost: p.cost ?? "", sf: p.sf || "", type: ty });
    map[n] = id;
    (S.cfg.tasks || []).forEach(t => addTask(id, t));
  });
  S.cfg.nameMap = map;
  S.cfg.assigns = [];
  Object.entries(S.cfg.assign || {}).forEach(([person, list]) =>
    (list || []).forEach(pn => { if (map[pn]) S.cfg.assigns.push({ person, node: map[pn], from: "", to: "" }); }));
  return true;
}
function syncLegacy() {
  const mids = Object.values(nodes()).filter(n => n.kind === "mid" && !n.hidden);
  if (mids.length) {
    S.cfg.projects = mids.map(n => ({ name: n.name, type: n.type || (node(n.parent) || {}).name || "",
      billable: !!n.billable, planned: +n.planned || 0, cost: n.cost ?? "", sf: n.sf || "" }));
    const tn = [...new Set(Object.values(nodes()).filter(n => n.kind === "task" && !n.hidden).map(n => n.name))];
    if (tn.length) S.cfg.tasks = tn;
  }
  const a = {};
  (S.cfg.assigns || []).forEach(x => {
    const n = node(x.node); if (!n || n.hidden) return;
    if (!activeOn(x, today)) return;
    (a[x.person] ??= []); if (!a[x.person].includes(n.name)) a[x.person].push(n.name);
  });
  if (Object.keys(a).length) S.cfg.assign = a;
}
function saveNodes() { syncLegacy(); saveCfg(); }
async function pushGenerated() {
  try { await api("/api/entries/replace", "POST", { entries: Object.fromEntries(S.entries) }); }
  catch (e) { toast("Saved the plan, but entries did not upload: " + e.message); }
}
const dispName = n => n ? (n.alias || n.name) : "";

function decorate() {
  for (const e of S.entries.values()) {
    if (!e.pid) continue;
    const m = node(e.pid), t = node(e.tid);
    if (m) e.project = dispName(m);
    if (t) e.task = dispName(t);
  }
}
function migrateEntries() {
  const out = new Map(); let moved = 0;
  for (const [k, e] of S.entries) {
    if (e.pid && e.tid && node(e.pid) && node(e.tid)) { out.set(k, e); continue; }
    let mid = Object.values(nodes()).find(n => n.kind === "mid" && (n.name === e.project || n.alias === e.project));
    if (!mid) { const id = addMid(/^internal$/i.test(e.project || "") ? "INT" : "BFS", e.project || "Unsorted"); mid = nodes()[id]; }
    let tsk = childrenOf(mid.id, "task").find(n => n.name === e.task || n.alias === e.task);
    if (!tsk) { const id = addTask(mid.id, e.task || "General"); tsk = nodes()[id]; }
    out.set(keyOfIds(e.date, e.owner, mid.id, tsk.id),
      { ...e, pid: mid.id, tid: tsk.id, project: dispName(mid), task: dispName(tsk) });
    moved++;
  }
  S.entries = out;
  return moved;
}
