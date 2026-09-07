import { describe, expect, it } from "vitest";

import { CLIENT_BUNDLE_TEMPLATES, LISTED_CLIENT_BUNDLE_TEMPLATES, getClientTemplateDefinition } from "./client-templates";
import {
  FEATURE_BUNDLES,
  LISTED_FEATURE_BUNDLES,
  LISTED_TIERS,
  TIERS,
  getBundleDefinition,
  getTierDefinition,
} from "./feature-catalog";

/**
 * Delisting is a fact the catalogue states, not a deletion: what a tenant
 * already holds stays resolvable by code; what is for sale is the listed set.
 */
describe("the delisted mine", () => {
  it("keeps Gold Edition in the catalogue and off the listed ladder", () => {
    const gold = getTierDefinition("GOLD_EDITION");
    expect(gold?.delisted).toBe(true);
    expect(TIERS).toContain(gold);
    expect(LISTED_TIERS.map((tier) => tier.code)).not.toContain("GOLD_EDITION");
    expect(LISTED_TIERS.length).toBe(TIERS.length - TIERS.filter((tier) => tier.delisted).length);
    expect(LISTED_TIERS.every((tier) => !tier.delisted)).toBe(true);
  });

  it("keeps the gold bundles for the tenants that hold them and off the listed add-ons", () => {
    for (const code of ["ADDON_GOLD_CORE", "ADDON_GOLD_ADVANCED", "ADDON_COMMODITY_SETTLEMENTS", "ADDON_MINE_DAILY_OPS"]) {
      expect(getBundleDefinition(code)?.delisted, code).toBe(true);
      expect(LISTED_FEATURE_BUNDLES.map((bundle) => bundle.code)).not.toContain(code);
    }
    expect(LISTED_FEATURE_BUNDLES.length).toBe(FEATURE_BUNDLES.filter((bundle) => !bundle.delisted).length);
  });

  it("keeps the mine's template resolvable and off the picker for a new tenant", () => {
    expect(getClientTemplateDefinition("TEMPLATE_GOLD_MINE")?.delisted).toBe(true);
    expect(getClientTemplateDefinition("GOLD")?.code).toBe("TEMPLATE_GOLD_MINE");
    expect(LISTED_CLIENT_BUNDLE_TEMPLATES.map((template) => template.code)).not.toContain("TEMPLATE_GOLD_MINE");
    expect(LISTED_CLIENT_BUNDLE_TEMPLATES.length).toBe(CLIENT_BUNDLE_TEMPLATES.length - 1);
  });
});
