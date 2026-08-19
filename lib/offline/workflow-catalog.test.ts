import {
  getOfflineExcludedRouteReason,
  getOfflineRouteAvailability,
  getOfflineWarmupModuleIds,
  getOfflineWarmupRoutes,
  getRouteOfflineMutationPolicy,
  isRouteWarmedForOffline,
  resolveOfflineWorkflowCatalog,
} from "@/lib/offline/workflow-catalog";

/**
 * ST-2.3. This file used to be about scrap, because scrap was the only vertical
 * with a warmed offline scope. The vertical is gone; the invariants it was
 * written to protect are not, and they are what is asserted here against the
 * People workflow that remains:
 *
 *  - a workflow is warmed only for a tenant that bought its features, so a
 *    tenant on some other module never pays for a warmup it cannot use;
 *  - a route named in the exclusion list is refused with a reason rather than
 *    silently warmed, because a half-cached settlement screen is worse than one
 *    that says it needs the network.
 */

describe("offline workflow catalog", () => {
  const enabledFeatures = ["hr.employees", "hr.incidents"];

  it("resolves the minimal hr catalog entry", () => {
    const entries = resolveOfflineWorkflowCatalog(enabledFeatures);
    expect(entries.map((entry) => entry.workflowId)).toEqual(["hr-workforce-minimal"]);
  });

  it("warms nothing for a tenant with none of the features", () => {
    expect(resolveOfflineWorkflowCatalog(["retail.pos"])).toEqual([]);
    expect(getOfflineWarmupModuleIds(["retail.pos"])).toEqual([]);
  });

  it("warms only configured modules and excludes settlements/accounting", () => {
    expect(getOfflineWarmupModuleIds(enabledFeatures)).toEqual(["hr-workforce-core"]);

    const warmRoutes = getOfflineWarmupRoutes(enabledFeatures);
    expect(warmRoutes).toContain("/people");
    expect(warmRoutes).not.toContain("/gold/settlement/approvals");
    expect(warmRoutes).not.toContain("/accounting");
  });

  it("reports offline availability and mutation policy", () => {
    expect(isRouteWarmedForOffline("/people", enabledFeatures)).toBe(true);
    expect(getRouteOfflineMutationPolicy("/people")).toBe("online-only");

    expect(getOfflineExcludedRouteReason("/accounting/journals")).toMatch(/excluded/i);
    expect(getRouteOfflineMutationPolicy("/accounting/journals")).toBe("excluded");

    const availability = getOfflineRouteAvailability("/payroll/runs", enabledFeatures);
    expect(availability.availability).toBe("online-only");
    expect(availability.reason).toMatch(/online only/i);
  });
});
