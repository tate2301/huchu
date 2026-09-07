import pathlib, re, json, subprocess
ROOT = pathlib.Path("/home/user/huchu")
def edit(path, old, new, count=1):
    p = ROOT / path; s = p.read_text(); n = s.count(old)
    assert n == count, f"{path}: expected {count} of {old[:60]!r}, found {n}"
    p.write_text(s.replace(old, new)); print("edited", path)

# --- the kernel's catalogue: a delisted tier, bundle or template stays for the tenants that hold it and leaves every public surface
edit("packages/platform/feature-catalog.ts", "  features: string[];\n}\n", '''  features: string[];
  /**
   * Sold no longer. The bundle stays in the catalogue so the tenants that hold
   * it keep their entitlements and their price; it is absent from every public
   * surface (the marketing site's add-on list). Gold's bundles, since Phase 4.
   */
  delisted?: boolean;
}
''')
edit("packages/platform/feature-catalog.ts", "  isVerticalEdition?: boolean;\n}\n", '''  isVerticalEdition?: boolean;
  /**
   * Sold no longer. The tier stays in `TIERS` so the tenants on it keep their
   * entitlements and their price, and every lookup by code still answers; it
   * is absent from every public surface — the marketing site, the ladder, the
   * operator's picker for a new tenant. Gold Edition, since Phase 4: the mine
   * is not a product the platform sells, and the enterprise host is the only
   * one that composes its module.
   */
  delisted?: boolean;
}
''')
edit("packages/platform/feature-catalog.ts", '    isVerticalEdition: true,\n    code: "GOLD_EDITION",\n', '    isVerticalEdition: true,\n    delisted: true,\n    code: "GOLD_EDITION",\n')
for code in ("ADDON_MINE_DAILY_OPS", "ADDON_GOLD_CORE", "ADDON_COMMODITY_SETTLEMENTS", "ADDON_GOLD_ADVANCED"):
    edit("packages/platform/feature-catalog.ts", f'    code: "{code}",\n', f'    code: "{code}",\n    delisted: true,\n')
edit("packages/platform/feature-catalog.ts", '''/** Vertical editions, sold for what a business is rather than how big it is. */
export const VERTICAL_EDITION_TIERS: TierDefinition[] = TIERS.filter(
  (tier) => tier.isVerticalEdition,
);
''', '''/** Vertical editions, sold for what a business is rather than how big it is. */
export const VERTICAL_EDITION_TIERS: TierDefinition[] = TIERS.filter(
  (tier) => tier.isVerticalEdition,
);

/**
 * What is for sale. A delisted tier stays in `TIERS` for the tenants on it and
 * is absent here, and here is what every public surface reads.
 */
export const LISTED_TIERS: TierDefinition[] = TIERS.filter((tier) => !tier.delisted);

/** The add-ons for sale; a delisted bundle is still a bundle for the tenants that hold it. */
export const LISTED_FEATURE_BUNDLES: FeatureBundleDefinition[] = FEATURE_BUNDLES.filter(
  (bundle) => !bundle.delisted,
);
''')
edit("packages/platform/client-templates.ts", "  includeAllFeatures?: boolean;\n}\n", '''  includeAllFeatures?: boolean;
  /**
   * Offered no longer. The template stays so a tenant provisioned from it can
   * be read, re-applied and audited; it is absent from the operator's picker
   * for a new tenant. The mine's template, since Phase 4.
   */
  delisted?: boolean;
}
''')
edit("packages/platform/client-templates.ts", '    code: "TEMPLATE_GOLD_MINE",\n', '    code: "TEMPLATE_GOLD_MINE",\n    delisted: true,\n')
edit("packages/platform/client-templates.ts", '''    includeAllFeatures: true,
  },
];

const TEMPLATE_ALIASES''', '''    includeAllFeatures: true,
  },
];

/** The templates offered for a new tenant; a delisted one is still resolvable by code. */
export const LISTED_CLIENT_BUNDLE_TEMPLATES: ClientBundleTemplateDefinition[] = CLIENT_BUNDLE_TEMPLATES.filter(
  (template) => !template.delisted,
);

const TEMPLATE_ALIASES''')

# --- the marketing site reads what is for sale
P = "apps/enterprise/lib/marketing/pricing.ts"
edit(P, "  FEATURE_BUNDLES,\n  TIERS,\n  USER_PACK_SIZE,", "  LISTED_FEATURE_BUNDLES,\n  LISTED_TIERS,\n  USER_PACK_SIZE,")
edit(P, "export const MARKETING_TIERS: MarketingTier[] = TIERS.map(toMarketingTier);", "export const MARKETING_TIERS: MarketingTier[] = LISTED_TIERS.map(toMarketingTier);")
edit(P, "  return TIERS.filter((tier) => tier.includedBundles.includes(code)).map((tier) => tier.code);", "  return LISTED_TIERS.filter((tier) => tier.includedBundles.includes(code)).map((tier) => tier.code);")
edit(P, "export const MARKETING_ADD_ONS: MarketingAddOn[] = FEATURE_BUNDLES.filter(", "export const MARKETING_ADD_ONS: MarketingAddOn[] = LISTED_FEATURE_BUNDLES.filter(")
edit(P, "  const tierDefinition = getTierDefinition(input.tierCode) ?? TIERS[0];", "  const tierDefinition = getTierDefinition(input.tierCode) ?? LISTED_TIERS[0];")
edit(P, "    ...TIERS.map((tier) => {\n      const billable = required", "    ...LISTED_TIERS.map((tier) => {\n      const billable = required")
edit(P, "    getTierDefinition(product.recommendedTierCode) ?? TIERS[Math.min(1, TIERS.length - 1)];", "    getTierDefinition(product.recommendedTierCode) ?? LISTED_TIERS[Math.min(1, LISTED_TIERS.length - 1)];")
edit(P, "    entryTierName: TIERS[0].name,", "    entryTierName: LISTED_TIERS[0].name,")
edit(P, ''' * Copy for the six tiers in `TIERS` (PR-1.2). Fiscal and Gold Edition are
 * vertical SKUs rather than rungs on the ladder, so neither of them claims
 * "everything in the plan below" — Start does not carry fiscalisation, and Gold
 * Edition does not carry retail, CRM, maintenance or portals.
 */''', ''' * Copy for the listed tiers (`LISTED_TIERS`, PR-1.2). Fiscal is a vertical SKU
 * rather than a rung on the ladder, so it does not claim "everything in the plan
 * below" — Start does not carry fiscalisation. Gold Edition is delisted (Phase
 * 4) and has no copy here: the tenants on it keep it, nobody new is offered it.
 */''')
s = (ROOT / P).read_text()
a = s.index('  GOLD_EDITION: {\n    tagline: "Account for every gram",'); b = s.index('  ENTERPRISE: {\n', a)
s = s[:a] + s[b:]
s = s.replace('  ADDON_GOLD_CORE: "Industry",\n  ADDON_GOLD_ADVANCED: "Industry",\n  ADDON_COMMODITY_SETTLEMENTS: "Industry",\n', "")
assert s.count('  bundleRow("Gold operations & controls", "ADDON_GOLD_CORE"),\n') == 1
s = s.replace('  bundleRow("Gold operations & controls", "ADDON_GOLD_CORE"),\n', "")
assert "GOLD_EDITION" not in s and "ADDON_GOLD" not in s, "the marketing copy still names gold"
(ROOT / P).write_text(s); print("edited", P, "(gold copy removed)")

# --- the operator's picker for a new tenant offers what is listed
W = "apps/enterprise/components/admin-portal/wizards/platform-wizards.tsx"
edit(W, "  FEATURE_BUNDLES,\n  TIERS,\n  BUNDLE_DEPENDENCIES,\n  getTierDefinition,\n} from \"@corelithzw/platform/feature-catalog\";", "  FEATURE_BUNDLES,\n  LISTED_TIERS,\n  TIERS,\n  BUNDLE_DEPENDENCIES,\n  getTierDefinition,\n} from \"@corelithzw/platform/feature-catalog\";")
edit(W, "import {\n  CLIENT_BUNDLE_TEMPLATES,\n  getClientTemplateDefinition,\n} from \"@corelithzw/platform/client-templates\";", "import {\n  CLIENT_BUNDLE_TEMPLATES,\n  LISTED_CLIENT_BUNDLE_TEMPLATES,\n  getClientTemplateDefinition,\n} from \"@corelithzw/platform/client-templates\";")
edit(W, "                        {CLIENT_BUNDLE_TEMPLATES.map((template) => (", "                        {LISTED_CLIENT_BUNDLE_TEMPLATES.map((template) => (")
s = (ROOT / W).read_text(); i = s.index("                        {TIERS.map((item) => (")  # the first tier picker: a new tenant
s = s[:i] + s[i:].replace("                        {TIERS.map((item) => (", "                        {LISTED_TIERS.map((item) => (", 1)
(ROOT / W).write_text(s); print("edited", W, "(new-tenant tier picker)")

# --- tests: the ladder is the listed ladder; delisting is a fact the catalogue states
T = "apps/enterprise/lib/marketing/pricing.test.ts"
edit(T, "  it(\"exposes a marketing tier for every billable tier\", () => {\n    expect(MARKETING_TIERS).toHaveLength(TIERS.length);\n    expect(MARKETING_TIERS.map((tier) => tier.code)).toEqual(TIERS.map((tier) => tier.code));\n  });",
     '''  it("exposes a marketing tier for every listed tier, and none for a delisted one", () => {
    expect(MARKETING_TIERS).toHaveLength(LISTED_TIERS.length);
    expect(MARKETING_TIERS.map((tier) => tier.code)).toEqual(LISTED_TIERS.map((tier) => tier.code));
    expect(TIERS.some((tier) => tier.delisted)).toBe(true);
    expect(MARKETING_TIERS.map((tier) => tier.code)).not.toContain("GOLD_EDITION");
    expect(getMarketingTier("GOLD_EDITION")).toBeNull();
  });

  it("sells no gold: the delisted add-ons are off the add-on list and the comparison table", () => {
    const codes = MARKETING_ADD_ONS.map((addOn) => addOn.code);
    for (const code of ["ADDON_GOLD_CORE", "ADDON_GOLD_ADVANCED", "ADDON_COMMODITY_SETTLEMENTS", "ADDON_MINE_DAILY_OPS"]) {
      expect(codes, `${code} is still for sale`).not.toContain(code);
    }
    expect(TIER_COMPARISON_ROWS.map((row) => row.label.toLowerCase())).not.toContain("gold operations & controls");
  });''')
s = (ROOT / T).read_text()
if "LISTED_TIERS" not in s.split("describe(")[0]:
    s = s.replace("  TIERS,\n", "  LISTED_TIERS,\n  TIERS,\n", 1)
if "getMarketingTier" not in s.split("describe(")[0]:
    s = s.replace("  MARKETING_ADD_ONS,\n", "  MARKETING_ADD_ONS,\n  getMarketingTier,\n", 1)
for name in ("MARKETING_ADD_ONS", "TIER_COMPARISON_ROWS", "getMarketingTier"):
    assert name in s.split("describe(")[0], f"pricing.test.ts does not import {name}"
(ROOT / T).write_text(s); print("edited", T)
(ROOT / "packages/platform/catalog-listing.test.ts").write_text('''import { describe, expect, it } from "vitest";

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
''')
print("wrote packages/platform/catalog-listing.test.ts")

# --- the Gold agent roster retires with the module's move; the working agreements it carried stay
A = ROOT / "AGENTS.md"; s = A.read_text(); i = s.index("## Gold Agent Team\n")
s = s[:i] + '''## Working agreements

The Gold multi-agent roster (`.claude/agents/gold-*`, its charter hook and its
per-ticket workflow) retired in Phase 4 with the module's move to
`packages/modules/gold`; the agreements it carried are everyone's:

- `pnpm typecheck` passes (plain `npx tsc --noEmit` dies at exit 134 — Node's
  default 4GB heap is not enough for this project, even on an idle machine).
- `npx eslint <changed files>` produces zero new errors.
- Target tests pass; a source change ships with its paired test, and a schema
  change with a migration witness test, in the same commit.
- Nothing merges on red CI, and "I'll add the test in a follow-up" is not a plan.
'''
A.write_text(s); print("edited AGENTS.md (roster retired)")
for f in sorted((ROOT / ".claude/agents").glob("gold-*.md")):
    subprocess.run(["git", "rm", "-q", str(f.relative_to(ROOT))], cwd=ROOT, check=True); print("removed", f.name)
subprocess.run(["git", "rm", "-q", "scripts/agent-charter-check.js"], cwd=ROOT, check=True); print("removed scripts/agent-charter-check.js")
sj = ROOT / ".claude/settings.json"; d = json.loads(sj.read_text())
for group in d["hooks"]["PostToolUse"]:
    group["hooks"] = [h for h in group["hooks"] if "agent-charter-check" not in h.get("command", "")]
sj.write_text(json.dumps(d, indent=2) + "\n"); print("edited .claude/settings.json")
edit("README.md", "| `scripts/` | Repository-level tooling: the agent guardrail hooks. Operational scripts live in `apps/enterprise/scripts/`. |",
     "| `scripts/` | Repository-level tooling: the host composer (`compose-host.mjs`) and the agent guardrail hooks. Operational scripts live in `apps/enterprise/scripts/`. |")

ROW = ("| 2026-09-06 | — | **Phase 4b executed: Gold delisted; the Gold agent roster retired.** Delisting is a fact the catalogue states, not a deletion: "
       "`GOLD_EDITION`, the four gold bundles (`ADDON_MINE_DAILY_OPS`, `ADDON_GOLD_CORE`, `ADDON_GOLD_ADVANCED`, `ADDON_COMMODITY_SETTLEMENTS`) and "
       "`TEMPLATE_GOLD_MINE` carry `delisted: true`, stay resolvable by code, and keep every mine tenant's entitlements and price; `LISTED_TIERS`, "
       "`LISTED_FEATURE_BUNDLES` and `LISTED_CLIENT_BUNDLE_TEMPLATES` are what is for sale. The marketing site reads the listed sets — no Gold Edition "
       "card, no gold add-ons, no gold row in the comparison table — and the operator's new-tenant wizard offers listed templates and tiers only; an "
       "existing tenant's subscription and filters still see every tier. Vertical roles and the `gold-operations` workspace bundle are untouched: they "
       "serve the tenants that exist. The `.claude/agents/gold-*` roster, its charter hook and the per-ticket workflow retired with the module's move; "
       "the working agreements they carried are in AGENTS.md for everyone. Not yet true, and recorded as the next decision: *nothing in a public build "
       "mentions Gold* — the kernel's catalogue still carries the delisted entries into every host's bundle, and moving a module's tiers, bundles and "
       "templates into its manifest is the cut that makes it true (a Phase 5 seam). `app/home` stays until the marketing site carries every page it does. |\n")
edit("docs/rollout/product-split-plan.md", "| Date | Commit | Description |\n|---|---|---|\n", "| Date | Commit | Description |\n|---|---|---|\n" + ROW)
print("done")
