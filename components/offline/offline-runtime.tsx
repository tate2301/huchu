"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";

import {
  applyOfflineUpdate,
  clearOfflineQueue,
  configureOfflineRuntime,
  installOfflineApp,
  keepVisitedPage,
  refreshOfflineBundleStatus,
  removeQueuedOperation,
  retryOfflineOperation,
  startOfflineRuntime,
  syncOfflineQueue,
  warmOfflineScope,
  watchPersistedQueries,
} from "@/lib/offline/client-runtime";
import {
  deriveOfflineStatus,
  getOfflineSnapshot,
  getOfflineStatusLabel,
  getServerOfflineSnapshot,
  subscribeOfflineRuntime,
} from "@/lib/offline/runtime-store";

type SessionUser = { companyId?: string; enabledFeatures?: string[] };

/**
 * Starts the offline runtime and keeps it pointed at the signed-in tenant.
 * Renders nothing; everything it learns is read with `useOfflineRuntime`.
 */
export function OfflineRuntime() {
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const user = session?.user as SessionUser | undefined;
  const tenantKey = status === "authenticated" ? user?.companyId ?? null : null;
  // Joined so a session refetch with the same features does not re-warm.
  const featureKey = (user?.enabledFeatures ?? []).join("|");

  useEffect(() => startOfflineRuntime(), []);

  useEffect(() => watchPersistedQueries(queryClient), [queryClient]);

  useEffect(() => {
    configureOfflineRuntime({
      queryClient,
      tenantKey,
      enabledFeatures: featureKey ? featureKey.split("|") : [],
    });
  }, [featureKey, queryClient, tenantKey]);

  useEffect(() => {
    keepVisitedPage(pathname);
  }, [pathname]);

  return null;
}

const actions = {
  syncNow: syncOfflineQueue,
  retryOperation: retryOfflineOperation,
  removeOperation: removeQueuedOperation,
  clearQueue: clearOfflineQueue,
  warmNow: () => warmOfflineScope({ force: true }),
  refreshBundle: refreshOfflineBundleStatus,
  applyUpdate: applyOfflineUpdate,
  installApp: installOfflineApp,
};

/**
 * The device's offline state, safe to render anywhere.
 *
 * Returns the server's snapshot while this component hydrates and the live
 * one from the next render on — see `lib/offline/runtime-store.ts` for why
 * that has to be decided per reader and not once in a provider.
 */
export function useOfflineRuntime() {
  const snapshot = useSyncExternalStore(
    subscribeOfflineRuntime,
    getOfflineSnapshot,
    getServerOfflineSnapshot,
  );

  return useMemo(
    () => ({
      ...snapshot,
      ...actions,
      status: deriveOfflineStatus(snapshot),
      statusLabel: getOfflineStatusLabel(snapshot),
      isOffline: !snapshot.online,
      isSyncing: snapshot.syncing,
      pendingCount: snapshot.queue.pending,
      blockingCount: snapshot.queue.blocking,
      operations: snapshot.queue.operations,
      showUpdatePrompt: snapshot.bundle.updateWaiting,
    }),
    [snapshot],
  );
}
