/* SY-1 service worker: precaches the whole app at install so it runs offline.
   The build (vite.config.ts) replaces the two placeholders below with the real
   version and file list. In dev the list is empty and everything is network-first. */
const VERSION = "__SW_VERSION__";
const FILES = __SW_FILES__;
const CACHE = "sy1-" + VERSION;
const scope = self.registration.scope;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(FILES.map((f) => new URL(f, scope).href)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("sy1-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || !req.url.startsWith(scope)) return;

  // Page loads: try the network first (so updates arrive), fall back to the cached app shell offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(new URL("index.html", scope).href, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(new URL("index.html", scope).href).then((r) => r || caches.match(scope)))
    );
    return;
  }

  // Everything else (hashed assets, worklets, icons): cache first, network fallback.
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      });
    })
  );
});
