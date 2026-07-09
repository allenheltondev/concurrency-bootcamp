/* Root kill-switch service worker.
   The JS Concurrency Bootcamp that used to live at "/" relocated to
   "/js-concurrency/" (see docs/PLATFORM_PLAN.md "URL strategy" and
   docs/COURSE_PATTERN.md) so the root URL is free for the React hub.
   Any browser that already installed the old root-scoped course worker
   would otherwise keep serving the cached course app at "/" forever —
   this file replaces it (same filename, still deployed with
   Cache-Control: max-age=0 so installed clients fetch it promptly),
   deletes every old course cache, unregisters itself, and hands control
   back to the network so the hub's real index.html loads.
   This file must stay deployed at the root indefinitely — there is no
   way to reach clients that never revisit "/" otherwise. */

self.addEventListener("install", (e) => {
  e.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith("cbootcamp")).map((k) => caches.delete(k))
      ))
      .then(() => self.registration.unregister())
      .then(() => self.clients.claim())
  );
});

// No fetch handler: once activated (and unregistered), this worker stops
// intercepting requests entirely — everything falls through to the network.
