"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import {
  createOfflineBootstrapProgress,
  getOfflineRouteDefinitions,
  getOfflineBootstrapProgress,
  saveOfflineBootstrapProgress,
} from "@/lib/offline/bootstrap-state";
import { useOfflineConnectivity } from "@/hooks/use-offline-connectivity";
import {
  OFFLINE_BOOTSTRAP_CHANGED_EVENT,
  OFFLINE_OUTBOX_CHANGED_EVENT,
  OFFLINE_SESSION_CHANGED_EVENT,
} from "@/lib/offline/events";
import { getEnabledOfflineModules } from "@/lib/offline/module-registry";
import {
  resolveReadyOfflineLifecycleState,
  transitionOfflineLifecycle,
} from "@/lib/offline/lifecycle-machine";
import {
  canReplayOfflineQueue,
  canRunOfflineWarmup,
} from "@/lib/offline/orchestration-guards";
import {
  getOfflineOutboxSummaryForTenant,
  removeOfflineOperation,
  resetOfflineOperationToQueued,
} from "@/lib/offline/outbox";
import {
  persistOfflineQueryRecord,
  pruneOfflineQueries,
  restoreOfflineQueries,
} from "@/lib/offline/query-cache";
import { syncOfflineRuntime } from "@/lib/offline/runtime";
import {
  clearOfflineSessionBootstrap,
  getOfflineSessionBootstrap,
  isOfflineSessionBootstrapExpired,
  saveOfflineSessionBootstrap,
} from "@/lib/offline/session-bootstrap";
import {
  clearTenantOfflineData,
  getActiveOfflineTenantContext,
  setActiveOfflineTenantContext,
} from "@/lib/offline/tenant-context";
import {
  filterRoutesToOfflineWarmupScope,
  getOfflineRouteAvailability,
  getRouteOfflineMutationPolicy,
} from "@/lib/offline/workflow-catalog";
import type {
  OfflineBootstrapProgress,
  OfflineLifecycleState,
  OfflineModuleDefinition,
  OfflineMutationPolicy,
  OfflineModulePreparation,
  OfflineModulePreparationState,
  OfflineOutboxSummaryItem,
  OfflineSessionBootstrap,
  OfflineStatus,
  OfflineTenantKey,
  OfflineUpdateState,
} from "@/lib/offline/types";

const RECENT_ROUTES_STORAGE_KEY = "offline_recent_routes_v1";
const OFFLINE_BOOTSTRAP_SYNC_TAG = "offline-runtime-sync";
const SHELL_ASSET_URLS = [
  "/offline",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/regular.4b554656.woff2",
  "/medium.501e532c.woff2",
  "/bold.37baf660.woff2",
];

type OfflineContextValue = {
  tenantKey: OfflineTenantKey | null;
  isOffline: boolean;
  lifecycleState: OfflineLifecycleState;
  isSyncing: boolean;
  canApplyUpdate: boolean;
  canInstallApp: boolean;
  pendingCount: number;
  blockingCount: number;
  status: OfflineStatus;
  statusLabel: string;
  sessionBootstrap: OfflineSessionBootstrap | null;
  sessionBootstrapExpired: boolean;
  preparedModules: OfflineModulePreparation[];
  bootstrapProgress: OfflineBootstrapProgress | null;
  lastSyncedAt: string | null;
  updateState: OfflineUpdateState;
  showUpdatePrompt: boolean;
  operations: OfflineOutboxSummaryItem[];
  tenantConflict:
    | {
        previousTenantKey: string;
        pendingCount: number;
        blockingCount: number;
      }
    | null;
  routeMutationPolicy: OfflineMutationPolicy;
  routeAvailabilityReason: string | null;
  syncNow: (options?: { force?: boolean }) => Promise<void>;
  retryOperation: (operationId: string) => Promise<void>;
  removeOperation: (operationId: string) => Promise<void>;
  clearTenantConflict: () => Promise<void>;
  applyUpdate: () => Promise<void>;
  dismissUpdate: () => void;
  installApp: () => Promise<void>;
};

const OfflineContext = createContext<OfflineContextValue | null>(null);

type BeforeInstallPromptEventLike = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  platforms?: string[];
};

function isPublicPathname(pathname: string) {
  return (
    pathname === "/login" ||
    pathname === "/offline" ||
    pathname === "/access-blocked" ||
    pathname === "/home" ||
    pathname.startsWith("/home/") ||
    pathname.endsWith("/login")
  );
}

function readRecentRoutes() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(RECENT_ROUTES_STORAGE_KEY) ?? "[]",
    );
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function writeRecentRoutes(routes: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    RECENT_ROUTES_STORAGE_KEY,
    JSON.stringify(routes.slice(0, 12)),
  );
}

function rememberRoute(pathname: string) {
  if (isPublicPathname(pathname)) return;
  const current = readRecentRoutes();
  const next = [pathname, ...current.filter((route) => route !== pathname)];
  writeRecentRoutes(next);
}

function routeMatches(pathname: string, candidate: string) {
  return pathname === candidate || pathname.startsWith(`${candidate}/`);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function nowIso() {
  return new Date().toISOString();
}

function getWarmupRouteDefinitions(moduleDefinition: OfflineModuleDefinition) {
  return getOfflineRouteDefinitions(moduleDefinition);
}

function moduleOwnsPath(
  moduleDefinition: OfflineModuleDefinition,
  pathname: string,
) {
  return getWarmupRouteDefinitions(moduleDefinition).some((routeDefinition) =>
    routeDefinition.matchPaths.some((candidate) => routeMatches(pathname, candidate)),
  );
}

async function prefetchModuleQueries(
  moduleDefinition: OfflineModuleDefinition,
  queryClient: QueryClient,
) {
  const preparedQueryKeys: string[] = [];

  for (const preloadQuery of moduleDefinition.preloadQueries) {
    if (preloadQuery.enabled && !preloadQuery.enabled()) {
      preparedQueryKeys.push(preloadQuery.key);
      continue;
    }

    const queryKey =
      typeof preloadQuery.queryKey === "function"
        ? await preloadQuery.queryKey()
        : preloadQuery.queryKey;

    if (!queryKey) {
      preparedQueryKeys.push(preloadQuery.key);
      continue;
    }

    try {
      await queryClient.prefetchQuery({
        queryKey,
        queryFn: () => preloadQuery.fetcher(queryKey),
        staleTime: preloadQuery.maxAgeMs ?? 5 * 60_000,
      });
      preparedQueryKeys.push(preloadQuery.key);
    } catch {
      // Ignore route-driven query warmup failures.
    }
  }

  return uniqueStrings(preparedQueryKeys);
}

function getStatusLabel(
  status: OfflineStatus,
  pendingCount: number,
  bootstrapProgress: OfflineBootstrapProgress | null,
) {
  if (status === "OFFLINE") return "Offline";
  if (status === "PREPARING") {
    if (!bootstrapProgress || bootstrapProgress.totalSteps === 0) return "Preparing";
    const clampedCompleted = Math.min(
      bootstrapProgress.completedSteps,
      bootstrapProgress.totalSteps,
    );
    return `Preparing ${Math.round(
      (clampedCompleted / bootstrapProgress.totalSteps) * 100,
    )}%`;
  }
  if (status === "UPDATE_READY") return "Update ready";
  if (status === "RECONNECTING") return "Reconnecting";
  if (status === "SYNCING") {
    return pendingCount > 0 ? `Syncing ${pendingCount}` : "Syncing";
  }
  if (status === "ATTENTION") {
    return pendingCount > 0 ? `Attention ${pendingCount}` : "Attention needed";
  }
  return "Ready";
}

function mergeModulePreparedRoutes(
  modulePreparation: OfflineModulePreparation,
  preparedRoutes: string[],
  state?: OfflineModulePreparationState,
) {
  const nextPreparedRoutes = uniqueStrings([
    ...modulePreparation.preparedRoutes,
    ...preparedRoutes,
  ]);
  const resolvedState =
    state ??
    (nextPreparedRoutes.length >= modulePreparation.totalRoutes &&
    modulePreparation.preparedQueryKeys.length >= modulePreparation.totalQueries
      ? "PREPARED"
      : modulePreparation.state);

  return {
    ...modulePreparation,
    preparedRoutes: nextPreparedRoutes,
    state: resolvedState,
    lastPreparedAt:
      resolvedState === "PREPARED" ? nowIso() : modulePreparation.lastPreparedAt,
  };
}

function mergeModulePreparedQueries(
  modulePreparation: OfflineModulePreparation,
  preparedQueryKeys: string[],
  state?: OfflineModulePreparationState,
) {
  const nextPreparedQueryKeys = uniqueStrings([
    ...modulePreparation.preparedQueryKeys,
    ...preparedQueryKeys,
  ]);
  const resolvedState =
    state ??
    (modulePreparation.preparedRoutes.length >= modulePreparation.totalRoutes &&
    nextPreparedQueryKeys.length >= modulePreparation.totalQueries
      ? "PREPARED"
      : modulePreparation.state);

  return {
    ...modulePreparation,
    preparedQueryKeys: nextPreparedQueryKeys,
    state: resolvedState,
    lastPreparedAt:
      resolvedState === "PREPARED" ? nowIso() : modulePreparation.lastPreparedAt,
  };
}

function recalculateBootstrapProgress(progress: OfflineBootstrapProgress) {
  const rawCompletedSteps = progress.modules.reduce(
    (sum, modulePreparation) =>
      sum +
      modulePreparation.preparedRoutes.length +
      modulePreparation.preparedQueryKeys.length,
    0,
  );
  const completedSteps = Math.min(rawCompletedSteps, progress.totalSteps);

  return {
    ...progress,
    completedSteps,
    updatedAt: nowIso(),
  };
}

function isModulePrepared(modulePreparation: OfflineModulePreparation) {
  return (
    modulePreparation.preparedRoutes.length >= modulePreparation.totalRoutes &&
    modulePreparation.preparedQueryKeys.length >= modulePreparation.totalQueries
  );
}

function needsBootstrapWork(
  progress: OfflineBootstrapProgress | null,
  pathname: string,
) {
  if (!progress) return true;
  if (progress.modules.length === 0) return true;
  if (progress.modules.some((modulePreparation) => !isModulePrepared(modulePreparation))) {
    return true;
  }
  if (isPublicPathname(pathname)) {
    return false;
  }
  return !progress.preparedRoutes.some((candidate) => routeMatches(pathname, candidate));
}

async function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

async function requestBackgroundSync() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.ready.catch(() => null);
  const syncRegistration = registration as
    | (ServiceWorkerRegistration & {
        sync?: { register: (tag: string) => Promise<void> };
      })
    | null;
  if (!syncRegistration?.sync?.register) return;
  try {
    await syncRegistration.sync.register(OFFLINE_BOOTSTRAP_SYNC_TAG);
  } catch {
    // Background Sync is an enhancement only.
  }
}

async function postServiceWorkerMessage(message: Record<string, unknown>) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.ready.catch(() => null);
  const worker =
    registration?.active ?? registration?.waiting ?? registration?.installing ?? null;
  worker?.postMessage(message);
}

async function prewarmAssets(assets: string[]) {
  const preparedAssets = [];

  for (const assetUrl of uniqueStrings(assets)) {
    try {
      const response = await fetch(assetUrl, { credentials: "include" });
      if (response.ok) {
        preparedAssets.push(assetUrl);
      }
    } catch {
      // Ignore asset warmup failures.
    }
  }

  if (preparedAssets.length > 0) {
    await postServiceWorkerMessage({
      type: "OFFLINE_BOOTSTRAP_WARM",
      assets: preparedAssets,
      routes: [],
    });
  }

  return preparedAssets;
}

async function prewarmRoutes(
  routeDefinitions: Array<{
    canonicalRoute: string;
    matchPaths: string[];
    warmupUrls: string[];
  }>,
  messageType: "OFFLINE_PREWARM" | "OFFLINE_BOOTSTRAP_WARM",
) {
  const preparedCanonicalRoutes: string[] = [];
  const preparedPathnames: string[] = [];

  for (const route of routeDefinitions) {
    let didPrepare = false;
    for (const warmupUrl of uniqueStrings(route.warmupUrls)) {
      try {
        const response = await fetch(warmupUrl, {
          credentials: "include",
        });
        if (response.ok) {
          didPrepare = true;
        }
      } catch {
        // Ignore route warmup failures.
      }
    }

    if (didPrepare) {
      preparedCanonicalRoutes.push(route.canonicalRoute);
      preparedPathnames.push(...route.matchPaths);
    }
  }

  const nextPreparedPathnames = uniqueStrings(preparedPathnames);
  if (nextPreparedPathnames.length > 0) {
    const matchedRoutes = routeDefinitions.filter((route) =>
      preparedCanonicalRoutes.includes(route.canonicalRoute),
    );
    try {
      await postServiceWorkerMessage({
        type: messageType,
        routes: uniqueStrings(matchedRoutes.flatMap((route) => route.warmupUrls)),
        assets: [],
      });
    } catch {
      // Ignore route warmup failures.
    }
  }

  return {
    preparedCanonicalRoutes: uniqueStrings(preparedCanonicalRoutes),
    preparedPathnames: nextPreparedPathnames,
  };
}

export function OfflineProvider({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { data: session, status: sessionStatus } = useSession();
  const { isOffline, lastOnlineAt } = useOfflineConnectivity();
  const [lifecycleState, setLifecycleState] =
    useState<OfflineLifecycleState>("booting");
  const [hydrationCompleted, setHydrationCompleted] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [blockingCount, setBlockingCount] = useState(0);
  const [tenantKey, setTenantKey] = useState<OfflineTenantKey | null>(null);
  const [hydratedTenantKey, setHydratedTenantKey] = useState<OfflineTenantKey | null>(null);
  const [sessionBootstrap, setSessionBootstrap] =
    useState<OfflineSessionBootstrap | null>(null);
  const [bootstrapProgress, setBootstrapProgress] =
    useState<OfflineBootstrapProgress | null>(null);
  const [updateState, setUpdateState] = useState<OfflineUpdateState>("idle");
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [installPromptEvent, setInstallPromptEvent] =
    useState<BeforeInstallPromptEventLike | null>(null);
  const [operations, setOperations] = useState<OfflineOutboxSummaryItem[]>([]);
  const [tenantConflict, setTenantConflict] = useState<{
    previousTenantKey: string;
    pendingCount: number;
    blockingCount: number;
  } | null>(null);
  const restoredQueriesRef = useRef(false);
  const isOfflineRef = useRef(isOffline);
  const lastReconnectHandledRef = useRef<string | null>(null);
  const lastHydratedTenantKeyRef = useRef<string | null>(null);
  const bootstrapRunRef = useRef<Promise<void> | null>(null);
  const syncRunRef = useRef<Promise<void> | null>(null);
  const serviceWorkerRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);

  const effectiveUser =
    (session?.user as OfflineSessionBootstrap["user"] | undefined) ??
    sessionBootstrap?.user ??
    null;
  const enabledFeatures = useMemo(
    () => effectiveUser?.enabledFeatures ?? [],
    [effectiveUser],
  );
  const enabledModules = useMemo(
    () => getEnabledOfflineModules(enabledFeatures),
    [enabledFeatures],
  );
  const currentSessionTenantKey =
    (session?.user as { companyId?: string } | undefined)?.companyId ?? null;
  const sessionBootstrapExpired = isOfflineSessionBootstrapExpired(sessionBootstrap);
  const preparedModules = useMemo(
    () => bootstrapProgress?.modules ?? [],
    [bootstrapProgress],
  );
  const lastSyncedAt = bootstrapProgress?.lastSyncedAt ?? null;
  const effectiveTenantKey = useMemo(
    () =>
      tenantConflict
        ? null
        : currentSessionTenantKey ??
      tenantKey ??
      sessionBootstrap?.tenantKey ??
      null,
    [currentSessionTenantKey, sessionBootstrap?.tenantKey, tenantConflict, tenantKey],
  );
  const routeAvailability = useMemo(
    () => getOfflineRouteAvailability(pathname, enabledFeatures),
    [enabledFeatures, pathname],
  );
  const routeMutationPolicy = useMemo(
    () => getRouteOfflineMutationPolicy(pathname),
    [pathname],
  );

  const refreshOutboxSummary = useCallback(async (targetTenantKey?: string | null) => {
    if (!targetTenantKey) {
      setPendingCount(0);
      setBlockingCount(0);
      setOperations([]);
      return;
    }
    const summary = await getOfflineOutboxSummaryForTenant(targetTenantKey);
    setPendingCount(summary.pendingCount);
    setBlockingCount(summary.blockingCount);
    setOperations(summary.items);
  }, []);

  const loadTenantState = useCallback(
    async (targetTenantKey: string | null) => {
      if (!targetTenantKey) {
        setSessionBootstrap(null);
        setBootstrapProgress(null);
        setHydratedTenantKey(null);
        lastHydratedTenantKeyRef.current = null;
        await refreshOutboxSummary(null);
        return;
      }

      if (lastHydratedTenantKeyRef.current !== targetTenantKey) {
        queryClient.clear();
        setHydratedTenantKey(null);
        lastHydratedTenantKeyRef.current = targetTenantKey;
      }

      await restoreOfflineQueries(queryClient, targetTenantKey);
      await pruneOfflineQueries(targetTenantKey);
      const [cachedSession, cachedBootstrapState] = await Promise.all([
        getOfflineSessionBootstrap(targetTenantKey).catch(() => null),
        getOfflineBootstrapProgress(targetTenantKey).catch(() => null),
      ]);
      setSessionBootstrap(cachedSession);
      setBootstrapProgress(cachedBootstrapState);
      setHydratedTenantKey(targetTenantKey);
      await refreshOutboxSummary(targetTenantKey);
    },
    [queryClient, refreshOutboxSummary],
  );

  const hydrateTenantState = useCallback(
    async (targetTenantKey: string | null) => {
      setHydrationCompleted(false);
      setLifecycleState((current) =>
        transitionOfflineLifecycle(current, "hydrating_cache"),
      );
      await loadTenantState(targetTenantKey);
      setHydrationCompleted(true);
      setLifecycleState((current) =>
        transitionOfflineLifecycle(
          current,
          resolveReadyOfflineLifecycleState(isOfflineRef.current),
        ),
      );
    },
    [loadTenantState],
  );

  const commitBootstrapProgress = useCallback(
    async (nextProgress: OfflineBootstrapProgress) => {
      setBootstrapProgress(nextProgress);
      await saveOfflineBootstrapProgress(nextProgress);
      return nextProgress;
    },
    [],
  );

  const checkForUpdates = useCallback(async () => {
    const registration = serviceWorkerRegistrationRef.current;
    if (!registration || typeof navigator === "undefined" || !navigator.onLine) {
      return;
    }
    if (registration.waiting) {
      setUpdateState("ready");
      setUpdateDismissed(false);
      return;
    }

    setUpdateState((current) => (current === "idle" ? "checking" : current));
    try {
      await registration.update();
    } catch {
      setUpdateState((current) => (current === "checking" ? "idle" : current));
      return;
    }
    if (registration.waiting) {
      setUpdateState("ready");
      setUpdateDismissed(false);
      return;
    }
    if (registration.installing) {
      setUpdateState("downloading");
      return;
    }
    setUpdateState((current) => (current === "checking" ? "idle" : current));
  }, []);

  const bootstrapSession = useCallback(
    async (options?: { force?: boolean }) => {
      if (typeof window === "undefined") {
        return;
      }
      if (
        !canRunOfflineWarmup({
          isOffline,
          sessionStatus,
          enabledModulesCount: enabledModules.length,
          hasEffectiveTenant: Boolean(effectiveTenantKey),
          tenantHydrated: hydratedTenantKey === effectiveTenantKey,
          hasTenantConflict: Boolean(tenantConflict),
          hydrationCompleted,
        })
      ) {
        return;
      }
      if (!navigator.onLine || isOfflineRef.current) {
        return;
      }
      if (!options?.force && !needsBootstrapWork(bootstrapProgress, pathname)) {
        return;
      }
      if (bootstrapRunRef.current && !options?.force) {
        return bootstrapRunRef.current;
      }
      const activeTenantKey = effectiveTenantKey;
      if (!activeTenantKey) {
        return;
      }

      const run = (async () => {
        setLifecycleState((current) =>
          transitionOfflineLifecycle(current, "warming"),
        );
        const seedProgress = createOfflineBootstrapProgress(
          activeTenantKey,
          enabledModules,
          bootstrapProgress,
        );
        let nextProgress: OfflineBootstrapProgress = {
          ...seedProgress,
          phase: "preparing",
          startedAt: seedProgress.startedAt ?? nowIso(),
          currentStepLabel: "Preparing offline workspace",
          updatedAt: nowIso(),
        };
        await commitBootstrapProgress(nextProgress);

        const shellAssets = uniqueStrings([
          ...SHELL_ASSET_URLS,
          ...enabledModules.flatMap((moduleDefinition) => moduleDefinition.shellAssets ?? []),
        ]);
        await prewarmAssets(shellAssets);
        if (!navigator.onLine || isOfflineRef.current) {
          return;
        }

        for (const moduleDefinition of [...enabledModules].sort(
          (left, right) => left.bootstrapPriority - right.bootstrapPriority,
        )) {
          if (!navigator.onLine || isOfflineRef.current) {
            return;
          }
          const routeDefinitions = getWarmupRouteDefinitions(moduleDefinition);
          nextProgress = recalculateBootstrapProgress({
            ...nextProgress,
            currentStepLabel: `Preparing ${moduleDefinition.primaryFlowLabel}`,
            modules: nextProgress.modules.map((modulePreparation) =>
              modulePreparation.moduleId === moduleDefinition.moduleId
                ? {
                    ...modulePreparation,
                    state: "PREPARING",
                  }
                : modulePreparation,
            ),
          });
          await commitBootstrapProgress(nextProgress);

          for (const preloadQuery of moduleDefinition.preloadQueries) {
            if (preloadQuery.enabled && !preloadQuery.enabled()) {
              nextProgress = recalculateBootstrapProgress({
                ...nextProgress,
                modules: nextProgress.modules.map((modulePreparation) =>
                  modulePreparation.moduleId === moduleDefinition.moduleId
                    ? mergeModulePreparedQueries(modulePreparation, [preloadQuery.key])
                    : modulePreparation,
                ),
              });
              continue;
            }

            const queryKey =
              typeof preloadQuery.queryKey === "function"
                ? await preloadQuery.queryKey()
                : preloadQuery.queryKey;
            if (!queryKey) {
              nextProgress = recalculateBootstrapProgress({
                ...nextProgress,
                modules: nextProgress.modules.map((modulePreparation) =>
                  modulePreparation.moduleId === moduleDefinition.moduleId
                    ? mergeModulePreparedQueries(modulePreparation, [preloadQuery.key])
                    : modulePreparation,
                ),
              });
              continue;
            }

            try {
              await queryClient.prefetchQuery({
                queryKey,
                queryFn: () => preloadQuery.fetcher(queryKey),
                staleTime: preloadQuery.maxAgeMs ?? 5 * 60_000,
              });
              nextProgress = recalculateBootstrapProgress({
                ...nextProgress,
                modules: nextProgress.modules.map((modulePreparation) =>
                  modulePreparation.moduleId === moduleDefinition.moduleId
                    ? mergeModulePreparedQueries(modulePreparation, [preloadQuery.key])
                    : modulePreparation,
                ),
              });
              await commitBootstrapProgress(nextProgress);
            } catch {
              // Ignore bootstrap query failures and keep the module partially prepared.
            }

            if (!navigator.onLine || isOfflineRef.current) {
              return;
            }
          }

          const preparedRouteState = await prewarmRoutes(
            routeDefinitions,
            "OFFLINE_BOOTSTRAP_WARM",
          );
          nextProgress = recalculateBootstrapProgress({
            ...nextProgress,
            preparedRoutes: uniqueStrings([
              ...nextProgress.preparedRoutes,
              ...preparedRouteState.preparedPathnames,
            ]),
            modules: nextProgress.modules.map((modulePreparation) =>
              modulePreparation.moduleId === moduleDefinition.moduleId
                ? mergeModulePreparedRoutes(
                    modulePreparation,
                    preparedRouteState.preparedCanonicalRoutes,
                  )
                : modulePreparation,
            ),
          });
          nextProgress = recalculateBootstrapProgress({
            ...nextProgress,
            modules: nextProgress.modules.map((modulePreparation) => {
              if (modulePreparation.moduleId !== moduleDefinition.moduleId) {
                return modulePreparation;
              }
              const isPrepared =
                modulePreparation.preparedRoutes.length >= modulePreparation.totalRoutes &&
                modulePreparation.preparedQueryKeys.length >= modulePreparation.totalQueries;
              return {
                ...modulePreparation,
                state: isPrepared ? "PREPARED" : "NOT_PREPARED",
                lastPreparedAt: isPrepared ? nowIso() : modulePreparation.lastPreparedAt,
              };
            }),
          });
          await commitBootstrapProgress(nextProgress);
        }

        const extraRoutes = filterRoutesToOfflineWarmupScope(
          uniqueStrings([pathname, ...readRecentRoutes()]).filter(
            (route) =>
              !nextProgress.preparedRoutes.includes(route) &&
              !isPublicPathname(route),
          ),
          enabledFeatures,
        );
        if (extraRoutes.length > 0) {
          const preparedExtraRoutes = await prewarmRoutes(
            extraRoutes.map((route) => ({
              canonicalRoute: route,
              matchPaths: [route],
              warmupUrls: [route],
            })),
            "OFFLINE_PREWARM",
          );
          nextProgress = recalculateBootstrapProgress({
            ...nextProgress,
            preparedRoutes: uniqueStrings([
              ...nextProgress.preparedRoutes,
              ...preparedExtraRoutes.preparedPathnames,
            ]),
          });
        }

        nextProgress = {
          ...nextProgress,
          phase: "complete",
          currentStepLabel: null,
          lastPreparedAt: nowIso(),
          updatedAt: nowIso(),
        };
        await commitBootstrapProgress(nextProgress);
      })();

      bootstrapRunRef.current = run;
      try {
        await run;
      } finally {
        bootstrapRunRef.current = null;
        setLifecycleState((current) =>
          transitionOfflineLifecycle(
            current,
            resolveReadyOfflineLifecycleState(isOfflineRef.current),
          ),
        );
      }
    },
    [
      bootstrapProgress,
      commitBootstrapProgress,
      effectiveTenantKey,
      hydratedTenantKey,
      enabledModules,
      enabledFeatures,
      hydrationCompleted,
      isOffline,
      pathname,
      queryClient,
      sessionStatus,
      tenantConflict,
    ],
  );

  const syncNow = useCallback(
    async (options?: { force?: boolean }) => {
      if (
        !canReplayOfflineQueue({
          isOffline,
          hasEffectiveTenant: Boolean(effectiveTenantKey),
          hasTenantConflict: Boolean(tenantConflict),
        })
      ) {
        return;
      }
      if (syncRunRef.current) {
        return syncRunRef.current;
      }

      const run = (async () => {
        setLifecycleState((current) =>
          transitionOfflineLifecycle(current, "syncing"),
        );
        setIsSyncing(true);
        try {
          const result = await syncOfflineRuntime({
            enabledFeatures,
            force: options?.force,
            tenantKey: effectiveTenantKey ?? undefined,
          });
          for (const queryKey of result.invalidateQueryKeys) {
            void queryClient.invalidateQueries({ queryKey });
          }
          await refreshOutboxSummary(effectiveTenantKey);
          const syncCompletedAt = nowIso();
          if (bootstrapProgress) {
            void commitBootstrapProgress({
              ...bootstrapProgress,
              lastSyncedAt: syncCompletedAt,
            });
          }
        } finally {
          setIsSyncing(false);
          setIsReconnecting(false);
          setLifecycleState((current) =>
            transitionOfflineLifecycle(
              current,
              resolveReadyOfflineLifecycleState(isOfflineRef.current),
            ),
          );
        }
      })();

      syncRunRef.current = run;
      try {
        await run;
      } finally {
        syncRunRef.current = null;
      }
    },
    [
      bootstrapProgress,
      commitBootstrapProgress,
      effectiveTenantKey,
      enabledFeatures,
      isOffline,
      queryClient,
      refreshOutboxSummary,
      tenantConflict,
    ],
  );

  const retryOperation = useCallback(
    async (operationId: string) => {
      await resetOfflineOperationToQueued(operationId);
      if (effectiveTenantKey) {
        await refreshOutboxSummary(effectiveTenantKey);
      }
      if (navigator.onLine && !isOfflineRef.current) {
        await syncNow({ force: true });
      }
    },
    [effectiveTenantKey, refreshOutboxSummary, syncNow],
  );

  const removeOperationFromShell = useCallback(
    async (operationId: string) => {
      await removeOfflineOperation(operationId);
      if (effectiveTenantKey) {
        await refreshOutboxSummary(effectiveTenantKey);
      }
    },
    [effectiveTenantKey, refreshOutboxSummary],
  );

  const applyUpdate = useCallback(async () => {
    const registration = serviceWorkerRegistrationRef.current;
    const waitingWorker = registration?.waiting ?? null;
    if (!waitingWorker || isSyncing) return;
    setUpdateState("activating");
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  }, [isSyncing]);

  const dismissUpdate = useCallback(() => {
    setUpdateDismissed(true);
  }, []);

  const installApp = useCallback(async () => {
    if (!installPromptEvent) return;
    await installPromptEvent.prompt();
    try {
      await installPromptEvent.userChoice;
    } finally {
      setInstallPromptEvent(null);
    }
  }, [installPromptEvent]);

  const clearTenantConflict = useCallback(async () => {
    if (!tenantConflict || !currentSessionTenantKey || !session?.user) {
      return;
    }
    await clearTenantOfflineData(tenantConflict.previousTenantKey);
    await setActiveOfflineTenantContext({
      tenantKey: currentSessionTenantKey,
      companySlug:
        (session.user as OfflineSessionBootstrap["user"]).companySlug ?? null,
      workspaceProfile:
        (session.user as OfflineSessionBootstrap["user"]).workspaceProfile ??
        null,
      host: typeof window !== "undefined" ? window.location.host : null,
    });
    setTenantConflict(null);
    setTenantKey(currentSessionTenantKey);
    await hydrateTenantState(currentSessionTenantKey);
  }, [currentSessionTenantKey, hydrateTenantState, session?.user, tenantConflict]);

  useEffect(() => {
    rememberRoute(pathname);
  }, [pathname]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      isOffline ||
      !navigator.onLine ||
      lifecycleState === "warming" ||
      Boolean(bootstrapRunRef.current) ||
      isPublicPathname(pathname) ||
      sessionStatus !== "authenticated" ||
      !effectiveTenantKey ||
      hydratedTenantKey !== effectiveTenantKey ||
      tenantConflict ||
      !hydrationCompleted
    ) {
      return;
    }

    void (async () => {
      const matchedModule =
        enabledModules.find((moduleDefinition) =>
          moduleOwnsPath(moduleDefinition, pathname),
        ) ?? null;
      if (!matchedModule) {
        return;
      }

      const routeDefinitions = getWarmupRouteDefinitions(matchedModule).filter(
        (routeDefinition) =>
          routeDefinition.matchPaths.some((candidate) =>
            routeMatches(pathname, candidate),
          ),
      );
      if (routeDefinitions.length === 0) {
        return;
      }
      const currentProgress = createOfflineBootstrapProgress(
        effectiveTenantKey,
        enabledModules,
        bootstrapProgress,
      );
      const currentModulePreparation = currentProgress.modules.find(
        (modulePreparation) =>
          modulePreparation.moduleId === matchedModule.moduleId,
      );
      const routeAlreadyPrepared = routeDefinitions.every((routeDefinition) =>
        currentModulePreparation?.preparedRoutes.includes(routeDefinition.canonicalRoute),
      );
      const queriesAlreadyPrepared = currentModulePreparation
        ? currentModulePreparation.preparedQueryKeys.length >=
          currentModulePreparation.totalQueries
        : false;
      if (routeAlreadyPrepared && queriesAlreadyPrepared) {
        return;
      }

      const [{ preparedCanonicalRoutes, preparedPathnames }, preparedQueryKeys] =
        await Promise.all([
          prewarmRoutes(routeDefinitions, "OFFLINE_PREWARM"),
          matchedModule
            ? prefetchModuleQueries(matchedModule, queryClient)
            : Promise.resolve([]),
        ]);

      if (
        preparedCanonicalRoutes.length === 0 &&
        preparedPathnames.length === 0 &&
        preparedQueryKeys.length === 0
      ) {
        return;
      }

      const refreshedProgress = createOfflineBootstrapProgress(
        effectiveTenantKey,
        enabledModules,
        bootstrapProgress,
      );
      const refreshedModulePreparation =
        refreshedProgress.modules.find(
          (modulePreparation) =>
            modulePreparation.moduleId === matchedModule.moduleId,
        ) ?? null;
      const hasNewPreparedPaths = preparedPathnames.some(
        (candidate) => !refreshedProgress.preparedRoutes.includes(candidate),
      );
      const hasNewPreparedRoute =
        refreshedModulePreparation !== null &&
        preparedCanonicalRoutes.some(
          (candidate) =>
            !refreshedModulePreparation.preparedRoutes.includes(candidate),
        );
      const hasNewPreparedQuery =
        refreshedModulePreparation !== null &&
        preparedQueryKeys.some(
          (candidate) =>
            !refreshedModulePreparation.preparedQueryKeys.includes(candidate),
        );

      if (!hasNewPreparedPaths && !hasNewPreparedRoute && !hasNewPreparedQuery) {
        return;
      }

      const nextProgress = recalculateBootstrapProgress({
        ...refreshedProgress,
        preparedRoutes: uniqueStrings([
          ...refreshedProgress.preparedRoutes,
          ...preparedPathnames,
        ]),
        modules: refreshedProgress.modules.map((modulePreparation) => {
          if (!matchedModule || modulePreparation.moduleId !== matchedModule.moduleId) {
            return modulePreparation;
          }

          return mergeModulePreparedQueries(
            mergeModulePreparedRoutes(
              modulePreparation,
              preparedCanonicalRoutes,
            ),
            preparedQueryKeys,
          );
        }),
      });

      await commitBootstrapProgress(nextProgress);
    })();
  }, [
    bootstrapProgress,
    commitBootstrapProgress,
    effectiveTenantKey,
    enabledModules,
    hydratedTenantKey,
    hydrationCompleted,
    isOffline,
    lifecycleState,
    pathname,
    queryClient,
    sessionStatus,
    tenantConflict,
  ]);

  useEffect(() => {
    let active = true;
    let updateFoundHandler: (() => void) | null = null;
    let controllerChangeHandler: (() => void) | null = null;

    void registerServiceWorker()
      .then((registration) => {
        if (!active) return;
        serviceWorkerRegistrationRef.current = registration;
        if (!registration) return;

        const bindInstallingWorker = (worker: ServiceWorker | null) => {
          if (!worker) return;
          setUpdateState(
            navigator.serviceWorker.controller ? "downloading" : "idle",
          );
          worker.addEventListener("statechange", () => {
            if (!active) return;
            if (worker.state === "installed") {
              if (navigator.serviceWorker.controller) {
                setUpdateState("ready");
                setUpdateDismissed(false);
                return;
              }
              setUpdateState("idle");
              return;
            }
            if (worker.state === "activating") {
              setUpdateState("activating");
            }
          });
        };

        if (registration.waiting) {
          setUpdateState("ready");
          setUpdateDismissed(false);
        }

        updateFoundHandler = () => {
          bindInstallingWorker(registration.installing);
        };
        registration.addEventListener("updatefound", updateFoundHandler);

        controllerChangeHandler = () => {
          window.location.reload();
        };
        navigator.serviceWorker?.addEventListener(
          "controllerchange",
          controllerChangeHandler,
        );
      })
      .catch(() => null);

    return () => {
      active = false;
      if (serviceWorkerRegistrationRef.current && updateFoundHandler) {
        serviceWorkerRegistrationRef.current.removeEventListener(
          "updatefound",
          updateFoundHandler,
        );
      }
      if (controllerChangeHandler) {
        navigator.serviceWorker?.removeEventListener(
          "controllerchange",
          controllerChangeHandler,
        );
      }
    };
  }, []);

  useEffect(() => {
    if (restoredQueriesRef.current) return;
    restoredQueriesRef.current = true;
    void (async () => {
      setLifecycleState("booting");
      const activeContext = await getActiveOfflineTenantContext().catch(() => null);
      const restoredTenantKey = activeContext?.tenantKey ?? null;
      setTenantKey(restoredTenantKey);
      await hydrateTenantState(restoredTenantKey);
    })();
  }, [hydrateTenantState]);

  useEffect(() => {
    isOfflineRef.current = isOffline;
  }, [isOffline]);

  useEffect(() => {
    if (bootstrapProgress || !effectiveTenantKey) return;
    setBootstrapProgress(
      createOfflineBootstrapProgress(effectiveTenantKey, enabledModules, null),
    );
  }, [bootstrapProgress, effectiveTenantKey, enabledModules]);

  useEffect(() => {
    if (!bootstrapProgress || !effectiveTenantKey) return;
    const nextProgress = createOfflineBootstrapProgress(
      effectiveTenantKey,
      enabledModules,
      bootstrapProgress,
    );
    setBootstrapProgress(nextProgress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTenantKey, enabledModules]);

  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (!event?.query || !effectiveTenantKey || tenantConflict) return;
      void persistOfflineQueryRecord(event.query, effectiveTenantKey);
    });
    return unsubscribe;
  }, [effectiveTenantKey, queryClient, tenantConflict]);

  useEffect(() => {
    const onOutboxChanged = () => {
      void refreshOutboxSummary(effectiveTenantKey);
      void requestBackgroundSync();
    };
    const onSessionChanged = () => {
      if (!effectiveTenantKey) return;
      void getOfflineSessionBootstrap(effectiveTenantKey)
        .then(setSessionBootstrap)
        .catch(() => null);
    };
    const onBootstrapChanged = () => {
      if (!effectiveTenantKey) return;
      void getOfflineBootstrapProgress(effectiveTenantKey)
        .then(setBootstrapProgress)
        .catch(() => null);
    };
    window.addEventListener(OFFLINE_OUTBOX_CHANGED_EVENT, onOutboxChanged);
    window.addEventListener(OFFLINE_SESSION_CHANGED_EVENT, onSessionChanged);
    window.addEventListener(OFFLINE_BOOTSTRAP_CHANGED_EVENT, onBootstrapChanged);
    return () => {
      window.removeEventListener(OFFLINE_OUTBOX_CHANGED_EVENT, onOutboxChanged);
      window.removeEventListener(OFFLINE_SESSION_CHANGED_EVENT, onSessionChanged);
      window.removeEventListener(OFFLINE_BOOTSTRAP_CHANGED_EVENT, onBootstrapChanged);
    };
  }, [effectiveTenantKey, refreshOutboxSummary]);

  useEffect(() => {
    if (!hydrationCompleted) {
      return;
    }
    if (isOffline) {
      setIsReconnecting(false);
      setLifecycleState((current) =>
        transitionOfflineLifecycle(current, "ready_offline"),
      );
      return;
    }

    setLifecycleState((current) =>
      transitionOfflineLifecycle(current, "ready_online"),
    );
    if (
      lastOnlineAt &&
      lastReconnectHandledRef.current !== lastOnlineAt &&
      sessionStatus === "authenticated" &&
      effectiveTenantKey &&
      !tenantConflict
    ) {
      lastReconnectHandledRef.current = lastOnlineAt;
      setIsReconnecting(true);
      void bootstrapSession({ force: true });
      void requestBackgroundSync();
      void checkForUpdates();
      void syncNow();
    }
  }, [
    bootstrapSession,
    checkForUpdates,
    effectiveTenantKey,
    hydrationCompleted,
    isOffline,
    lastOnlineAt,
    sessionStatus,
    syncNow,
    tenantConflict,
  ]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (!navigator.onLine || isOfflineRef.current) {
        return;
      }
      void bootstrapSession();
      void requestBackgroundSync();
      void checkForUpdates();
      void syncNow();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [bootstrapSession, checkForUpdates, syncNow]);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEventLike);
    };

    const onAppInstalled = () => {
      setInstallPromptEvent(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  useEffect(() => {
    const onServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === "OFFLINE_SYNC_REQUEST") {
        if (!navigator.onLine || isOfflineRef.current) return;
        void syncNow();
        return;
      }
      if (event.data?.type === "OFFLINE_SW_ACTIVATED") {
        setUpdateState("idle");
        setUpdateDismissed(false);
        return;
      }
      if (event.data?.type === "OFFLINE_UPDATE_WAITING") {
        setUpdateState("ready");
        setUpdateDismissed(false);
      }
    };
    navigator.serviceWorker?.addEventListener("message", onServiceWorkerMessage);
    return () =>
      navigator.serviceWorker?.removeEventListener("message", onServiceWorkerMessage);
  }, [syncNow]);

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !session?.user || !currentSessionTenantKey) {
      return;
    }

    void (async () => {
      const savedBootstrap = await saveOfflineSessionBootstrap(
        currentSessionTenantKey,
        session.user as OfflineSessionBootstrap["user"],
      );
      const activeContext = await getActiveOfflineTenantContext().catch(() => null);
      if (!activeContext || activeContext.tenantKey === currentSessionTenantKey) {
        setTenantConflict(null);
        setTenantKey(currentSessionTenantKey);
        await setActiveOfflineTenantContext({
          tenantKey: currentSessionTenantKey,
          companySlug: savedBootstrap.user.companySlug ?? null,
          workspaceProfile: savedBootstrap.user.workspaceProfile ?? null,
          host: typeof window !== "undefined" ? window.location.host : null,
        });
        await hydrateTenantState(currentSessionTenantKey);
        return;
      }

      const previousSummary = await getOfflineOutboxSummaryForTenant(
        activeContext.tenantKey,
      );
      if (previousSummary.pendingCount > 0) {
        setTenantConflict({
          previousTenantKey: activeContext.tenantKey,
          pendingCount: previousSummary.pendingCount,
          blockingCount: previousSummary.blockingCount,
        });
        setSessionBootstrap(savedBootstrap);
        setBootstrapProgress(
          createOfflineBootstrapProgress(
            currentSessionTenantKey,
            enabledModules,
            null,
          ),
        );
        setPendingCount(0);
        setBlockingCount(0);
        setOperations([]);
        return;
      }

      await clearTenantOfflineData(activeContext.tenantKey);
      setTenantConflict(null);
      setTenantKey(currentSessionTenantKey);
      await setActiveOfflineTenantContext({
        tenantKey: currentSessionTenantKey,
        companySlug: savedBootstrap.user.companySlug ?? null,
        workspaceProfile: savedBootstrap.user.workspaceProfile ?? null,
        host: typeof window !== "undefined" ? window.location.host : null,
      });
      await hydrateTenantState(currentSessionTenantKey);
    })();
  }, [
    currentSessionTenantKey,
    enabledModules,
    hydrateTenantState,
    session,
    sessionStatus,
  ]);

  useEffect(() => {
    if (sessionStatus === "unauthenticated" && navigator.onLine && tenantKey) {
      void clearOfflineSessionBootstrap(tenantKey).then(() => setSessionBootstrap(null));
    }
  }, [sessionStatus, tenantKey]);

  useEffect(() => {
    if (sessionStatus !== "authenticated" || tenantConflict) return;
    if (!effectiveTenantKey || hydratedTenantKey !== effectiveTenantKey) return;
    if (isOffline || !navigator.onLine || !hydrationCompleted) return;
    void bootstrapSession();
    void checkForUpdates();
  }, [
    bootstrapSession,
    checkForUpdates,
    effectiveTenantKey,
    hydratedTenantKey,
    hydrationCompleted,
    isOffline,
    sessionStatus,
    tenantConflict,
  ]);

  useEffect(() => {
    if (updateState !== "ready") {
      setUpdateDismissed(false);
    }
  }, [updateState]);

  const status: OfflineStatus = useMemo(() => {
    if (isOffline) return "OFFLINE";
    if (
      lifecycleState === "hydrating_cache" ||
      lifecycleState === "warming" ||
      bootstrapProgress?.phase === "preparing"
    ) {
      return "PREPARING";
    }
    if (lifecycleState === "syncing" || isSyncing) return "SYNCING";
    if (isReconnecting) return "RECONNECTING";
    if (tenantConflict || blockingCount > 0) return "ATTENTION";
    if (updateState === "ready" || updateState === "activating") {
      return "UPDATE_READY";
    }
    return "ONLINE";
  }, [
    blockingCount,
    bootstrapProgress?.phase,
    isOffline,
    isReconnecting,
    isSyncing,
    lifecycleState,
    tenantConflict,
    updateState,
  ]);

  const canApplyUpdate = updateState === "ready" && !isSyncing;
  const canInstallApp = installPromptEvent !== null;

  const contextValue = useMemo<OfflineContextValue>(
    () => ({
      tenantKey: effectiveTenantKey,
      isOffline,
      lifecycleState,
      isSyncing,
      canApplyUpdate,
      canInstallApp,
      pendingCount,
      blockingCount,
      status,
      statusLabel: getStatusLabel(status, pendingCount, bootstrapProgress),
      sessionBootstrap,
      sessionBootstrapExpired,
      preparedModules,
      bootstrapProgress,
      lastSyncedAt,
      updateState,
      showUpdatePrompt: updateState === "ready" && !updateDismissed,
      operations,
      tenantConflict,
      routeMutationPolicy,
      routeAvailabilityReason: routeAvailability.reason,
      syncNow,
      retryOperation,
      removeOperation: removeOperationFromShell,
      clearTenantConflict,
      applyUpdate,
      dismissUpdate,
      installApp,
    }),
    [
      applyUpdate,
      blockingCount,
      bootstrapProgress,
      canApplyUpdate,
      canInstallApp,
      clearTenantConflict,
      dismissUpdate,
      effectiveTenantKey,
      isOffline,
      isSyncing,
      lifecycleState,
      lastSyncedAt,
      operations,
      pendingCount,
      preparedModules,
      sessionBootstrap,
      sessionBootstrapExpired,
      installApp,
      removeOperationFromShell,
      retryOperation,
      routeAvailability.reason,
      routeMutationPolicy,
      tenantConflict,
      updateDismissed,
      status,
      syncNow,
      updateState,
    ],
  );

  const routeOfflineReady =
    routeAvailability.availability === "warmed" &&
    (bootstrapProgress?.preparedRoutes ?? []).some((candidate) =>
      routeMatches(pathname, candidate),
    );
  const shouldShowTransientRouteSpinner =
    isOffline &&
    !isPublicPathname(pathname) &&
    !tenantConflict &&
    Boolean(sessionBootstrap) &&
    !sessionBootstrapExpired &&
    routeAvailability.availability === "warmed" &&
    !routeOfflineReady &&
    (lifecycleState === "hydrating_cache" || lifecycleState === "warming");
  const [showRouteSpinner, setShowRouteSpinner] = useState(false);

  useEffect(() => {
    if (!shouldShowTransientRouteSpinner) {
      setShowRouteSpinner(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setShowRouteSpinner(true);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [pathname, shouldShowTransientRouteSpinner]);

  const shouldShowOfflineGuard =
    isOffline &&
    !isPublicPathname(pathname) &&
    (Boolean(tenantConflict) ||
      !sessionBootstrap ||
      sessionBootstrapExpired ||
      routeAvailability.availability === "excluded" ||
      routeAvailability.availability === "online-only");

  return (
    <OfflineContext.Provider value={contextValue}>
      {shouldShowOfflineGuard ? (
        <div className="flex min-h-screen items-center justify-center bg-[color-mix(in_srgb,var(--surface-canvas)_92%,white)] px-6 py-10">
          <div className="w-full max-w-3xl rounded-[28px] bg-[color-mix(in_srgb,var(--surface-base)_92%,white)] px-8 py-10 shadow-[0_12px_32px_-24px_rgba(17,17,17,0.18)]">
            <div className="inline-flex items-center gap-2 rounded-full bg-[color-mix(in_srgb,var(--surface-muted)_84%,white)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              <span className="size-1.5 rounded-full bg-[color-mix(in_srgb,var(--status-warning-text)_72%,white)]" />
              Offline guard
            </div>
            <h1 className="mt-4 max-w-[18ch] text-[2rem] font-semibold tracking-[-0.03em] text-foreground">
              {sessionBootstrapExpired
                ? "Reconnect to continue"
                : tenantConflict
                  ? "Clear previous offline workspace"
                  : routeAvailability.availability === "excluded" ||
                      routeAvailability.availability === "online-only"
                    ? "This workflow is online only"
                  : "This page is not ready offline"}
            </h1>
            <p className="mt-3 max-w-[58ch] text-sm leading-6 text-[var(--text-muted)]">
              {sessionBootstrapExpired
                ? "Your cached session has expired. Connect to the internet so we can refresh your access."
                : tenantConflict
                  ? "This device still holds queued offline work from another tenant. Clear that offline workspace before preparing this one."
                  : routeAvailability.reason
                    ? routeAvailability.reason
                  : !sessionBootstrap
                  ? "This device has not completed an online bootstrap for the current workspace yet."
                  : "Reconnect and let the app finish preparing this route for offline use."}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {tenantConflict ? (
                <button
                  type="button"
                  onClick={() => void clearTenantConflict()}
                  className="inline-flex h-9 items-center justify-center rounded-full bg-[var(--action-primary-bg)] px-4 text-sm font-medium text-[var(--action-primary-fg)]"
                >
                  Clear device offline data
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void syncNow({ force: true })}
                  className="inline-flex h-9 items-center justify-center rounded-full bg-[var(--action-primary-bg)] px-4 text-sm font-medium text-[var(--action-primary-fg)]"
                >
                  Retry now
                </button>
              )}
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex h-9 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--surface-muted)_84%,white)] px-4 text-sm font-medium text-[var(--text-strong)]"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      ) : showRouteSpinner ? (
        <div className="flex min-h-screen items-center justify-center bg-[color-mix(in_srgb,var(--surface-canvas)_92%,white)] px-6 py-10">
          <div
            role="status"
            aria-live="polite"
            aria-label="Loading"
            className="size-10 animate-spin rounded-full border-2 border-[color-mix(in_srgb,var(--surface-muted)_88%,white)] border-t-[var(--action-primary-bg)]"
          />
        </div>
      ) : (
        children
      )}
    </OfflineContext.Provider>
  );
}

export function useOfflineRuntime() {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error("useOfflineRuntime must be used within OfflineProvider");
  }
  return context;
}
