/**
 * Regression tests for workspace / feature resolution.
 *
 * The platform started as a gold-mine product and was later made modular.
 * These tests pin the boundary: mining-only surfaces (shift report, plant report,
 * gold intake) must never resolve into non-mining workspaces — not from
 * templates, not from bundles, and not from the presentation layer (quick
 * actions, sidebar, route gating) even when a legacy tenant still carries leaked
 * feature flags.
 *
 * Crew attendance used to be on that list and no longer is. It was mining-only by
 * accident of where it was built: a register belongs to whoever has a workforce,
 * and the `ops.attendance.mark` gate meant a school, a bureau or a scrap yard
 * could not reach one. It is now `/people/attendance` on `hr.attendance`, and a
 * non-mining template offering it is correct rather than a leak.
 */
import { describe, expect, it } from "vitest";

import {
  CLIENT_BUNDLE_TEMPLATES,
  getClientTemplateFeatureKeys,
  getClientTemplateWorkspaceProfile,
} from "@/lib/platform/client-templates";
import { BUNDLE_DEPENDENCIES, FEATURE_BUNDLES, FEATURE_CATALOG } from "@/lib/platform/feature-catalog";
import { isKnownFeatureKey } from "@/lib/platform/gating/catalog-utils";
import { getFeatureDependencies } from "@/lib/platform/gating/feature-dependencies";
import { getAllRouteFeatureKeys, resolveFeatureKeyForPath } from "@/lib/platform/gating/route-registry";
import { getAllowedUserRolesForWorkspace } from "@/lib/platform/vertical-roles";
import { getPrimaryQuickActions } from "@/lib/primary-actions";
import { resolveWorkspaceVerticalProductBundle } from "@/lib/workspace-products";
import { getWorkspaceSidebarModel } from "@/lib/workspaces";

const MINE_DAILY_OPS_FEATURE_KEYS = [
  "ops.shift-report.submit",
  "ops.attendance.mark",
  "ops.plant-report.submit",
  "reports.shift",
  "reports.attendance",
  "reports.plant",
];

// Attendance is deliberately absent: a register is not mining, so a non-mining
// template offering `/people/attendance` is correct rather than a leak.
const MINING_PAGE_HREFS = ["/shift-report", "/plant-report"];

const MINING_TEMPLATE_CODES = new Set(["TEMPLATE_GOLD_MINE", "TEMPLATE_ALL_FEATURES"]);

function templateFeatures(code: string): string[] {
  return getClientTemplateFeatureKeys(code);
}

function isMiningHref(href: string): boolean {
  return MINING_PAGE_HREFS.includes(href) || href.startsWith("/gold");
}

describe("feature catalog bundles", () => {
  it("maps every route feature to a known catalog feature key", () => {
    const unknownRouteKeys = getAllRouteFeatureKeys().filter((key) => !isKnownFeatureKey(key));
    expect(unknownRouteKeys).toEqual([]);
  });

  it("keeps mining daily ops out of ADDON_OPERATIONS_CORE", () => {
    const operationsCore = FEATURE_BUNDLES.find((bundle) => bundle.code === "ADDON_OPERATIONS_CORE");
    expect(operationsCore).toBeDefined();
    for (const key of MINE_DAILY_OPS_FEATURE_KEYS) {
      expect(operationsCore?.features).not.toContain(key);
    }
  });

  it("collects mining daily ops in ADDON_MINE_DAILY_OPS", () => {
    const mineOps = FEATURE_BUNDLES.find((bundle) => bundle.code === "ADDON_MINE_DAILY_OPS");
    expect(mineOps?.features.slice().sort()).toEqual(MINE_DAILY_OPS_FEATURE_KEYS.slice().sort());
  });

  it("exposes CRM as a first-class add-on bundle", () => {
    expect(FEATURE_CATALOG.some((feature) => feature.key === "crm.customers")).toBe(true);

    const crm = FEATURE_BUNDLES.find((bundle) => bundle.code === "ADDON_CRM_SUITE");
    expect(crm).toBeDefined();
    expect(crm?.features).toContain("crm.customers");
  });

  it("keeps Retail Suite entitled to customer CRM", () => {
    const retail = FEATURE_BUNDLES.find((bundle) => bundle.code === "ADDON_RETAIL_SUITE");
    expect(retail?.features).toContain("crm.customers");
  });

  /**
   * S-5. "Retail depends on Stores & Inventory", in the entitlement layer.
   *
   * Retail does not own stock and never did: on-hand lives in the core
   * `InventoryItem` and every retail movement goes through
   * `recordStockMovement`. The dependency is restrictive — `retail.catalog` is
   * *denied* without `stores.inventory` — so it must not be declared without the
   * packaging that satisfies it, or a retail tenant's sidebar goes dark.
   */
  describe("retail depends on the stock module", () => {
    it("declares the dependency", () => {
      expect(getFeatureDependencies("retail.catalog")).toEqual(
        expect.arrayContaining(["retail.core", "stores.inventory"]),
      );
      expect(getFeatureDependencies("stores.catalogue")).toContain("stores.inventory");
      expect(getFeatureDependencies("stores.price-lists")).toContain("stores.inventory");
    });

    it("sells the stock module with the Retail Suite that now requires it", () => {
      expect(BUNDLE_DEPENDENCIES.ADDON_RETAIL_SUITE).toContain("ADDON_STORES_CORE");
    });

    it("leaves no retail surface entitled but denied on the retail template", () => {
      const keys = templateFeatures("TEMPLATE_RETAIL");
      for (const key of keys) {
        for (const dependency of getFeatureDependencies(key)) {
          expect(keys, `${key} needs ${dependency}`).toContain(dependency);
        }
      }
    });

    it("carries the split-out catalogue keys wherever stock was already granted", () => {
      // Splitting a key must not quietly take a working screen away from a
      // tenant who could always open it.
      for (const code of ["ADDON_STORES_CORE", "ADDON_SCRAP_METAL_SUITE"]) {
        const bundle = FEATURE_BUNDLES.find((candidate) => candidate.code === code);
        expect(bundle?.features, code).toContain("stores.catalogue");
        expect(bundle?.features, code).toContain("stores.price-lists");
      }
    });
  });
});

describe("client templates", () => {
  const nonMiningTemplates = CLIENT_BUNDLE_TEMPLATES.filter(
    (template) => !MINING_TEMPLATE_CODES.has(template.code),
  );

  it.each(nonMiningTemplates.map((template) => [template.code] as const))(
    "%s grants no mining ops or gold features",
    (code) => {
      const keys = templateFeatures(code);
      for (const key of MINE_DAILY_OPS_FEATURE_KEYS) {
        expect(keys).not.toContain(key);
      }
      expect(keys.some((key) => key.startsWith("gold."))).toBe(false);
    },
  );

  it("TEMPLATE_GOLD_MINE still grants mining daily ops and gold features", () => {
    const keys = templateFeatures("TEMPLATE_GOLD_MINE");
    for (const key of MINE_DAILY_OPS_FEATURE_KEYS) {
      expect(keys).toContain(key);
    }
    expect(keys).toContain("gold.home");
  });

  it("resolves a workspace profile for every template", () => {
    for (const template of CLIENT_BUNDLE_TEMPLATES) {
      expect(getClientTemplateWorkspaceProfile(template.code)).not.toBeNull();
    }
  });
});

describe("vertical role registration", () => {
  it("registers CRM sales roles only when CRM features are enabled", () => {
    const generalRoles = getAllowedUserRolesForWorkspace({
      workspaceProfile: "GENERAL",
      enabledFeatures: [],
    });
    expect(generalRoles).not.toContain("SALES_EXEC");
    expect(generalRoles).not.toContain("SALES_REP");

    const crmRoles = getAllowedUserRolesForWorkspace({
      workspaceProfile: "GENERAL",
      enabledFeatures: ["crm.customers"],
    });
    expect(crmRoles).toContain("SALES_EXEC");
    expect(crmRoles).toContain("SALES_REP");
  });

  it("keeps Autos sales roles registered through the Autos profile", () => {
    expect(
      getAllowedUserRolesForWorkspace({
        workspaceProfile: "AUTOS",
        enabledFeatures: [],
      }),
    ).toContain("SALES_EXEC");
  });

});

describe("vertical product resolution", () => {
  it("resolves multi-site operations from the multi-site template features", () => {
    const bundle = resolveWorkspaceVerticalProductBundle({
      workspaceProfile: "GENERAL",
      enabledFeatures: templateFeatures("TEMPLATE_SMALL_BUSINESS_SECURITY_STOCK"),
    });
    expect(bundle.id).toBe("multi-site-operations");
  });

  it("resolves service workshop from the workshop template features", () => {
    const bundle = resolveWorkspaceVerticalProductBundle({
      workspaceProfile: "GENERAL",
      enabledFeatures: templateFeatures("TEMPLATE_TECH_WORKSHOP"),
    });
    expect(bundle.id).toBe("service-workshop");
  });

  it("resolves crm-sales from the CRM template features (before generic products)", () => {
    const bundle = resolveWorkspaceVerticalProductBundle({
      workspaceProfile: "GENERAL",
      enabledFeatures: templateFeatures("TEMPLATE_CRM"),
    });
    expect(bundle.id).toBe("crm-sales");
  });
});

describe("crm template", () => {
  it("grants crm.* and the accounting features it depends on, but no foreign verticals", () => {
    const keys = templateFeatures("TEMPLATE_CRM");
    expect(keys).toContain("crm.core");
    expect(keys).toContain("crm.documents");
    expect(keys).toContain("accounting.ar");
    for (const key of MINE_DAILY_OPS_FEATURE_KEYS) {
      expect(keys).not.toContain(key);
    }
    expect(keys.some((key) => key.startsWith("gold."))).toBe(false);
    expect(keys.some((key) => key.startsWith("scrap-metal."))).toBe(false);
    expect(keys).not.toContain("schools.core");
    expect(keys).not.toContain("autos.core");
    expect(keys).not.toContain("retail.core");
  });

  it("does not leak crm.* features into unrelated templates", () => {
    for (const code of ["TEMPLATE_CORE_STARTER", "TEMPLATE_SCHOOLS", "TEMPLATE_GOLD_MINE"]) {
      expect(templateFeatures(code).some((key) => key.startsWith("crm."))).toBe(false);
    }
  });

  it("limits retail CRM access to the shared customer directory", () => {
    expect(templateFeatures("TEMPLATE_RETAIL").filter((key) => key.startsWith("crm."))).toEqual([
      "crm.customers",
    ]);
  });
});

describe("primary quick actions", () => {
  const nonMiningCases: Array<[string, string | null]> = [
    ["TEMPLATE_SMALL_BUSINESS_SECURITY_STOCK", "GENERAL"],
    ["TEMPLATE_TECH_WORKSHOP", "GENERAL"],
    ["TEMPLATE_CORE_STARTER", "GENERAL"],
    ["TEMPLATE_SCHOOLS", "SCHOOLS"],
    ["TEMPLATE_CAR_SALES", "AUTOS"],
    ["TEMPLATE_RETAIL", "RETAIL"],
    ["TEMPLATE_SCRAP_METAL", "SCRAP_METAL"],
    ["TEMPLATE_CRM", "GENERAL"],
  ];

  it.each(nonMiningCases)("%s offers no mining quick actions", (code, profile) => {
    const actions = getPrimaryQuickActions({
      workspaceProfile: profile,
      role: "MANAGER",
      enabledFeatures: templateFeatures(code),
    });
    expect(actions.filter((action) => isMiningHref(action.href))).toEqual([]);
  });

  it("multi-site offers stores actions", () => {
    const actions = getPrimaryQuickActions({
      workspaceProfile: "GENERAL",
      role: "MANAGER",
      enabledFeatures: templateFeatures("TEMPLATE_SMALL_BUSINESS_SECURITY_STOCK"),
    });
    expect(actions.map((action) => action.href)).toContain("/stores/receive");
  });

  it("service workshop offers maintenance actions", () => {
    const actions = getPrimaryQuickActions({
      workspaceProfile: "GENERAL",
      role: "MANAGER",
      enabledFeatures: templateFeatures("TEMPLATE_TECH_WORKSHOP"),
    });
    expect(actions.map((action) => action.href)).toContain("/maintenance/breakdown");
  });

  it("gold mine keeps its mining quick actions", () => {
    const actions = getPrimaryQuickActions({
      workspaceProfile: "GOLD_MINE",
      role: "MANAGER",
      enabledFeatures: templateFeatures("TEMPLATE_GOLD_MINE"),
    });
    const hrefs = actions.map((action) => action.href);
    expect(hrefs).toContain("/shift-report");
    expect(hrefs).toContain("/gold/intake/pours/new");
  });

  it("legacy multi-site tenants with leaked mining flags still see no mining quick actions", () => {
    const leakedFeatures = [
      ...templateFeatures("TEMPLATE_SMALL_BUSINESS_SECURITY_STOCK"),
      ...MINE_DAILY_OPS_FEATURE_KEYS,
    ];
    const actions = getPrimaryQuickActions({
      workspaceProfile: "GENERAL",
      role: "MANAGER",
      enabledFeatures: leakedFeatures,
    });
    expect(actions.filter((action) => isMiningHref(action.href))).toEqual([]);
  });
});

describe("workspace sidebar model", () => {
  it("shows CRM navigation when only CRM customers is enabled", () => {
    const model = getWorkspaceSidebarModel({
      role: "MANAGER",
      enabledFeatures: ["crm.customers"],
      workspaceProfile: "GENERAL",
    });
    const hrefs = model.sections.flatMap((section) => section.items.map((item) => item.href));
    expect(hrefs).toContain("/retail/customers");
  });

  it("multi-site sidebar contains no mining hrefs anywhere", () => {
    const model = getWorkspaceSidebarModel({
      role: "MANAGER",
      enabledFeatures: templateFeatures("TEMPLATE_SMALL_BUSINESS_SECURITY_STOCK"),
      workspaceProfile: "GENERAL",
    });
    const hrefs = [
      ...model.quickActions.map((item) => item.href),
      ...model.sections.flatMap((section) => section.items.map((item) => item.href)),
    ];
    expect(hrefs.filter(isMiningHref)).toEqual([]);
    expect(model.homeHref.startsWith("/gold")).toBe(false);
  });

  /**
   * S-5. Range & Stock is the one stock door in a retail workspace.
   *
   * "Stores & Inventory" used to be a second entry under More, so a shopkeeper
   * had to know which of two sections owned the answer — and the answer was
   * usually both, because on-hand has only ever lived in the core
   * `InventoryItem`. The section is not deleted, it is claimed: `stores` is a
   * native module of the RETAIL profile, so its destinations arrive inside the
   * curated sections and it never renders a rail of its own. Every other
   * workspace still gets it.
   */
  describe("retail: Range & Stock is the one stock door", () => {
    const retailFeatures = templateFeatures("TEMPLATE_RETAIL");

    function retailModel(activeStockLocationSiteIds?: string[]) {
      return getWorkspaceSidebarModel({
        role: "MANAGER",
        enabledFeatures: retailFeatures,
        workspaceProfile: "RETAIL",
        activeStockLocationSiteIds,
      });
    }

    function rangeItems(model: ReturnType<typeof retailModel>) {
      return model.sections.find((section) => section.id === "retail-range")?.items ?? [];
    }

    it("puts the core stock surfaces under Range & Stock", () => {
      const hrefs = rangeItems(retailModel()).map((item) => item.href);
      expect(hrefs).toContain("/stores/inventory");
      expect(hrefs).toContain("/stores/movements");
      expect(hrefs).toContain("/stores/locations");
    });

    it("keeps the retail stock screens core has no answer for", () => {
      const hrefs = rangeItems(retailModel()).map((item) => item.href);
      // Purchase-order and goods-receipt value, which the core stock overview
      // cannot show.
      expect(hrefs).toContain("/retail/stock");
      // A variance posted as an ADJUSTMENT. The Stores module offers Issue and
      // Receive and has no adjustment surface anywhere.
      expect(hrefs).toContain("/retail/stock/count");
    });

    it("renders no separate Stores & Inventory section", () => {
      const model = retailModel();
      expect(model.sections.map((section) => section.id)).not.toContain("stores");
      expect(model.sections.map((section) => section.title)).not.toContain("Stores & Inventory");

      // …and the stock destinations are in the sidebar exactly once.
      const allHrefs = model.sections.flatMap((section) => section.items.map((item) => item.href));
      expect(allHrefs.filter((href) => href === "/stores/inventory")).toHaveLength(1);
    });

    it("still renders Stores & Inventory for a non-retail workspace", () => {
      const model = getWorkspaceSidebarModel({
        role: "MANAGER",
        enabledFeatures: templateFeatures("TEMPLATE_SMALL_BUSINESS_SECURITY_STOCK"),
        workspaceProfile: "GENERAL",
      });
      const stores = model.sections.find((section) => section.id === "stores");
      expect(stores?.title).toBe("Stores & Inventory");
      expect(stores?.items.map((item) => item.href)).toContain("/stores/inventory");
    });

    it("does not offer core's catalogue or price lists beside retail's own", () => {
      // A second item master and a second price book that no retail surface
      // reads. They stay entitled — and now hold their own keys, so a tenant can
      // be given retail's stock without them — but the retail sidebar does not
      // ask the shopkeeper to choose between two catalogues.
      const allHrefs = retailModel().sections.flatMap((section) =>
        section.items.map((item) => item.href),
      );
      expect(allHrefs).not.toContain("/stores/catalogue");
      expect(allHrefs).not.toContain("/stores/price-lists");
      expect(allHrefs).toContain("/retail/catalog");
      expect(allHrefs).toContain("/retail/merchandising/pricing");
    });

    it("hides transfers until some site has two active stock locations", () => {
      const hrefsFor = (siteIds?: string[]) => rangeItems(retailModel(siteIds)).map((i) => i.href);

      // Not known yet, and the demo bottle store's one `SHOP` location: a
      // transfer has nowhere to go and `recordStockMovement` refuses it.
      expect(hrefsFor()).not.toContain("/retail/stock/transfers");
      expect(hrefsFor(["site-a"])).not.toContain("/retail/stock/transfers");

      // Two locations, but one each at two sites. On-hand is held per site, so
      // this is not a reclassification and the movement service refuses it too.
      expect(hrefsFor(["site-a", "site-b"])).not.toContain("/retail/stock/transfers");

      // A storeroom and a shop floor at the same site — the one transfer the
      // model can honestly represent.
      expect(hrefsFor(["site-a", "site-a"])).toContain("/retail/stock/transfers");
    });

    it("bands Range & Stock rather than listing nine destinations flat", () => {
      const section = retailModel(["site-a", "site-a"]).sections.find(
        (candidate) => candidate.id === "retail-range",
      );
      expect(section?.groups?.map((group) => group.id)).toEqual(["selling", "stock"]);
      for (const item of section?.items ?? []) {
        expect(item.group, `${item.href} sits in no band`).toBeTruthy();
      }
    });
  });

  it("schools sidebar contains no mining hrefs anywhere", () => {
    const model = getWorkspaceSidebarModel({
      role: "MANAGER",
      enabledFeatures: templateFeatures("TEMPLATE_SCHOOLS"),
      workspaceProfile: "SCHOOLS",
    });
    const hrefs = [
      ...model.quickActions.map((item) => item.href),
      ...model.sections.flatMap((section) => section.items.map((item) => item.href)),
    ];
    expect(hrefs.filter(isMiningHref)).toEqual([]);
  });
});

describe("route gating", () => {
  it("gates the production dashboard behind plant reporting", () => {
    expect(resolveFeatureKeyForPath("/dashboard")).toBe("reports.plant");
  });

  it("gates mining capture pages behind mining ops features", () => {
    expect(resolveFeatureKeyForPath("/shift-report")).toBe("ops.shift-report.submit");
    expect(resolveFeatureKeyForPath("/plant-report")).toBe("ops.plant-report.submit");
  });

  it("gates the attendance register as People, not as mining", () => {
    // It used to be `/attendance` on `ops.attendance.mark`, which meant a school,
    // a bureau or a scrap yard — anybody with a workforce but no shafts — could
    // not reach a register at all.
    expect(resolveFeatureKeyForPath("/people/attendance")).toBe("hr.attendance");
    expect(resolveFeatureKeyForPath("/api/people/attendance")).toBe("hr.attendance");

    // And the old path is gone rather than redirected. AGENTS.md forbids
    // compatibility layers, so an unregistered path must resolve to nothing —
    // if this ever returns a key again, something re-added the route.
    expect(resolveFeatureKeyForPath("/attendance")).toBeNull();
  });

  it("keeps the People register ahead of the bare /people entry", () => {
    // First match wins in the registry, so a longer prefix listed after a shorter
    // one is dead. If this resolves to `hr.employees` the two entries have been
    // reordered and the register is gated on the wrong feature.
    expect(resolveFeatureKeyForPath("/people/attendance/anything")).toBe("hr.attendance");
  });

  it("gates moved preferences organization pages behind their source features", () => {
    expect(resolveFeatureKeyForPath("/preferences/organization/users")).toBe(
      "admin.user-management.directory",
    );
    expect(resolveFeatureKeyForPath("/preferences/organization/sites")).toBe(
      "admin.sites-sections",
    );
    expect(resolveFeatureKeyForPath("/preferences/organization/departments")).toBe(
      "hr.employees",
    );
    expect(resolveFeatureKeyForPath("/preferences/organization/branding/identity")).toBe(
      "core.branding.manage",
    );
    expect(resolveFeatureKeyForPath("/preferences/organization/templates")).toBe(
      "core.branding.manage",
    );
  });

  it("gates the catalogue and the price lists on their own keys", () => {
    // Both used to ride on `stores.inventory`, so a tenant could not be given a
    // price book without the whole stock module.
    expect(resolveFeatureKeyForPath("/stores/catalogue")).toBe("stores.catalogue");
    expect(resolveFeatureKeyForPath("/stores/price-lists")).toBe("stores.price-lists");
    expect(resolveFeatureKeyForPath("/api/v2/inventory/price-lists")).toBe("stores.price-lists");
    // The product API is read by the catalogue, the price-list editor and CRM
    // quoting, so it stays on the item master's own key.
    expect(resolveFeatureKeyForPath("/api/v2/inventory/products")).toBe("stores.inventory");
  });

  it("gates retail customer surfaces behind CRM", () => {
    expect(resolveFeatureKeyForPath("/retail/customers")).toBe("crm.customers");
    expect(resolveFeatureKeyForPath("/portal/pos/customers")).toBe("crm.customers");
    expect(resolveFeatureKeyForPath("/api/v2/retail/customers/search")).toBe("crm.customers");
  });
});
