/* Distributed Systems Bootcamp service worker — offline-first app shell.
   Bump CACHE on every content change so clients pick up the new build.
   Registered at scope ./ so it wins over the root course's worker on these
   pages; ../js/app.js (the shared engine) is same-origin and precaches fine. */
const CACHE = "dsysbootcamp-v5";
const SHELL = [
  "./", "./index.html", "./manifest.webmanifest", "./icon.svg",
  "./js/core.js", "./js/content.js", "./js/sim.js",
  "./js/packs/10-lessons-replication.js",
  "./js/packs/20-lessons-coordination.js",
  "./js/packs/30-hunt-build.js",
  "./js/packs/40-cloud-map.js",
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
