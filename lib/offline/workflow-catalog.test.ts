/**
 * Every offline module is reachable by some tenant.
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
 */

import { describe, expect, it } from "vitest";
import { OFFLINE_MODULES } from "@/lib/offline/module-registry";
import {
  OFFLINE_WORKFLOW_CATALOG,
  getOfflineWarmupModuleIds,
  resolveOfflineWorkflowCatalog,
} from "@/lib/offline/workflow-catalog";

/** Enough of a tenant's feature set to select each vertical's entries. */
const RETAIL_FEATURES = ["retail.core", "retail.pos", "retail.catalog"];
const SCRAP_FEATURES = ["scrap-metal.core", "scrap-metal.tickets"];
const HR_FEATURES = ["hr.employees"];

describe("the offline workflow catalogue", () => {
  it("has entries at all", () => {
    // A silent zero would make every assertion below vacuously true.
    expect(OFFLINE_WORKFLOW_CATALOG.length).toBeGreaterThan(2);
    expect(OFFLINE_MODULES.length).toBeGreaterThan(5);
  });

  it("names only modules that exist", () => {
    const known = new Set(OFFLINE_MODULES.map((entry) => entry.moduleId));
    const unknown = OFFLINE_WORKFLOW_CATALOG.flatMap((entry) => entry.moduleIds).filter(
      (moduleId) => !known.has(moduleId),
    );
    expect(unknown, "catalogue entries pointing at modules that do not exist").toEqual([]);
  });

  /**
   * Three scrap modules are defined and unreachable for the same reason retail's
   * was — no catalogue entry names them. They are listed rather than fixed:
   * changing what the scrap vertical warms is a scrap decision, and silently
   * widening its warmup while fixing retail would be the wrong kind of tidy.
   *
   * The list is asserted to be *exact*, so a fourth orphan fails this test.
   */
  const KNOWN_ORPHANS = ["scrap-master-data", "scrap-price-board", "scrap-staff-settlements"];

  it("leaves no module unreachable by every tenant, beyond the known three", () => {
    // The retail bug in one assertion: a module no catalogue entry names can
    // never warm, for anyone, and nothing says so.
    const named = new Set(OFFLINE_WORKFLOW_CATALOG.flatMap((entry) => entry.moduleIds));
    const orphans = OFFLINE_MODULES.map((entry) => entry.moduleId)
      .filter((moduleId) => !named.has(moduleId))
      .sort();
    expect(orphans, "offline modules no workflow entry can select").toEqual(
      [...KNOWN_ORPHANS].sort(),
    );
  });

  it("has the till out of that list", () => {
    // It was in it, which is the whole point of this file.
    expect(KNOWN_ORPHANS).not.toContain("retail-pos");
  });

  it("resolves every vertical it declares", () => {
    // A vertical string with no branch in the resolver is the same bug wearing a
    // different hat: the entry exists and can never be chosen.
    const declared = new Set(OFFLINE_WORKFLOW_CATALOG.map((entry) => entry.vertical));
    const everyFeature = [...RETAIL_FEATURES, ...SCRAP_FEATURES, ...HR_FEATURES];
    const resolvable = new Set(
      resolveOfflineWorkflowCatalog(everyFeature).map((entry) => entry.vertical),
    );
    expect([...declared].filter((vertical) => !resolvable.has(vertical))).toEqual([]);
  });
});

describe("a retail tenant", () => {
  it("warms the till", () => {
    expect(getOfflineWarmupModuleIds(RETAIL_FEATURES)).toContain("retail-pos");
  });

  it("does not warm scrap or HR", () => {
    const modules = getOfflineWarmupModuleIds(RETAIL_FEATURES);
    expect(modules.filter((moduleId) => moduleId.startsWith("scrap"))).toEqual([]);
    expect(modules).not.toContain("hr-workforce-core");
  });

  it("needs the till feature, not merely the module", () => {
    // `retail.core` alone is a shop that has not bought the POS.
    expect(getOfflineWarmupModuleIds(["retail.core"])).not.toContain("retail-pos");
  });
});

describe("a scrap tenant", () => {
  it("still warms scrap and not the till", () => {
    const modules = getOfflineWarmupModuleIds(SCRAP_FEATURES);
    expect(modules.some((moduleId) => moduleId.startsWith("scrap"))).toBe(true);
    expect(modules).not.toContain("retail-pos");
  });
});

describe("a tenant with nothing", () => {
  it("warms nothing", () => {
    expect(getOfflineWarmupModuleIds([])).toEqual([]);
    expect(getOfflineWarmupModuleIds(undefined)).toEqual([]);
  });
});
