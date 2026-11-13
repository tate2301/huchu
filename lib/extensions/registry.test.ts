import { describe, expect, it } from "vitest";

import { fixtureExtension } from "@/extensions/__fixture__";
import { registeredExtensions } from "@/extensions";
import { FEATURE_CATALOG } from "@/lib/platform/feature-catalog";

import {
  ExtensionError,
  mergeBundleDependencies,
  mergeBundles,
  mergeFeatureDependencies,
  mergeFeatures,
  mergeRoutes,
  mergeTemplates,
} from "./registry";
import type { CorelithExtension } from "./types";

const base: CorelithExtension = { id: "milling", label: "Milling", features: [] };
const feature = (key: string) => ({ key, name: key, description: key, defaultEnabled: false });

describe("core ships with no extension registered", () => {
  it("has an empty extensions/index.ts and no extension features", () => {
    expect(registeredExtensions).toEqual([]);
    expect(FEATURE_CATALOG.filter((entry) => entry.domain === "extension")).toEqual([]);
  });
});

describe("an extension stays inside its own namespace", () => {
  it("accepts the fixture", () => {
    expect(() => mergeFeatures([], [fixtureExtension])).not.toThrow();
    expect(() => mergeBundles([], [fixtureExtension])).not.toThrow();
    expect(() => mergeRoutes([], [fixtureExtension], "page")).not.toThrow();
    expect(() => mergeRoutes([], [fixtureExtension], "api")).not.toThrow();
    expect(() => mergeTemplates([], [fixtureExtension])).not.toThrow();
  });

  it("refuses a bad id, or the same id twice", () => {
    expect(() => mergeFeatures([], [{ ...base, id: "Milling" }])).toThrow(ExtensionError);
    expect(() => mergeFeatures([], [base, base])).toThrow(/registered twice/);
  });

  it("refuses features outside its prefix, or that collide", () => {
    expect(() => mergeFeatures([], [{ ...base, features: [feature("stores.inventory")] }])).toThrow(/must start with "milling."/);
    expect(() => mergeFeatures([], [{ ...base, features: [feature("milling")] }])).toThrow(ExtensionError);
    expect(() =>
      mergeFeatures([{ ...feature("milling.runs"), domain: "core" }], [{ ...base, features: [feature("milling.runs")] }]),
    ).toThrow(/declared twice/);
  });

  it("refuses dependencies of features or bundles it does not own", () => {
    expect(() => mergeFeatureDependencies({}, [{ ...base, featureDependencies: { "retail.pos": ["milling.runs"] } }])).toThrow(
      /its own features/,
    );
    expect(() => mergeBundleDependencies({}, [{ ...base, bundleDependencies: { ADDON_RETAIL_SUITE: [] } }])).toThrow(
      /its own bundles/,
    );
  });

  it("refuses bundle and template codes outside its name", () => {
    const bundle = { code: "ADDON_STORES_CORE", name: "x", description: "x", features: [] };
    expect(() => mergeBundles([], [{ ...base, bundles: [bundle] }])).toThrow(/ADDON_MILLING/);
    expect(() => mergeBundles([], [{ ...base, bundles: [{ ...bundle, code: "ADDON_MILLINGX" }] }])).toThrow(ExtensionError);
    expect(() => mergeBundles([], [{ ...base, bundles: [{ ...bundle, code: "ADDON_MILLING_QC" }] }])).not.toThrow();
    const template = { ...fixtureExtension.templates![0]!, code: "TEMPLATE_RETAIL" };
    expect(() => mergeTemplates([], [{ ...base, templates: [template] }])).toThrow(/TEMPLATE_MILLING/);
  });

  it("refuses routes outside its paths or gated on another vertical's feature", () => {
    const pages = (prefix: string, featureKey = "milling.runs") => ({ ...base, routes: { pages: [{ prefix, featureKey }] } });
    expect(() => mergeRoutes([], [pages("/retail/milling")], "page")).toThrow(/under "\/milling"/);
    expect(() => mergeRoutes([], [pages("/millingx")], "page")).toThrow(ExtensionError);
    expect(() => mergeRoutes([], [pages("/milling/runs", "retail.pos")], "page")).toThrow(/its own features/);
    const apis = { ...base, routes: { apis: [{ prefix: "/api/retail/x", featureKey: "milling.runs" }] } };
    expect(() => mergeRoutes([], [apis], "api")).toThrow(/under "\/api\/milling\/"/);
  });
});
