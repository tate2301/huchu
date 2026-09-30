/// <reference lib="webworker" />

/**
 * The service worker, built by Serwist and served from `app/serwist/[path]`.
 *
 * Serwist does the work this file used to do by hand: the precache is the
 * build's own static manifest (every JS and CSS chunk, content-hashed, so the
 * whole bundle a page needs is on the device after the first install), and the
 * runtime strategies are its maintained Next.js defaults. What stays here is
 * only what is specific to this app — see `OFFLINE_PAGE_CACHE`,
 * `SESSION_CACHE` and the precache status reply below.
 */

import { defaultCache } from "@serwist/turbopack/worker";
import {
  NetworkFirst,
  NetworkOnly,
  Serwist,
  type PrecacheEntry,
  type SerwistGlobalConfig,
} from "serwist";

import {
  OFFLINE_FALLBACK_URL,
  OFFLINE_PAGE_CACHE,
  PRECACHE_STATUS_MESSAGE,
  SESSION_CACHE,
  type PrecacheStatus,
} from "@/lib/offline/service-worker-protocol";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const manifest = self.__SW_MANIFEST ?? [];

/**
 * Keep the worker out of API requests altogether.
 *
 * API data is not cached here: TanStack Query persists it per tenant (see
 * `components/providers/app-providers.tsx`), and a second copy in the worker
 * would outlive a sign-out. But "not cached" has to mean "not handled", not
 * `NetworkOnly`: a route that answers `/api/notifications/stream` holds that
 * fetch open in the worker for as long as the page lives, and a worker with a
 * fetch in flight never hands over — so a downloaded update sat waiting
 * forever and "Apply update" did nothing.
 *
 * With no matching route the browser fetches natively. Serwist's defaults
 * would claim these through their `apis` cache and their catch-all
 * `NetworkOnly`, so both are dropped; nothing else in the list is lost, since
 * a request no route matches goes to the network anyway.
 */
function passesApiThrough(entry: (typeof defaultCache)[number]) {
  const handler = entry.handler as { cacheName?: string };
  return !(entry.handler instanceof NetworkOnly) && handler.cacheName !== "apis";
}

const serwist = new Serwist({
  precacheEntries: manifest,
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    /*
      Pages, whether the browser navigated to them or the app asked for them
      to be kept (`CACHE_URLS` carries `Accept: text/html`, because a request
      built in a worker can never have `mode: "navigate"`).

      Serwist's default page rule matches on the request's `Content-Type`,
      which a navigation never sends, so without this every page landed in its
      catch-all `others` cache and the panel could not tell which ones were
      kept. A redirected response is refused: the till's routes answer at two
      paths depending on the host, and the one that redirects must not be
      stored under the other's URL.
    */
    {
      matcher: ({ request, sameOrigin, url }) =>
        sameOrigin &&
        request.method === "GET" &&
        !url.pathname.startsWith("/api/") &&
        // A kept sign-in page signs nobody in; it must come from the server.
        !url.pathname.endsWith("/login") &&
        request.headers.get("RSC") !== "1" &&
        (request.mode === "navigate" ||
          (request.headers.get("Accept") ?? "").includes("text/html")),
      handler: new NetworkFirst({
        cacheName: OFFLINE_PAGE_CACHE,
        networkTimeoutSeconds: 8,
        plugins: [
          {
            cacheWillUpdate: async ({ response }) =>
              response.ok && !response.redirected ? response : null,
          },
        ],
      }),
    },
    /*
      The session, so `next-auth` still knows who is signed in when a kept
      page is opened offline. Every other `/api/auth/*` call stays on the
      network — Serwist's default for them, kept below.
    */
    {
      matcher: ({ sameOrigin, url }) =>
        sameOrigin && url.pathname === "/api/auth/session",
      handler: new NetworkFirst({ cacheName: SESSION_CACHE, networkTimeoutSeconds: 8 }),
    },
    ...defaultCache.filter(passesApiThrough),
  ],
  fallbacks: {
    entries: [
      {
        url: OFFLINE_FALLBACK_URL,
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

/**
 * How much of the bundle is on this device, for the sync panel.
 *
 * The manifest only exists in here, so the page asks.
 */
self.addEventListener("message", (event) => {
  if (event.data?.type !== PRECACHE_STATUS_MESSAGE) return;
  const port = event.ports[0];
  if (!port) return;
  event.waitUntil(
    (async () => {
      // Only this version's entries. During an update the outgoing version's
      // files share the cache until activation clears them, and counting every
      // key reported more files on the device than the bundle has.
      const expected = new Set(serwist.getUrlsToPrecacheKeys().values());
      const cache = await caches.open(serwist.precacheStrategy.cacheName);
      const keys = await cache.keys();
      const cached = keys.filter((request) => expected.has(request.url)).length;
      const status: PrecacheStatus = { total: expected.size, cached };
      port.postMessage(status);
    })(),
  );
});

serwist.addEventListeners();
