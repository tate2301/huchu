import type { CorelithExtension } from "@/lib/extensions/types";

/**
 * A stand-in vertical that core's tests register, so every seam an industry
 * fork relies on is exercised in core CI. If a core change breaks a seam,
 * `lib/extensions/contract.test.ts` fails here, before any fork syncs it.
 */
export const fixtureExtension: CorelithExtension = {
  id: "fixture",
  label: "Fixture",
  features: [
    { key: "fixture.home", name: "Fixture home", description: "The fixture vertical's overview.", defaultEnabled: false },
    { key: "fixture.runs", name: "Fixture runs", description: "Records the fixture vertical keeps.", defaultEnabled: false },
  ],
  featureDependencies: { "fixture.runs": ["fixture.home", "stores.inventory"] },
  bundles: [
    {
      code: "ADDON_FIXTURE",
      name: "Fixture",
      description: "Everything the fixture vertical does.",
      features: ["fixture.home", "fixture.runs"],
    },
  ],
  bundleDependencies: { ADDON_FIXTURE: ["ADDON_STORES_CORE"] },
  routes: {
    pages: [
      { prefix: "/fixture", featureKey: "fixture.home" },
      { prefix: "/fixture/runs", featureKey: "fixture.runs" },
    ],
    apis: [{ prefix: "/api/fixture/runs", featureKey: "fixture.runs" }],
  },
  templates: [
    {
      code: "TEMPLATE_FIXTURE",
      label: "Fixture",
      description: "A workspace running the fixture vertical.",
      targetClients: ["Core's own tests"],
      recommendedTierCode: "ENTERPRISE",
      bundleCodes: ["ADDON_STORES_CORE", "ADDON_FIXTURE"],
      featureKeys: [],
      verticalProductId: "general-business",
    },
  ],
  product: {
    label: "Fixture operations",
    workspaceLabel: "The fixture",
    description: "A workspace that runs the fixture vertical.",
    customerExamples: ["Core's own tests"],
    preferredHomeHref: "/fixture",
    primaryModules: ["stores", "reporting"],
    foundationalModules: ["people", "accounting"],
  },
  reports: [
    {
      key: "fixture-runs",
      title: "Runs",
      area: "Fixture",
      href: "/fixture/runs",
      featureKey: "fixture.runs",
      profiles: ["GENERAL"],
      params: [],
      columns: [{ key: "run", label: "Run", kind: "code" }],
      defaults: {},
    },
  ],
  roles: ["STOCK_CLERK"],
  defaults: { equipmentCategories: ["FIXTURE_LINE"] },
  nav: {
    label: "The fixture",
    nodes: [
      { id: "fixture.home", label: "Overview", icon: "home", href: "/fixture" },
      {
        id: "fixture.runs",
        label: "Runs",
        icon: "checklist",
        href: "/fixture/runs",
        kids: [
          { id: "fixture.runs-open", label: "Open", icon: "checklist", href: "/fixture/runs?state=open" },
          { id: "fixture.runs-approved", label: "Approved", icon: "check-circle", href: "/fixture/runs?state=approved" },
        ],
      },
    ],
  },
};
