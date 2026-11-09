// Tally – Offline-Speicher (Service Worker)
// Mit Internet: immer die neueste Version laden (und für offline merken).
// Ohne Internet: die zuletzt gemerkte Version starten – wie eine normale App.
const CACHE = "tally-offline-v1";
const BASE = new URL("./", self.location).href;
const INDEX = BASE + "index.html";
const ASSETS = [INDEX, BASE + "manifest.webmanifest", BASE + "apple-touch-icon.png", BASE + "icon-192.png", BASE + "icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(ASSETS.map((u) => fetch(u, { cache: "reload" }).then((r) => r.ok && c.put(u, r)).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !req.url.startsWith(BASE)) return;

  const isPage = req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("/index.html");
  if (isPage) {
    // Seite: zuerst Netz (max. 3 s), sonst gemerkte Version
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 3000);
        const res = await fetch(url.href, { cache: "no-store", signal: ctrl.signal });
        clearTimeout(t);
        if (res.ok) { cache.put(INDEX, res.clone()); return res; }
        throw new Error("status " + res.status);
      } catch (err) {
        const hit = await cache.match(INDEX);
        return hit || new Response("Tally ist gerade offline nicht verfügbar.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })());
    return;
  }

  // Icons usw.: aus dem Speicher, im Hintergrund auffrischen
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then((r) => { if (r.ok) cache.put(req, r.clone()); return r; }).catch(() => null);
    return hit || (await net) || new Response("", { status: 504 });
  })());
});
