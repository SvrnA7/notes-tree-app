/* Blattwerk Service Worker: alles offline verfügbar, Updates auf Knopfdruck */
const VERSION = "blattwerk-1.1.0";
const ASSETS = [
  "./",
  "index.html",
  "app.css",
  "app.js",
  "fonts.css",
  "manifest.webmanifest",
  "fonts/CormorantGaramond-italic-500-latin-ext.woff2",
  "fonts/CormorantGaramond-italic-500-latin.woff2",
  "fonts/CormorantGaramond-normal-500-latin-ext.woff2",
  "fonts/CormorantGaramond-normal-500-latin.woff2",
  "fonts/Jost-normal-300-latin-ext.woff2",
  "fonts/Jost-normal-300-latin.woff2",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png"
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)));
});
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener("message", e => { if (e.data === "skipWaiting") self.skipWaiting(); });
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  if (req.mode === "navigate") {
    e.respondWith(caches.match("./index.html").then(r => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  })));
});
