/**
 * Payroll is provisionable on its own, and bolts onto anything.
 *
 * Two shapes have to work and they fail differently.
 *
 * **Standalone.** A client provisioned from `TEMPLATE_PAYROLL_BUREAU` must land
 * somewhere real with a coherent sidebar. The failure mode is not an error — it
 * is a workspace that loads, shows a general dashboard of eight dead tiles, and
 * gives the client no route to the thing they paid for.
 *
 * **Addon.** The same code must bolt onto an existing workspace. The concrete
 * case is a school: `TEMPLATE_SCHOOLS` had every `hr.*` key in its
 * `disabledFeatureKeys`, which is a *hard block* rather than a default — so a
 * school could not buy payroll at all, even by adding the bundle, because
 * provisioning turned it straight back off. That is asserted here as a
 * regression, because it is exactly the kind of thing that gets re-added by
 * somebody tidying a list.
 */

import { describe, it, expect } from "vitest";

import {
  CLIENT_BUNDLE_TEMPLATES,
  getClientTemplateDefinition,
  getClientTemplateDisabledFeatureKeys,
  getClientTemplateWorkspaceProfile,
} from "@corelithzw/platform/client-templates";
import { FEATURE_BUNDLES, FEATURE_CATALOG } from "@corelithzw/platform/feature-catalog";
import { getFeatureDependencies } from "@corelithzw/platform/gating/feature-dependencies";
import { getAllRouteFeatureKeys, resolveFeatureKeyForPath } from "@corelithzw/platform/gating/route-registry";
import {
  inferWorkspaceProfileFromEnabledFeatures,
  normalizeWorkspaceProfileInput,
  resolveWorkspaceVerticalProductBundle,
  VERTICAL_PRODUCT_BUNDLES,
} from "@corelithzw/platform/workspace-products";
import { getWorkspaceProfileForTemplate } from "@/lib/workspaces";
import { PEOPLE_TABS, PEOPLE_CATEGORIES } from "@/lib/people/tab-config";
import { PAYROLL_TABS, PAYROLL_CATEGORIES } from "@/lib/payroll/tab-config";

const CATALOG_KEYS = new Set(FEATURE_CATALOG.map((feature) => feature.key));

const PAYROLL_TEMPLATE = "TEMPLATE_PAYROLL_BUREAU";

/** The features a bureau template actually grants, bundles expanded. */
function templateFeatureKeys(templateCode: string): Set<string> {
  const template = CLIENT_BUNDLE_TEMPLATES.find((row) => row.code === templateCode)!;
  const bundles = FEATURE_BUNDLES.filter((bundle) =>
    template.bundleCodes.includes(bundle.code),
  );
  const granted = new Set<string>([
    ...template.featureKeys,
    ...bundles.flatMap((bundle) => bundle.features),
  ]);
  for (const disabled of getClientTemplateDisabledFeatureKeys(templateCode)) {
    granted.delete(disabled);
  }
  return granted;
}

describe("the new statutory feature keys", () => {
  it.each([
    "hr.statutory-tables",
    "hr.statutory-returns",
    "hr.payslips",
    "hr.employee-self-service",
  ])("%s is in the catalog", (key) => {
    // A key used by a route registry entry but absent from the catalog is a route
    // nobody can ever reach.
    expect(CATALOG_KEYS.has(key)).toBe(true);
  });

  it("declares dependencies that cannot produce an incoherent workspace", () => {
    expect(getFeatureDependencies("hr.payroll")).toContain("hr.employees");
    expect(getFeatureDependencies("hr.statutory-returns")).toContain("hr.payroll");
    expect(getFeatureDependencies("hr.statutory-returns")).toContain(
      "hr.statutory-tables",
    );
    expect(getFeatureDependencies("hr.employee-self-service")).toContain("hr.payslips");
  });

  it("does NOT make payroll depend on accounting", () => {
    // The seam the payroll-only product stands on. If this ever becomes a
    // dependency, a bureau cannot be provisioned without a ledger it does not
    // want, and the "run completes and says it posted nothing" path becomes
    // unreachable.
    expect(getFeatureDependencies("hr.payroll")).not.toContain("accounting.core");
    expect(getFeatureDependencies("hr.statutory-tables")).not.toContain(
      "accounting.core",
    );
  });
});

describe("the standalone payroll product", () => {
  it("has a template", () => {
    const template = getClientTemplateDefinition(PAYROLL_TEMPLATE);
    expect(template).not.toBeNull();
    expect(template!.verticalProductId).toBe("payroll-services");
  });

  it("resolves from its aliases, so provisioning does not need the full code", () => {
    expect(getClientTemplateDefinition("PAYROLL")?.code).toBe(PAYROLL_TEMPLATE);
    expect(getClientTemplateDefinition("bureau")?.code).toBe(PAYROLL_TEMPLATE);
  });

  it("grants the whole payroll surface", () => {
    const granted = templateFeatureKeys(PAYROLL_TEMPLATE);
    for (const key of [
      "hr.employees",
      "hr.compensation-rules",
      "hr.payroll",
      "hr.disbursements",
      "hr.salaries",
      "hr.approvals-history",
      "hr.statutory-tables",
      "hr.statutory-returns",
      "hr.payslips",
      "hr.employee-self-service",
    ]) {
      expect(granted.has(key), `expected ${key} to be granted`).toBe(true);
    }
  });

  it("grants nothing from another vertical", () => {
    const granted = templateFeatureKeys(PAYROLL_TEMPLATE);
    // A bureau opening a gold reconciliation screen is the dead-tiles failure.
    for (const key of Array.from(granted)) {
      expect(
        key.startsWith("gold.") ||
          key.startsWith("schools.") ||
          key.startsWith("retail.") ||
          key.startsWith("autos.") ||
          key.startsWith("scrap-metal.") ||
          key.startsWith("cctv."),
        `${key} does not belong in a payroll-only workspace`,
      ).toBe(false);
    }
  });

  it("grants only keys the catalog knows", () => {
    for (const key of templateFeatureKeys(PAYROLL_TEMPLATE)) {
      expect(CATALOG_KEYS.has(key), `${key} is not in the feature catalog`).toBe(true);
    }
  });

  it("does not block accounting, so a bureau can add a ledger later", () => {
    // `TEMPLATE_SCHOOLS` made exactly this mistake with `hr.payroll`: a hard
    // block that made the upgrade impossible.
    const disabled = getClientTemplateDisabledFeatureKeys(PAYROLL_TEMPLATE);
    expect(disabled).not.toContain("accounting.core");
  });

  it("lands the client on payroll, not a general dashboard", () => {
    const bundle = VERTICAL_PRODUCT_BUNDLES.find(
      (row) => row.id === "payroll-services",
    )!;
    expect(bundle.preferredHomeHref).toBe("/payroll/runs");
    // Payroll is the product for a bureau. People is foundational — you need
    // employees to pay, but nobody buys this to keep a staff directory.
    expect(bundle.primaryModules).toEqual(["payroll"]);
    expect(bundle.foundationalModules).toContain("people");
    // Foundational, not required: accounting is offered, never assumed.
    expect(bundle.foundationalModules).toContain("accounting");
  });

  it("resolves the vertical product from the profile", () => {
    expect(
      resolveWorkspaceVerticalProductBundle({
        workspaceProfile: "PAYROLL",
        enabledFeatures: [],
      }).id,
    ).toBe("payroll-services");
  });

  it("maps the template to a workspace profile", () => {
    // There are two of these mappers — `getClientTemplateWorkspaceProfile` here
    // and `getWorkspaceProfileForTemplate` in `lib/workspaces.ts` — and adding a
    // template to only one of them is silent. The existing
    // `workspace-feature-resolution` suite caught exactly that while this was
    // being written; asserted here too so the reason is recorded next to the
    // template.
    expect(getClientTemplateWorkspaceProfile(PAYROLL_TEMPLATE)).toBe("PAYROLL");
    expect(getWorkspaceProfileForTemplate(PAYROLL_TEMPLATE)).toBe("PAYROLL");
  });

  it("resolves the profile from its aliases", () => {
    expect(normalizeWorkspaceProfileInput("payroll")).toBe("PAYROLL");
    expect(normalizeWorkspaceProfileInput("PAYROLL_BUREAU")).toBe("PAYROLL");
    expect(normalizeWorkspaceProfileInput("bureau")).toBe("PAYROLL");
  });

  it("infers the profile for an existing workspace that only has payroll", () => {
    expect(
      inferWorkspaceProfileFromEnabledFeatures([
        "hr.employees",
        "hr.payroll",
        "hr.statutory-tables",
      ]),
    ).toBe("PAYROLL");
  });

  it("does NOT mistake a school that also runs payroll for a bureau", () => {
    // HR is foundational to every vertical, so `hr.payroll` alone cannot mean
    // "bureau". The ordering in `inferWorkspaceProfileFromEnabledFeatures` is
    // what tells them apart, and this is the case that would break if somebody
    // moved the payroll check earlier.
    expect(
      inferWorkspaceProfileFromEnabledFeatures([
        "schools.core",
        "schools.fees",
        "hr.employees",
        "hr.payroll",
        "hr.statutory-tables",
      ]),
    ).toBe("SCHOOLS");
  });

  it("does not read an ordinary tenant with payroll as a bureau", () => {
    // Requires the statutory keys, so a general-business tenant that merely has
    // payroll switched on stays general.
    expect(
      inferWorkspaceProfileFromEnabledFeatures(["hr.employees", "hr.payroll"]),
    ).toBeNull();
  });
});

describe("the addon path", () => {
  it("has a bundle addable to any template", () => {
    const bundle = FEATURE_BUNDLES.find(
      (row) => row.code === "ADDON_ZIMBABWE_PAYROLL",
    );
    expect(bundle).toBeDefined();
    expect(bundle!.features).toEqual(
      expect.arrayContaining([
        "hr.statutory-tables",
        "hr.statutory-returns",
        "hr.payslips",
      ]),
    );
  });

  it("REGRESSION: a school is no longer hard-blocked from buying payroll", () => {
    // While `hr.payroll` sat in the schools disable list, adding the bundle did
    // nothing — provisioning turned the key straight back off. A school paying
    // its teachers from the same `Employee` rows the timetable uses was
    // impossible, not merely unsold.
    const disabled = getClientTemplateDisabledFeatureKeys("TEMPLATE_SCHOOLS");
    expect(disabled).not.toContain("hr.payroll");
    expect(disabled).not.toContain("hr.employees");
    expect(disabled).not.toContain("hr.compensation-rules");
    expect(disabled).not.toContain("hr.disbursements");
  });

  it("still blocks the settlement surface a school has no use for", () => {
    // The settlement keys are the gold payout screens. Unblocking them along
    // with the rest of HR would give a school empty tabs for a commodity it
    // does not handle.
    //
    // These used to be one key, `hr.settlements` — a mining concept in the HR
    // namespace, which is why the scrap settlements page was gated on an HR key
    // and why every Advanced Payroll customer was sold a gold payout screen.
    // `settlements.scrap` was a third key and is gone with its vertical
    // (ST-3.4): a template cannot disable a feature the catalogue no longer
    // sells, and listing one here would assert against a key nobody can hold.
    const disabled = getClientTemplateDisabledFeatureKeys("TEMPLATE_SCHOOLS");
    expect(disabled).toContain("settlements.core");
    expect(disabled).toContain("settlements.gold");
    expect(disabled).not.toContain("settlements.scrap");
  });
});

describe("navigation", () => {
  it("registers a route for every new HR page", () => {
    const registered = new Set(getAllRouteFeatureKeys());
    expect(registered.has("hr.statutory-tables")).toBe(true);
    expect(registered.has("hr.statutory-returns")).toBe(true);
  });

  it("resolves the longest prefix, so returns is not swallowed by tables", () => {
    expect(resolveFeatureKeyForPath("/payroll/statutory")).toBe(
      "hr.statutory-tables",
    );
    expect(resolveFeatureKeyForPath("/payroll/statutory/returns")).toBe(
      "hr.statutory-returns",
    );
    expect(resolveFeatureKeyForPath("/api/payroll/returns")).toBe(
      "hr.statutory-returns",
    );
    // And the bare payroll prefix still answers for everything under it.
    expect(resolveFeatureKeyForPath("/api/payroll/runs")).toBe("hr.payroll");
  });

  it("declares the statutory tabs in the one place nav is declared", () => {
    // `lib/navigation.ts` derives from this, so a tab added anywhere else does
    // not appear.
    const ids = PAYROLL_TABS.map((tab) => tab.id);
    expect(ids).toContain("statutory-tables");
    expect(ids).toContain("statutory-returns");
    expect(PAYROLL_CATEGORIES.map((c) => c.id)).toContain("statutory");
  });

  it("keeps money out of People and people out of Payroll", () => {
    // The split this module exists to hold. People had six categories and five
    // were money, so the directory sat behind four screens about salary bills.
    const peopleHrefs = PEOPLE_TABS.map((tab) => tab.href);
    const payrollHrefs = PAYROLL_TABS.map((tab) => tab.href);
    expect(peopleHrefs.every((href) => href.startsWith("/people"))).toBe(true);
    expect(payrollHrefs.every((href) => href.startsWith("/payroll"))).toBe(true);
    // Compensation is payroll's, which is the move that prompted the split.
    expect(payrollHrefs).toContain("/payroll/compensation");
    expect(peopleHrefs).not.toContain("/payroll/compensation");
  });

  it("gives every tab a category that exists", () => {
    for (const [tabs, categories] of [
      [PEOPLE_TABS, PEOPLE_CATEGORIES],
      [PAYROLL_TABS, PAYROLL_CATEGORIES],
    ] as const) {
      const ids = new Set(categories.map((category) => category.id as string));
      for (const tab of tabs) {
        expect(ids.has(tab.categoryId), `${tab.id} has no category`).toBe(true);
      }
    }
  });

  it("orders the categories without a collision", () => {
    for (const categories of [PEOPLE_CATEGORIES, PAYROLL_CATEGORIES]) {
      const orders = categories.map((category) => category.order);
      expect(new Set(orders).size).toBe(orders.length);
    }
  });
});
