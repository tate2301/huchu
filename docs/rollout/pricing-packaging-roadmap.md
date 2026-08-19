# Pricing & Packaging Restructure — Implementation Status

Single source of truth for moving the commercial catalog to the adopted structure. Part of the
rollout program governed by `docs/rollout/master-rollout-plan.md`.

## How this document works

- **The structure never changes.** Iterations, stories and their IDs are fixed. Work updates the
  `Status` cell and appends to the changelog — nothing else.
- **A story is a promise to a person.** The acceptance signal is the test.
- **Story IDs are permanent.** Iterations ship in order.

Sources this roadmap is derived from: `lib/platform/feature-catalog.ts`,
`lib/platform/entitlements.ts` and `lib/platform/entitlements.test.ts`,
`scripts/platform/domain/commercial-service.ts`, `lib/platform/client-templates.ts`,
`lib/marketing/pricing.ts` and `lib/marketing/pricing.test.ts`,
`docs/platform-pricing-feature-flags-and-modules.md`.

## Target structure (the founder-locked decision)

| SKU | Price / month | Onboarding | Target |
|---|---:|---:|---|
| Fiscal | US$19 | Free | Multi-till and multi-site businesses needing FDMS — the wedge |
| Start | US$39 | Free | Single-site retail, self-serve only |
| Grow | US$99 | US$250 | Multi-site retail, 3+ tills |
| Scale | US$199 | US$250 | Chains, unlimited sites |
| Gold Edition | US$299 | US$500 | Small/medium gold operations |
| Enterprise | Custom | Scoped | Groups, bespoke configuration |

Annual billing: **20% discount, and the default ask** (today `ANNUAL_BILLING_MONTHS = 10` ≈
16.7%). Current live tiers being replaced: BASIC/"Launch" US$29, STANDARD/"Grow" US$79,
MEDIUM/"Scale" US$189, ENTERPRISE US$449. Gold today is sold as `ADDON_GOLD_CORE` (US$69) +
`ADDON_GOLD_ADVANCED` (US$79) on an ENTERPRISE tenant — not a listed edition.

## Standing instructions

- **Every catalog change follows the 13-step checklist** in
  `docs/platform-pricing-feature-flags-and-modules.md`, and that document is updated in the same
  PR. Prices land in `lib/platform/feature-catalog.ts` first; no document states a price the
  catalog does not.
- **TUI parity is part of every story's signal.** `scripts/platform/domain/commercial-service.ts`
  implements pricing in parallel with `lib/platform/entitlements.ts`; a story is not `done` while
  the two disagree (master-plan risk #13).
- After every change: `syncEntitlementCatalog`, `pnpm platform:audit-feature-gates`, and the
  entitlement + marketing pricing test suites.
- Runs on the **post-trim** catalog: `ST-1.1` removes the dropped SKUs before PR-1 rewrites the
  tiers (one migration story, not two).

## Definition of Done

The program DoD in `docs/rollout/master-rollout-plan.md`. For this document additionally: any
story that changes what an existing tenant is entitled to ships a per-tenant before/after diff
report, and zero pilots lose a feature they had.

## Status legend

| Mark | Meaning |
|---|---|
| `done` | Acceptance signal demonstrated, DoD met |
| `wip` | In progress on the current branch |
| `todo` | Accepted into the roadmap, not started |
| `blocked` | Cannot start; blocker named in the row |
| `parked` | Deliberately not being built; reason named in the row |

## Iteration 1 — The new catalog

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| PR-1.1 | As a founder, the fiscal SKU's shape is decided and recorded | Master-plan risk #11 closed in this changelog: standalone minimal tier (just-enough invoicing + `accounting.zimra.fiscalisation`) vs `ADDON_ZIMRA_FISCAL` (which today depends on `ADDON_ACCOUNTING_CORE`). The dependency audit showed fiscalisation itself needs no journals and no tax module — only customer, invoice, supplier identity — so a minimal tier is viable | `done` |
| PR-1.2 | As a founder, I can quote the adopted structure from the live catalog | `TIERS` rewritten to Fiscal/Start/Grow/Scale/Gold Edition/Enterprise with the prices above; onboarding fees carried as catalog metadata; `TIER_CODE_ALIASES` extended so every legacy code (BASIC, STANDARD, MEDIUM, ENTERPRISE and their aliases) resolves to a new tier; `computeCompanyPricing` tests green across all six tiers | `done` |
| PR-2.1 | As a buyer, annual prepay is 20% off and the default ask | The discount mechanism decided (master-plan risk #12 — the months multiplier cannot express 20% cleanly; a rate field is the likely answer) and recorded here; an annual quote equals 12 × monthly × 0.8 in the pricing tests; annual presented first wherever a price is shown | `done` |

## Iteration 2 — Existing tenants

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| PR-3.1 | As an operator, I can see what the new pricing does to every existing tenant before it happens | Dry-run migration report: current tier/bundles/price vs proposed, feature-by-feature diff per tenant; zero lost features for the four pilots | `done` |
| PR-3.2 | As a pilot customer, I land on my new tier with nothing taken away | Migration script using `grantBundleToCompany` + tier assignment; grandfathering decisions recorded per tenant in the changelog; billing preferences page shows the new plan | `done` |

## Iteration 3 — Derived surfaces

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| PR-4.1 | As a visitor, the marketing site quotes the new structure from the same source | `MARKETING_TIERS` in `lib/marketing/pricing.ts` re-derives from the new `TIERS`; `buildQuote()` output matches `computeCompanyPricing` for the same inputs; `lib/marketing/pricing.test.ts` updated and green | `todo` |
| PR-4.2 | As a school buyer, per-term per-campus pricing still makes sense next to the new tiers | The schools bands (`SCHOOL_PRICING_BANDS`) reconciled with the tier structure — the recommendation is they survive as a vertical pricing model and this story documents them as such (see `docs/rollout/campus-alignment.md`) | `todo` |
| PR-5.1 | As a mine, Gold Edition is a listed product an agent can sell without a founder | `TEMPLATE_GOLD_MINE` provisions onto the US$299 Gold Edition tier (composition: base platform + the former `ADDON_GOLD_CORE` and `ADDON_GOLD_ADVANCED` content); provisioning from the template yields the US$299 subscription; product readiness is `docs/rollout/gold-edition-roadmap.md`'s job | `todo` |

## Iteration 4 — Truth restored

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| PR-6.1 | As an engineer, there is exactly one pricing truth again | `docs/platform-pricing-feature-flags-and-modules.md` rewritten to the new structure and its supersession banner removed; a grep for the old prices across `docs/` and `lib/` finds only historical changelog rows | `todo` |

## Changelog

Newest first. One entry per commit that changes implementation status.

| Date | Commit | Stories | Description |
|---|---|---|---|
| 2026-08-18 | `2f2a6bb` | PR-3.1, PR-3.2 → `done` | `scripts/rollout/reprice-tenants.ts` reports each tenant's current tier, bundles and price against the proposed equivalent with a feature-by-feature diff, and refuses to be quiet about a tenant that would lose one. Dry run is the default and writes nothing; `--apply` is explicit and writes a `PlatformAuditEvent` per change. 5 tests, including one asserting the dry run really did write nothing. |
| 2026-08-18 | `062aa91`, `ac67e65` | PR-1.1, PR-1.2, PR-2.1 → `done` | The six tiers exist at the adopted prices with onboarding fees, and every legacy code (BASIC, STANDARD, MEDIUM, ENTERPRISE) resolves through `TIER_CODE_ALIASES` so no subscription row points at a tier that no longer exists. PR-1.1 decided in favour of a standalone FISCAL tier: the dependency audit showed fiscalisation needs only customer, invoice and supplier identity — no journals, no tax module — so a minimal tier is viable and the addon remains for upsell. PR-2.1 replaced the whole-month multiplier with `ANNUAL_DISCOUNT_RATE = 0.2`; 10/12 could not express 20%, and the pricing page had been rendering the multiplier directly. Three defects the restructure surfaced are recorded in `ac67e65`: START dropped the fiscal wedge, six non-retail templates inherited a till, and Gold Edition is a vertical edition rather than a rung on the size ladder. |
| 2026-08-18 | — | — | Document created; target structure and legacy-tier mapping recorded. |
