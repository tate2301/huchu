import type { QueryClient } from "@tanstack/react-query";
import { Serwist } from "@serwist/window";
import { get, set } from "idb-keyval";

import { OFFLINE_OUTBOX_CHANGED_EVENT } from "@/lib/offline/events";
import {
  getEnabledOfflineModules,
  getOfflineRouteDefinitions,
  prefetchOfflineModuleQueries,
} from "@/lib/offline/module-registry";
import {
  clearOfflineOutbox,
  getOfflineOutboxSummaryForTenant,
  removeOfflineOperation,
  resetOfflineOperationToQueued,
} from "@/lib/offline/outbox";
import { syncOfflineRuntime } from "@/lib/offline/runtime";
import {
  getOfflineSnapshot,
  resetOfflineSnapshot,
  updateOfflineSnapshot,
  type KeptRoute,
} from "@/lib/offline/runtime-store";
import {
  OFFLINE_PAGE_CACHE,
  PRECACHE_STATUS_MESSAGE,
  SERVICE_WORKER_ENABLED,
  SERVICE_WORKER_URL,
  type PrecacheStatus,
} from "@/lib/offline/service-worker-protocol";

/**
 * The offline runtime on the client: one module, started once by
 * `OfflineRuntime`, publishing everything it learns to `runtime-store.ts`.
 *
 * What it no longer does, because a maintained package does it:
 *   - caching pages and the JS/CSS bundle — Serwist (`app/sw.ts`);
 *   - persisting query results — TanStack Query persistence
 *     (`components/providers/app-providers.tsx`).
 * What is left is wiring: when to warm, when to replay the outbox, and
 * reading back what the caches hold so the sync panel can say so.
 */

type RuntimeConfig = {
  queryClient: QueryClient;
  tenantKey: string | null;
  enabledFeatures: string[];
};

type BeforeInstallPromptEventLike = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** Device-wide, not per tenant: the connection belongs to the device. */
const META_KEY = "huchu-offline-meta";

type OfflineMeta = {
  lastOnlineAt: string | null;
  lastSyncedAt: Record<string, string>;
};

/** How often a waiting queue is retried while online. The outbox's own backoff still applies. */
const QUEUE_RETRY_INTERVAL_MS = 60_000;

let config: RuntimeConfig | null = null;
let serwist: Serwist | null = null;
let installPrompt: BeforeInstallPromptEventLike | null = null;
let syncRun: Promise<void> | null = null;
let warmRun: Promise<void> | null = null;
let warmedFor: string | null = null;

function nowIso() {
  return new Date().toISOString();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Pages that must always come from the server. Kept copies of a login screen
 * would sign nobody in, and the fallback is precached separately.
 *
 * `/` is not on the list: on the POS host it is the till's checkout, the one
 * page that most needs keeping. Where it only redirects, the worker refuses
 * the redirected response anyway.
 */
export function isUnkeptPathname(pathname: string) {
  return (
    pathname === "/login" ||
    pathname.endsWith("/login") ||
    pathname === "/offline" ||
    pathname === "/access-blocked" ||
    pathname === "/home" ||
    pathname.startsWith("/home/") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/portal/admin")
  );
}

/*
  Best effort, both ways. `idb-keyval` throws synchronously where IndexedDB
  does not exist at all, which a `.catch()` on its promise never sees, and a
  browser with storage blocked rejects instead. Neither may break the runtime:
  losing "last synced" is a worse display, not a broken till.
*/
async function readMeta(): Promise<OfflineMeta> {
  let stored: OfflineMeta | undefined;
  try {
    stored = await get<OfflineMeta>(META_KEY);
  } catch {
    stored = undefined;
  }
  return { lastOnlineAt: stored?.lastOnlineAt ?? null, lastSyncedAt: stored?.lastSyncedAt ?? {} };
}

async function writeMeta(patch: (current: OfflineMeta) => OfflineMeta) {
  const next = patch(await readMeta());
  try {
    await set(META_KEY, next);
  } catch {
    // See above.
  }
  return next;
}

/** How often a stream of successful requests rewrites "last online". */
const SERVER_CONTACT_WRITE_INTERVAL_MS = 30_000;
let lastContactWrite = 0;

/**
 * The server just answered.
 *
 * "Last online" means exactly that, not `navigator.onLine`: a browser on a
 * network whose server is down reports itself online, and the offline
 * fallback page used to say "last connected" a few seconds ago on the very
 * screen that exists because the connection failed.
 */
function markServerContact() {
  const at = nowIso();
  updateOfflineSnapshot({ lastOnlineAt: at });
  const now = Date.now();
  if (now - lastContactWrite < SERVER_CONTACT_WRITE_INTERVAL_MS) return;
  lastContactWrite = now;
  void writeMeta((meta) => ({ ...meta, lastOnlineAt: at }));
}

// ── Queue ────────────────────────────────────────────────────────────────

export async function refreshOfflineQueue() {
  const tenantKey = config?.tenantKey ?? null;
  if (!tenantKey) {
    updateOfflineSnapshot({ queue: { pending: 0, blocking: 0, operations: [] } });
    return;
  }
  const summary = await getOfflineOutboxSummaryForTenant(tenantKey).catch(() => null);
  if (!summary || config?.tenantKey !== tenantKey) return;
  updateOfflineSnapshot({
    queue: {
      pending: summary.pendingCount,
      blocking: summary.blockingCount,
      operations: summary.items,
    },
  });
}

/**
 * Send what is waiting. `force` also retries items marked for review and
 * items still inside their backoff window — it is what "Sync now" means.
 */
export function syncOfflineQueue(options?: { force?: boolean }): Promise<void> {
  if (syncRun) return syncRun;
  const current = config;
  if (!current?.tenantKey || !getOfflineSnapshot().online) return Promise.resolve();
  if (!options?.force && getOfflineSnapshot().queue.pending === 0) return Promise.resolve();

  const tenantKey = current.tenantKey;
  syncRun = (async () => {
    updateOfflineSnapshot({ syncing: true });
    try {
      const result = await syncOfflineRuntime({
        enabledFeatures: current.enabledFeatures,
        force: options?.force,
        tenantKey,
      });
      for (const queryKey of result.invalidateQueryKeys) {
        void current.queryClient.invalidateQueries({ queryKey });
      }
      // The browser can say "online" with no route to the server. Items that
      // failed to reach it are not a sync, and "Last sync" must not say so.
      if (result.retryableCount > 0) {
        const count = result.retryableCount;
        updateOfflineSnapshot({
          lastSyncError: `${count} action${count === 1 ? "" : "s"} could not reach the server`,
        });
        return;
      }
      const at = nowIso();
      await writeMeta((meta) => ({
        ...meta,
        lastSyncedAt: { ...meta.lastSyncedAt, [tenantKey]: at },
      }));
      markServerContact();
      updateOfflineSnapshot({ lastSyncedAt: at, lastSyncError: null });
    } catch (error) {
      updateOfflineSnapshot({ lastSyncError: errorMessage(error) });
    } finally {
      await refreshOfflineQueue();
      updateOfflineSnapshot({ syncing: false });
      syncRun = null;
    }
  })();
  return syncRun;
}

export async function retryOfflineOperation(operationId: string) {
  await resetOfflineOperationToQueued(operationId);
  await syncOfflineQueue({ force: true });
}

export async function removeQueuedOperation(operationId: string) {
  await removeOfflineOperation(operationId);
}

export async function clearOfflineQueue() {
  const tenantKey = config?.tenantKey;
  if (!tenantKey) return;
  await clearOfflineOutbox(tenantKey);
}

// ── Bundle and pages ─────────────────────────────────────────────────────

function routeLabel(canonicalRoute: string, warmupUrls: string[]) {
  const path = warmupUrls[0] ?? canonicalRoute;
  return path.startsWith("/") ? path : canonicalRoute;
}

/** Read back what the worker's caches hold. Cheap: Cache Storage lookups only. */
export async function refreshOfflineBundleStatus() {
  if (!serwist) return;
  const [precache, pages] = await Promise.all([
    withTimeout(serwist.messageSW({ type: PRECACHE_STATUS_MESSAGE }) as Promise<PrecacheStatus>, 4000).catch(
      () => null,
    ),
    readKeptPages(),
  ]);
  updateOfflineSnapshot((current) => ({
    bundle: precache
      ? { ...current.bundle, cached: precache.cached, total: precache.total }
      : current.bundle,
    pages: { ...current.pages, routes: pages.routes, keptCount: pages.keptCount },
  }));
}

async function readKeptPages(): Promise<{ routes: KeptRoute[]; keptCount: number }> {
  if (typeof caches === "undefined") return { routes: [], keptCount: 0 };
  const cache = await caches.open(OFFLINE_PAGE_CACHE);
  const keys = await cache.keys();
  const keptPaths = new Set(keys.map((request) => new URL(request.url).pathname));
  const routes = getEnabledOfflineModules(config?.enabledFeatures ?? [])
    .flatMap(getOfflineRouteDefinitions)
    .filter((route) => !route.warmupUrls.every(isUnkeptPathname))
    .map((route) => ({
      label: routeLabel(route.canonicalRoute, route.warmupUrls),
      kept: route.warmupUrls.some((url) => keptPaths.has(url)),
    }));
  return { routes, keptCount: keptPaths.size };
}

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function cacheUrls(urls: string[]) {
  if (!serwist || urls.length === 0) return Promise.resolve();
  // `Accept: text/html` is what lets the worker's page rule claim these —
  // a request built inside a worker can never be a navigation.
  return serwist.messageSW({
    type: "CACHE_URLS",
    payload: { urlsToCache: urls.map((url) => [url, { headers: { Accept: "text/html" } }]) },
  });
}

/** Keep the page someone just opened, so they can come back to it offline. */
export function keepVisitedPage(pathname: string) {
  if (!serwist || !config?.tenantKey || !getOfflineSnapshot().online) return;
  if (isUnkeptPathname(pathname)) return;
  void cacheUrls([pathname]).then(refreshOfflineBundleStatus, () => undefined);
}

async function isPageKept(url: string) {
  if (typeof caches === "undefined") return false;
  const cache = await caches.open(OFFLINE_PAGE_CACHE);
  return Boolean(await cache.match(url, { ignoreVary: true, ignoreSearch: true }));
}

/**
 * Keep one route, trying its URL forms in order and stopping at the first
 * the worker stored.
 *
 * A till route answers at `/portal/pos/overview` on a tenant host and at
 * `/overview` on the POS host; the worker refuses the form that redirects.
 * Sending both at once would 404 the bare form on every other tenant, which
 * is what the warm-up used to do on every page until it learned to stop.
 */
async function keepRoute(warmupUrls: string[], refresh: boolean) {
  for (const url of warmupUrls) {
    if (isUnkeptPathname(url)) continue;
    if (!refresh && (await isPageKept(url))) return;
    await cacheUrls([url]).catch(() => undefined);
    if (await isPageKept(url)) return;
  }
}

/** Put every page and query the enabled modules need on the device. */
export function warmOfflineScope(options?: { force?: boolean }): Promise<void> {
  if (warmRun) return warmRun;
  const current = config;
  if (!current?.tenantKey || !getOfflineSnapshot().online) return Promise.resolve();
  const scopeKey = `${current.tenantKey}:${current.enabledFeatures.join(",")}`;
  if (!options?.force && warmedFor === scopeKey) return Promise.resolve();

  const modules = getEnabledOfflineModules(current.enabledFeatures);
  if (modules.length === 0) return Promise.resolve();

  warmRun = (async () => {
    updateOfflineSnapshot((state) => ({ pages: { ...state.pages, warming: true } }));
    try {
      const keepPages = async () => {
        if (!serwist) return;
        for (const route of modules.flatMap(getOfflineRouteDefinitions)) {
          await keepRoute(route.warmupUrls, Boolean(options?.force));
        }
      };
      await Promise.all([
        keepPages(),
        prefetchOfflineModuleQueries(modules, current.queryClient, current.enabledFeatures),
      ]);
      warmedFor = scopeKey;
    } finally {
      updateOfflineSnapshot((state) => ({ pages: { ...state.pages, warming: false } }));
      await refreshOfflineBundleStatus();
    }
  })().finally(() => {
    warmRun = null;
  });
  return warmRun;
}

/** Hand over to the downloaded version. The page reloads once it takes control. */
export function applyOfflineUpdate() {
  if (!serwist) return;
  updateOfflineSnapshot((state) => ({ bundle: { ...state.bundle, updating: true } }));
  serwist.messageSkipWaiting();
}

export async function installOfflineApp() {
  const prompt = installPrompt;
  if (!prompt) return;
  await prompt.prompt();
  await prompt.userChoice.catch(() => undefined);
  installPrompt = null;
  updateOfflineSnapshot({ installAvailable: false });
}

// ── Lifecycle ────────────────────────────────────────────────────────────

function countPersistedQueries(queryClient: QueryClient) {
  return queryClient
    .getQueryCache()
    .getAll()
    .filter((query) => query.state.data !== undefined).length;
}

/**
 * Point the runtime at the signed-in tenant. Called on every session change;
 * a sign-out passes `tenantKey: null` and the queue view empties.
 */
export function configureOfflineRuntime(next: RuntimeConfig) {
  const tenantChanged = config?.tenantKey !== next.tenantKey;
  config = next;
  updateOfflineSnapshot({
    tenantKey: next.tenantKey,
    data: { queryCount: countPersistedQueries(next.queryClient) },
  });
  if (!tenantChanged) {
    void warmOfflineScope();
    return;
  }
  warmedFor = null;
  void (async () => {
    const meta = await readMeta();
    updateOfflineSnapshot({
      lastSyncedAt: next.tenantKey ? meta.lastSyncedAt[next.tenantKey] ?? null : null,
    });
    await refreshOfflineQueue();
    await refreshOfflineBundleStatus();
    void syncOfflineQueue();
    void warmOfflineScope();
  })();
}

async function registerWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    updateOfflineSnapshot((state) => ({ bundle: { ...state.bundle, state: "unsupported" } }));
    return;
  }

  if (!SERVICE_WORKER_ENABLED) {
    // A worker left behind by a production build on this origin would keep
    // serving stale chunks to `next dev`. Remove it and everything it cached.
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    if (typeof caches !== "undefined") {
      await Promise.all((await caches.keys()).map((name) => caches.delete(name)));
    }
    updateOfflineSnapshot((state) => ({ bundle: { ...state.bundle, state: "disabled" } }));
    return;
  }

  const worker = new Serwist(SERVICE_WORKER_URL, { scope: "/", type: "classic" });
  serwist = worker;

  worker.addEventListener("installed", (event) => {
    if (!event.isUpdate) void refreshOfflineBundleStatus();
  });
  worker.addEventListener("waiting", () => {
    updateOfflineSnapshot((state) => ({ bundle: { ...state.bundle, updateWaiting: true } }));
  });
  worker.addEventListener("activated", () => {
    updateOfflineSnapshot((state) => ({ bundle: { ...state.bundle, state: "ready" } }));
    void refreshOfflineBundleStatus();
    void warmOfflineScope({ force: true });
  });
  worker.addEventListener("controlling", (event) => {
    // Only a new version the person chose to apply reloads the page. The
    // first install also takes control (`clientsClaim`), and reloading a till
    // mid-sale for that would be the worst possible moment.
    if (event.isUpdate && getOfflineSnapshot().bundle.updating) {
      window.location.reload();
    }
  });

  try {
    const registration = await worker.register();
    const installing = Boolean(registration?.installing) && !registration?.active;
    updateOfflineSnapshot((state) => ({
      bundle: {
        ...state.bundle,
        state: installing ? "installing" : registration?.active ? "ready" : "checking",
        updateWaiting: Boolean(registration?.waiting && registration.active),
      },
    }));
    await refreshOfflineBundleStatus();
  } catch {
    updateOfflineSnapshot((state) => ({ bundle: { ...state.bundle, state: "failed" } }));
  }
}

/**
 * Start listening. Returns the cleanup; safe to call once per page load.
 */
export function startOfflineRuntime() {
  updateOfflineSnapshot({ online: navigator.onLine !== false });
  void readMeta().then((meta) => {
    // Only if nothing newer has landed while IndexedDB was being read.
    if (!getOfflineSnapshot().lastOnlineAt) updateOfflineSnapshot({ lastOnlineAt: meta.lastOnlineAt });
  });
  void registerWorker();

  const onOnline = () => {
    updateOfflineSnapshot({ online: true });
    void syncOfflineQueue({ force: true });
    void warmOfflineScope();
    void refreshOfflineBundleStatus();
  };
  const onOffline = () => {
    // The moment the line went is the last moment it was up.
    const at = nowIso();
    updateOfflineSnapshot({ online: false, lastOnlineAt: at });
    void writeMeta((meta) => ({ ...meta, lastOnlineAt: at }));
  };
  const onVisible = () => {
    if (document.visibilityState !== "visible" || !getOfflineSnapshot().online) return;
    void serwist?.update().catch(() => undefined);
    void syncOfflineQueue();
  };
  const onOutboxChanged = () => {
    void refreshOfflineQueue();
  };
  const onBeforeInstallPrompt = (event: Event) => {
    event.preventDefault();
    installPrompt = event as BeforeInstallPromptEventLike;
    updateOfflineSnapshot({ installAvailable: true });
  };
  const onInstalled = () => {
    installPrompt = null;
    updateOfflineSnapshot({ installAvailable: false });
  };
  const retryTimer = window.setInterval(() => {
    if (getOfflineSnapshot().queue.pending > 0) void syncOfflineQueue();
  }, QUEUE_RETRY_INTERVAL_MS);

  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener(OFFLINE_OUTBOX_CHANGED_EVENT, onOutboxChanged);
  window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  window.addEventListener("appinstalled", onInstalled);

  return () => {
    window.clearInterval(retryTimer);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener(OFFLINE_OUTBOX_CHANGED_EVENT, onOutboxChanged);
    window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.removeEventListener("appinstalled", onInstalled);
    config = null;
    serwist = null;
    warmedFor = null;
    resetOfflineSnapshot();
  };
}

/**
 * Keep the data count in the panel honest as queries land, and note each
 * time the server answers one.
 */
export function watchPersistedQueries(queryClient: QueryClient) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    // A fetch that succeeded is the server answering. Restoring persisted
    // results is a `setState`, not a `success`, so it does not count.
    if (event.type === "updated" && event.action.type === "success" && !event.action.manual) {
      markServerContact();
    }
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      updateOfflineSnapshot({ data: { queryCount: countPersistedQueries(queryClient) } });
    }, 500);
  });
  return () => {
    if (timer) clearTimeout(timer);
    unsubscribe();
  };
}
