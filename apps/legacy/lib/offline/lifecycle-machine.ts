import type { OfflineLifecycleState } from "@/lib/offline/types";

const ALLOWED_TRANSITIONS: Record<OfflineLifecycleState, OfflineLifecycleState[]> = {
  booting: ["hydrating_cache"],
  hydrating_cache: ["ready_offline", "ready_online"],
  ready_offline: ["hydrating_cache", "ready_online", "warming", "syncing"],
  ready_online: ["hydrating_cache", "ready_offline", "warming", "syncing"],
  warming: ["hydrating_cache", "ready_offline", "ready_online", "syncing"],
  syncing: ["hydrating_cache", "ready_offline", "ready_online", "warming"],
};

export function canTransitionOfflineLifecycle(
  from: OfflineLifecycleState,
  to: OfflineLifecycleState,
) {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function transitionOfflineLifecycle(
  current: OfflineLifecycleState,
  next: OfflineLifecycleState,
) {
  if (current === next) return current;
  if (canTransitionOfflineLifecycle(current, next)) return next;
  return current;
}

export function resolveReadyOfflineLifecycleState(isOffline: boolean) {
  return (isOffline ? "ready_offline" : "ready_online") as OfflineLifecycleState;
}
