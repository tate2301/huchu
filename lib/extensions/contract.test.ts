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

import { getBundleDefinition, BUNDLE_DEPENDENCIES, FEATURE_BUNDLES, FEATURE_CATALOG } from "@/lib/platform/feature-catalog";
import {
  getClientTemplateBundleCodes,
  getClientTemplateDefinition,
  getClientTemplateFeatureKeys,
} from "@/lib/platform/client-templates";
import { isKnownFeatureKey } from "@/lib/platform/gating/catalog-utils";
import { getFeatureDependencies } from "@/lib/platform/gating/feature-dependencies";
import { getAllRouteFeatureKeys, resolveFeatureKeyForPath } from "@/lib/platform/gating/route-registry";

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
