"use strict";
/* Blattwerk · Notizen & Aufgaben
   Daten: nur lokal (IndexedDB, Rückfall localStorage). Backup als JSON-Datei über das iOS-Teilen-Menü. */

const APP_VERSION = "1.1.0";
const $ = (s, el = document) => el.querySelector(s);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/* ---------- Symbole ---------- */
const ICONS = {
  leaf: '<path d="M5 21C5 11 11 5 22 4c0 11-6 17-16 17zM5 21l9-9"/>',
  week: '<rect x="3" y="5" width="20" height="17" rx="3"/><path d="M3 10h20"/><circle cx="8" cy="15" r=".9"/><circle cx="13" cy="15" r=".9"/><circle cx="18" cy="15" r=".9"/><circle cx="8" cy="19" r=".9"/>',
  month: '<rect x="3" y="5" width="20" height="17" rx="3"/><path d="M3 10h20M8 3v4M18 3v4M7 14h3M12 14h3M17 14h2M7 18h3M12 18h3"/>',
  gift: '<rect x="4" y="10" width="18" height="12" rx="2"/><path d="M3 10h20M13 10v12M13 10c-2-4-7-5-7-2s5 2 7 2zM13 10c2-4 7-5 7-2s-5 2-7 2z"/>',
  heart: '<path d="M13 21s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 21 10c0 6-8 11-8 11z"/>',
  cart: '<path d="M3 4h3l2.5 12h11l2-8H7.5"/><circle cx="10" cy="20.5" r="1.3"/><circle cx="18" cy="20.5" r="1.3"/>',
  book: '<path d="M4 5c3-1.5 6-1.5 9 0v16c-3-1.5-6-1.5-9 0zM13 5c3-1.5 6-1.5 9 0v16c-3-1.5-6-1.5-9 0z"/>',
  star: '<path d="M13 3l2.8 6 6.2.6-4.7 4.2 1.4 6.2L13 16.8 7.3 20l1.4-6.2L4 9.6l6.2-.6z"/>',
  home: '<path d="M4 11l9-7 9 7v10H4zM10 21v-6h6v6"/>',
  pen: '<path d="M16 4l5 5L9 21H4v-5z"/>'
};
const icon = (k, cls = "tile-icon") => `<svg class="${cls}" viewBox="0 0 26 26" aria-hidden="true">${ICONS[k] || ICONS.leaf}</svg>`;
const SVG_PLUS = '<svg viewBox="0 0 20 20"><path d="M10 4v12M4 10h12"/></svg>';
const SVG_CHECK = '<svg viewBox="0 0 16 16"><path d="M3 8.5l3.2 3L13 4.5"/></svg>';
const SVG_CHEV = '<svg viewBox="0 0 12 12"><path d="M2 4l4 4 4-4"/></svg>';
const SVG_CLOSE = '<svg viewBox="0 0 16 16"><path d="M3 3l10 10M13 3L3 13"/></svg>';
const SVG_SHARE = '<svg class="ios-share" viewBox="0 0 16 16"><path d="M8 1v9M5 4l3-3 3 3M4 7H3v8h10V7h-1"/></svg>';

/* ---------- Speicher ---------- */
const DB_NAME = "blattwerk", STORE = "kv", LS_KEY = "blattwerk-state";
let db = null, useLS = false;
function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function idbGet(key) {
  return new Promise((res, rej) => {
    const q = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  });
}
function idbSet(key, val) {
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(val, key);
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
  });
}
function freshState() {
  return {
    schema: 2, createdAt: Date.now(), grown: 0, lastBackup: null,
    sections: [
      { id: "heute", name: "Heute", icon: "leaf", fixed: true },
      { id: "woche", name: "Woche", icon: "week" },
      { id: "monat", name: "Monat", icon: "month" },
      { id: "geschenke", name: "Geschenkideen", icon: "gift" }
    ],
    tasks: [], dismissed: {}
  };
}
function sanitize(s) {
  const base = freshState();
  const out = Object.assign(base, typeof s === "object" && s ? s : {});
  out.sections = (Array.isArray(out.sections) ? out.sections : base.sections)
    .filter(x => x && typeof x.id === "string" && typeof x.name === "string")
    .map(x => ({ id: x.id, name: x.name.slice(0, 60), icon: ICONS[x.icon] ? x.icon : "leaf", fixed: x.id === "heute" }));
  if (!out.sections.some(x => x.id === "heute")) out.sections.unshift({ id: "heute", name: "Heute", icon: "leaf", fixed: true });
  const ids = new Set(out.sections.map(x => x.id));
  out.tasks = (Array.isArray(out.tasks) ? out.tasks : [])
    .filter(t => t && typeof t.text === "string")
    .map(t => ({ id: String(t.id || uid()), section: ids.has(t.section) ? t.section : "heute", text: t.text.slice(0, 2000), note: typeof t.note === "string" ? t.note.slice(0, 5000) : "", done: !!t.done, createdAt: +t.createdAt || +t.at || Date.now(), doneAt: t.done ? (+t.doneAt || +t.at || Date.now()) : null }));
  out.grown = Math.max(0, Math.floor(+out.grown || 0));
  out.dismissed = typeof out.dismissed === "object" && out.dismissed ? out.dismissed : {};
  out.schema = 2;
  return out;
}
async function loadState() {
  try {
    db = await idbOpen();
    const s = await idbGet("state");
    if (s) return sanitize(s);
    // Übernahme aus einem älteren localStorage-Stand
    try { const ls = JSON.parse(localStorage.getItem(LS_KEY)); if (ls) return sanitize(ls); } catch (e) {}
    return freshState();
  } catch (e) {
    useLS = true;
    try { const ls = JSON.parse(localStorage.getItem(LS_KEY)); if (ls) return sanitize(ls); } catch (e2) {}
    return freshState();
  }
}
let state = null, saveTimer = null;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 120); }
async function flush() {
  clearTimeout(saveTimer);
  if (!state) return;
  const snap = JSON.parse(JSON.stringify(state));
  try {
    if (!useLS && db) await idbSet("state", snap);
    else localStorage.setItem(LS_KEY, JSON.stringify(snap));
  } catch (e) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(snap)); } catch (e2) { toast("Speichern fehlgeschlagen. Bitte ein Backup sichern."); }
  }
}
document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); else { renderHeader(); renderBanners(); } });
window.addEventListener("pagehide", flush);

/* ---------- Haptik ---------- */
const hapticEl = (() => {
  const l = document.createElement("label"); l.className = "haptic"; l.setAttribute("aria-hidden", "true");
  const i = document.createElement("input"); i.type = "checkbox"; i.setAttribute("switch", ""); i.tabIndex = -1;
  l.appendChild(i); document.body.appendChild(l); return l;
})();
function haptic() {
  try { if (navigator.vibrate) navigator.vibrate(12); else if (isIOS()) hapticEl.click(); } catch (e) {}
}

/* ---------- Datum ---------- */
const WD = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const MO = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
function fmtDate(ts) { const d = new Date(ts); return `${d.getDate()}. ${MO[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} Uhr`; }
function daysSince(ts) { return Math.floor((Date.now() - ts) / 86400000); }

/* ---------- Baum ---------- */
function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const NS = "http://www.w3.org/2000/svg";
const LEAF_D = "M0 0C3.5-5.2 10.5-7 17-.6C10.8 6.2 3.8 5.4 0 0Z";
const LEAF_V = "M1.2 0C6 -.6 11 -.7 15.6 -.5";
function buildTree() {
  const R = rng(271126), items = [], UP = -Math.PI / 2, MAXL = 6, BX = 300, BY = 600;
  const q = (b, t) => { const u = 1 - t; return [u * u * b.x + 2 * u * t * b.mx + t * t * b.ex, u * u * b.y + 2 * u * t * b.my + t * t * b.ey]; };
  // Blatt: Farbton nach Höhe/Zufall (außen heller, innen dunkler, ein paar ockerfarbene)
  const leaf = (x, y, ang, birth, s, level) => {
    const r = R(); let tone = r < .12 ? 3 : r < .38 ? 2 : r < .72 ? 0 : 1;
    if (level <= 2 && tone === 2) tone = 1;
    items.push({ k: "l", x, y, a: ang * 180 / Math.PI, s, birth, tone });
  };
  function branch(x, y, ang, len, w0, w1, level, birth) {
    const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len, bend = (R() - .5) * len * (level === 0 ? .18 : .42);
    const b = { k: "b", x, y, ex, ey, w0, w1, level, birth,
      mx: (x + ex) / 2 + Math.cos(ang + Math.PI / 2) * bend, my: (y + ey) / 2 + Math.sin(ang + Math.PI / 2) * bend };
    items.push(b);
    if (level >= 2) {
      const n = 2 + Math.floor(R() * (level >= 4 ? 4 : 3));
      for (let i = 0; i < n; i++) {
        const t = .25 + .65 * (i / n) + R() * .1, [px, py] = q(b, t), side = i % 2 ? 1 : -1;
        leaf(px, py, ang + side * (.65 + R() * .6), birth + .3 + t * .9 + R() * 1.1, .7 + R() * .5, level);
      }
    }
    if (level === 1 && R() < .5) { // kleine Seitentriebe am Stamm-Ast
      const t = .45 + R() * .3, [px, py] = q(b, t), side = R() < .5 ? -1 : 1;
      branch(px, py, ang + side * (.9 + R() * .3), len * .38, w1 * .55, w1 * .2, 5, birth + 1.2 + R());
    }
    if (level < MAXL) {
      const n = level === 0 ? 3 : (R() < .38 ? 3 : 2), spread = level === 0 ? .66 : .48 + R() * .22;
      for (let i = 0; i < n; i++) {
        let a = ang + (i - (n - 1) / 2) * spread + (R() - .5) * .34;
        a = a * .85 + UP * .15;
        const main = n === 3 ? i === 1 : i === (R() < .5 ? 0 : 1), k = main ? .8 : .66;
        branch(ex, ey, a, len * (main ? .76 : .66) * (.92 + R() * .16), w1 * (main ? .9 : .78), w1 * k * .66, level + 1, birth + 1 + R() * 1.4);
      }
    } else {
      const n = 4 + Math.floor(R() * 2);
      for (let i = 0; i < n; i++) leaf(ex, ey, ang + (i - (n - 1) / 2) * .55, birth + .6 + R() * 1.4, .8 + R() * .45, level);
      if (R() < .24) items.push({ k: "f", x: ex + Math.cos(ang) * 3, y: ey + Math.sin(ang) * 3, r: R() * 72, s: .8 + R() * .5, birth: birth + 2.4 + R() * 2, berry: R() < .3 });
    }
  }
  branch(BX, BY, UP, 150, 26, 15, 0, 0);
  // Wurzeln, immer sichtbar
  const roots = [[-1, .9, 46], [1, .8, 52], [-1, .35, 30], [1, .3, 26]].map(([side, lift, len]) => {
    const sx = BX + side * 7, ex = BX + side * (len + 14), ey = BY + 6 - lift * 2;
    return { k: "r", x: sx, y: BY - 6, mx: BX + side * (len * .45), my: BY + 3, ex, ey, w0: 9 * (lift + .4), w1: 1.2, level: 0, birth: -1 };
  });
  items.sort((a, b) => a.birth - b.birth);
  return { items, roots, BX, BY };
}
const TR = buildTree(), TREE = TR.items;
const PER_TASK = Math.max(4, Math.round((TREE.length - 1) / 280));
const TASKS_FOR_FULL = Math.ceil((TREE.length - 1) / PER_TASK);
let shownCount = 0;
// verjüngter Ast als gefüllte Form entlang einer quadratischen Kurve
function limbPath(b, f) {
  const N = 9, L = [], Rr = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = 1 - t;
    const x = u * u * b.x + 2 * u * t * b.mx + t * t * b.ex, y = u * u * b.y + 2 * u * t * b.my + t * t * b.ey;
    const dx = 2 * u * (b.mx - b.x) + 2 * t * (b.ex - b.mx), dy = 2 * u * (b.my - b.y) + 2 * t * (b.ey - b.my), dl = Math.hypot(dx, dy) || 1;
    let w = Math.max(.55, (b.w0 + (b.w1 - b.w0) * t) * f / 2);
    if (b.k === "b" && b.level === 0) w += Math.pow(u, 5) * 12 * f; // Stammfuß
    L.push([x - dy / dl * w, y + dx / dl * w]); Rr.push([x + dy / dl * w, y - dx / dl * w]);
  }
  const p = a => a[0].toFixed(1) + " " + a[1].toFixed(1), r = b.w1 * f / 2;
  let d = "M" + p(L[0]) + L.slice(1).map(a => "L" + p(a)).join("");
  d += `A${r.toFixed(1)} ${r.toFixed(1)} 0 0 0 ${p(Rr[N])}` + Rr.slice(0, N).reverse().map(a => "L" + p(a)).join("") + "Z";
  if (b.k === "b" && b.level > 0 && b.level < 4) { const j = b.w0 * f / 2; d += `M${(b.x - j).toFixed(1)} ${b.y.toFixed(1)}a${j.toFixed(1)} ${j.toFixed(1)} 0 1 0 ${(2 * j).toFixed(1)} 0a${j.toFixed(1)} ${j.toFixed(1)} 0 1 0 ${(-2 * j).toFixed(1)} 0`; }
  return d;
}
function treeBounds() {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity;
  for (const it of TREE) { const pad = it.k === "l" ? 18 * it.s : it.k === "f" ? 8 : 4, x = it.k === "b" ? it.ex : it.x, y = it.k === "b" ? it.ey : it.y;
    x0 = Math.min(x0, x - pad); x1 = Math.max(x1, x + pad); y0 = Math.min(y0, y - pad); }
  const half = Math.max(TR.BX - x0, x1 - TR.BX) + 12;
  return [TR.BX - half, y0 - 12, half * 2, TR.BY + 26 - (y0 - 12)];
}
function el(tag, attrs) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
function renderTreeSkeleton() {
  const svg = $("#tree"); svg.innerHTML = "";
  svg.setAttribute("viewBox", treeBounds().map(v => v.toFixed(0)).join(" "));
  svg.innerHTML = `<defs>
    <linearGradient id="barkG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6F5A47"/><stop offset=".45" stop-color="#8C7660"/><stop offset="1" stop-color="#A08A72"/></linearGradient>
    <radialGradient id="shadowG"><stop offset="0" stop-color="#8C7660" stop-opacity=".28"/><stop offset="1" stop-color="#8C7660" stop-opacity="0"/></radialGradient>
  </defs>`;
  const { BX, BY } = TR;
  svg.appendChild(el("ellipse", { cx: BX, cy: BY + 4, rx: 150, ry: 13, fill: "url(#shadowG)" }));
  // Gräser und Steinchen
  const G = rng(77), grass = el("g", { class: "grass" });
  for (let i = 0; i < 26; i++) {
    const x = BX + (G() - .5) * 250, h = 5 + G() * 9, lean = (G() - .5) * 7;
    if (Math.abs(x - BX) < 16) continue;
    grass.appendChild(el("path", { d: `M${x.toFixed(1)} ${BY + 4}q${(lean * .3).toFixed(1)} ${(-h * .6).toFixed(1)} ${lean.toFixed(1)} ${(-h).toFixed(1)}` }));
  }
  svg.appendChild(grass);
  [[-92, 2.6], [104, 3.2], [-58, 1.8], [70, 2]].forEach(([dx, r]) => svg.appendChild(el("ellipse", { class: "pebble", cx: BX + dx, cy: BY + 5, rx: r * 1.5, ry: r })));
  const gR = el("g", { class: "limbs" }), gB = el("g", { class: "limbs" }), gL = el("g"), gF = el("g");
  svg.append(gR, gB, gL, gF);
  for (const r of TR.roots) { r.el = el("path", { class: "br" }); gR.appendChild(r.el); }
  for (const it of TREE) {
    if (it.k === "b") {
      it.el = el("path", { class: "br h" }); it.el.style.transformOrigin = `${it.x.toFixed(1)}px ${it.y.toFixed(1)}px`; gB.appendChild(it.el);
      if (it.level === 0) { // Rindenlinien am Stamm
        it.bark = el("path", { class: "bark-line h", d: `M${TR.BX - 5} ${TR.BY - 8}C${TR.BX - 7} ${TR.BY - 50} ${TR.BX - 2} ${TR.BY - 90} ${TR.BX - 3} ${TR.BY - 128}M${TR.BX + 6} ${TR.BY - 14}C${TR.BX + 4} ${TR.BY - 46} ${TR.BX + 7} ${TR.BY - 70} ${TR.BX + 4} ${TR.BY - 104}` });
        gB.appendChild(it.bark);
      }
    } else if (it.k === "l") {
      const g = el("g", { transform: `translate(${it.x.toFixed(1)} ${it.y.toFixed(1)}) rotate(${it.a.toFixed(0)}) scale(${it.s.toFixed(2)})` });
      it.el = el("g", { class: "lf h t" + it.tone });
      it.el.append(el("path", { d: LEAF_D }), el("path", { class: "vein", d: LEAF_V }));
      g.appendChild(it.el); gL.appendChild(g);
    } else {
      const g = el("g", { transform: `translate(${it.x.toFixed(1)} ${it.y.toFixed(1)}) rotate(${it.r.toFixed(0)}) scale(${it.s.toFixed(2)})` });
      it.el = el("g", { class: "fl h" + (it.berry ? " berry" : "") });
      if (it.berry) it.el.innerHTML = `<circle cx="-2" cy="1" r="2.6"/><circle cx="2.2" cy="-1.2" r="2.3"/><circle cx="1" cy="2.8" r="2"/>`;
      else it.el.innerHTML = [0, 72, 144, 216, 288].map(a => `<ellipse class="pt" rx="2.4" ry="3.6" transform="rotate(${a}) translate(0 -3.4)"/>`).join("") + `<circle class="ct" r="1.7"/>`;
      g.appendChild(it.el); gF.appendChild(g);
    }
  }
  // Zweig-Deko im Kopf
  const leaves = [[38, 110, -40], [46, 92, 210], [55, 76, -30], [64, 60, 205], [72, 46, -25], [80, 32, 200], [86, 20, -20]];
  $("#sprig").innerHTML = `<path d="M20 138 C40 100 60 60 92 10"/>` + leaves.map(([x, y, r]) => `<path transform="translate(${x} ${y}) rotate(${r}) scale(1.9)" d="M0 0C3-4.6 9-4.8 13 0C9 4.8 3 4.6 0 0Z M1 0H11"/>`).join("");
}
function updateTree(animate) {
  const target = Math.min(TREE.length, 1 + state.grown * PER_TASK);
  const f = .42 + .58 * Math.min(1, target / TREE.length * 1.4);
  let nb = 0, nl = 0;
  for (const r of TR.roots) r.el.setAttribute("d", limbPath(r, f));
  TREE.forEach((it, i) => {
    const vis = i < target;
    if (it.k === "b" && vis) it.el.setAttribute("d", limbPath(it, f));
    if (vis && it.el.classList.contains("h")) {
      it.el.classList.remove("h"); if (it.bark) it.bark.classList.remove("h");
      if (animate) { it.el.classList.add("sprout"); it.el.style.animationDelay = (Math.random() * .3).toFixed(2) + "s"; it.k === "b" ? nb++ : nl++; }
    } else if (!vis && !it.el.classList.contains("h")) { it.el.classList.add("h"); it.el.classList.remove("sprout"); if (it.bark) it.bark.classList.add("h"); }
  });
  const trunk = TREE.find(x => x.bark); if (trunk) trunk.bark.classList.toggle("h", f < .8);
  shownCount = target;
  const shown = TREE.slice(0, target), b = shown.filter(x => x.k === "b").length, l = shown.filter(x => x.k === "l").length, fl = shown.filter(x => x.k === "f").length, g = state.grown;
  $("#treeStats").textContent = g === 0 ? "Erledige eine Aufgabe, dann wächst er." :
    `${g} erledigt · ${b} ${b === 1 ? "Ast" : "Äste"} · ${l} ${l === 1 ? "Blatt" : "Blätter"}` + (fl ? ` · ${fl} ${fl === 1 ? "Blüte" : "Blüten"}` : "");
  return { nb, nl };
}
function growMessage({ nb, nl }) {
  const g = state.grown;
  if (shownCount >= TREE.length && g === TASKS_FOR_FULL) return "Dein Baum ist ausgewachsen. Wunderbar!";
  if ([10, 25, 50, 100, 150, 200, 250].includes(g)) return `${g} Aufgaben erledigt. Dein Baum wird groß.`;
  if (nb && nl) return nb === 1 ? `Ein neuer Zweig und ${nl === 1 ? "ein Blatt" : nl + " Blätter"}.` : `${nb} neue Zweige wachsen.`;
  if (nb) return nb === 1 ? "Ein neuer Zweig wächst." : `${nb} neue Zweige wachsen.`;
  if (nl) return nl === 1 ? "Ein neues Blatt." : `${nl} neue Blätter.`;
  return "Erledigt.";
}

/* ---------- Toast ---------- */
let toastTimer, toastAction = null;
function toast(msg, actionLabel, action) {
  const t = $("#toast"); $("#toastMsg").textContent = msg;
  const b = $("#toastAct"); toastAction = action || null;
  b.hidden = !action; if (action) b.textContent = actionLabel;
  t.classList.add("show"); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove("show"); toastAction = null; }, action ? 5000 : 2400);
}
$("#toastAct").addEventListener("click", () => { const a = toastAction; $("#toast").classList.remove("show"); toastAction = null; if (a) a(); });

/* ---------- Aufgaben-Logik ---------- */
const secById = id => state.sections.find(s => s.id === id);
const tasksOf = (sec, done) => state.tasks.filter(t => t.section === sec && t.done === done).sort((a, b) => done ? (b.doneAt - a.doneAt) : (a.createdAt - b.createdAt));
function addTask(section, text, note = "") {
  text = text.trim(); if (!text) return null;
  const t = { id: uid(), section, text, note: note.trim(), done: false, createdAt: Date.now(), doneAt: null };
  state.tasks.push(t); save(); return t;
}
function setDone(task, done) {
  if (task.done === done) return { nb: 0, nl: 0 };
  task.done = done; task.doneAt = done ? Date.now() : null;
  state.grown = Math.max(0, state.grown + (done ? 1 : -1));
  save();
  return updateTree(done);
}
function deleteTask(id) {
  const idx = state.tasks.findIndex(t => t.id === id); if (idx < 0) return;
  const [t] = state.tasks.splice(idx, 1); save(); renderAll();
  toast("Aufgabe gelöscht.", "Rückgängig", () => { state.tasks.splice(Math.min(idx, state.tasks.length), 0, t); save(); renderAll(); });
}

/* ---------- Rendering ---------- */
const openDone = {};
function taskRow(t) {
  return `<li class="task${t.done ? " is-done" : ""}" data-id="${esc(t.id)}">
    <div class="task-bg">Löschen</div>
    <div class="task-fg">
      <button class="check" data-act="toggle" aria-label="${t.done ? "Wieder öffnen" : "Als erledigt markieren"}"><i>${SVG_CHECK}</i></button>
      <button class="body" data-act="edit" aria-label="Bearbeiten: ${esc(t.text)}"><span class="txt">${esc(t.text)}</span>${t.note ? `<span class="note">${esc(t.note)}</span>` : ""}</button>
    </div></li>`;
}
function listBlock(sec) {
  const open = tasksOf(sec, false), done = tasksOf(sec, true), isOpen = !!openDone[sec];
  const emptyMsg = sec === "heute"
    ? (done.length ? "Alles erledigt für heute. Schön!" : "Was steht heute an? Schreib es unten hinein.")
    : "Noch nichts hier.";
  return `
    <ul class="list" data-sec="${esc(sec)}">${open.map(taskRow).join("") || `<li class="empty">${emptyMsg}</li>`}</ul>
    <form class="add" data-sec="${esc(sec)}">
      <input id="add-${esc(sec)}" name="t" autocomplete="off" autocorrect="on" enterkeyhint="done" placeholder="${sec === "heute" ? "Neue Aufgabe für heute" : "Neuer Eintrag"}" aria-label="Neuer Eintrag">
      <button type="submit" aria-label="Hinzufügen">${SVG_PLUS}</button>
    </form>
    ${done.length ? `
      <button class="done-toggle" data-act="done" data-sec="${esc(sec)}" aria-expanded="${isOpen}">Erledigt · ${done.length} ${SVG_CHEV}</button>
      <div class="done-wrap" ${isOpen ? "" : "hidden"}>
        <ul class="list done-list" data-sec="${esc(sec)}">${done.map(taskRow).join("")}</ul>
        <div class="done-tools"><button class="linkbtn" data-act="clearDone" data-sec="${esc(sec)}">Erledigte entfernen</button></div>
      </div>` : ""}`;
}
function greeting() { const h = new Date().getHours(); return h < 5 ? "Gute Nacht." : h < 11 ? "Guten Morgen." : h < 17 ? "Schönen Tag." : h < 22 ? "Guten Abend." : "Gute Nacht."; }
function renderHeader() {
  const now = new Date();
  $("#hdrDate").textContent = `${WD[now.getDay()]}, ${now.getDate()}. ${MO[now.getMonth()]}`;
  $("#greet1").textContent = greeting();
  const open = state.tasks.filter(t => t.section === "heute" && !t.done).length;
  $("#greet2").textContent = open === 0 ? "Was bringt dich heute weiter?" : open === 1 ? "Noch eine Sache für heute." : `Noch ${open} Dinge für heute.`;
}
function renderToday() {
  const active = document.activeElement && document.activeElement.id === "add-heute";
  $("#todayInner").innerHTML = `<div class="today-head"><h2 class="sec-title">Heute</h2></div>` + listBlock("heute");
  if (active) $("#add-heute").focus();
}
function renderGrid() {
  const tiles = state.sections.filter(s => !s.fixed).map((s, i) => {
    const open = tasksOf(s.id, false);
    const prev = open.slice(0, 3).map(t => `<li>${esc(t.text)}</li>`).join("") + (open.length > 3 ? `<li class="more">+ ${open.length - 3} weitere</li>` : "");
    return `<button class="tile tone-${i % 3}" data-open="${esc(s.id)}">
      <span class="tile-head">${icon(s.icon)}<span class="tile-title">${esc(s.name)}</span></span>
      <span class="tile-count">${open.length ? open.length + " offen" : (state.tasks.some(t => t.section === s.id) ? "alles erledigt" : "noch leer")}</span>
      <ul class="tile-preview">${prev}</ul></button>`;
  }).join("");
  $("#grid").innerHTML = tiles + `<button class="tile tile-add" data-act="newSection">${SVG_PLUS}<span>Bereich hinzufügen</span></button>`;
}
function renderBanners() {
  const out = [];
  if (updateReady) out.push(`<div class="banner"><p><b>Neue Version bereit.</b></p><button class="pill" data-act="applyUpdate">Aktualisieren</button></div>`);
  if (!isStandalone() && isIOS() && !state.dismissed.install)
    out.push(`<div class="banner"><p>Für die App: tippe auf ${SVG_SHARE} <b>Teilen</b> und dann <b>„Zum Home-Bildschirm“</b>.</p><button class="x" data-act="dismiss" data-key="install" aria-label="Ausblenden">×</button></div>`);
  const n = state.tasks.length;
  const last = state.lastBackup;
  const due = n >= 5 && (!last ? daysSince(state.createdAt) >= 7 : daysSince(last) >= 14);
  const snoozed = state.dismissed.backupUntil && Date.now() < state.dismissed.backupUntil;
  if (due && !snoozed)
    out.push(`<div class="banner"><p>${last ? `Letztes Backup vor ${daysSince(last)} Tagen.` : "Du hast noch kein Backup."} Sichere deine Aufgaben.</p><button class="pill" data-act="backup">Sichern</button><button class="x" data-act="snoozeBackup" aria-label="Später">×</button></div>`);
  $("#banners").innerHTML = out.join("");
}
function renderAll() {
  renderHeader(); renderToday(); renderGrid(); renderBanners();
  for (const s of sheets) if (!s.opts.static) s.render();
}

/* ---------- Sheets (von unten, wie iOS) ---------- */
const sheets = [];
function openSheet(build, opts = {}) {
  const el = document.createElement("div");
  el.className = "sheet"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true");
  el.innerHTML = `<div class="sheet-scrim" data-close></div><div class="sheet-panel"><div class="grabber"></div><div class="sheet-content"></div></div>`;
  const panel = $(".sheet-panel", el), content = $(".sheet-content", el);
  content.style.cssText = "display:flex;flex-direction:column;gap:14px";
  const s = { el, panel, content, opts, render: () => { content.innerHTML = build(s); opts.after && opts.after(s); }, close: () => closeSheet(s) };
  s.render();
  $("#sheets").appendChild(el); sheets.push(s);
  document.documentElement.style.overflow = "hidden";
  el.addEventListener("click", e => { if (e.target.closest("[data-close]")) closeSheet(s); });
  enableDragToClose(s);
  if (opts.focus) setTimeout(() => { const f = $(opts.focus, el); if (f) f.focus(); }, 340);
  return s;
}
function closeSheet(s) {
  const i = sheets.indexOf(s); if (i < 0) return;
  sheets.splice(i, 1);
  if (s.opts.onClose) s.opts.onClose(s);
  s.el.classList.add("closing");
  setTimeout(() => s.el.remove(), 240);
  if (!sheets.length) document.documentElement.style.overflow = "";
  renderAll();
}
function enableDragToClose(s) {
  let y0 = null, dy = 0;
  const panel = s.panel;
  panel.addEventListener("touchstart", e => {
    const fromHead = e.target.closest(".grabber,.sheet-head");
    if (!fromHead && panel.scrollTop > 0) return;
    if (e.target.closest("input,textarea,.list")) return;
    y0 = e.touches[0].clientY; dy = 0;
  }, { passive: true });
  panel.addEventListener("touchmove", e => {
    if (y0 === null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    if (dy > 0) { panel.style.transition = "none"; panel.style.transform = `translateY(${dy}px)`; }
  }, { passive: true });
  panel.addEventListener("touchend", () => {
    if (y0 === null) return;
    panel.style.transition = "transform .25s cubic-bezier(.2,.8,.2,1)";
    if (dy > 110) { closeSheet(s); } else panel.style.transform = "";
    y0 = null;
  });
}
function confirmSheet({ title, text, okLabel, danger = false }) {
  return new Promise(res => {
    let answered = false;
    const s = openSheet(() => `
      <div class="sheet-head"><h2 class="sec-title">${esc(title)}</h2></div>
      <p style="margin:0;color:var(--muted)">${esc(text)}</p>
      <div class="actions"><button class="btn ${danger ? "danger armed" : "primary"}" data-ok>${esc(okLabel)}</button><button class="btn" data-cancel>Abbrechen</button></div>`,
      { static: true, onClose: () => { if (!answered) res(false); } });
    s.el.addEventListener("click", e => {
      if (e.target.closest("[data-ok]")) { answered = true; res(true); closeSheet(s); }
      else if (e.target.closest("[data-cancel]")) { answered = true; res(false); closeSheet(s); }
    });
  });
}

/* Bereich */
function openSection(id) {
  let renaming = false;
  const s = openSheet(sh => {
    const sec = secById(id);
    if (!sec) { setTimeout(() => closeSheet(sh)); return ""; }
    return `
      <div class="sheet-head">
        ${renaming
          ? `<form class="add" id="renameForm" style="flex:1"><input id="renameInput" value="${esc(sec.name)}" maxlength="60" aria-label="Name des Bereichs"><button type="submit" aria-label="Speichern">${SVG_CHECK.replace('viewBox="0 0 16 16"', 'viewBox="0 0 16 16" style="stroke:currentColor;stroke-width:2;fill:none;width:18px;height:18px"')}</button></form>`
          : `<h2 class="sec-title">${esc(sec.name)}</h2><button class="close" data-act="rename" aria-label="Umbenennen">${icon("pen", "")}</button>`}
        <button class="close" data-close aria-label="Schließen">${SVG_CLOSE}</button>
      </div>
      ${listBlock(sec.id)}
      ${sec.fixed ? "" : `<div class="done-tools"><button class="linkbtn" data-act="delSection" data-sec="${esc(sec.id)}" style="color:var(--danger)">Bereich löschen</button></div>`}`;
  }, {
    after: sh => {
      const f = $("#renameForm", sh.el);
      if (f) { const i = $("#renameInput", sh.el); i.focus(); i.select(); }
    }
  });
  s.el.addEventListener("click", e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    if (b.dataset.act === "rename") { renaming = true; s.render(); }
  });
  s.el.addEventListener("submit", e => {
    if (e.target.id !== "renameForm") return;
    e.preventDefault(); e.stopPropagation();
    const v = $("#renameInput", s.el).value.trim(); const sec = secById(id);
    if (v && sec) { sec.name = v; save(); }
    renaming = false; renderAll();
  }, true);
}
/* Neuer Bereich */
function openNewSection() {
  let chosen = "leaf";
  const s = openSheet(() => `
    <div class="sheet-head"><h2 class="sec-title">Neuer Bereich</h2><button class="close" data-close aria-label="Schließen">${SVG_CLOSE}</button></div>
    <form id="nsForm" class="actions">
      <div class="field"><span class="label">Name</span><input id="nsName" maxlength="60" placeholder="z. B. Einkauf, Ideen, Haushalt" autocomplete="off" enterkeyhint="done"></div>
      <div class="field"><span class="label">Symbol</span><div class="chips icons-pick">${Object.keys(ICONS).filter(k => k !== "pen").map(k => `<button type="button" class="chip" data-icon="${k}" aria-pressed="${k === chosen}" aria-label="${k}">${icon(k, "")}</button>`).join("")}</div></div>
      <button class="btn primary" type="submit">Anlegen</button>
    </form>`, { focus: "#nsName", static: true });
  s.el.addEventListener("click", e => {
    const c = e.target.closest("[data-icon]"); if (!c) return;
    chosen = c.dataset.icon;
    s.el.querySelectorAll("[data-icon]").forEach(x => x.setAttribute("aria-pressed", x.dataset.icon === chosen));
  });
  s.el.addEventListener("submit", e => {
    e.preventDefault(); e.stopPropagation();
    const name = $("#nsName", s.el).value.trim(); if (!name) { $("#nsName", s.el).focus(); return; }
    const sec = { id: "s-" + uid(), name, icon: chosen }; state.sections.push(sec); save();
    closeSheet(s); haptic(); setTimeout(() => openSection(sec.id), 260);
  }, true);
}
/* Aufgabe bearbeiten / schnell anlegen */
function openTaskEditor(taskId, presetSection) {
  const isNew = !taskId;
  const t = isNew ? { text: "", note: "", section: presetSection || "heute", done: false } : state.tasks.find(x => x.id === taskId);
  if (!t) return;
  let section = t.section, armed = false;
  const s = openSheet(() => `
    <div class="sheet-head"><h2 class="sec-title">${isNew ? "Neue Aufgabe" : "Bearbeiten"}</h2><button class="close" data-close aria-label="Schließen">${SVG_CLOSE}</button></div>
    <form id="edForm" class="actions">
      <div class="field"><textarea id="edText" rows="2" maxlength="2000" placeholder="Was ist zu tun?" enterkeyhint="done">${esc(t.text)}</textarea></div>
      <div class="field"><span class="label">Notiz</span><textarea id="edNote" rows="3" maxlength="5000" placeholder="Details, Link, Größe, Preis …">${esc(t.note || "")}</textarea></div>
      <div class="field"><span class="label">Bereich</span><div class="chips">${state.sections.map(x => `<button type="button" class="chip" data-sec="${esc(x.id)}" aria-pressed="${x.id === section}">${esc(x.name)}</button>`).join("")}</div></div>
      <button class="btn primary" type="submit">${isNew ? "Hinzufügen" : "Fertig"}</button>
      ${isNew ? "" : `<div class="row2"><button type="button" class="btn" data-act="edToggle">${t.done ? "Wieder öffnen" : "Erledigt"}</button><button type="button" class="btn danger${armed ? " armed" : ""}" data-act="edDelete">${armed ? "Wirklich löschen?" : "Löschen"}</button></div>`}
    </form>`, { focus: isNew ? "#edText" : null, static: true });
  const read = () => ({ text: $("#edText", s.el).value, note: $("#edNote", s.el).value });
  s.el.addEventListener("click", e => {
    const c = e.target.closest("[data-sec]");
    if (c && c.classList.contains("chip")) { section = c.dataset.sec; s.el.querySelectorAll(".chip[data-sec]").forEach(x => x.setAttribute("aria-pressed", x.dataset.sec === section)); return; }
    const b = e.target.closest("[data-act]"); if (!b) return;
    if (b.dataset.act === "edToggle") { const v = read(); t.text = v.text.trim() || t.text; t.note = v.note.trim(); t.section = section; const r = setDone(t, !t.done); if (t.done) { haptic(); toast(growMessage(r)); } closeSheet(s); }
    if (b.dataset.act === "edDelete") {
      if (!armed) { armed = true; b.classList.add("armed"); b.textContent = "Wirklich löschen?"; return; }
      closeSheet(s); deleteTask(t.id);
    }
  });
  $("#edText", s.el).addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#edForm", s.el).requestSubmit(); } });
  s.el.addEventListener("submit", e => {
    e.preventDefault(); e.stopPropagation();
    const v = read();
    if (!v.text.trim()) { $("#edText", s.el).focus(); return; }
    if (isNew) { addTask(section, v.text, v.note); haptic(); toast(`Zu „${secById(section).name}“ hinzugefügt.`); }
    else { t.text = v.text.trim(); t.note = v.note.trim(); t.section = section; save(); }
    closeSheet(s);
  }, true);
}

/* ---------- Backup ---------- */
function backupPayload() {
  return { app: "blattwerk", format: 1, appVersion: APP_VERSION, exportedAt: new Date().toISOString(), data: state };
}
async function doBackup() {
  await flush();
  const d = new Date(), stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const name = `blattwerk-backup-${stamp}.json`;
  const json = JSON.stringify(backupPayload(), null, 2);
  const file = new File([json], name, { type: "application/json" });
  let ok = false;
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "Blattwerk Backup" });
      ok = true;
    }
  } catch (e) {
    if (e && e.name === "AbortError") return;
  }
  if (!ok) {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000); ok = true;
  }
  state.lastBackup = Date.now(); delete state.dismissed.backupUntil; save(); renderAll();
  toast("Backup erstellt.");
}
function parseBackup(text) {
  const j = JSON.parse(text);
  const data = j && j.app === "blattwerk" && j.data ? j.data : (j && Array.isArray(j.tasks) ? j : null);
  if (!data || !Array.isArray(data.tasks) || !Array.isArray(data.sections)) throw new Error("format");
  return sanitize(data);
}
async function importBackup(file) {
  let incoming;
  try { incoming = parseBackup(await file.text()); }
  catch (e) { toast("Diese Datei ist kein Blattwerk-Backup."); return; }
  const n = incoming.tasks.length;
  const s = openSheet(() => `
    <div class="sheet-head"><h2 class="sec-title">Backup laden</h2><button class="close" data-close aria-label="Schließen">${SVG_CLOSE}</button></div>
    <div class="card"><div class="stat"><span>Aufgaben im Backup</span><span>${n}</span></div><div class="stat"><span>Bereiche</span><span>${incoming.sections.length}</span></div><div class="stat"><span>Baum</span><span>${incoming.grown} erledigt</span></div></div>
    <p style="margin:0;color:var(--muted);font-size:14px">Zusammenführen behält alles, was schon auf diesem Gerät ist, und ergänzt das Backup. Ersetzen löscht den aktuellen Stand.</p>
    <div class="actions"><button class="btn primary" data-imp="merge">Zusammenführen</button><button class="btn danger" data-imp="replace">Aktuellen Stand ersetzen</button><button class="btn" data-close>Abbrechen</button></div>`, { static: true });
  s.el.addEventListener("click", async e => {
    const b = e.target.closest("[data-imp]"); if (!b) return;
    if (b.dataset.imp === "replace") {
      const ok = await confirmSheet({ title: "Wirklich ersetzen?", text: `Alle ${state.tasks.length} Aufgaben auf diesem Gerät werden durch das Backup ersetzt.`, okLabel: "Ersetzen", danger: true });
      if (!ok) return;
      state = incoming;
    } else {
      const secIds = new Set(state.sections.map(x => x.id));
      for (const sec of incoming.sections) if (!secIds.has(sec.id)) state.sections.push(sec);
      const tIds = new Set(state.tasks.map(x => x.id));
      for (const t of incoming.tasks) if (!tIds.has(t.id)) state.tasks.push(t);
      state.grown = Math.max(state.grown, incoming.grown);
      state.lastBackup = Math.max(state.lastBackup || 0, incoming.lastBackup || 0) || null;
    }
    await flush(); renderTreeSkeleton(); updateTree(false);
    closeSheet(s); haptic(); toast("Backup geladen.");
  });
}
$("#importFile").addEventListener("change", e => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) importBackup(f); });

/* ---------- Einstellungen ---------- */
let persisted = null;
async function checkPersist() {
  try { if (navigator.storage && navigator.storage.persisted) { persisted = await navigator.storage.persisted(); if (!persisted && navigator.storage.persist) persisted = await navigator.storage.persist(); } } catch (e) {}
}
function openSettings() {
  let armed = false;
  const s = openSheet(() => {
    const open = state.tasks.filter(t => !t.done).length, done = state.tasks.length - open;
    return `
    <div class="sheet-head"><h2 class="sec-title">Daten &amp; Backup</h2><button class="close" data-close aria-label="Schließen">${SVG_CLOSE}</button></div>
    <div class="card">
      <div class="stat"><span>Offene Aufgaben</span><span>${open}</span></div>
      <div class="stat"><span>Erledigt (in Listen)</span><span>${done}</span></div>
      <div class="stat"><span>Bereiche</span><span>${state.sections.length}</span></div>
      <div class="stat"><span>Baum</span><span>${state.grown} von ${TASKS_FOR_FULL}</span></div>
      <div class="stat"><span>Letztes Backup</span><span>${state.lastBackup ? fmtDate(state.lastBackup) : "noch keins"}</span></div>
      <p>Alles liegt nur auf diesem Gerät, ohne Konto und ohne Cloud.${persisted === true ? " Der Speicher ist vor automatischem Löschen geschützt." : ""}</p>
    </div>
    <div class="actions">
      <button class="btn primary" data-act="backup">Backup sichern</button>
      <button class="btn" data-act="import">Backup laden</button>
    </div>
    <div class="card">
      <h3>Auf ein neues iPhone übertragen</h3>
      <ol>
        <li>Hier auf „Backup sichern“ tippen und die Datei per AirDrop senden oder in „Dateien“ (z. B. iCloud Drive) sichern.</li>
        <li>Auf dem neuen Gerät Blattwerk zum Home-Bildschirm hinzufügen und öffnen.</li>
        <li>„Backup laden“ tippen und die Datei auswählen.</li>
      </ol>
    </div>
    ${isStandalone() ? "" : `<div class="card"><h3>Als App installieren</h3><p>In Safari auf ${SVG_SHARE} Teilen tippen, dann „Zum Home-Bildschirm“. Danach startet Blattwerk wie eine App, auch ohne Internet.</p></div>`}
    <div class="actions"><button class="btn danger${armed ? " armed" : ""}" data-act="wipe">${armed ? "Sicher? Alles wird gelöscht" : "Alle Daten löschen"}</button></div>
    <p style="margin:0;text-align:center;font-size:12px;color:var(--muted)">Blattwerk ${APP_VERSION}</p>`;
  });
  s.el.addEventListener("click", async e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    if (b.dataset.act === "wipe") {
      if (!armed) { armed = true; s.render(); setTimeout(() => { armed = false; if (sheets.includes(s)) s.render(); }, 4000); return; }
      state = freshState(); await flush(); renderTreeSkeleton(); updateTree(false); closeSheet(s); toast("Alle Daten gelöscht.");
    }
  });
  checkPersist().then(() => { if (sheets.includes(s)) s.render(); });
}

/* ---------- Wischen zum Löschen ---------- */
let swipe = null;
document.addEventListener("pointerdown", e => {
  const fg = e.target.closest(".task-fg"); if (!fg || e.button > 0) return;
  if (e.target.closest(".check")) return;
  swipe = { li: fg.parentElement, fg, x0: e.clientX, y0: e.clientY, dx: 0, active: false, id: e.pointerId };
});
document.addEventListener("pointermove", e => {
  if (!swipe || e.pointerId !== swipe.id) return;
  const dx = e.clientX - swipe.x0, dy = e.clientY - swipe.y0;
  if (!swipe.active) {
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { swipe = null; return; }
    if (dx < -10 && Math.abs(dx) > Math.abs(dy)) { swipe.active = true; swipe.li.classList.add("dragging", "swiping"); }
    else return;
  }
  swipe.dx = Math.min(0, dx);
  swipe.fg.style.transform = `translateX(${swipe.dx}px)`;
  if (swipe.dx < -100 && !swipe.buzzed) { swipe.buzzed = true; haptic(); }
  if (swipe.dx > -100) swipe.buzzed = false;
});
function endSwipe() {
  if (!swipe) return;
  const s = swipe; swipe = null;
  if (!s.active) return;
  s.li.classList.remove("dragging");
  s.suppressClick = true; suppressNextClick = true;
  if (s.dx < -100) {
    s.fg.style.transform = "translateX(-110%)";
    setTimeout(() => deleteTask(s.li.dataset.id), 200);
  } else {
    s.fg.style.transform = "";
    setTimeout(() => s.li.classList.remove("swiping"), 250);
  }
}
let suppressNextClick = false;
document.addEventListener("pointerup", endSwipe);
document.addEventListener("pointercancel", endSwipe);

/* ---------- Klicks ---------- */
document.addEventListener("click", e => {
  if (suppressNextClick) { suppressNextClick = false; if (e.target.closest(".task-fg")) { e.preventDefault(); return; } }
  const open = e.target.closest("[data-open]");
  if (open) { openSection(open.dataset.open); return; }
  const b = e.target.closest("[data-act]"); if (!b) return;
  const act = b.dataset.act, li = b.closest(".task");
  switch (act) {
    case "toggle": {
      const t = state.tasks.find(x => x.id === li.dataset.id); if (!t) return;
      const willBeDone = !t.done;
      const r = setDone(t, willBeDone);
      if (willBeDone) {
        haptic(); toast(growMessage(r));
        li.classList.add("is-done");
        setTimeout(() => { li.classList.add("leaving"); setTimeout(renderAll, 340); }, 600);
      } else renderAll();
      break;
    }
    case "edit": openTaskEditor(li.dataset.id); break;
    case "done": openDone[b.dataset.sec] = !openDone[b.dataset.sec]; renderAll(); break;
    case "clearDone": {
      const sec = b.dataset.sec, removed = state.tasks.filter(t => t.section === sec && t.done);
      state.tasks = state.tasks.filter(t => !(t.section === sec && t.done)); save(); renderAll();
      toast(`${removed.length} erledigte entfernt.`, "Rückgängig", () => { state.tasks.push(...removed); save(); renderAll(); });
      break;
    }
    case "newSection": openNewSection(); break;
    case "delSection": {
      const sec = secById(b.dataset.sec); if (!sec) return;
      const n = state.tasks.filter(t => t.section === sec.id).length;
      confirmSheet({ title: "Bereich löschen?", text: `„${sec.name}“ und ${n === 1 ? "1 Eintrag" : n + " Einträge"} darin werden gelöscht. Dein Baum bleibt, wie er ist.`, okLabel: "Löschen", danger: true })
        .then(ok => { if (!ok) return; state.tasks = state.tasks.filter(t => t.section !== sec.id); state.sections = state.sections.filter(x => x.id !== sec.id); save(); renderAll(); toast("Bereich gelöscht."); });
      break;
    }
    case "backup": doBackup(); break;
    case "import": $("#importFile").click(); break;
    case "dismiss": state.dismissed[b.dataset.key] = true; save(); renderBanners(); break;
    case "snoozeBackup": state.dismissed.backupUntil = Date.now() + 3 * 86400000; save(); renderBanners(); break;
    case "applyUpdate": applyUpdate(); break;
  }
});
document.addEventListener("submit", e => {
  const f = e.target; if (!f.classList.contains("add") || !f.dataset.sec) return;
  e.preventDefault();
  const inp = f.querySelector("input"); const t = addTask(f.dataset.sec, inp.value);
  if (!t) return;
  inp.value = ""; renderAll(); haptic();
  const again = document.getElementById("add-" + f.dataset.sec); if (again) again.focus();
});
$("#fab").addEventListener("click", () => {
  const top = sheets[sheets.length - 1];
  const sec = top && top.el.querySelector(".add[data-sec]") ? top.el.querySelector(".add[data-sec]").dataset.sec : "heute";
  openTaskEditor(null, sec);
});
$("#openSettings").addEventListener("click", openSettings);
document.addEventListener("keydown", e => { if (e.key === "Escape" && sheets.length) closeSheet(sheets[sheets.length - 1]); });

/* ---------- Offline & Updates ---------- */
let updateReady = false, waitingWorker = null;
function applyUpdate() { if (waitingWorker) waitingWorker.postMessage("skipWaiting"); else location.reload(); }
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").then(reg => {
    const onWaiting = w => { waitingWorker = w; updateReady = true; renderBanners(); };
    if (reg.waiting && navigator.serviceWorker.controller) onWaiting(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const nw = reg.installing; if (!nw) return;
      nw.addEventListener("statechange", () => { if (nw.state === "installed" && navigator.serviceWorker.controller) onWaiting(nw); });
    });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (reloaded) return; reloaded = true; flush().then(() => location.reload()); });
}

/* ---------- Start ---------- */
(async function start() {
  state = await loadState();
  renderTreeSkeleton();
  updateTree(false);
  renderAll();
  if (isStandalone()) checkPersist();
  // Mitternacht: Datum und Gruß aktualisieren
  setInterval(renderHeader, 60000);
})();
