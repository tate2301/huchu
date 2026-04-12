const STATIC_CACHE = "huchu-static-v3";
const PAGE_CACHE = "huchu-pages-v3";
const SESSION_CACHE = "huchu-session-v3";
const OFFLINE_FALLBACK_URL = "/offline";
const PRECACHE_URLS = [
  OFFLINE_FALLBACK_URL,
  "/manifest.webmanifest",
  "/icon-192.svg",
  "/icon-512.svg",
  "/regular.4b554656.woff2",
  "/medium.501e532c.woff2",
  "/bold.37baf660.woff2",
];

async function warmCacheEntries(message) {
  const routes = Array.isArray(message.routes) ? message.routes : [];
  const assets = Array.isArray(message.assets) ? message.assets : [];

  const [pageCache, staticCache] = await Promise.all([
    caches.open(PAGE_CACHE),
    caches.open(STATIC_CACHE),
  ]);

  for (const route of routes) {
    try {
      const response = await fetch(route, { credentials: "include" });
      if (response && response.ok) {
        await pageCache.put(route, response.clone());
      }
    } catch {
      // Ignore warmup failures.
    }
  }

  for (const asset of assets) {
    try {
      const response = await fetch(asset, { credentials: "include" });
      if (response && response.ok) {
        await staticCache.put(asset, response.clone());
      }
    } catch {
      // Ignore warmup failures.
    }
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => ![STATIC_CACHE, PAGE_CACHE, SESSION_CACHE].includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim())
      .then(() =>
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
          for (const client of clients) {
            client.postMessage({ type: "OFFLINE_SW_ACTIVATED" });
          }
        }),
      ),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
    return;
  }
  if (
    event.data?.type !== "OFFLINE_PREWARM" &&
    event.data?.type !== "OFFLINE_BOOTSTRAP_WARM"
  ) {
    return;
  }
  event.waitUntil(warmCacheEntries(event.data));
});

self.addEventListener("sync", (event) => {
  if (event.tag !== "offline-runtime-sync") return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        client.postMessage({ type: "OFFLINE_SYNC_REQUEST" });
      }
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response && response.ok) {
            const cache = await caches.open(PAGE_CACHE);
            cache.put(request, response.clone());
          }
          return response;
        } catch {
          const cache = await caches.open(PAGE_CACHE);
          const cached = await cache.match(request, { ignoreSearch: true });
          if (cached) return cached;
          const offlineFallback = await caches.match(OFFLINE_FALLBACK_URL);
          if (offlineFallback) return offlineFallback;
          throw new Error("No offline fallback available.");
        }
      })(),
    );
    return;
  }

  if (url.pathname === "/api/auth/session") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SESSION_CACHE);
        try {
          const response = await fetch(request);
          if (response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        } catch {
          const cached = await cache.match(request);
          if (cached) return cached;
          throw new Error("No cached auth session available.");
        }
      })(),
    );
    return;
  }

  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/_next/image") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".jpeg") ||
    url.pathname.endsWith(".webp") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".woff2")
  ) {
    event.respondWith(
      caches.match(request).then(async (cached) => {
        if (cached) return cached;
        const response = await fetch(request);
        if (response && response.ok) {
          const cache = await caches.open(STATIC_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      }),
    );
  }
});
