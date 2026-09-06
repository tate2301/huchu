/**
 * Every offline module is reachable by some tenant, and warms only for them.
 *
 * `resolveOfflineWorkflowCatalog` selects catalogue entries by vertical and
 * returns `false` for a vertical it does not recognise. That default is quiet:
 * `retail-pos` was a fully specified offline module — outbox, entity adapters,
 * mutation policies — and it was never warmed for anybody, because no catalogue
 * entry named it and nothing complained. The offline runtime existed and did not
 * run for the one surface built around it.
 *
 * These tests are structural. They do not check that warming works; they check
 * that a module cannot be defined and then left unselectable, which is the
 * failure that actually happened.
 *
 * ## Two histories, merged
 *
 * This file was about scrap, because scrap was the only vertical with a warmed
 * offline scope. ST-2.3 deleted that vertical and rewrote these against the
 * People workflow that remained; the retail hardening work, in parallel, added
 * the till's entry and the reachability invariants above.
 *
 * Both survive here, and one assertion did not. The scrap-free rewrite carried
 * `expect(resolveOfflineWorkflowCatalog(["retail.pos"])).toEqual([])` as its
 * "warms nothing for a tenant with none of the features" case — true when it was
 * written, and the precise bug the other branch had just fixed. A tenant holding
 * `retail.pos` now warms the till, which is the point. The case it was making is
 * still worth making, so it is made with a feature nothing claims.
 */

import { describe, expect, it } from "vitest";
import { OFFLINE_MODULES } from "@/lib/offline/module-registry";
import {
  OFFLINE_WORKFLOW_CATALOG,
  getOfflineExcludedRouteReason,
  getOfflineWarmupModuleIds,
  getOfflineWarmupRoutes,
  getRouteOfflineMutationPolicy,
  isRouteWarmedForOffline,
  resolveOfflineWorkflowCatalog,
} from "@/lib/offline/workflow-catalog";

/** Enough of a tenant's feature set to select each vertical's entries. */
const RETAIL_FEATURES = ["retail.core", "retail.pos", "retail.catalog"];
const HR_FEATURES = ["hr.employees", "hr.incidents"];

describe("the offline workflow catalogue", () => {
  it("has entries at all", () => {
    // A silent zero would make every assertion below vacuously true.
    expect(OFFLINE_WORKFLOW_CATALOG.length).toBeGreaterThan(1);
    expect(OFFLINE_MODULES.length).toBeGreaterThan(1);
  });

  it("names only modules that exist", () => {
    const known = new Set(OFFLINE_MODULES.map((entry) => entry.moduleId));
    const unknown = OFFLINE_WORKFLOW_CATALOG.flatMap((entry) => entry.moduleIds).filter(
      (moduleId) => !known.has(moduleId),
    );
    expect(unknown, "catalogue entries pointing at modules that do not exist").toEqual([]);
  });

  /**
   * No orphans at all, now.
   *
   * This assertion used to carry three named exceptions —
   * `scrap-master-data`, `scrap-price-board`, `scrap-staff-settlements` —
   * modules defined and unreachable for exactly the reason retail's was. They
   * were listed rather than fixed, because widening the scrap vertical's warmup
   * while fixing retail would have been the wrong kind of tidy.
   *
   * ST-2 deleted the module, so the exceptions went with it and the invariant
   * gets to be what it always wanted to be: an empty list.
   */
  it("leaves no module unreachable by every tenant", () => {
    // The retail bug in one assertion: a module no catalogue entry names can
    // never warm, for anyone, and nothing says so.
    const named = new Set(OFFLINE_WORKFLOW_CATALOG.flatMap((entry) => entry.moduleIds));
    const orphans = OFFLINE_MODULES.map((entry) => entry.moduleId)
      .filter((moduleId) => !named.has(moduleId))
      .sort();
    expect(orphans, "offline modules no workflow entry can select").toEqual([]);
  });

  it("resolves every vertical it declares", () => {
    // A vertical string with no branch in the resolver is the same bug wearing a
    // different hat: the entry exists and can never be chosen.
    const declared = new Set(OFFLINE_WORKFLOW_CATALOG.map((entry) => entry.vertical));
    const everyFeature = [...RETAIL_FEATURES, ...HR_FEATURES];
    const resolvable = new Set(
      resolveOfflineWorkflowCatalog(everyFeature).map((entry) => entry.vertical),
    );
    expect([...declared].filter((vertical) => !resolvable.has(vertical))).toEqual([]);
  });
});

/**
 * A workflow is warmed only for a tenant that bought its features, so a tenant
 * on some other module never pays for a warmup it cannot use; and a route named
 * in the exclusion list is refused with a reason rather than silently warmed,
 * because a half-cached settlement screen is worse than one that says it needs
 * the network.
 */
describe("who a workflow warms for", () => {
  it("resolves the minimal hr catalog entry", () => {
    const entries = resolveOfflineWorkflowCatalog(HR_FEATURES);
    expect(entries.map((entry) => entry.workflowId)).toEqual(["hr-workforce-minimal"]);
  });

  it("warms the till for a tenant that has the till", () => {
    // The fix, asserted from the outside. `retail.pos` selected nothing at all
    // until the catalogue named `retail-pos`.
    const entries = resolveOfflineWorkflowCatalog(RETAIL_FEATURES);
    expect(entries.map((entry) => entry.workflowId)).toContain("retail-pos-core");
    expect(getOfflineWarmupModuleIds(RETAIL_FEATURES)).toContain("retail-pos");
  });

  it("warms nothing for a tenant with none of the features", () => {
    // A key no catalogue entry claims. It used to be `retail.pos`, which was
    // true only while the till was the bug this file exists to describe.
    const unrelated = ["gold.core"];
    expect(resolveOfflineWorkflowCatalog(unrelated)).toEqual([]);
    expect(getOfflineWarmupModuleIds(unrelated)).toEqual([]);
  });

  it("warms only configured modules and excludes settlements/accounting", () => {
    expect(getOfflineWarmupModuleIds(HR_FEATURES)).toEqual(["hr-workforce-core"]);

    const warmRoutes = getOfflineWarmupRoutes(HR_FEATURES);
    expect(warmRoutes).toContain("/people");
    expect(warmRoutes).not.toContain("/gold/settlement/approvals");
    expect(warmRoutes).not.toContain("/accounting");
  });

  it("reports offline availability and mutation policy", () => {
    expect(isRouteWarmedForOffline("/people", HR_FEATURES)).toBe(true);
    expect(getRouteOfflineMutationPolicy("/people")).toBe("online-only");

    expect(getOfflineExcludedRouteReason("/accounting/journals")).toMatch(/excluded/i);
    expect(getRouteOfflineMutationPolicy("/accounting/journals")).toBe("excluded");
  });

  it("warms nothing", () => {
    expect(getOfflineWarmupModuleIds([])).toEqual([]);
    expect(getOfflineWarmupModuleIds(undefined)).toEqual([]);
  });
});
