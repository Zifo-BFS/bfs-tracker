// =====================================================================
//  BFS/ BES Tracker  –  app.js   (Stage 2: three-level hierarchy)
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
  nodes: {}, assigns: [],
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
function midsFor(person, d) {
  const all = Object.values(nodes()).filter(n => n.kind === "mid" && !n.hidden);
  const mine = (S.cfg.assigns || []).filter(a => a.person === person && activeOn(a, d))
    .map(a => node(a.node)).filter(n => n && !n.hidden);
  const hasAny = (S.cfg.assigns || []).some(a => a.person === person);
  const ids = new Set((hasAny ? mine : all).map(n => n.id));
  for (const e of S.entries.values())
    if (e.owner === person && e.date === d && e.pid && node(e.pid)) ids.add(e.pid);
  return [...ids].map(id => node(id)).filter(Boolean)
    .sort((a, b) => ((topOf(a) || {}).ord || 0) - ((topOf(b) || {}).ord || 0) || (a.ord || 0) - (b.ord || 0));
}
function tasksFor(mid, person, d) {
  const ids = new Set(childrenOf(mid.id, "task").filter(t => !t.hidden).map(t => t.id));
  for (const e of S.entries.values())
    if (e.owner === person && e.date === d && e.pid === mid.id && e.tid && node(e.tid)) ids.add(e.tid);
  return [...ids].map(id => node(id)).filter(Boolean).sort((a, b) => (a.ord || 0) - (b.ord || 0));
}

/* ===================== routing / permissions ===================== */
const ALL_VIEWS = [
  ["dash", "Analysis", "admin"], ["alloc", "Allocation", "all"], ["bll", "BLL Tracker", "all"], ["sf", "Salesforce", "all"],
  ["prima", "Prima", "admin"], ["reports", "Reports", "admin"], ["set", "Setup", "admin"], ["users", "Users", "admin"]];
const views = () => ALL_VIEWS.filter(v => v[2] === "all" || isAdmin());
const U = { view: "", anFrom: monday(today), anTo: add(monday(today), 4), alUser: "", alFrom: monday(today), alTo: add(monday(today), 4),
  bllUser: "", bllMode: "logged", sfUser: "", sfWeek: saturdayEnding(today), prUser: "__all", prWeek: monday(today),
  rpType: "summary", rpFrom: monday(today), rpTo: add(monday(today), 4), rpUser: "__all", rpProj: "__all" };
function nav() { $("nav").innerHTML = views().map(([k, l]) => `<button data-v="${k}" class="${U.view === k ? "on" : ""}">${l}</button>`).join(""); }
$("nav").onclick = e => { const v = e.target.dataset.v; if (v) { location.hash = v; } };
window.addEventListener("hashchange", route);
function route() {
  if (!S.profile || !S.profile.active) return;
  const hv = location.hash.slice(1), vs = views();
  U.view = vs.some(v => v[0] === hv) ? hv : (isAdmin() ? "dash" : "alloc");
  if (!isAdmin()) U.alUser = myMember();
  nav();
  const fn = { dash: vDash, alloc: vAlloc, bll: vBll, sf: vSf, prima: vPrima, reports: vReports, set: vSet, users: vUsers }[U.view];
  $("app").innerHTML = fn(); bind();
}
let dirty = false;
function softRender() {
  if (!started) return;
  const ae = document.activeElement;
  if (ae && ae.closest && ae.closest("#app") && /INPUT|SELECT/.test(ae.tagName) && U.view !== "dash") { dirty = true; return; }
  route();
}
document.addEventListener("focusout", () => setTimeout(() => {
  if (dirty && !(document.activeElement && /INPUT|SELECT/.test(document.activeElement.tagName))) { dirty = false; route(); } }, 60));
function toast(t) { const el = $("toast"); el.textContent = t; el.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 2800); }
const userOpts = (sel, all) => (all ? `<option value="__all" ${sel === "__all" ? "selected" : ""}>Whole team</option>` : "") +
  S.cfg.team.map(u => `<option ${u === sel ? "selected" : ""}>${esc(u)}</option>`).join("");
const projOpts = sel => `<option value="__all">All projects</option>` + S.cfg.projects.map(p => `<option ${p.name === sel ? "selected" : ""}>${esc(p.name)}</option>`).join("");
const viewOnly = () => isAdmin() ? "" : `<span class="ro">View only</span>`;

/* ===================== ANALYSIS (admin) ===================== */
function analyse(from, to, owner = "__all", project = "__all") {
  const R = rows({ from, to, owner, project }), days = workdays(from, to);
  const team = owner === "__all" ? S.cfg.team : [owner];
  const per = team.map(u => {
    const r = R.filter(e => String(e.owner).trim() === u);
    const byDay = days.map(d => sum(r.filter(e => e.date === d), "est"));
    return { u, est: sum(r, "est"), act: sum(r, "act"), bill: sum(r.filter(e => isBill(e.project)), "act"),
             ok: byDay.filter(x => Math.abs(x - 8) < .01).length, byDay, actDay: days.map(d => sum(r.filter(e => e.date === d), "act")) };
  });
  const byProj = {}, byTask = {};
  R.forEach(e => {
    (byProj[e.project] ??= { est: 0, act: 0 }); byProj[e.project].est += +e.est || 0; byProj[e.project].act += +e.act || 0;
    (byTask[e.task] ??= { est: 0, act: 0 }); byTask[e.task].est += +e.est || 0; byTask[e.task].act += +e.act || 0;
  });
  const issues = [];
  const noEst = R.filter(e => +e.act && !(+e.est)), noAct = R.filter(e => +e.est && !(+e.act));
  if (noEst.length) issues.push(["warn", `${noEst.length} task rows have actual hours that were never estimated`]);
  if (noAct.length) issues.push(["warn", `${noAct.length} task rows have an estimate but no actual yet`]);
  per.forEach(p => p.byDay.forEach((x, i) => { if (Math.abs(x - 8) > .01) issues.push(["bad", `${p.u} · ${fdl(days[i])}: estimated ${h(x) || 0} h, expected 8 h`]); }));
  R.filter(e => +e.est && +e.act && +e.act > 1.5 * +e.est && +e.act - +e.est >= .5)
   .forEach(e => issues.push(["warn", `${String(e.owner).trim()} · ${fd(e.date)} · ${e.project} / ${e.task}: actual ${h(e.act)} h vs estimate ${h(e.est)} h`]));
  return { R, days, per, byProj, byTask, issues, est: sum(R, "est"), act: sum(R, "act"), bill: sum(R.filter(e => isBill(e.project)), "act"),
           cap: 8 * days.length * team.length };
}
function vDash() {
  const A = analyse(U.anFrom, U.anTo), { days, per } = A;
  const maxP = Math.max(8 * days.length, ...per.map(p => Math.max(p.est, p.act)), 1);
  const bars = o => { const m = Math.max(1, ...Object.values(o).map(v => Math.max(v.est, v.act)));
    return Object.entries(o).sort((a, b) => b[1].act - a[1].act).map(([k, v]) => `<div class="row"><span>${esc(k)}</span><div class="track"><i style="width:${v.est / m * 100}%"></i><u style="width:${v.act / m * 100}%"></u></div><span class="num">${h(v.act) || 0} / ${h(v.est) || 0}</span></div>`).join("") || `<p class="muted">No hours in this range yet.</p>`; };
  return `<h1>How the team spent the time</h1>
  <p class="lede">Estimated against actual hours, the 8-hour rule per person per day, and where the time went.</p>
  <div class="controls"><label class="f">From<input type="date" id="anFrom" value="${U.anFrom}"></label><label class="f">To<input type="date" id="anTo" value="${U.anTo}"></label>
   <button class="btn sm" data-act="anWeek" data-d="-7">← Previous week</button><button class="btn sm" data-act="anWeek" data-d="7">Next week →</button>
   <button class="btn sm" data-act="anReport">Download this analysis</button></div>
  <div class="grid g4">
   <div class="card stat"><b>${h(A.act) || 0} h</b><span>actual of ${h(A.est) || 0} h estimated</span></div>
   <div class="card stat"><b>${A.cap ? Math.round(A.est / A.cap * 100) : 0}%</b><span>of capacity planned (${A.cap} h)</span></div>
   <div class="card stat"><b>${A.act ? Math.round(A.bill / A.act * 100) : 0}%</b><span>of actual hours billable (${h(A.bill) || 0} h)</span></div>
   <div class="card stat"><b>${per.reduce((s, p) => s + p.ok, 0)} / ${per.length * days.length}</b><span>person-days meeting the 8-hour estimate</span></div></div>
  <h2>By person</h2>
  <div class="card bars">${per.map(p => `<div class="row"><span class="who"><i class="dot" style="background:${color(p.u)}"></i>${esc(p.u)}</span><div class="track"><i style="width:${p.est / maxP * 100}%"></i><u style="width:${p.act / maxP * 100}%"></u><span class="eight" style="left:${8 * days.length / maxP * 100}%"></span></div><span class="num">${h(p.act) || 0} / ${h(p.est) || 0}</span></div>`).join("")}
   <div class="legend"><em><i class="dot" style="background:var(--accent)"></i>actual</em><em><i class="dot" style="background:var(--accent);opacity:.3"></i>estimated</em><em>| line = 8 h × working days</em></div></div>
  <h2>Daily 8-hour check (estimated · actual)</h2>
  <div class="scroll"><table><thead><tr><th>Person</th>${days.map(d => `<th class="n">${DAY[dow(d)]} ${fd(d)}</th>`).join("")}<th class="n">Total</th></tr></thead><tbody>
  ${per.map(p => `<tr><td><span class="who"><i class="dot" style="background:${color(p.u)}"></i>${esc(p.u)}</span></td>${p.byDay.map((x, i) => `<td class="n"><span class="pill ${Math.abs(x - 8) < .01 ? "ok" : "bad"}">${h(x) || 0}</span> <span class="muted num">${h(p.actDay[i]) || 0}</span></td>`).join("")}<td class="n num">${h(p.est) || 0} · ${h(p.act) || 0}</td></tr>`).join("")}
  </tbody></table></div>
  <div class="grid g2" style="margin-top:14px"><div><h2>By project (actual / estimated)</h2><div class="card bars">${bars(A.byProj)}</div></div>
   <div><h2>By task type</h2><div class="card bars">${bars(A.byTask)}</div></div></div>
  <h2>Needs attention</h2>
  <div class="card"><ul class="issues">${A.issues.slice(0, 40).map(([c, t]) => `<li><span class="pill ${c}">${c === "bad" ? "8 h" : "check"}</span> ${esc(t)}</li>`).join("") || "<li>Nothing to fix – every day adds up.</li>"}</ul>${A.issues.length > 40 ? `<p class="note">…and ${A.issues.length - 40} more.</p>` : ""}</div>`;
}

/* ===================== ALLOCATION ===================== */
const aliasT = new Map();
function saveAlias(id, val) {
  const n = node(id); if (!n) return;
  n.alias = val.trim() === n.name ? "" : val;
  decorate();
  clearTimeout(aliasT.get(id)); setSync("Saving…");
  aliasT.set(id, setTimeout(async () => {
    try { await api("/api/alias", "PUT", { id, alias: n.alias || "" }); setSync(); }
    catch (e) { setSync("Not saved"); toast("Couldn’t rename: " + e.message); }
  }, 700));
}

function vAlloc() {
  if (!isAdmin() && !myMember()) return `<h1>Weekly allocation</h1><div class="card">Your account isn’t linked to a team name yet. Ask an administrator to link it in Users.</div>`;
  const users = U.alUser === "__all" ? S.cfg.team : [U.alUser];
  const days = workdays(U.alFrom, U.alTo).slice(0, 23);

  const dayCard = (d, u) => {
    const ed = canEditOwner(u), dis = ed ? "" : "disabled";
    const mids = midsFor(u, d);
    const r = rows({ owner: u, from: d, to: d }), est = sum(r, "est"), act = sum(r, "act");
    let html = "", lastTop = null;
    mids.forEach(m => {
      const top = topOf(m) || {};
      if (top.id !== lastTop) {
        lastTop = top.id;
        html += `<tr class="first"><td colspan="5" style="background:var(--head);font-weight:600;font-size:12.5px">${esc(dispName(top))}</td></tr>`;
      }
      const ts = tasksFor(m, u, d);
      if (!ts.length) { html += `<tr><td class="proj">${esc(dispName(m))}</td><td colspan="4" class="muted">No tasks set up yet.</td></tr>`; return; }
      ts.forEach((t, i) => {
        const e = S.entries.get(keyOfIds(d, u, m.id, t.id)) || {};
        const a = `data-d="${d}" data-u="${esc(u)}" data-pid="${esc(m.id)}" data-tid="${esc(t.id)}"`;
        html += `<tr${i === 0 ? ' class="first"' : ""}>
          <td class="proj">${i === 0 ? esc(dispName(m)) + (m.hidden ? ` <span class="pill warn">ended</span>` : "") : ""}</td>
          <td><input class="c" data-ali="${esc(t.id)}" value="${esc(dispName(t))}" title="${esc(t.id)} — rename is shared with the team" style="min-width:150px" ${dis}></td>
          <td class="n"><input class="n" inputmode="decimal" ${a} data-f="est" value="${h(e.est)}" ${dis}></td>
          <td class="n"><input class="n" inputmode="decimal" ${a} data-f="act" value="${h(e.act)}" ${dis}></td>
          <td><input class="c" ${a} data-f="comment" value="${esc(e.comment || "")}" ${dis}></td></tr>`;
      });
    });
    if (!mids.length) html = `<tr><td colspan="5" class="muted">Nothing assigned on this day. Ask an administrator to add an assignment in Setup.</td></tr>`;
    return `<div class="day" style="border-left:6px solid ${color(u)}"><div class="dayhead" style="background:${color(u)}"><h3>${esc(u)} · ${fdl(d)}</h3>
      <span>Estimated <span class="pill ${Math.abs(est - 8) < .01 ? "ok" : "bad"}" data-tot="${d}|${esc(u)}|est">${h(est) || 0} h</span> &nbsp;Actual <span class="pill warn" data-tot="${d}|${esc(u)}|act">${h(act) || 0} h</span>
      ${ed ? `<button class="btn sm" data-act="copyEA" data-d="${d}" data-u="${esc(u)}">Actual = Estimate</button>` : ""}</span></div>
      <div class="scroll" style="border:0;border-radius:0"><table class="alloc"><thead><tr><th style="min-width:120px">Project</th><th>Task</th><th class="n">Estimated</th><th class="n">Actual</th><th>Comments</th></tr></thead>
      <tbody>${html}</tbody></table></div></div>`;
  };

  const body = days.map(d => users.map(u => dayCard(d, u)).join("")).join("");
  return `<h1>Weekly allocation</h1>
  <p class="lede">${isAdmin() ? "Pick a person and the dates." : `Your allocation, ${esc(myMember())}.`} Only what you are assigned on each day appears. You can rename a task here — everyone sees the new name, and the hours stay attached.</p>
  <div class="controls">${isAdmin() ? `<label class="f">Person<select id="alUser">${userOpts(U.alUser, true)}</select></label>` : ""}
   <label class="f">From<input type="date" id="alFrom" value="${U.alFrom}"></label><label class="f">To<input type="date" id="alTo" value="${U.alTo}"></label>
   <button class="btn sm" data-act="alWeek" data-d="-7">← Previous week</button><button class="btn sm" data-act="alWeek" data-d="7">Next week →</button>
   <button class="btn sm" data-act="alThis">This week</button></div>
  ${days.length ? body : `<div class="card">No working days in that range.</div>`}`;
}

function updTotals(d, u) {
  const r = rows({ owner: u, from: d, to: d });
  ["est", "act"].forEach(k => { const el = document.querySelector(`[data-tot="${CSS.escape(d + "|" + u + "|" + k)}"]`);
    if (el) { const v = sum(r, k); el.textContent = (h(v) || 0) + " h"; if (k === "est") el.className = "pill " + (Math.abs(v - 8) < .01 ? "ok" : "bad"); } });
}

/* ===================== BLL ===================== */
function bllGrid(owner, bill) {
  const W = weeks(), R = rows({ owner }).filter(e => !bill || isBill(e.project)), cell = {};
  R.forEach(e => { const k = e.project + "|" + monday(e.date); cell[k] = (cell[k] || 0) + (+e.act || 0); });
  const names = [...S.cfg.projects.filter(p => !bill || p.billable).map(p => p.name), ...[...new Set(R.map(e => e.project))].filter(n => !proj(n))];
  return { W, names, cell };
}
function projectDetails() {
  const months = [[2026, 5, "May"], [2026, 6, "Jun"], [2026, 7, "Jul"], [2026, 8, "Aug"], [2026, 9, "Sep"], [2026, 10, "Oct"], [2026, 11, "Nov"], [2026, 12, "Dec"], [2027, 1, "Jan"]];
  return { months, rows: S.cfg.projects.map(p => {
    const r = rows({ project: p.name }), lg = sum(r, "act"), pl = +p.planned || 0, pc = pl ? lg / pl : null;
    const mons = months.map(([y, m]) => { const end = I(new Date(Date.UTC(y, m, 1))); return pl ? sum(r.filter(e => e.date < end), "act") / pl : null; });
    const st = pc == null ? "" : pc > 1 ? "Over budget" : pc >= .9 ? "At risk" : lg ? "On track" : "Not started";
    const accr = pl && typeof p.cost === "number" ? Math.min(1, lg / pl) * p.cost : (pl && !isNaN(+p.cost) && p.cost !== "" ? Math.min(1, lg / pl) * +p.cost : null);
    return { p, lg, bl: p.billable ? lg : 0, pl, pc, mons, st, accr }; }) };
}
function vBll() {
  const u = U.bllUser || "__all", bill = U.bllMode === "billable", { W, names, cell } = bllGrid(u, bill), cw = monday(today);
  const colT = W.map(w => names.reduce((s, p) => s + (cell[p + "|" + w] || 0), 0));
  let details = "";
  if (u === "__all") { const D = projectDetails();
    details = `<h2>Project details</h2><div class="scroll"><table><thead><tr><th>Project</th><th>Type</th><th class="n">Planned h</th><th class="n">Cost</th><th class="n">Logged h</th><th class="n">Billable h</th><th class="n">Remaining h</th><th class="n">% complete</th>${D.months.map(m => `<th class="n">% ${m[2]}</th>`).join("")}<th class="n">Accrual</th><th>Status</th></tr></thead><tbody>
    ${D.rows.map(x => `<tr><td>${esc(x.p.name)}</td><td>${esc(x.p.type)}</td><td class="n">${h(x.pl)}</td><td class="n">${esc(x.p.cost)}</td><td class="n">${h(x.lg)}</td><td class="n">${h(x.bl)}</td><td class="n">${x.pl ? h(x.pl - x.lg) || 0 : ""}</td><td class="n">${x.pc == null ? "" : Math.round(x.pc * 100) + "%"}</td>${x.mons.map(v => `<td class="n">${v == null ? "" : Math.round(v * 100) + "%"}</td>`).join("")}<td class="n">${x.accr == null ? "" : Math.round(x.accr).toLocaleString()}</td><td>${x.st === "Over budget" ? `<span class="pill bad">${x.st}</span>` : x.st === "At risk" ? `<span class="pill warn">${x.st}</span>` : x.st === "On track" ? `<span class="pill ok">${x.st}</span>` : `<span class="muted">${x.st}</span>`}</td></tr>`).join("")}
    </tbody></table></div>`; }
  return `<h1>BLL tracker ${viewOnly()}</h1>
  <p class="lede">Built from actual hours. Logged (Prima) counts every hour; Billable (Salesforce) counts only billable projects. Weeks start on Monday.</p>
  <div class="controls"><label class="f">Person<select id="bllUser">${userOpts(u, true)}</select></label>
   <label class="f">Grid<select id="bllMode"><option value="logged" ${!bill ? "selected" : ""}>Logged (Prima)</option><option value="billable" ${bill ? "selected" : ""}>Billable (Salesforce)</option></select></label>
   <button class="btn sm" data-act="xlsxBll">Download BLL Excel</button></div>
  <h2>${bill ? "Billable (Salesforce)" : "Logged (Prima)"} – ${u === "__all" ? "whole team" : esc(u)}</h2>
  <div class="scroll"><table><thead><tr><th>Project</th><th>Type</th>${W.map(w => `<th class="n ${w === cw ? "cur" : ""}">${fd(w)}</th>`).join("")}<th class="n">Total</th></tr></thead><tbody>
  ${names.map(p => { const v = W.map(w => cell[p + "|" + w] || 0), t = v.reduce((a, b) => a + b, 0);
    return `<tr><td>${esc(p)}${proj(p) ? "" : ` <span class="pill warn">not in Setup</span>`}</td><td class="muted">${esc(proj(p)?.type || "")}</td>${v.map((x, i) => `<td class="n num ${x ? "" : "zero"} ${W[i] === cw ? "cur" : ""}">${x ? h(x) : "·"}</td>`).join("")}<td class="n num"><b>${h(t) || 0}</b></td></tr>`; }).join("")}
  <tr class="tot"><td>Total weekly hours</td><td></td>${colT.map(v => `<td class="n num">${h(v) || 0}</td>`).join("")}<td class="n num">${h(colT.reduce((a, b) => a + b, 0)) || 0}</td></tr>
  </tbody></table></div>${details}`;
}

/* ===================== SALESFORCE ===================== */
function sfData(owner, end) {
  const start = add(end, -6), days = Array.from({ length: 7 }, (_, i) => add(start, i));
  const R = rows({ owner, from: start, to: end }).filter(e => isBill(e.project)), by = {}, notes = {};
  R.forEach(e => { (by[e.project] ??= Array(7).fill(0))[days.indexOf(e.date)] += +e.act || 0; if (e.comment) (notes[e.project] ??= []).push(`${DAY[dow(e.date)]}: ${e.comment}`); });
  return { start, end, days, by, notes };
}
const SF_HEAD = ["Resource", "pse__Resource__c", "Project", "pse__Assignment__c", "pse__Start_Date__c", "pse__End_Date__c", "pse__Sunday_Hours__c", "pse__Monday_Hours__c", "pse__Tuesday_Hours__c", "pse__Wednesday_Hours__c", "pse__Thursday_Hours__c", "pse__Friday_Hours__c", "pse__Saturday_Hours__c", "pse__Billable__c", "pse__Status__c", "Notes"];
function sfRows(owners, end) {
  const out = [];
  owners.forEach(o => { const { start, by, notes } = sfData(o, end);
    Object.entries(by).forEach(([p, v]) => out.push([o, (S.cfg.resIds || {})[o] || "", p, proj(p)?.sf || "", start, end, ...v.map(x => +x.toFixed(2)), "TRUE", "Saved", (notes[p] || []).join("; ")])); });
  return out;
}
function vSf() {
  const { start, end, days, by, notes } = sfData(U.sfUser, U.sfWeek), ps = Object.keys(by), col = days.map((_, i) => ps.reduce((s, p) => s + by[p][i], 0));
  return `<h1>Salesforce time entry ${viewOnly()}</h1>
  <p class="lede">Laid out like the PSA Time Entry page: Week Ending on Saturday, Sunday to Saturday, billable projects only.</p>
  <div class="controls"><label class="f">Resource<select id="sfUser">${userOpts(U.sfUser)}</select></label>
   <label class="f">Week ending (Saturday)<input type="date" id="sfWeek" value="${U.sfWeek}"></label>
   <button class="btn sm" data-act="sfWk" data-d="-7">←</button><button class="btn sm" data-act="sfWk" data-d="7">→</button>
   <button class="btn pri sm" data-act="sfCopy" ${ps.length ? "" : "disabled"}>Copy hours</button>
   <button class="btn sm" data-act="sfCsv" ${ps.length ? "" : "disabled"}>Timecard CSV</button></div>
  <div class="scroll"><table><thead><tr><th>Project / Assignment</th><th>Assignment ID</th>${days.map(d => `<th class="n">${DAY[dow(d)]} ${fd(d)}</th>`).join("")}<th class="n">Sum</th><th>Notes</th></tr></thead><tbody>
  ${ps.map(p => `<tr><td>${esc(p)}</td><td class="muted">${esc(proj(p)?.sf || "–")}</td>${by[p].map(v => `<td class="n num ${v ? "" : "zero"}">${v.toFixed(2)}</td>`).join("")}<td class="n num"><b>${h(by[p].reduce((a, b) => a + b, 0))}</b></td><td class="muted" style="white-space:normal;min-width:200px">${esc((notes[p] || []).join("; "))}</td></tr>`).join("") || `<tr><td colspan="11" class="muted">No billable hours for ${esc(U.sfUser)} between ${fd(start)} and ${fd(end)}.</td></tr>`}
  ${ps.length ? `<tr class="tot"><td>Total</td><td></td>${col.map(v => `<td class="n num">${v.toFixed(2)}</td>`).join("")}<td class="n num">${col.reduce((a, b) => a + b, 0).toFixed(2)}</td><td></td></tr>` : ""}
  </tbody></table></div>`;
}

/* ===================== PRIMA (admin) ===================== */
function primaRows(owner, start) {
  const R = rows({ owner, from: start, to: add(start, 6) }), by = {};
  R.forEach(e => { const k = String(e.owner).trim() + "|" + e.project; (by[k] ??= Array(7).fill(0))[dow(e.date)] += +e.act || 0; });
  return Object.entries(by).map(([k, v]) => [...k.split("|"), ...v.map(x => +x.toFixed(2)), +v.reduce((a, b) => a + b, 0).toFixed(2)]);
}
function vPrima() {
  const s = U.prWeek, days = Array.from({ length: 7 }, (_, i) => add(s, i)), R = primaRows(U.prUser, s);
  return `<h1>Prima log</h1><p class="lede">All actual hours for the week (billable and internal) per person and project.</p>
  <div class="controls"><label class="f">Person<select id="prUser">${userOpts(U.prUser, true)}</select></label><label class="f">Week starting (Monday)<input type="date" id="prWeek" value="${s}"></label>
   <button class="btn sm" data-act="prWk" data-d="-7">←</button><button class="btn sm" data-act="prWk" data-d="7">→</button>
   <button class="btn sm" data-act="prCsv" ${R.length ? "" : "disabled"}>Download Prima Excel</button></div>
  <div class="scroll"><table><thead><tr><th>Person</th><th>Project</th>${days.map(d => `<th class="n">${DAY[dow(d)]} ${fd(d)}</th>`).join("")}<th class="n">Total</th></tr></thead><tbody>
  ${R.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td>${r.slice(2, 9).map(v => `<td class="n num ${v ? "" : "zero"}">${v ? h(v) : "·"}</td>`).join("")}<td class="n num"><b>${h(r[9])}</b></td></tr>`).join("") || `<tr><td colspan="10" class="muted">No hours logged this week.</td></tr>`}
  </tbody></table></div>`;
}

/* ===================== REPORTS (admin) ===================== */
const REPORTS = {
  summary: "Analysis pack (summary, people, projects, tasks, 8-hour check, issues)",
  log: "Allocation log (every entry)",
  person: "Person summary",
  project: "Project status & accrual",
  bll: "BLL workbook (team + one sheet per person)",
  sf: "Salesforce Timecard import (all people, each week in range)",
  prima: "Prima weekly hours (each week in range)",
  compliance: "8-hour compliance by person and day",
  structure: "Work structure (all IDs, levels and assignments)"
};
function buildReport(type, from, to, owner, project) {
  const A = analyse(from, to, owner, project), sheets = [];
  const people = () => [["Person", "Estimated h", "Actual h", "Variance h", "Billable h", "Billable %", "Days meeting 8 h", "Working days"],
    ...A.per.map(p => [p.u, +p.est.toFixed(2), +p.act.toFixed(2), +(p.act - p.est).toFixed(2), +p.bill.toFixed(2), p.act ? +(p.bill / p.act * 100).toFixed(1) : 0, p.ok, A.days.length])];
  const projs = () => [["Project", "Billable", "Estimated h", "Actual h", "Variance h"], ...Object.entries(A.byProj).sort((a, b) => b[1].act - a[1].act).map(([k, v]) => [k, isBill(k) ? "Yes" : "No", +v.est.toFixed(2), +v.act.toFixed(2), +(v.act - v.est).toFixed(2)])];
  const tasks = () => [["Task type", "Estimated h", "Actual h", "Variance h"], ...Object.entries(A.byTask).map(([k, v]) => [k, +v.est.toFixed(2), +v.act.toFixed(2), +(v.act - v.est).toFixed(2)])];
  const comp = () => [["Person", ...A.days.flatMap(d => [`${fd(d)} est`, `${fd(d)} act`]), "Days OK"], ...A.per.map(p => [p.u, ...p.byDay.flatMap((x, i) => [+x.toFixed(2), +p.actDay[i].toFixed(2)]), p.ok])];
  const log = () => [["Date", "Week start", "Owner", "Project", "Task", "Estimated h", "Actual h", "Billable", "Comments", "Last edited by"],
    ...A.R.slice().sort((a, b) => a.date.localeCompare(b.date) || String(a.owner).localeCompare(String(b.owner))).map(e => [e.date, monday(e.date), String(e.owner).trim(), e.project, e.task, e.est ?? "", e.act ?? "", isBill(e.project) ? "Yes" : "No", e.comment || "", e.updatedByName || ""])];
  const projStatus = () => { const D = projectDetails(); return [["Project", "Type", "Billable", "Planned h", "Cost", "Logged h (all time)", "Billable h", "Remaining h", "% complete", ...D.months.map(m => `% ${m[2]}`), "Accrual", "Status", "SF Assignment ID"],
    ...D.rows.map(x => [x.p.name, x.p.type, x.p.billable ? "Yes" : "No", x.pl, x.p.cost, +x.lg.toFixed(2), +x.bl.toFixed(2), x.pl ? +(x.pl - x.lg).toFixed(2) : "", x.pc == null ? "" : +(x.pc * 100).toFixed(1), ...x.mons.map(v => v == null ? "" : +(v * 100).toFixed(1)), x.accr == null ? "" : Math.round(x.accr), x.st, x.p.sf || ""])]; };
  const structure = () => { const out = [["ID", "Level", "Parent ID", "Name", "Billable", "Planned h", "Cost", "SF ID", "Hidden"]];
    tops().forEach(t => { out.push([t.id, "Top", "", t.name, "", "", "", "", t.hidden ? "Yes" : "No"]);
      childrenOf(t.id, "mid").forEach(m => { out.push([m.id, midLabel(t), t.id, m.name, m.billable ? "Yes" : "No", +m.planned || 0, m.cost ?? "", m.sf || "", m.hidden ? "Yes" : "No"]);
        childrenOf(m.id, "task").forEach(k => out.push([k.id, taskLabel(t), m.id, k.name, k.billable ? "Yes" : "No", "", "", "", k.hidden ? "Yes" : "No"])); }); });
    return out; };
  const assignSheet = () => [["Person", "Node ID", "Name", "From", "To", "Status"],
    ...(S.cfg.assigns || []).map(a => { const n = node(a.node) || {}; return [a.person, a.node, n.name || "", a.from || "", a.to || "", activeOn(a, today) ? "Active" : "Ended"]; })];
  const weeksIn = (startFn) => { const out = []; for (let w = startFn(from); w <= to; w = add(w, 7)) out.push(w); return out.length ? out : [startFn(from)]; };
  const owners = owner === "__all" ? S.cfg.team : [owner];
  if (type === "summary") {
    sheets.push(["Summary", [[`${APP_NAME} – analysis ${from} to ${to}`], [], ["Estimated h", +A.est.toFixed(2)], ["Actual h", +A.act.toFixed(2)], ["Billable h", +A.bill.toFixed(2)],
      ["Billable % of actual", A.act ? +(A.bill / A.act * 100).toFixed(1) : 0], ["Capacity h (8 h × people × days)", A.cap], ["% of capacity planned", A.cap ? +(A.est / A.cap * 100).toFixed(1) : 0],
      ["Person-days meeting 8 h", `${A.per.reduce((s, p) => s + p.ok, 0)} of ${A.per.length * A.days.length}`], [], ["Generated", new Date().toLocaleString()], ["Generated by", S.profile.name]]]);
    sheets.push(["People", people()], ["Projects", projs()], ["Task types", tasks()], ["8-hour check", comp()], ["Issues", [["Type", "Detail"], ...A.issues.map(([c, t]) => [c === "bad" ? "8-hour rule" : "Check", t])]]);
  }
  if (type === "log") sheets.push(["Allocation log", log()]);
  if (type === "person") sheets.push(["Person summary", people()]);
  if (type === "project") sheets.push(["Project status", projStatus()], ["Hours in range", projs()]);
  if (type === "compliance") sheets.push(["8-hour check", comp()]);
  if (type === "structure") sheets.push(["Structure", structure()], ["Assignments", assignSheet()]);
  if (type === "bll") {
    const W = weeks();
    ["__all", ...owners].filter((v, i, a) => a.indexOf(v) === i).forEach(o => { const sh = [];
      [false, true].forEach(bill => { const { names, cell } = bllGrid(o, bill);
        sh.push([bill ? "BILLABLE (Salesforce)" : "LOGGED (PRIMA)"], ["Project Name", "Type", ...W.map(fd), "Total Project Hours"]);
        names.forEach(p => { const v = W.map(w => +(cell[p + "|" + w] || 0).toFixed(2)); sh.push([p, proj(p)?.type || "", ...v.map(x => x || ""), +v.reduce((a, b) => a + b, 0).toFixed(2)]); });
        sh.push(["Total Weekly Hours", "", ...W.map(w => +names.reduce((s, p) => s + (cell[p + "|" + w] || 0), 0).toFixed(2)), ""], []); });
      sheets.push([o === "__all" ? "BLL Team" : ("BLL - " + o).slice(0, 31), sh]); });
    sheets.push(["Project details", projStatus()]);
  }
  if (type === "sf") sheets.push(["Timecards", [SF_HEAD, ...weeksIn(saturdayEnding).flatMap(w => sfRows(owners, w))]]);
  if (type === "prima") sheets.push(["Prima", [["Person", "Project", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Week total", "Week start"],
    ...weeksIn(monday).flatMap(w => primaRows(owner, w).map(r => [...r, w]))]]);
  return sheets;
}
function vReports() {
  const sheets = buildReport(U.rpType, U.rpFrom, U.rpTo, U.rpUser, U.rpProj), first = sheets[0]?.[1] || [];
  const prev = first.slice(0, 26);
  return `<h1>Reports</h1><p class="lede">Choose a report, the dates and filters. Preview the first sheet, then download it as Excel (all sheets) or CSV (first sheet).</p>
  <div class="controls"><label class="f">Report<select id="rpType">${Object.entries(REPORTS).map(([k, l]) => `<option value="${k}" ${k === U.rpType ? "selected" : ""}>${l}</option>`).join("")}</select></label>
   <label class="f">From<input type="date" id="rpFrom" value="${U.rpFrom}"></label><label class="f">To<input type="date" id="rpTo" value="${U.rpTo}"></label>
   <label class="f">Person<select id="rpUser">${userOpts(U.rpUser, true)}</select></label><label class="f">Project<select id="rpProj">${projOpts(U.rpProj)}</select></label>
   <button class="btn sm" data-act="rpRange" data-r="week">This week</button><button class="btn sm" data-act="rpRange" data-r="month">This month</button><button class="btn sm" data-act="rpRange" data-r="all">All time</button>
   <button class="btn pri sm" data-act="rpXlsx">Download Excel</button><button class="btn sm" data-act="rpCsv">Download CSV</button></div>
  <p class="muted">Sheets in this report: ${sheets.map(s => esc(s[0])).join(", ")}</p>
  <div class="scroll preview"><table><tbody>${prev.map((r, i) => `<tr>${(r || []).map(c => i === 0 && first.length > 1 ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`).join("")}</tr>`).join("") || `<tr><td class="muted">No data for these filters.</td></tr>`}</tbody></table></div>
  ${first.length > 26 ? `<p class="note">Showing 25 of ${first.length - 1} rows.</p>` : ""}`;
}

/* ===================== SETUP (admin) ===================== */
function vSet() {
  const c = S.cfg;
  const taskRow = (m, t) => `<tr><td class="muted num" style="font-size:11px">${esc(t.id)}</td>
    <td><input data-nd="${esc(t.id)}" data-nk="name" value="${esc(t.name)}" style="width:190px"></td>
    <td style="text-align:center"><input type="checkbox" data-nd="${esc(t.id)}" data-nk="billable" ${t.billable ? "checked" : ""}></td>
    <td><button class="btn sm" data-act="hideNode" data-id="${esc(t.id)}">${t.hidden ? "Unhide" : "Hide"}</button></td></tr>`;

  const midCard = (top, m) => `<div class="card" style="margin:10px 0 0 18px;${m.hidden ? "opacity:.5" : ""}">
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end">
      <label class="f">${esc(midLabel(top))} name<input data-nd="${esc(m.id)}" data-nk="name" value="${esc(m.name)}" style="width:170px"></label>
      <label class="f">Type / note<input data-nd="${esc(m.id)}" data-nk="type" value="${esc(m.type || "")}" style="width:190px"></label>
      <label class="f">Planned h<input class="n" data-nd="${esc(m.id)}" data-nk="planned" value="${esc(m.planned ?? 0)}" style="width:72px"></label>
      <label class="f">Cost<input data-nd="${esc(m.id)}" data-nk="cost" value="${esc(m.cost ?? "")}" style="width:86px"></label>
      <label class="f">SF Assignment ID<input data-nd="${esc(m.id)}" data-nk="sf" value="${esc(m.sf || "")}" style="width:160px"></label>
      <label class="f">Billable<input type="checkbox" data-nd="${esc(m.id)}" data-nk="billable" ${m.billable ? "checked" : ""}></label>
      <button class="btn sm" data-act="hideNode" data-id="${esc(m.id)}">${m.hidden ? "Unhide" : "Hide"}</button>
    </div>
    <p class="note" style="margin:6px 0 0">ID <code>${esc(m.id)}</code> — permanent. Renaming is safe; hours stay linked.</p>
    <div class="scroll" style="margin-top:8px"><table><thead><tr><th style="width:150px">ID</th><th>${esc(taskLabel(top))}</th><th style="width:70px;text-align:center">Billable</th><th style="width:90px"></th></tr></thead>
      <tbody>${childrenOf(m.id, "task").map(t => taskRow(m, t)).join("") || `<tr><td colspan="4" class="muted">No ${esc(taskLabel(top)).toLowerCase()}s yet.</td></tr>`}</tbody></table></div>
    <p style="margin:8px 0 0"><button class="btn sm" data-act="addTask" data-id="${esc(m.id)}">+ Add ${esc(taskLabel(top).toLowerCase())}</button></p>
  </div>`;

  const topCard = t => `<div class="card" style="margin-bottom:16px;${t.hidden ? "opacity:.5" : ""}">
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">
      <label class="f">Top level<input data-nd="${esc(t.id)}" data-nk="name" value="${esc(t.name)}" style="width:150px"></label>
      <label class="f">Structure<select data-nd="${esc(t.id)}" data-nk="mode">
        <option value="project" ${t.mode !== "primary" ? "selected" : ""}>Project → Task</option>
        <option value="primary" ${t.mode === "primary" ? "selected" : ""}>Primary → Secondary task</option></select></label>
      <span class="ro">ID ${esc(t.id)}</span>
      <button class="btn sm" data-act="hideNode" data-id="${esc(t.id)}">${t.hidden ? "Unhide" : "Hide"}</button>
    </div>
    ${childrenOf(t.id, "mid").map(m => midCard(t, m)).join("")}
    <p style="margin:12px 0 0"><button class="btn sm pri" data-act="addMid" data-id="${esc(t.id)}">+ Add ${esc(midLabel(t).toLowerCase())}</button></p>
  </div>`;

  const midOpts = sel => tops().map(t => `<optgroup label="${esc(t.name)}">` +
    childrenOf(t.id, "mid").map(m => `<option value="${esc(m.id)}" ${m.id === sel ? "selected" : ""}>${esc(m.name)}${m.hidden ? " (hidden)" : ""}</option>`).join("") +
    `</optgroup>`).join("");

  const asg = c.assigns || [];
  const asgRows = asg.map((a, i) => {
    const live = activeOn(a, today);
    return `<tr><td><select data-asg="${i}" data-af="person">${c.team.map(u => `<option ${u === a.person ? "selected" : ""}>${esc(u)}</option>`).join("")}</select></td>
    <td><select data-asg="${i}" data-af="node">${midOpts(a.node)}</select></td>
    <td><input type="date" data-asg="${i}" data-af="from" value="${esc(a.from || "")}"></td>
    <td><input type="date" data-asg="${i}" data-af="to" value="${esc(a.to || "")}"></td>
    <td><span class="pill ${live ? "ok" : "warn"}">${live ? "Active" : "Ended"}</span></td>
    <td><button class="btn sm" data-act="delAsg" data-i="${i}">✕</button></td></tr>`;
  }).join("");

  return `<h1>Setup</h1>
  <p class="lede">Your work structure has three levels. Every item keeps a permanent ID, so you can rename anything without breaking past hours, and hide anything without deleting its history.</p>

  <h2>Team</h2><div class="card settings">${c.team.map((u, i) => `<span style="display:inline-flex;gap:6px;margin:0 10px 8px 0;align-items:center"><i class="dot" style="background:${color(u)}"></i><input data-team="${i}" value="${esc(u)}" style="width:130px"><input data-rid="${esc(u)}" placeholder="SF Resource ID" value="${esc((c.resIds || {})[u] || "")}" style="width:150px"><button class="btn sm" data-act="delTeam" data-i="${i}">✕</button></span>`).join("")}
   <div><button class="btn sm" data-act="addTeam">+ Add person</button></div></div>

  <h2>Work structure</h2>
  ${tops().map(topCard).join("")}
  <div class="controls"><label class="f">New top level name<input id="newTop" placeholder="e.g. Lilly" style="width:180px"></label>
   <button class="btn sm" data-act="addTop">+ Add top level</button></div>

  <h2>Assignments</h2>
  <p class="muted" style="margin-top:-4px">Who works on what, and between which dates. Leave dates blank for “always”. Ending an assignment removes it from future allocation screens — past hours are never lost.</p>
  <div class="scroll"><table><thead><tr><th>Person</th><th>Project / Primary task</th><th>From</th><th>To</th><th>Status</th><th></th></tr></thead>
   <tbody>${asgRows || `<tr><td colspan="6" class="muted">No assignments yet — nobody is restricted, so everyone sees everything.</td></tr>`}</tbody></table></div>
  <p><button class="btn sm pri" data-act="addAsg">+ Add assignment</button></p>

  <h2>BLL weeks</h2><div class="controls"><label class="f">First week (Monday)<input type="date" id="bllStart" value="${c.bllStart}"></label><label class="f">Number of weeks<input type="number" id="bllWeeks" min="1" max="104" value="${c.bllWeeks}"></label></div>

  <h2>Import</h2><div class="card"><p style="margin-top:0">Import an existing allocation workbook (Date · Owner · Project · Task · Estimated · Actual · Comments; merged cells are fine).</p>
   <input type="file" id="imp" accept=".xlsx,.xls,.xlsm"><p class="note">${S.entries.size} entries stored.</p></div>`;
}

/* ===================== USERS (admin) ===================== */
function vUsers() {
  const us = S.users.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const tokSet = !!S.sharedToken;
  return `<h1>Users &amp; sign-ins</h1>
  <p class="lede">Create a username for each person, then give them the passphrase. They sign in from any phone or laptop — no GitHub account needed.</p>
  <h2>Shared team token</h2>
  <div class="card">
    <p style="margin-top:0">${tokSet ? `<span class="pill ok">Set</span> Team sign-ins are working.`
      : `<span class="pill bad">Not set</span> Paste the <b>shared team token</b> (the one limited to <code>bfs-tracker-data</code>). Until this is set you cannot create team logins.`}</p>
    <label class="f">Shared team token<input id="shTok" type="password" placeholder="github_pat_..." style="width:100%;max-width:460px"></label>
    <p><button class="btn pri sm" data-act="saveShared">Save shared token</button></p>
    <p class="note">Stored in your private data repo. Replace it if anyone leaves the team, then reset everyone’s passphrase.</p>
  </div>
  <h2>Team</h2>
  <div class="card"><label class="f">Add a person — username<input id="newUser" placeholder="anjali" style="width:200px"></label>
   <p><button class="btn pri sm" data-act="addUser" ${tokSet ? "" : "disabled"}>Create sign-in</button></p></div>
  <div class="scroll" style="margin-top:14px"><table><thead><tr><th>Name</th><th>Username</th><th>Team name</th><th>Role</th><th>Active</th><th>Sign-in</th></tr></thead><tbody>
  ${us.map(u => `<tr><td>${esc(u.name)}</td><td class="muted">${esc(u.username)}</td>
   <td><select data-uid="${esc(u.uid)}" data-uf="member"><option value="">– not linked –</option>${S.cfg.team.map(t => `<option ${t === u.member ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></td>
   <td><select data-uid="${esc(u.uid)}" data-uf="role" ${u.uid === S.me.uid ? "disabled" : ""}><option value="user" ${u.role !== "admin" ? "selected" : ""}>User</option><option value="admin" ${u.role === "admin" ? "selected" : ""}>Admin</option></select></td>
   <td>${u.uid === S.me.uid ? `<span class="pill ok">You</span>` : `<button class="btn sm ${u.active ? "" : "pri"}" data-act="toggleUser" data-uid="${esc(u.uid)}">${u.active ? "Deactivate" : "Activate"}</button>`}</td>
   <td>${String(u.uid).startsWith("gh:") ? `<span class="muted">GitHub admin</span>`
      : `<button class="btn sm" data-act="resetPass" data-uid="${esc(u.uid)}">New passphrase</button>
         <button class="btn sm" data-act="delUser" data-uid="${esc(u.uid)}">Remove</button>`}</td></tr>`).join("")}
  </tbody></table></div>
  <div class="card" style="margin-top:16px"><b>What each role can do</b>
   <p style="margin:8px 0 0"><span class="role admin">Admin</span> everything, including Setup, Users, Analysis and Reports.</p>
   <p style="margin:6px 0 0"><span class="role">User</span> Allocation (own rows), BLL, Salesforce and Reports — view, export and download.</p></div>`;
}

/* ===================== events ===================== */
function bind() {
  const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
  on("anFrom", "change", e => { U.anFrom = e.target.value || U.anFrom; route(); }); on("anTo", "change", e => { U.anTo = e.target.value || U.anTo; route(); });
  on("alUser", "change", e => { U.alUser = e.target.value; route(); }); on("alFrom", "change", e => { U.alFrom = e.target.value || U.alFrom; route(); }); on("alTo", "change", e => { U.alTo = e.target.value || U.alTo; route(); });
  on("bllUser", "change", e => { U.bllUser = e.target.value; route(); }); on("bllMode", "change", e => { U.bllMode = e.target.value; route(); });
  on("sfUser", "change", e => { U.sfUser = e.target.value; route(); }); on("sfWeek", "change", e => { if (e.target.value) U.sfWeek = saturdayEnding(e.target.value); route(); });
  on("prUser", "change", e => { U.prUser = e.target.value; route(); }); on("prWeek", "change", e => { if (e.target.value) U.prWeek = monday(e.target.value); route(); });
  ["rpType", "rpFrom", "rpTo", "rpUser", "rpProj"].forEach(id => on(id, "change", e => { if (e.target.value) U[id] = e.target.value; route(); }));
  on("bllStart", "change", e => { if (e.target.value) { S.cfg.bllStart = monday(e.target.value); saveCfg(); } });
  on("bllWeeks", "change", e => { S.cfg.bllWeeks = Math.max(1, Math.min(104, +e.target.value || 34)); saveCfg(); });
  on("imp", "change", e => { const f = e.target.files[0]; if (f) importXlsx(f); });
}
$("app").addEventListener("input", e => {
  const t = e.target, d = t.dataset;
  if (d.f) {
    let v = t.value;
    if (d.f !== "comment") { v = v.replace(",", "."); if ((v !== "" && isNaN(+v)) || +v < 0 || +v > 24) { t.style.outline = "2px solid var(--bad)"; return; } t.style.outline = ""; v = v === "" ? null : +v; }
    setEntry(d.d, d.u, d.pid, d.tid, { [d.f]: v }); updTotals(d.d, d.u); return;
  }
  if (d.ali !== undefined) { saveAlias(d.ali, t.value); return; }
  if (!isAdmin()) return;
  if (d.nd !== undefined) {
    const n = node(d.nd); if (!n) return;
    if (d.nk === "planned") n.planned = +t.value || 0;
    else if (d.nk === "cost") n.cost = t.value !== "" && !isNaN(+t.value) ? +t.value : t.value;
    else n[d.nk] = t.value;
    saveNodes(); return;
  }
  if (d.asg !== undefined) {
    const a = (S.cfg.assigns || [])[+d.asg]; if (!a) return;
    a[d.af] = t.value; saveNodes(); return;
  }
  if (d.team !== undefined) { const old = S.cfg.team[+d.team], nw = t.value.trim(); if (!nw) return; S.cfg.team[+d.team] = nw; if (S.cfg.assign[old] && nw !== old) { S.cfg.assign[nw] = S.cfg.assign[old]; delete S.cfg.assign[old]; }
    (S.cfg.assigns || []).forEach(a => { if (a.person === old) a.person = nw; }); saveCfg(); return; }
  if (d.rid !== undefined) { (S.cfg.resIds ??= {})[d.rid] = t.value.trim(); saveCfg(); return; }
});
$("app").addEventListener("change", async e => {
  const t = e.target, d = t.dataset;
  if (d.ali !== undefined) { saveAlias(d.ali, t.value); return; }
  if (!isAdmin()) return;
  if (d.nd !== undefined) {
    const n = node(d.nd); if (!n) return;
    n[d.nk] = t.type === "checkbox" ? t.checked : t.value;
    saveNodes(); route(); return;
  }
  if (d.asg !== undefined) {
    const a = (S.cfg.assigns || [])[+d.asg]; if (!a) return;
    a[d.af] = t.value; saveNodes(); route(); return;
  }
  if (d.uid) { try { await api("/api/users/" + encodeURIComponent(d.uid), "PATCH", { [d.uf]: t.value }); await loadState(); toast("Saved"); } catch (er) { toast("Couldn’t update user: " + er.message); } }
  if (d.team !== undefined) route();
});
$("app").addEventListener("click", async e => {
  const b = e.target.closest("[data-act]"); if (!b) return; const a = b.dataset.act, c = S.cfg;
  if (a === "anWeek") { U.anFrom = add(U.anFrom, +b.dataset.d); U.anTo = add(U.anTo, +b.dataset.d); }
  if (a === "anReport") { xlsxSave(`Analysis_${U.anFrom}_${U.anTo}.xlsx`, buildReport("summary", U.anFrom, U.anTo, "__all", "__all")); return; }
  if (a === "alWeek") { U.alFrom = add(U.alFrom, +b.dataset.d); U.alTo = add(U.alTo, +b.dataset.d); }
  if (a === "alThis") { U.alFrom = monday(today); U.alTo = add(U.alFrom, 4); }
  if (a === "sfWk") U.sfWeek = add(U.sfWeek, +b.dataset.d);
  if (a === "prWk") U.prWeek = add(U.prWeek, +b.dataset.d);
  if (a === "copyEA") { rows({ owner: b.dataset.u, from: b.dataset.d, to: b.dataset.d }).forEach(x => { if (+x.est && x.pid && x.tid) setEntry(x.date, String(x.owner).trim(), x.pid, x.tid, { act: +x.est }); }); toast("Actuals set from estimates"); }
  if (a === "sfCopy") { const { by } = sfData(U.sfUser, U.sfWeek); copy(Object.entries(by).map(([p, v]) => [p, ...v.map(x => x.toFixed(2))].join("\t")).join("\n")); return; }
  if (a === "sfCsv") { downloadCsv(`Timecard_${slug(U.sfUser)}_${U.sfWeek}.csv`, [SF_HEAD, ...sfRows([U.sfUser], U.sfWeek)]); return; }
  if (a === "prCsv") { xlsxSave(`Prima_${U.prWeek}.xlsx`, [["Prima", [["Person", "Project", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Total"], ...primaRows(U.prUser, U.prWeek)]]]); return; }
  if (a === "xlsxBll") { xlsxSave("BLL_Tracker.xlsx", buildReport("bll", S.cfg.bllStart, add(S.cfg.bllStart, 7 * S.cfg.bllWeeks), isAdmin() ? "__all" : (U.bllUser === "__all" ? "__all" : U.bllUser), "__all")); return; }
  if (a === "rpRange") { const r = b.dataset.r; if (r === "week") { U.rpFrom = monday(today); U.rpTo = add(U.rpFrom, 4); } if (r === "month") { U.rpFrom = today.slice(0, 8) + "01"; U.rpTo = add(I(new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7), 1))), -1); } if (r === "all") { const ds = [...S.entries.values()].map(x => x.date).sort(); U.rpFrom = ds[0] || today; U.rpTo = ds[ds.length - 1] || today; } }
  if (a === "rpXlsx") { xlsxSave(`${slug(REPORTS[U.rpType].split(" (")[0])}_${U.rpFrom}_${U.rpTo}.xlsx`, buildReport(U.rpType, U.rpFrom, U.rpTo, U.rpUser, U.rpProj)); return; }
  if (a === "rpCsv") { const s = buildReport(U.rpType, U.rpFrom, U.rpTo, U.rpUser, U.rpProj)[0]; if (s) downloadCsv(`${slug(s[0])}_${U.rpFrom}_${U.rpTo}.csv`, s[1]); return; }

  if (!isAdmin()) { route(); return; }

  /* ---- work structure ---- */
  if (a === "addTop") {
    const nm = ($("newTop") && $("newTop").value.trim()) || "";
    if (!nm) { toast("Type a name first"); return; }
    addTop(nm); saveNodes(); route(); toast("Top level added"); return;
  }
  if (a === "addMid") {
    const t0 = node(b.dataset.id); if (!t0) return;
    addMid(t0.id, "New " + midLabel(t0).toLowerCase()); saveNodes(); route(); return;
  }
  if (a === "addTask") {
    const m = node(b.dataset.id); if (!m) return;
    addTask(m.id, "New " + taskLabel(topOf(m)).toLowerCase()); saveNodes(); route(); return;
  }
  if (a === "hideNode") {
    const n = node(b.dataset.id); if (!n) return;
    if (!n.hidden && !confirm(`Hide "${n.name}"?\n\nIt stops appearing on new allocation screens. All hours already recorded against it are kept and still count in reports.`)) return;
    n.hidden = !n.hidden; saveNodes(); route(); toast(n.hidden ? "Hidden" : "Visible again"); return;
  }
  if (a === "addAsg") {
    const firstMid = Object.values(nodes()).find(n => n.kind === "mid" && !n.hidden);
    if (!firstMid) { toast("Add a project first"); return; }
    (S.cfg.assigns ??= []).push({ person: S.cfg.team[0] || "", node: firstMid.id, from: "", to: "" });
    saveNodes(); route(); return;
  }
  if (a === "delAsg") { (S.cfg.assigns || []).splice(+b.dataset.i, 1); saveNodes(); route(); return; }

  /* ---- users ---- */
  if (a === "saveShared") {
    const t = $("shTok").value.trim(); if (!t) { toast("Paste the shared token first"); return; }
    try { await api("/api/shared", "PUT", { token: t }); S.sharedToken = t; toast("Shared token saved"); route(); }
    catch (er) { toast(er.message); } return;
  }
  if (a === "addUser") {
    const name = $("newUser").value.trim(); if (!name) { toast("Enter a username"); return; }
    try {
      const pass = await ghAddTeamLogin(name, S.sharedToken, ghToken());
      await api("/api/users/" + encodeURIComponent(name.toLowerCase()), "PUT",
        { username: name, name, role: "user", active: true, hasLogin: true });
      await loadState(); route();
      prompt(`Sign-in created for ${name}.\n\nSend them the username and this passphrase.\nIt cannot be shown again — copy it now:`, pass);
    } catch (er) { toast(er.message); } return;
  }
  if (a === "resetPass") {
    const uid = b.dataset.uid; const u = S.users.find(x => x.uid === uid); if (!u) return;
    if (!confirm(`Give ${u.name} a new passphrase? Their current one stops working.`)) return;
    try { const pass = await ghAddTeamLogin(u.username, S.sharedToken, ghToken());
      prompt(`New passphrase for ${u.name} — copy it now:`, pass); }
    catch (er) { toast(er.message); } return;
  }
  if (a === "delUser") {
    const uid = b.dataset.uid; const u = S.users.find(x => x.uid === uid); if (!u) return;
    if (!confirm(`Remove ${u.name}? Their recorded hours stay.`)) return;
    try { await ghRemoveTeamLogin(u.username, ghToken());
      await api("/api/users/" + encodeURIComponent(uid), "DELETE");
      await loadState(); route(); toast("Removed"); }
    catch (er) { toast(er.message); } return;
  }
  if (a === "toggleUser") { const u = S.users.find(x => x.uid === b.dataset.uid); if (!u) return;
    try { await api("/api/users/" + encodeURIComponent(u.uid), "PATCH", { active: !u.active }); await loadState(); route(); toast(u.active ? "Deactivated" : "Activated – remember to link a team name"); } catch (er) { toast("Couldn’t update: " + er.message); } return; }

  /* ---- team list ---- */
  if (a === "addTeam") { c.team.push("New person"); saveCfg(); }
  if (a === "delTeam") { if (!confirm("Remove " + c.team[+b.dataset.i] + "? Their hours stay stored.")) return; c.team.splice(+b.dataset.i, 1); saveCfg(); }
  route();
});

/* ===================== files ===================== */
const csvCell = v => { v = String(v ?? ""); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
function blobDownload(name, blob) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); toast("Downloaded " + name); }
function downloadCsv(name, aoa) { blobDownload(name, new Blob(["\ufeff" + aoa.map(r => r.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" })); }
function xlsxSave(name, sheets) {
  if (!window.XLSX) { toast("Excel library didn’t load"); return; }
  if (!sheets.length) { toast("Nothing to export"); return; }
  const wb = XLSX.utils.book_new();
  sheets.forEach(([n, aoa]) => { const ws = XLSX.utils.aoa_to_sheet(aoa.length ? aoa : [["No data"]]);
    const widths = []; aoa.forEach(r => (r || []).forEach((v, i) => { widths[i] = Math.min(45, Math.max(widths[i] || 8, String(v ?? "").length + 2)); }));
    ws["!cols"] = widths.map(w => ({ wch: w })); XLSX.utils.book_append_sheet(wb, ws, n.replace(/[\\\/?*\[\]:]/g, "").slice(0, 31)); });
  XLSX.writeFile(wb, name); toast("Downloaded " + name);
}
async function copy(t) { try { await navigator.clipboard.writeText(t); toast("Copied – paste into the first hours cell in Salesforce"); } catch (e) { toast("Copy blocked – use Timecard CSV instead"); } }

/* ===================== import (admin) ===================== */
async function importXlsx(file) {
  if (!isAdmin() || !window.XLSX) return;
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true }); let n = 0; const c = S.cfg, bulk = new Map();
  for (const name of wb.SheetNames) {
    const a = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
    const hr = a.findIndex(r => r && ["Date", "Owner", "Task"].every(k => r.some(v => String(v).trim() === k))); if (hr < 0) continue;
    const H = a[hr].map(v => String(v ?? "").trim().toLowerCase()), ci = k => H.findIndex(x => x.startsWith(k));
    const iD = ci("date"), iO = ci("owner"), iP = ci("project"), iT = ci("task"), iE = ci("estimated"), iA = ci("actual"), iC = ci("comment");
    const cur = [null, null, null];
    for (const r of a.slice(hr + 1)) {
      if (!r) continue;
      [iD, iO, iP].forEach((ix, k) => { if (ix >= 0 && r[ix] != null && String(r[ix]).trim() !== "") cur[k] = r[ix]; });
      const t = r[iT] == null ? "" : String(r[iT]).trim(); if (!t || !cur[0] || !cur[1] || !cur[2]) continue;
      const est = iE >= 0 ? +r[iE] || 0 : 0, act = iA >= 0 ? +r[iA] || 0 : 0, cm = iC >= 0 && r[iC] != null ? String(r[iC]).trim() : "";
      if (!est && !act && !cm) continue;
      let d = cur[0];
      if (d instanceof Date) d = I(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())));
      else { const m = String(d).match(/(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/); if (!m) continue; d = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
      const o = String(cur[1]).trim(), p = String(cur[2]).trim(), task = t.replace(/^dummy tasks?\s*\d+\s*-\s*/i, "").trim() || t;
      if (!c.team.includes(o)) c.team.push(o);
      let mid = Object.values(nodes()).find(x => x.kind === "mid" && x.name === p);
      if (!mid) { const id = addMid(/^internal$/i.test(p) ? "INT" : "BFS", p); mid = nodes()[id]; }
      if (!childrenOf(mid.id, "task").some(x => x.name === task)) addTask(mid.id, task);
      const tn = childrenOf(mid.id, "task").find(x => x.name === task || x.alias === task);
      const kk = keyOfIds(d, o, mid.id, tn.id), ex = bulk.get(kk) || {};
      bulk.set(kk, { date: d, owner: o, pid: mid.id, tid: tn.id, project: dispName(mid), task: dispName(tn), est: (+ex.est || 0) + est || null, act: (+ex.act || 0) + act || null, comment: [ex.comment, cm].filter(Boolean).join("; ") });
      n++;
    }
  }
  if (!n) { toast("No allocation rows found – the header needs Date, Owner and Task"); return; }
  try { syncLegacy(); await api("/api/config", "PUT", S.cfg); const r = await api("/api/entries/bulk", "POST", { items: [...bulk.values()] }); await loadState();
        toast(`Imported ${r.saved} entries` + (r.errors.length ? ` (${r.errors.length} skipped)` : "")); route(); }
  catch (e) { toast("Import failed: " + e.message); }
}
document.title = APP_NAME;
boot();
