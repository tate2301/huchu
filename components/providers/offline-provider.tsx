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
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import {
  createOfflineBootstrapProgress,
  getOfflineBootstrapProgress,
  saveOfflineBootstrapProgress,
} from "@/lib/offline/bootstrap-state";
import {
  OFFLINE_BOOTSTRAP_CHANGED_EVENT,
  OFFLINE_OUTBOX_CHANGED_EVENT,
  OFFLINE_SESSION_CHANGED_EVENT,
} from "@/lib/offline/events";
import { getEnabledOfflineModules } from "@/lib/offline/module-registry";
import { getOfflineOutboxSummary } from "@/lib/offline/outbox";
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
import type {
  OfflineBootstrapProgress,
  OfflineModuleDefinition,
  OfflineModulePreparation,
  OfflineModulePreparationState,
  OfflineSessionBootstrap,
  OfflineStatus,
  OfflineUpdateState,
} from "@/lib/offline/types";

const RECENT_ROUTES_STORAGE_KEY = "offline_recent_routes_v1";
const OFFLINE_BOOTSTRAP_SYNC_TAG = "offline-runtime-sync";
const SHELL_ASSET_URLS = [
  "/offline",
  "/manifest.webmanifest",
  "/icon-192.svg",
  "/icon-512.svg",
  "/regular.4b554656.woff2",
  "/medium.501e532c.woff2",
  "/bold.37baf660.woff2",
];

type OfflineContextValue = {
  isOffline: boolean;
  isSyncing: boolean;
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
  syncNow: (options?: { force?: boolean }) => Promise<void>;
  applyUpdate: () => Promise<void>;
  dismissUpdate: () => void;
};

const OfflineContext = createContext<OfflineContextValue | null>(null);

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

function getWarmupRoutes(moduleDefinition: OfflineModuleDefinition) {
  return uniqueStrings([
    ...moduleDefinition.criticalRoutes,
    ...(moduleDefinition.warmupRoutes ?? []),
  ]);
}

function getStatusLabel(
  status: OfflineStatus,
  pendingCount: number,
  bootstrapProgress: OfflineBootstrapProgress | null,
) {
  if (status === "OFFLINE") return "Offline";
  if (status === "PREPARING") {
    if (!bootstrapProgress || bootstrapProgress.totalSteps === 0) return "Preparing";
    return `Preparing ${Math.round(
      (bootstrapProgress.completedSteps / bootstrapProgress.totalSteps) * 100,
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
  return "Synced";
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
  const preparedRoutes = uniqueStrings([
    ...progress.preparedRoutes,
    ...progress.modules.flatMap((modulePreparation) => modulePreparation.preparedRoutes),
  ]);
  const completedSteps = progress.modules.reduce(
    (sum, modulePreparation) =>
      sum +
      modulePreparation.preparedRoutes.length +
      modulePreparation.preparedQueryKeys.length,
    0,
  );

  return {
    ...progress,
    preparedRoutes,
    completedSteps,
    updatedAt: nowIso(),
  };
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

async function prewarmRoutes(routes: string[], messageType: "OFFLINE_PREWARM" | "OFFLINE_BOOTSTRAP_WARM") {
  const preparedRoutes = [];

  for (const route of uniqueStrings(routes)) {
    try {
      const response = await fetch(route, {
        credentials: "include",
      });
      if (response.ok) {
        preparedRoutes.push(route);
      }
    } catch {
      // Ignore route warmup failures.
    }
  }

  if (preparedRoutes.length > 0) {
    await postServiceWorkerMessage({
      type: messageType,
      routes: preparedRoutes,
      assets: [],
    });
  }

  return preparedRoutes;
}

export function OfflineProvider({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: session, status: sessionStatus } = useSession();
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [blockingCount, setBlockingCount] = useState(0);
  const [sessionBootstrap, setSessionBootstrap] =
    useState<OfflineSessionBootstrap | null>(null);
  const [bootstrapProgress, setBootstrapProgress] =
    useState<OfflineBootstrapProgress | null>(null);
  const [updateState, setUpdateState] = useState<OfflineUpdateState>("idle");
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const lastOnlineRef = useRef<boolean | null>(null);
  const restoredQueriesRef = useRef(false);
  const bootstrapRunRef = useRef<Promise<void> | null>(null);
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
  const sessionBootstrapExpired = isOfflineSessionBootstrapExpired(sessionBootstrap);
  const preparedModules = useMemo(
    () => bootstrapProgress?.modules ?? [],
    [bootstrapProgress],
  );
  const lastSyncedAt = bootstrapProgress?.lastSyncedAt ?? null;

  const commitBootstrapProgress = useCallback(
    async (nextProgress: OfflineBootstrapProgress) => {
      setBootstrapProgress(nextProgress);
      await saveOfflineBootstrapProgress(nextProgress);
      return nextProgress;
    },
    [],
  );

  const refreshOutboxSummary = useCallback(async () => {
    const summary = await getOfflineOutboxSummary();
    setPendingCount(summary.pendingCount);
    setBlockingCount(summary.blockingCount);
  }, []);

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
    setUpdateState((current) => (current === "checking" ? "idle" : current));
  }, []);

  const bootstrapSession = useCallback(
    async (options?: { force?: boolean }) => {
      if (
        typeof window === "undefined" ||
        sessionStatus !== "authenticated" ||
        enabledModules.length === 0
      ) {
        return;
      }
      if (bootstrapRunRef.current && !options?.force) {
        return bootstrapRunRef.current;
      }

      const run = (async () => {
        const seedProgress = createOfflineBootstrapProgress(
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

        for (const moduleDefinition of [...enabledModules].sort(
          (left, right) => left.bootstrapPriority - right.bootstrapPriority,
        )) {
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
              continue;
            }

            const queryKey =
              typeof preloadQuery.queryKey === "function"
                ? await preloadQuery.queryKey()
                : preloadQuery.queryKey;
            if (!queryKey) continue;

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
          }

          const moduleRoutes = getWarmupRoutes(moduleDefinition);
          const preparedRoutes = await prewarmRoutes(
            moduleRoutes,
            "OFFLINE_BOOTSTRAP_WARM",
          );
          nextProgress = recalculateBootstrapProgress({
            ...nextProgress,
            modules: nextProgress.modules.map((modulePreparation) =>
              modulePreparation.moduleId === moduleDefinition.moduleId
                ? mergeModulePreparedRoutes(modulePreparation, preparedRoutes)
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

        const extraRoutes = uniqueStrings([
          pathname,
          ...readRecentRoutes().slice(0, 6),
        ]).filter(
          (route) => !nextProgress.preparedRoutes.includes(route) && !isPublicPathname(route),
        );
        if (extraRoutes.length > 0) {
          const preparedExtraRoutes = await prewarmRoutes(extraRoutes, "OFFLINE_PREWARM");
          nextProgress = recalculateBootstrapProgress({
            ...nextProgress,
            preparedRoutes: uniqueStrings([
              ...nextProgress.preparedRoutes,
              ...preparedExtraRoutes,
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
      }
    },
    [bootstrapProgress, commitBootstrapProgress, enabledModules, pathname, queryClient, sessionStatus],
  );

  const syncNow = useCallback(
    async (options?: { force?: boolean }) => {
      setIsSyncing(true);
      try {
        const result = await syncOfflineRuntime({
          enabledFeatures,
          force: options?.force,
        });
        for (const queryKey of result.invalidateQueryKeys) {
          void queryClient.invalidateQueries({ queryKey });
        }
        await refreshOutboxSummary();
        const syncCompletedAt = nowIso();
        if (bootstrapProgress) {
          void commitBootstrapProgress({
            ...bootstrapProgress,
            lastSyncedAt: syncCompletedAt,
          });
        }
        if (result.syncedCount > 0) {
          toast({
            title: "Offline changes synced",
            description: `${result.syncedCount} queued item${result.syncedCount === 1 ? "" : "s"} posted.`,
            variant: "success",
          });
        }
        if (result.retryableCount > 0) {
          toast({
            title: "Some offline changes are still pending",
            description: `${result.retryableCount} item${result.retryableCount === 1 ? "" : "s"} will retry automatically.`,
            variant: "default",
          });
        }
        if (result.blockingCount > 0) {
          toast({
            title: "Some offline changes need attention",
            description: `${result.blockingCount} item${result.blockingCount === 1 ? "" : "s"} could not sync automatically.`,
            variant: "destructive",
          });
        }
      } finally {
        setIsSyncing(false);
        setIsReconnecting(false);
      }
    },
    [
      bootstrapProgress,
      commitBootstrapProgress,
      enabledFeatures,
      queryClient,
      refreshOutboxSummary,
      toast,
    ],
  );

  const applyUpdate = useCallback(async () => {
    const registration = serviceWorkerRegistrationRef.current;
    const waitingWorker = registration?.waiting ?? null;
    if (!waitingWorker) return;
    setUpdateState("activating");
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  }, []);

  const dismissUpdate = useCallback(() => {
    setUpdateDismissed(true);
  }, []);

  useEffect(() => {
    rememberRoute(pathname);
  }, [pathname]);

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
                toast({
                  title: "Update ready",
                  description: "A newer version has been downloaded for this device.",
                  variant: "default",
                });
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
  }, [toast]);

  useEffect(() => {
    if (restoredQueriesRef.current) return;
    restoredQueriesRef.current = true;
    void (async () => {
      await restoreOfflineQueries(queryClient);
      await pruneOfflineQueries();
      await refreshOutboxSummary();
      const [cachedSession, cachedBootstrapState] = await Promise.all([
        getOfflineSessionBootstrap().catch(() => null),
        getOfflineBootstrapProgress().catch(() => null),
      ]);
      setSessionBootstrap(cachedSession);
      setBootstrapProgress(cachedBootstrapState);
    })();
  }, [queryClient, refreshOutboxSummary]);

  useEffect(() => {
    if (bootstrapProgress) return;
    setBootstrapProgress(createOfflineBootstrapProgress(enabledModules, null));
  }, [bootstrapProgress, enabledModules]);

  useEffect(() => {
    if (!bootstrapProgress) return;
    const nextProgress = createOfflineBootstrapProgress(enabledModules, bootstrapProgress);
    setBootstrapProgress(nextProgress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabledModules]);

  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (!event?.query) return;
      void persistOfflineQueryRecord(event.query);
    });
    return unsubscribe;
  }, [queryClient]);

  useEffect(() => {
    const onOutboxChanged = () => {
      void refreshOutboxSummary();
      void requestBackgroundSync();
    };
    const onSessionChanged = () => {
      void getOfflineSessionBootstrap().then(setSessionBootstrap).catch(() => null);
    };
    const onBootstrapChanged = () => {
      void getOfflineBootstrapProgress().then(setBootstrapProgress).catch(() => null);
    };
    window.addEventListener(OFFLINE_OUTBOX_CHANGED_EVENT, onOutboxChanged);
    window.addEventListener(OFFLINE_SESSION_CHANGED_EVENT, onSessionChanged);
    window.addEventListener(OFFLINE_BOOTSTRAP_CHANGED_EVENT, onBootstrapChanged);
    return () => {
      window.removeEventListener(OFFLINE_OUTBOX_CHANGED_EVENT, onOutboxChanged);
      window.removeEventListener(OFFLINE_SESSION_CHANGED_EVENT, onSessionChanged);
      window.removeEventListener(OFFLINE_BOOTSTRAP_CHANGED_EVENT, onBootstrapChanged);
    };
  }, [refreshOutboxSummary]);

  useEffect(() => {
    const onOnline = () => {
      setIsOffline(false);
      setIsReconnecting(true);
      if (lastOnlineRef.current === false) {
        toast({
          title: "Connection restored",
          description: "Syncing offline changes now.",
          variant: "success",
        });
      }
      void bootstrapSession({ force: true });
      void requestBackgroundSync();
      void checkForUpdates();
      void syncNow();
    };
    const onOffline = () => {
      setIsOffline(true);
      setIsReconnecting(false);
      if (lastOnlineRef.current !== null) {
        toast({
          title: "You are offline",
          description: "Offline-ready screens and queued actions will keep working.",
          variant: "default",
        });
      }
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [bootstrapSession, checkForUpdates, syncNow, toast]);

  useEffect(() => {
    lastOnlineRef.current = !isOffline;
  }, [isOffline]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      void bootstrapSession();
      if (navigator.onLine) {
        void requestBackgroundSync();
        void checkForUpdates();
        void syncNow();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [bootstrapSession, checkForUpdates, syncNow]);

  useEffect(() => {
    const onServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === "OFFLINE_SYNC_REQUEST") {
        if (!navigator.onLine) return;
        void syncNow();
        return;
      }
      if (event.data?.type === "OFFLINE_SW_ACTIVATED") {
        setUpdateState("idle");
      }
    };
    navigator.serviceWorker?.addEventListener("message", onServiceWorkerMessage);
    return () =>
      navigator.serviceWorker?.removeEventListener("message", onServiceWorkerMessage);
  }, [syncNow]);

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !session?.user) return;
    void saveOfflineSessionBootstrap(
      session.user as OfflineSessionBootstrap["user"],
    ).then(setSessionBootstrap);
  }, [session, sessionStatus]);

  useEffect(() => {
    if (sessionStatus === "unauthenticated" && navigator.onLine) {
      void clearOfflineSessionBootstrap().then(() => setSessionBootstrap(null));
    }
  }, [sessionStatus]);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    void bootstrapSession();
    void checkForUpdates();
  }, [bootstrapSession, checkForUpdates, sessionStatus]);

  useEffect(() => {
    if (updateState !== "ready") {
      setUpdateDismissed(false);
    }
  }, [updateState]);

  const status: OfflineStatus = useMemo(() => {
    if (isOffline) return "OFFLINE";
    if (updateState === "ready" || updateState === "activating") {
      return "UPDATE_READY";
    }
    if (bootstrapProgress?.phase === "preparing") return "PREPARING";
    if (isSyncing) return "SYNCING";
    if (isReconnecting) return "RECONNECTING";
    if (blockingCount > 0) return "ATTENTION";
    return "ONLINE";
  }, [blockingCount, bootstrapProgress?.phase, isOffline, isReconnecting, isSyncing, updateState]);

  const contextValue = useMemo<OfflineContextValue>(
    () => ({
      isOffline,
      isSyncing,
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
      syncNow,
      applyUpdate,
      dismissUpdate,
    }),
    [
      applyUpdate,
      blockingCount,
      bootstrapProgress,
      dismissUpdate,
      isOffline,
      isSyncing,
      lastSyncedAt,
      pendingCount,
      preparedModules,
      sessionBootstrap,
      sessionBootstrapExpired,
      updateDismissed,
      status,
      syncNow,
      updateState,
    ],
  );

  const routeOfflineReady = (bootstrapProgress?.preparedRoutes ?? []).some((candidate) =>
    routeMatches(pathname, candidate),
  );
  const shouldShowOfflineGuard =
    isOffline &&
    !isPublicPathname(pathname) &&
    (!sessionBootstrap || sessionBootstrapExpired || !routeOfflineReady);

  return (
    <OfflineContext.Provider value={contextValue}>
      {shouldShowOfflineGuard ? (
        <div className="flex min-h-screen items-center justify-center bg-background px-6">
          <div className="max-w-md rounded-2xl border bg-card p-6 shadow-sm">
            <h1 className="text-xl font-semibold text-foreground">
              {sessionBootstrapExpired
                ? "Reconnect to continue"
                : routeOfflineReady
                  ? "Offline session unavailable"
                  : "This page is not ready offline"}
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {sessionBootstrapExpired
                ? "Your cached session has expired. Connect to the internet so we can refresh your access."
                : !sessionBootstrap
                  ? "This device has not completed an online bootstrap for the current workspace yet."
                  : "Reconnect and let the app finish preparing this route for offline use."}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => void syncNow({ force: true })}
                className="rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background"
              >
                Retry now
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-lg border px-3 py-2 text-sm font-medium"
              >
                Reload
              </button>
            </div>
          </div>
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
