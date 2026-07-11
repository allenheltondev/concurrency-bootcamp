/* Concurrency Bootcamp service worker — offline-first app shell.
   Bump CACHE on every content change so clients pick up the new build.
   Registered at scope ./ (now /js-concurrency/) so it wins over the root
   kill-switch worker on these pages; ../js/app.js and ../js/account.js (the
   shared engine + account layer) are same-origin and precache fine. */
const CACHE = "cbootcamp-v12";
const SHELL = [
  "./", "./index.html", "./worker.js", "./manifest.webmanifest", "./icon.svg",
  "./js/core.js", "./js/content.js", "./js/sim.js",
  "./js/packs/foundations.js",
  "./js/packs/ordered-merge.js",
  "./js/packs/async-iterators.js",
  "./js/packs/cancellation.js",
  "./js/packs/node-loop.js",
  "./js/packs/temporal-map.js",
  "../js/app.js",
  "../js/account.js",
  "../js/vendor/rsc-nav.global.js",
  "../js/vendor/rsc-nav.css",
  "../js/vendor/assets/cloud-logo.svg",
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
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  // Never touch the API or the auth config: a stale progress response (or an
  // index.html offline fallback served as "JSON") would corrupt cloud sync.
  if (url.pathname.startsWith("/api/") || url.pathname.endsWith("/auth-config.json")) return;
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
