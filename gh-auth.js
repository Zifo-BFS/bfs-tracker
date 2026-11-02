// gh-auth.js - sign-in for the team
import { GH } from "./config.js";

const SUB = globalThis.crypto.subtle;
const rnd = n => globalThis.crypto.getRandomValues(new Uint8Array(n));
const te = new TextEncoder(), td = new TextDecoder();
const b64 = b => btoa(String.fromCharCode(...new Uint8Array(b)));
const ub64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const ITER = 600000;

let TOKEN = null, WHO = null;

export const ghToken = () => TOKEN;
export const ghIdentity = () => WHO;
export function ghLogout() {
  TOKEN = null; WHO = null;
  try { sessionStorage.removeItem("bbt_sess"); localStorage.removeItem("bbt_gh_token"); } catch (e) {}
}
function remember() {
  try { sessionStorage.setItem("bbt_sess", JSON.stringify({ t: TOKEN, w: WHO })); } catch (e) {}
}
export function ghRestore() {
  try {
    const s = JSON.parse(sessionStorage.getItem("bbt_sess") || "null");
    if (s && s.t) { TOKEN = s.t; WHO = s.w; return true; }
    const legacy = localStorage.getItem("bbt_gh_token");
    if (legacy) { TOKEN = legacy; WHO = { uid: null, username: null, isGhAdmin: true }; return true; }
  } catch (e) {}
  return false;
}

async function deriveKey(pass, salt, iter) {
  const base = await SUB.importKey("raw", te.encode(pass), "PBKDF2", false, ["deriveKey"]);
  return SUB.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function sealToken(token, pass) {
  const salt = rnd(16), iv = rnd(12);
  const key = await deriveKey(pass, salt, ITER);
  const ct = await SUB.encrypt({ name: "AES-GCM", iv }, key, te.encode(token));
  return { s: b64(salt), i: b64(iv), c: b64(ct), n: ITER };
}
async function openToken(rec, pass) {
  const key = await deriveKey(pass, ub64(rec.s), rec.n || ITER);
  return td.decode(await SUB.decrypt({ name: "AES-GCM", iv: ub64(rec.i) }, key, ub64(rec.c)));
}
async function uhash(username) {
  const d = await SUB.digest("SHA-256", te.encode(String(username).trim().toLowerCase() + ":" + GH.owner));
  return b64(d).replace(/[+/=]/g, "").slice(0, 22);
}

const WORDS = ("amber anchor apple arrow autumn basil beacon beetle birch bishop bison blossom bolt bramble brass breeze bridge bronze brook butter cable cactus candle canyon cedar chalk cherry chimney cinder clover cobalt comet copper coral cotton crane crystal cypress daisy dawn delta denim desert diamond dolphin domino dragon dune eagle ember emerald falcon fennel fern flint forest fossil galaxy garnet ginger glacier granite gravel hammer harbour harvest hazel heather hickory hollow honey ivory jasmine jasper juniper kernel kettle lagoon lantern lattice laurel lemon lilac linen lotus lumber lunar magnet mahogany maple marble marigold meadow medal mercury meteor midnight mineral mint mirror moss mulberry nectar needle nickel nutmeg oasis ocean olive onyx opal orchard orbit otter oxide paddle palace pansy pebble pepper pewter pigeon pillar pine piper pistol plaza plover plum pollen poppy portal prairie prism pumpkin quarry quartz quiver radish rafter ramble rapid raven ribbon ridge river robin rocket rosemary rust saffron sage salmon sandal sapphire satin scarlet sepia shadow shale shell sierra silver slate sorrel spruce stellar stone stork summit sunset sycamore tangerine teak temple thicket thimble thistle thunder timber topaz torch tulip tundra turret umber valley vanilla velvet verbena vessel violet walnut wander willow window winter wisteria yarrow zephyr zinc").split(" ");
export function ghNewPassphrase(words = 7) {
  const out = [];
  for (let i = 0; i < words; i++) {
    const r = new Uint32Array(1); globalThis.crypto.getRandomValues(r);
    out.push(WORDS[r[0] % WORDS.length]);
  }
  return out.join("-");
}

function appRepo() { return GH.appRepo || "bfs-tracker"; }

export async function ghReadAuth() {
  try {
    const r = await fetch("auth.json?t=" + Date.now(), { cache: "no-store" });
    if (r.ok) return await r.json();
  } catch (e) {}
  return { v: 1, users: {} };
}
async function ghWriteAuth(obj, token) {
  const path = `/repos/${GH.owner}/${appRepo()}/contents/auth.json`;
  const head = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
                 Authorization: "Bearer " + token };
  let sha = null;
  const cur = await fetch("https://api.github.com" + path, { headers: head });
  if (cur.ok) sha = (await cur.json()).sha;
  const body = { message: "update team sign-in", content: btoa(JSON.stringify(obj, null, 1)), branch: GH.branch };
  if (sha) body.sha = sha;
  const r = await fetch("https://api.github.com" + path, { method: "PUT", headers: head, body: JSON.stringify(body) });
  if (!r.ok) throw new Error("Could not save sign-in file: " + ((await r.json()).message || r.status));
}

export async function ghLoginAdmin(token) {
  const r = await fetch("https://api.github.com/user", {
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" } });
  if (!r.ok) throw new Error("That token did not work. Check you copied all of it.");
  const u = await r.json();
  TOKEN = token; WHO = { uid: "gh:" + u.login, username: u.login, name: u.name || u.login, isGhAdmin: true };
  remember();
  try { localStorage.setItem("bbt_gh_token", token); } catch (e) {}
  return WHO;
}
export async function ghLoginUser(username, passphrase) {
  const auth = await ghReadAuth();
  const rec = auth.users[await uhash(username)];
  if (!rec) throw new Error("No account with that username. Check the spelling, or ask your admin.");
  let token;
  try { token = await openToken(rec, String(passphrase).trim()); }
  catch (e) { throw new Error("Wrong passphrase. Check it was copied exactly, including the dashes."); }
  TOKEN = token;
  WHO = { uid: String(username).trim().toLowerCase(), username: String(username).trim(), isGhAdmin: false };
  remember();
  return WHO;
}

export async function ghAddTeamLogin(username, sharedToken, adminToken) {
  const name = String(username).trim();
  if (!/^[A-Za-z0-9._-]{2,30}$/.test(name)) throw new Error("Username: 2-30 letters, numbers, dot, dash or underscore.");
  if (!sharedToken) throw new Error("Set the shared team token in Setup first.");
  const auth = await ghReadAuth();
  const pass = ghNewPassphrase();
  auth.users[await uhash(name)] = await sealToken(sharedToken, pass);
  await ghWriteAuth(auth, adminToken);
  return pass;
}
export async function ghRemoveTeamLogin(username, adminToken) {
  const auth = await ghReadAuth();
  delete auth.users[await uhash(username)];
  await ghWriteAuth(auth, adminToken);
}
export async function ghHasTeamLogin(username) {
  const auth = await ghReadAuth();
  return !!auth.users[await uhash(username)];
}
