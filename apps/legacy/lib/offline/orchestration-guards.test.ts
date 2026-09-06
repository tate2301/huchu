import { canReplayOfflineQueue, canRunOfflineWarmup } from "@/lib/offline/orchestration-guards";

describe("offline orchestration guards", () => {
  it("blocks warmup while offline", () => {
    expect(
      canRunOfflineWarmup({
        isOffline: true,
        sessionStatus: "authenticated",
        enabledModulesCount: 2,
        hasEffectiveTenant: true,
        tenantHydrated: true,
        hasTenantConflict: false,
        hydrationCompleted: true,
      }),
    ).toBe(false);
  });

  it("requires hydration and authenticated tenant context before warmup", () => {
    expect(
      canRunOfflineWarmup({
        isOffline: false,
        sessionStatus: "authenticated",
        enabledModulesCount: 2,
        hasEffectiveTenant: true,
        tenantHydrated: true,
        hasTenantConflict: false,
        hydrationCompleted: false,
      }),
    ).toBe(false);

    expect(
      canRunOfflineWarmup({
        isOffline: false,
        sessionStatus: "authenticated",
        enabledModulesCount: 2,
        hasEffectiveTenant: true,
        tenantHydrated: true,
        hasTenantConflict: false,
        hydrationCompleted: true,
      }),
    ).toBe(true);
  });

  it("gates queue replay to online + tenant-safe context", () => {
    expect(
      canReplayOfflineQueue({
        isOffline: true,
        hasEffectiveTenant: true,
        hasTenantConflict: false,
      }),
    ).toBe(false);

    expect(
      canReplayOfflineQueue({
        isOffline: false,
        hasEffectiveTenant: true,
        hasTenantConflict: false,
      }),
    ).toBe(true);
  });
});
