/* Concurrency Bootcamp service worker — offline-first app shell.
   Bump CACHE on every content change so clients pick up the new build. */
const CACHE = "cbootcamp-v3";
const SHELL = [
  "./", "./index.html", "./worker.js", "./manifest.webmanifest", "./icon.svg",
  "./js/core.js", "./js/content.js", "./js/app.js",
];

// Precache the shell so the app opens with no network.
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

// Drop old caches, take control of open pages immediately.
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Stale-while-revalidate: serve from cache instantly, refresh in the background.
// Caching the real network Response preserves CloudFront's COOP/COEP headers,
// so cross-origin isolation (SharedArrayBuffer in the workers module) survives offline.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached || caches.match("./index.html"));
      return cached || network;
    })
  );
});
