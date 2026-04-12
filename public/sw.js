const STATIC_CACHE = "huchu-static-v3";
const PAGE_CACHE = "huchu-pages-v3";
const SESSION_CACHE = "huchu-session-v3";
const OFFLINE_FALLBACK_URL = "/offline";
const PRECACHE_URLS = [
  OFFLINE_FALLBACK_URL,
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/regular.4b554656.woff2",
  "/medium.501e532c.woff2",
  "/bold.37baf660.woff2",
];

const NEXT_ASSET_URL_PATTERN = /(?:src|href)=["']([^"']*\/_next\/static\/[^"']+\.(?:js|css|woff2?))["']/g;

function normalizeSameOriginUrl(value) {
  if (!value || typeof value !== "string") return null;
  try {
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function extractNextStaticAssetsFromHtml(html) {
  if (!html || typeof html !== "string") return [];
  const assets = new Set();
  let match = NEXT_ASSET_URL_PATTERN.exec(html);
  while (match) {
    const normalized = normalizeSameOriginUrl(match[1]);
    if (normalized) {
      assets.add(normalized);
    }
    match = NEXT_ASSET_URL_PATTERN.exec(html);
  }
  NEXT_ASSET_URL_PATTERN.lastIndex = 0;
  return [...assets];
}

async function warmCacheEntries(message) {
  const routes = Array.isArray(message.routes)
    ? message.routes
        .map((value) => normalizeSameOriginUrl(value))
        .filter(Boolean)
    : [];
  const assets = Array.isArray(message.assets)
    ? message.assets
        .map((value) => normalizeSameOriginUrl(value))
        .filter(Boolean)
    : [];

  const [pageCache, staticCache] = await Promise.all([
    caches.open(PAGE_CACHE),
    caches.open(STATIC_CACHE),
  ]);

  const discoveredAssets = new Set();

  for (const routeUrl of routes) {
    try {
      const response = await fetch(routeUrl, { credentials: "include" });
      if (response && response.ok) {
        await pageCache.put(routeUrl, response.clone());
        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("text/html")) {
          const html = await response.clone().text();
          for (const assetUrl of extractNextStaticAssetsFromHtml(html)) {
            discoveredAssets.add(assetUrl);
          }
        }
      }
    } catch {
      // Ignore warmup failures.
    }
  }

  const allAssets = [...new Set([...assets, ...discoveredAssets])];
  for (const assetUrl of allAssets) {
    try {
      const response = await fetch(assetUrl, { credentials: "omit" });
      if (response && response.ok) {
        await staticCache.put(assetUrl, response.clone());
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
      caches.match(request, { ignoreSearch: true }).then(async (cached) => {
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response && response.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, response.clone());
          }
          return response;
        } catch {
          const fallback = await caches.match(request, { ignoreSearch: true });
          if (fallback) return fallback;
          throw new Error("Static asset unavailable while offline.");
        }
      }),
    );
  }
});
