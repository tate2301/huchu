import {
  getOfflineExcludedRouteReason,
  getOfflineRouteAvailability,
  getOfflineWarmupModuleIds,
  getOfflineWarmupRoutes,
  getRouteOfflineMutationPolicy,
  isRouteWarmedForOffline,
  resolveOfflineWorkflowCatalog,
} from "@/lib/offline/workflow-catalog";

describe("offline workflow catalog", () => {
  const enabledFeatures = [
    "scrap-metal.tickets",
    "hr.employees",
    "hr.incidents",
  ];

  it("resolves scrap operator + minimal hr catalog entries", () => {
    const entries = resolveOfflineWorkflowCatalog(enabledFeatures);
    expect(entries.map((entry) => entry.workflowId)).toEqual(
      expect.arrayContaining([
        "scrap-operator-core",
        "scrap-operator-reports",
        "hr-workforce-minimal",
      ]),
    );
  });

  it("warms only configured modules and excludes settlements/accounting", () => {
    const moduleIds = getOfflineWarmupModuleIds(enabledFeatures);
    expect(moduleIds).toEqual(
      expect.arrayContaining(["scrap-metal", "scrap-lots", "scrap-reports-snapshot", "hr-workforce-core"]),
    );
    expect(moduleIds).not.toContain("scrap-staff-settlements");

    const warmRoutes = getOfflineWarmupRoutes(enabledFeatures);
    expect(warmRoutes).not.toContain("/scrap-metal/settlements");
    expect(warmRoutes).not.toContain("/human-resources/payouts");
    expect(warmRoutes).not.toContain("/accounting");
  });

  it("reports offline availability and mutation policy", () => {
    expect(isRouteWarmedForOffline("/scrap-metal/tickets", enabledFeatures)).toBe(true);
    expect(getRouteOfflineMutationPolicy("/scrap-metal/tickets")).toBe("offline-safe");

    expect(getOfflineExcludedRouteReason("/scrap-metal/settlements")).toMatch(/excluded/i);
    expect(getRouteOfflineMutationPolicy("/scrap-metal/settlements")).toBe("excluded");

    const availability = getOfflineRouteAvailability("/human-resources/payroll", enabledFeatures);
    expect(availability.availability).toBe("online-only");
    expect(availability.reason).toMatch(/online only/i);
  });
});
