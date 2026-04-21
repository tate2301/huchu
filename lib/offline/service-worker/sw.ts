/// <reference lib="webworker" />

export {};

declare const self: ServiceWorkerGlobalScope;

/**
 * Huchu Service Worker — Offline-First Caching & Background Sync
 * ---------------------------------------------------------------------------
 * Implements a 5-tier caching strategy:
 *   1. Shell      → cache-first      (HTML, CSS, JS bundles)
 *   2. Static     → cache-first      (icons, fonts, SVGs)
 *   3. API        → network-first    (GET responses, 5s timeout)
 *   4. Catalog    → stale-while-revalidate (materials, sellers, products)
 *   5. Media      → cache-first      (uploaded photos, attachments)
 *
 * Also provides:
 *   • Background Sync  (`sync` event)  — trigger outbox drain on reconnect
 *   • Periodic Sync    (`periodicSync`) — proactive catalog refresh
 *   • Message channel  — bidirectional main-thread ↔ SW comms
 *   • Offline fallback — served when shell is missing and network is down
 */

// ── Constants ──────────────────────────────────────────────────────────────

const SW_VERSION = "2.0.0";
const BUILD_ID =
  typeof self !== "undefined" && "__BUILD_ID" in self
    ? (self as any).__BUILD_ID
    : "unknown";

// ── Cache Names ────────────────────────────────────────────────────────────

const CACHE_NAMES = {
  shell: `huchu-shell-v${BUILD_ID}`,
  static: `huchu-static-v${BUILD_ID}`,
  api: `huchu-api-v${BUILD_ID}`,
  catalog: `huchu-catalog-v${BUILD_ID}`,
  media: `huchu-media-v${BUILD_ID}`,
  offlineFallback: `huchu-fallback-v${BUILD_ID}`,
} as const;

// Precache manifest — injected at build time via workbox / webpack
const PRECACHE_ASSETS: string[] =
  typeof self !== "undefined" && "__SW_MANIFEST__" in self
    ? (self as any).__SW_MANIFEST__
    : [];

// ── Install: Precache Shell ────────────────────────────────────────────────

self.addEventListener("install", (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      const [shellCache, staticCache, fallbackCache] = await Promise.all([
        caches.open(CACHE_NAMES.shell),
        caches.open(CACHE_NAMES.static),
        caches.open(CACHE_NAMES.offlineFallback),
      ]);

      // Split precache manifest into shell vs static
      const shellUrls = PRECACHE_ASSETS.filter(
        (url) =>
          url.endsWith(".html") ||
          url.includes("/_next/static/chunks") ||
          url.includes("/_next/static/css"),
      );
      const staticUrls = PRECACHE_ASSETS.filter(
        (url) =>
          url.endsWith(".svg") ||
          url.endsWith(".png") ||
          url.endsWith(".woff2") ||
          url.endsWith(".ico") ||
          url.endsWith(".webmanifest"),
      );

      await Promise.all([
        shellUrls.length > 0 ? shellCache.addAll(shellUrls) : Promise.resolve(),
        staticUrls.length > 0
          ? staticCache.addAll(staticUrls)
          : Promise.resolve(),
        // Cache offline fallback page — best-effort
        fetch("/offline-fallback.html", { credentials: "same-origin" })
          .then((res) => {
            if (res.ok) fallbackCache.put("/offline-fallback.html", res);
          })
          .catch(() => {
            /* Fallback page not deployed yet — OK */
          }),
      ]);

      // Force activation — don't wait for old tabs to close
      self.skipWaiting();
    })(),
  );
});

// ── Activate: Clean Old Caches, Claim Clients ──────────────────────────────

self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      // Delete caches from previous builds
      const allCacheNames = await caches.keys();
      const currentCacheNames: string[] = Object.values(CACHE_NAMES);
      const staleCaches = allCacheNames.filter(
        (name) =>
          !currentCacheNames.includes(name) && name.startsWith("huchu-"),
      );
      await Promise.all(staleCaches.map((name) => caches.delete(name)));

      // Take control of all clients immediately
      await self.clients.claim();

      // Request periodic background sync if supported
      if ("periodicSync" in self.registration) {
        try {
          await (self.registration as any).periodicSync.register(
            "proactive-sync",
            {
              minInterval: 12 * 60 * 60 * 1000, // 12 hours minimum
            },
          );
        } catch {
          // Periodic sync not granted — graceful degradation
        }
      }
    })(),
  );
});

// ── Fetch Handler ──────────────────────────────────────────────────────────

self.addEventListener("fetch", (event: FetchEvent) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests (mutations go directly to network)
  if (request.method !== "GET") {
    return;
  }

  // Skip cross-origin requests (except known CDNs)
  if (url.origin !== self.location.origin) {
    return;
  }

  // ── Strategy Router ──────────────────────────────────────────────────
  if (isShellAsset(url)) {
    event.respondWith(cacheFirst(request, CACHE_NAMES.shell));
  } else if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, CACHE_NAMES.static));
  } else if (isCatalogEndpoint(url)) {
    event.respondWith(staleWhileRevalidate(request, CACHE_NAMES.catalog));
  } else if (isApiEndpoint(url)) {
    event.respondWith(networkFirstWithTimeout(request, CACHE_NAMES.api, 5000));
  } else if (isMediaAsset(url)) {
    event.respondWith(cacheFirst(request, CACHE_NAMES.media));
  }
  // Navigation requests (page loads) — shell-only with offline fallback
  else if (request.mode === "navigate") {
    event.respondWith(navigateWithFallback(request));
  }
});

// ── Strategy Implementations ───────────────────────────────────────────────

/** Cache-First: Serve from cache, fall back to network, update cache */
async function cacheFirst(
  request: Request,
  cacheName: string,
): Promise<Response> {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    // Network failed and cache miss — return offline page for HTML
    if (request.headers.get("accept")?.includes("text/html")) {
      const fallback = await caches
        .open(CACHE_NAMES.offlineFallback)
        .then((c) => c.match("/offline-fallback.html"));
      return (
        fallback ??
        new Response(
          "<html><body><h1>Offline</h1><p>Please connect to the internet.</p></body></html>",
          { status: 503, headers: { "Content-Type": "text/html" } },
        )
      );
    }
    return new Response("Offline", {
      status: 503,
      statusText: "Service Unavailable",
    });
  }
}

/** Network-First with Timeout: Try network, fall back to cache */
async function networkFirstWithTimeout(
  request: Request,
  cacheName: string,
  timeoutMs: number,
): Promise<Response> {
  const cache = await caches.open(cacheName);
  const cacheKey = request.url;

  const networkPromise = fetch(request).then((response) => {
    if (response.ok) {
      cache.put(cacheKey, response.clone());
    }
    return response;
  });

  const timeoutPromise = new Promise<Response>((_, reject) =>
    setTimeout(() => reject(new Error("Network timeout")), timeoutMs),
  );

  try {
    return await Promise.race([networkPromise, timeoutPromise]);
  } catch {
    // Network failed or timed out — serve from cache
    const cached = await cache.match(cacheKey);
    if (cached) {
      // Mark as stale via header for the app to know
      const headers = new Headers(cached.headers);
      headers.set("X-Huchu-Cache", "stale");
      return new Response(cached.body, {
        status: 200,
        statusText: "OK (from cache)",
        headers,
      });
    }
    return new Response(
      JSON.stringify({ error: "offline", message: "No cached data available" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }
}

/** Stale-While-Revalidate: Serve cache immediately, refresh in background */
async function staleWhileRevalidate(
  request: Request,
  cacheName: string,
): Promise<Response> {
  const cache = await caches.open(cacheName);
  const cacheKey = request.url;
  const cached = await cache.match(cacheKey);

  // Always attempt background revalidation
  const revalidatePromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(cacheKey, response.clone());
      }
      return response;
    })
    .catch(() => {
      // Silently fail revalidation — cache is still served
    });

  if (cached) {
    // Fire-and-forget revalidation + notify clients
    revalidatePromise.then(() => {
      if (self.clients.matchAll) {
        self.clients.matchAll({ type: "window" }).then((clients) => {
          clients.forEach((client) =>
            client.postMessage({
              type: "CATALOG_REFRESHED",
              url: request.url,
            }),
          );
        });
      }
    });
    return cached;
  }

  // Cache miss — wait for network
  try {
    return (await revalidatePromise) as Response;
  } catch {
    return new Response(
      JSON.stringify({ error: "offline", message: "Catalog data unavailable" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }
}

/** Navigation: Serve app shell for all routes (SPA behavior) */
async function navigateWithFallback(request: Request): Promise<Response> {
  const shellCache = await caches.open(CACHE_NAMES.shell);
  const cachedShell = await shellCache.match("/");

  if (cachedShell) {
    // SPA: all routes serve the same shell (Next.js handles routing client-side)
    return cachedShell;
  }

  // No shell cached — try network
  try {
    return await fetch(request);
  } catch {
    const fallbackCache = await caches.open(CACHE_NAMES.offlineFallback);
    return (
      (await fallbackCache.match("/offline-fallback.html")) ??
      new Response(
        "<html><body><h1>Offline</h1><p>Please connect to the internet to load the app.</p></body></html>",
        {
          status: 503,
          headers: { "Content-Type": "text/html" },
        },
      )
    );
  }
}

// ── URL Classifiers ────────────────────────────────────────────────────────

function isShellAsset(url: URL): boolean {
  return (
    url.pathname === "/" ||
    url.pathname.startsWith("/_next/static/chunks") ||
    url.pathname.startsWith("/_next/static/css") ||
    url.pathname.startsWith("/_next/static/media")
  );
}

function isStaticAsset(url: URL): boolean {
  return (
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".woff2") ||
    url.pathname.endsWith(".webmanifest")
  );
}

function isCatalogEndpoint(url: URL): boolean {
  const catalogPatterns = [
    "/api/scrap-metal/materials",
    "/api/scrap-metal/sellers",
    "/api/scrap-metal/pricing",
    "/api/v2/retail/pos/catalog",
    "/api/scrap-metal/batches",
  ];
  return catalogPatterns.some((pattern) =>
    url.pathname.startsWith(pattern),
  );
}

function isApiEndpoint(url: URL): boolean {
  return (
    url.pathname.startsWith("/api/") &&
    !isCatalogEndpoint(url) &&
    !url.pathname.startsWith("/api/uploads")
  );
}

function isMediaAsset(url: URL): boolean {
  return (
    url.pathname.startsWith("/api/uploads") ||
    url.pathname.startsWith("/media/")
  );
}

// ── Background Sync ────────────────────────────────────────────────────────

self.addEventListener("sync", (event: SyncEvent) => {
  if (event.tag === "huchu-outbox-sync") {
    event.waitUntil(handleBackgroundSync());
  }
});

self.addEventListener("periodicsync", (event: SyncEvent) => {
  if (event.tag === "proactive-sync") {
    event.waitUntil(handleProactiveSync());
  }
});

/** Background Sync: Triggered when connectivity returns */
async function handleBackgroundSync(): Promise<void> {
  const clients = await self.clients.matchAll({ type: "window" });
  clients.forEach((client) => {
    client.postMessage({
      type: "BACKGROUND_SYNC_TRIGGERED",
      timestamp: Date.now(),
    });
  });
}

/** Proactive Sync: Periodic refresh of critical data */
async function handleProactiveSync(): Promise<void> {
  const clients = await self.clients.matchAll({ type: "window" });
  clients.forEach((client) => {
    client.postMessage({
      type: "PROACTIVE_SYNC_TRIGGERED",
      timestamp: Date.now(),
    });
  });
}

// ── Message Handler (Main App ↔ SW Communication) ──────────────────────────

self.addEventListener("message", (event: ExtendableMessageEvent) => {
  const { type, payload } = event.data ?? {};

  switch (type) {
    case "SKIP_WAITING":
      self.skipWaiting();
      break;

    case "GET_SW_VERSION":
      event.source?.postMessage({
        type: "SW_VERSION",
        version: SW_VERSION,
        buildId: BUILD_ID,
      });
      break;

    case "REGISTER_BACKGROUND_SYNC":
      registerBackgroundSync();
      break;

    case "CACHE_SHELL":
      if (event.waitUntil && payload?.urls) {
        event.waitUntil(warmShellCache(payload.urls));
      }
      break;
  }
});

async function registerBackgroundSync(): Promise<void> {
  if (!("sync" in self.registration)) {
    return;
  }
  try {
    await self.registration.sync.register("huchu-outbox-sync");
  } catch {
    // Registration failed — sync will be attempted manually
  }
}

async function warmShellCache(urls: string[]): Promise<void> {
  const cache = await caches.open(CACHE_NAMES.shell);
  const requests = urls.map(
    (url) => new Request(url, { credentials: "same-origin" }),
  );
  const responses = await Promise.all(
    requests.map((req) => fetch(req).catch(() => null)),
  );
  await Promise.all(
    responses
      .filter((res): res is Response => res !== null && res.ok)
      .map((res, i) => cache.put(requests[i], res)),
  );
}

// ── Type Declarations ──────────────────────────────────────────────────────

declare global {
  interface ServiceWorkerGlobalScope {
    __SW_MANIFEST__: string[];
    __BUILD_ID: string;
  }

  interface ServiceWorkerGlobalScopeEventMap {
    sync: SyncEvent;
    periodicsync: SyncEvent;
  }

  interface SyncEvent extends ExtendableEvent {
    readonly tag: string;
    readonly lastChance: boolean;
  }

  interface ServiceWorkerRegistration {
    readonly sync: {
      register(tag: string): Promise<void>;
    };
    readonly periodicSync: {
      register(tag: string, options?: { minInterval?: number }): Promise<void>;
    };
  }
}
