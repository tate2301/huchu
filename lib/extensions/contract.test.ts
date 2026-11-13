import { describe, expect, it, vi } from "vitest";

/**
 * The seams an industry fork plugs into, exercised with a stand-in vertical.
 *
 * `extensions/index.ts` is empty in core, so this test registers
 * `extensions/__fixture__` in its place and reads core's catalogues the way
 * the app does. If a core change stops an extension's features, bundles,
 * routes or templates from reaching gating and provisioning, this fails here,
 * before a fork syncs the change and finds out in production.
 */
vi.mock("@/extensions", async () => ({
  registeredExtensions: [(await import("@/extensions/__fixture__")).fixtureExtension],
}));
vi.mock("@/extensions/server", async () => ({
  registeredExtensionLoaders: (await import("@/extensions/__fixture__/server")).FIXTURE_LOADERS,
}));

import { getBundleDefinition, BUNDLE_DEPENDENCIES, FEATURE_BUNDLES, FEATURE_CATALOG } from "@/lib/platform/feature-catalog";
import {
  getClientTemplateBundleCodes,
  getClientTemplateDefinition,
  getClientTemplateFeatureKeys,
} from "@/lib/platform/client-templates";
import { isKnownFeatureKey } from "@/lib/platform/gating/catalog-utils";
import { getFeatureDependencies } from "@/lib/platform/gating/feature-dependencies";
import { getAllRouteFeatureKeys, resolveFeatureKeyForPath } from "@/lib/platform/gating/route-registry";
import { composeNav } from "@/lib/nav/compose";
import { canOpenFor, productGroupsFor, visibleAddresses } from "@/lib/nav/gate";
import { GROUP_LABEL, NAV_NODES, PRODUCT_GROUPS } from "@/lib/nav/registry";
import { getRegisteredRoles } from "@/lib/platform/vertical-role-registry";
import { canReadReport } from "@/lib/reports/access";
import { getReportDefinition, REPORT_DEFINITIONS } from "@/lib/reports/registry";
import { getReport, unpairedReportKeys } from "@/lib/reports/server";
import { getVerticalProductBundleForTemplate, resolveWorkspaceVerticalProductBundle } from "@/lib/workspace-products";

describe("an extension's contributions reach core", () => {
  it("its features are known catalogue entries in the extension domain", () => {
    expect(isKnownFeatureKey("fixture.home")).toBe(true);
    expect(isKnownFeatureKey("fixture.runs")).toBe(true);
    const runs = FEATURE_CATALOG.find((feature) => feature.key === "fixture.runs");
    expect(runs?.domain).toBe("extension");
    expect(runs?.defaultEnabled).toBe(false);
  });

  it("its bundle and bundle dependencies are core bundles", () => {
    expect(getBundleDefinition("ADDON_FIXTURE")?.features).toEqual(["fixture.home", "fixture.runs"]);
    expect(BUNDLE_DEPENDENCIES.ADDON_FIXTURE).toEqual(["ADDON_STORES_CORE"]);
  });

  it("every bundle names only catalogue features, as syncEntitlementCatalog requires", () => {
    const keys = new Set(FEATURE_CATALOG.map((feature) => feature.key));
    for (const bundle of FEATURE_BUNDLES) {
      for (const key of bundle.features) expect(keys.has(key), `${bundle.code} → ${key}`).toBe(true);
    }
  });

  it("its pages and API routes are gated on its features, longest prefix first", () => {
    expect(resolveFeatureKeyForPath("/fixture")).toBe("fixture.home");
    expect(resolveFeatureKeyForPath("/fixture/runs/42")).toBe("fixture.runs");
    expect(resolveFeatureKeyForPath("/api/fixture/runs/42")).toBe("fixture.runs");
    expect(getAllRouteFeatureKeys()).toEqual(expect.arrayContaining(["fixture.home", "fixture.runs"]));
  });

  it("its feature dependencies are enforced like core's", () => {
    expect(getFeatureDependencies("fixture.runs")).toEqual(["fixture.home", "stores.inventory"]);
  });

  it("its template provisions its bundles and their features", () => {
    expect(getClientTemplateDefinition("template_fixture")?.code).toBe("TEMPLATE_FIXTURE");
    expect(getClientTemplateBundleCodes("TEMPLATE_FIXTURE")).toEqual(["ADDON_STORES_CORE", "ADDON_FIXTURE"]);
    expect(getClientTemplateFeatureKeys("TEMPLATE_FIXTURE")).toEqual(
      expect.arrayContaining(["fixture.home", "fixture.runs", "stores.inventory"]),
    );
  });
});

describe("an extension's sidebar group", () => {
  const provisioned = getClientTemplateFeatureKeys("TEMPLATE_FIXTURE");
  const manager = { role: "MANAGER", enabledFeatures: provisioned, workspaceProfile: "GENERAL" };

  it("is a product group with its own heading and rows", () => {
    expect(PRODUCT_GROUPS).toContain("ext.fixture");
    expect(GROUP_LABEL["ext.fixture"]).toBe("The fixture");
    expect(NAV_NODES.filter((node) => node.group === "ext.fixture").map((node) => node.id)).toEqual([
      "fixture.home",
      "fixture.runs",
    ]);
  });

  it("shows to a workspace that has the features, first among its products", () => {
    const open = visibleAddresses(manager);
    expect(open.has("/fixture")).toBe(true);
    expect(open.has("/fixture/runs")).toBe(true);
    expect(productGroupsFor(open, "GENERAL")[0]).toBe("ext.fixture");

    const groups = composeNav({ canOpen: canOpenFor(manager), products: productGroupsFor(open, "GENERAL") });
    const fixture = groups.find((group) => group.id === "ext.fixture");
    expect(fixture?.label).toBe("The fixture");
    expect(fixture?.items.map((item) => item.href)).toEqual(["/fixture", "/fixture/runs"]);
    expect(fixture?.items[1]?.kids.map((kid) => kid.href)).toEqual([
      "/fixture/runs?state=open",
      "/fixture/runs?state=approved",
    ]);
  });

  it("hides rows whose feature the workspace lacks, and the group when none is left", () => {
    const homeOnly = { ...manager, enabledFeatures: provisioned.filter((key) => key !== "fixture.runs") };
    const open = visibleAddresses(homeOnly);
    expect(open.has("/fixture")).toBe(true);
    expect(open.has("/fixture/runs")).toBe(false);

    const none = { ...manager, enabledFeatures: provisioned.filter((key) => !key.startsWith("fixture.")) };
    const groups = composeNav({ canOpen: canOpenFor(none), products: productGroupsFor(visibleAddresses(none), "GENERAL") });
    expect(groups.some((group) => group.id === "ext.fixture")).toBe(false);
  });

  it("hides rows the role may not reach, as the proxy refuses them", () => {
    const rep = { ...manager, role: "SALES_REP" };
    expect(visibleAddresses(rep).has("/fixture")).toBe(false);
  });
});

describe("an extension's product, reports and roles", () => {
  const provisioned = getClientTemplateFeatureKeys("TEMPLATE_FIXTURE");
  const without = provisioned.filter((key) => !key.startsWith("fixture."));

  it("is the product of a GENERAL workspace that holds its features, with its own home", () => {
    const product = resolveWorkspaceVerticalProductBundle({ workspaceProfile: "GENERAL", enabledFeatures: provisioned });
    expect(product.id).toBe("ext.fixture");
    expect(product.workspaceLabel).toBe("The fixture");
    expect(product.preferredHomeHref).toBe("/fixture");
    expect(resolveWorkspaceVerticalProductBundle({ workspaceProfile: "GENERAL", enabledFeatures: without }).id).not.toBe(
      "ext.fixture",
    );
    expect(getVerticalProductBundleForTemplate("TEMPLATE_FIXTURE")?.id).toBe("ext.fixture");
  });

  it("does not take over a workspace a core vertical claims", () => {
    expect(resolveWorkspaceVerticalProductBundle({ workspaceProfile: "SCHOOLS", enabledFeatures: provisioned }).id).toBe(
      "school-operations",
    );
  });

  it("adds its reports, readable only with its feature, each paired with its loader", async () => {
    const runs = getReportDefinition("fixture-runs");
    expect(runs?.area).toBe("Fixture");
    expect(REPORT_DEFINITIONS.at(-1)?.key).toBe("fixture-runs");
    expect(unpairedReportKeys(REPORT_DEFINITIONS)).toEqual([]);
    expect(canReadReport(runs!, { role: "MANAGER", enabledFeatures: provisioned })).toBe(true);
    expect(canReadReport(runs!, { role: "MANAGER", enabledFeatures: without })).toBe(false);
    const report = getReport("fixture-runs");
    expect(report?.definition.key).toBe("fixture-runs");
  });

  it("offers its roles to a workspace that runs it", () => {
    expect(getRegisteredRoles("GENERAL", provisioned)).toContain("STOCK_CLERK");
    expect(getRegisteredRoles("GENERAL", without)).not.toContain("STOCK_CLERK");
  });
});
