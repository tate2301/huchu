export type WarmupGuardInput = {
  isOffline: boolean;
  sessionStatus: "loading" | "authenticated" | "unauthenticated";
  enabledModulesCount: number;
  hasEffectiveTenant: boolean;
  tenantHydrated: boolean;
  hasTenantConflict: boolean;
  hydrationCompleted: boolean;
};

export function canRunOfflineWarmup(input: WarmupGuardInput) {
  if (input.isOffline) return false;
  if (input.sessionStatus !== "authenticated") return false;
  if (input.enabledModulesCount === 0) return false;
  if (!input.hasEffectiveTenant) return false;
  if (!input.tenantHydrated) return false;
  if (input.hasTenantConflict) return false;
  if (!input.hydrationCompleted) return false;
  return true;
}

export type SyncGuardInput = {
  isOffline: boolean;
  hasEffectiveTenant: boolean;
  hasTenantConflict: boolean;
};

export function canReplayOfflineQueue(input: SyncGuardInput) {
  if (input.isOffline) return false;
  if (!input.hasEffectiveTenant) return false;
  if (input.hasTenantConflict) return false;
  return true;
}
