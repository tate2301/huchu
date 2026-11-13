import { describe, expect, it } from "vitest";

import { fixtureExtension } from "@/extensions/__fixture__";
import { registeredExtensions } from "@/extensions";
import { registeredExtensionLoaders } from "@/extensions/server";
import { FEATURE_CATALOG } from "@/lib/platform/feature-catalog";

import {
  ExtensionError,
  mergeNavNodes,
  mergeProducts,
  mergeReportLoaders,
  mergeReports,
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
    expect(registeredExtensionLoaders).toEqual({});
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

describe("an extension's sidebar rows stay inside its paths", () => {
  const nav = (id: string, href: string) => ({ ...base, nav: { label: "The mill", nodes: [{ id, label: "x", icon: "home", href }] } });

  it("accepts its own rows and gives them its group", () => {
    expect(mergeNavNodes([], [nav("milling.runs", "/milling/runs?state=open")])[0]?.group).toBe("ext.milling");
  });

  it("refuses ids outside its prefix, addresses outside its root, and duplicates", () => {
    expect(() => mergeNavNodes([], [nav("runs", "/milling/runs")])).toThrow(/starting "milling."/);
    expect(() => mergeNavNodes([], [nav("milling.runs", "/retail/sales")])).toThrow(/outside "\/milling"/);
    expect(() => mergeNavNodes([], [nav("milling.runs", "/millingx")])).toThrow(ExtensionError);
    expect(() =>
      mergeNavNodes([{ id: "milling.runs", label: "x", icon: "home", href: "/x", group: "top" }], [nav("milling.runs", "/milling")]),
    ).toThrow(/declared twice/);
  });
});

describe("an extension's product and reports stay inside its paths", () => {
  const report = { ...fixtureExtension.reports![0]!, key: "milling-runs", href: "/milling/runs", featureKey: "milling.runs" };

  it("refuses a product home outside its root", () => {
    const product = { ...fixtureExtension.product!, preferredHomeHref: "/retail" };
    expect(() => mergeProducts([], [{ ...base, product }])).toThrow(/home "\/retail"/);
    expect(mergeProducts([], [{ ...base, product: { ...product, preferredHomeHref: "/milling" } }])[0]?.id).toBe("ext.milling");
  });

  it("refuses report keys, gates and pages that are not its own", () => {
    expect(() => mergeReports([], [{ ...base, reports: [report] }])).not.toThrow();
    expect(() => mergeReports([], [{ ...base, reports: [{ ...report, key: "runs" }] }])).toThrow(/starting "milling-"/);
    expect(() => mergeReports([], [{ ...base, reports: [{ ...report, featureKey: undefined }] }])).toThrow(/own features/);
    expect(() => mergeReports([], [{ ...base, reports: [{ ...report, featureKey: "retail.pos" }] }])).toThrow(/own features/);
    expect(() => mergeReports([], [{ ...base, reports: [{ ...report, href: "/retail/sales" }] }])).toThrow(/under "\/milling"/);
  });

  it("refuses a loader that would replace a core report's", () => {
    const loader = { load: async () => ({ rows: [], truncated: false }) };
    expect(() => mergeReportLoaders({ "payroll-pay": loader }, { "payroll-pay": loader })).toThrow(/replace a core/);
  });
});
