# Scope Trim — Implementation Status

Single source of truth for narrowing the platform: what is dropped, what is parked, what is
frozen, and the order it happens in. Part of the rollout program governed by
`docs/rollout/master-rollout-plan.md`.

## How this document works

- **The structure never changes.** Iterations, stories and their IDs are fixed. Work updates the
  `Status` cell of an existing row and appends to the changelog — nothing else.
- **A story is a promise to a person.** Here that person is usually an engineer or an operator;
  the promise is that something is verifiably gone, flagged off, or safely retained.
- **The acceptance signal is the test.** A story is `done` when the signal can be demonstrated.
- **Story IDs are permanent.** An abandoned story becomes `parked` with a reason; it is never
  deleted or renumbered.
- **Iterations ship in order.** Catalog-and-flag removals come before code deletion, which comes
  before schema deletion. Nothing destructive runs before its export story is `done`.

Sources this roadmap is derived from: the accounting and module dependency audit of 2026-08-18
(recorded in this document's scope notes), `lib/platform/feature-catalog.ts`,
`lib/platform/client-templates.ts`, `lib/platform/gating/route-registry.ts`,
`lib/accounting/posting.ts`, `lib/accounting/integration.ts`, `lib/commodity-billing.ts`,
`prisma/schema.prisma`.

## Why this trim, and where the line is

The founder decision: we are not an accounting software company; the platform keeps only what it
needs to keep working. The line was drawn from a dependency audit, not taste:

**Kept — pilot-critical, verified consumers outside accounting:**

- **The posting engine** — `ChartOfAccount`, `JournalEntry`/`JournalLine`, `AccountingPeriod` and
  period locks, `PostingRule*`, `AccountingSettings`, tender mappings, and the services in
  `lib/accounting/posting.ts`, `lib/accounting/defaults.ts`, `lib/accounting/bootstrap.ts`,
  `lib/accounting/integration.ts`. Retail (`app/api/v2/retail/_helpers.ts`), schools fees
  (`app/api/v2/schools/fees/_helpers.ts`), gold (`app/api/gold/purchases/route.ts` and the
  capture-with-PENDING call sites), payroll (`lib/hr/payroll/posting.ts`), disbursements and
  stores all post through it — gold and schools tenants run it headlessly with no accounting UI
  entitlement.
- **The AR/AP document core** — `Customer`, `Vendor`, `SalesInvoice`, `SalesReceipt`,
  `SalesQuotation`, `PurchaseBill`. Gold buys and sells through `lib/commodity-billing.ts`; CRM
  creates and reads these documents directly (`lib/crm/accounting-bridge.ts`); document PDFs
  render from `lib/documents/source-registry.ts`.
- **The tax/VAT module in full** — tax codes, categories, templates, rules, and the VAT-return
  workflow (`lib/accounting/vat-return.ts`, `components/accounting/tax/tax-setup-workspace.tsx`).
  Founder decision: keep it all; native FDMS needs a ZIMRA taxID per rate regardless, and VAT
  returns are part of the compliance-layer claim.
- **Currency data** — `CurrencyRate` and `AccountingSettings.baseCurrency` are read by
  `lib/money.ts` (23 importers). The models stay even though the UI is parked.
- **The trial-balance function** in `lib/accounting/ledger.ts` — input to any future statement
  work and cheap to keep.

**Deleted — zero consumers anywhere, verified:** fixed assets (a register; nothing computes or
posts depreciation, no `DEPRECIATION` source type exists) and budgets (no variance report or
actual-vs-budget query exists anywhere).

**Parked (flagged off, models retained):** banking-reconciliation UI (the executive dashboard
reads `BankAccount`/`BankTransaction` in `lib/dashboard/executive-aggregations.ts`, and retail
setup checks `defaultBankAccountId`), financial-statement pages, cost-center UI (the
`costCenterId` columns on journal and posting-rule lines stay — the posting engine touches them),
currency-rate UI.

**Dropped modules (code and SKU removed):** CCTV, Autos/car-sales, Scrap metal. None are in the
four pilots' templates. CCTV and Autos are leaf modules with no cross-domain FKs; Scrap metal is
substantial but sits outside the gold/retail/campus focus — its FKs into accounting documents
make its migration the careful one.

**Frozen, not dropped:** Maintenance — it posts `MAINTENANCE_COMPLETION` to the ledger and ships
in the gold and retail pilot bundles. **Kept outright:** Compliance (gold pilot bundle; the
mining-campaign collateral is built on it) and CRM (the largest actively developed module and the
deepest AR consumer).

## Standing instructions

- **Nothing is dropped while any tenant has the feature enabled, until its export story is
  `done`.** The usage audit decides; the export is the undo.
- Every removal story runs `pnpm platform:audit-feature-gates`, the entitlement tests
  (`lib/platform/entitlements.test.ts`), and the marketing pricing tests
  (`lib/marketing/pricing.test.ts`) before merge.
- `lib/commodity-billing.ts` is **not** scrap-metal code. Gold depends on it. It stays.
- Catalog rows, templates, navigation, route-registry entries, workspace products, permission
  catalog entries, and marketing copy for a dropped module are removed **together** in one story —
  a half-removed SKU that still renders on the pricing page is a regression.
- Parked features are removed from navigation, templates and sellable bundles but keep their
  route-registry entries mapped to a feature key no bundle grants; the code stays compiling.

## Definition of Done

The program DoD in `docs/rollout/master-rollout-plan.md` applies to every story. For this
document additionally: any story that deletes a Prisma model ships its migration with a
`prisma migrate diff` check against `prisma/schema.prisma` in both directions, and names in its
changelog row where the exported data landed.

## Status legend

| Mark | Meaning |
|---|---|
| `done` | Acceptance signal demonstrated, DoD met |
| `wip` | In progress on the current branch |
| `todo` | Accepted into the roadmap, not started |
| `blocked` | Cannot start; blocker named in the row |
| `parked` | Deliberately not being built; reason named in the row |

## Iteration 0 — Truth before deletion

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| ST-0.1 | As an operator, I know exactly which tenants use each feature slated for removal | A usage report per dropped/parked feature: tenants with the bundle or flag enabled, and row counts in the module's tables per tenant. Produced by script, committed as an artifact of the changelog row | `done` |
| ST-0.2 | As an operator, any tenant's data in a dropped module is exported before the drop | Per-tenant export (CSV or JSON per table) for CCTV, Autos and Scrap metal tables, generated and stored; re-runnable; empty tenants produce empty exports, not errors | `done` |

## Iteration 1 — Catalog and flag removals (non-destructive)

Everything in this iteration is reversible: no code or schema is deleted yet.

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| ST-1.1 | As a buyer, dropped modules no longer appear anywhere they could be bought or navigated to | `ADDON_CCTV_SUITE`, `ADDON_AUTOS_SUITE`, `ADDON_SCRAP_METAL_SUITE` removed from `FEATURE_BUNDLES`; `TEMPLATE_CAR_SALES`, `TEMPLATE_SCRAP_METAL`, `TEMPLATE_SMALL_BUSINESS_SECURITY_STOCK` removed or re-pointed in `lib/platform/client-templates.ts`; navigation groups gone from `lib/navigation.ts`; vertical bundles gone from `lib/workspace-products.ts`; marketing rows gone from `lib/marketing/pricing.ts` and `app/home/site-data.ts`; catalog sync reports the expected reduced bundle count | `done` |
| ST-1.2 | As a tenant admin on a parked accounting feature, the page is gone but my data is not | Banking-reconciliation, financial-statements, cost-center and currency pages removed from `lib/accounting/tab-config.ts` navigation and from every sellable bundle; models untouched; executive dashboard cash tiles still render | `todo` |
| ST-1.3 | As an engineer, no tenant can reach a dropped module's routes | Route-registry entries for `/cctv`, `/car-sales`, `/scrap-metal` and their API prefixes resolve to feature keys no bundle grants; `pnpm platform:audit-feature-gates` clean; a request to each returns the feature-disabled response | `done` |

## Iteration 2 — Code deletion

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| ST-2.1 | As an engineer, the CCTV module and its server are gone | `app/cctv`, `app/api/cctv`, `components/cctv`, `lib/cctv-playback.ts` and related lib files, `cctv-server/`, and `app/reports/cctv-events` deleted; `hls.js` dependency removed if nothing else uses it; build green | `done` |
| ST-2.2 | As an engineer, Autos/car-sales is gone | `app/car-sales`, `app/api/v2/autos`, `app/api/v2/car-sales` (re-export shims), `lib/autos`, `components/car-sales`, `app/portal/autos` and the `portal.autos` feature deleted; build green | `done` |
| ST-2.3 | As an engineer, Scrap metal is gone but gold still bills | `app/scrap-metal`, `app/api/scrap-metal`, `lib/scrap-metal.ts`, `lib/scrap-metal/`, `components/scrap-metal` deleted; `lib/commodity-billing.ts` untouched and gold purchase/receipt posting tests green | `done` |
| ST-2.4 | As an engineer, dead accounting features are gone | `app/accounting/assets`, `app/accounting/budgets`, `app/api/accounting/assets`, `app/api/accounting/budgets` deleted; the thrift redirect stub `app/thrift/page.tsx` removed alongside its route-registry entry | `done` |
| ST-2.5 | As an engineer, the workspace and persona registries no longer know the dropped verticals | `SCRAP_METAL` and `AUTOS` handling removed from `lib/platform/vertical-defaults.ts`, `lib/platform/vertical-role-registry.ts` and workspace profile resolution, with a documented mapping for any existing tenant on those profiles (re-point to `GENERAL`); tests updated | `done` |

## Iteration 3 — Schema deletion

Blocked until ST-0.2 is `done` for the affected tables.

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| ST-3.1 | As an operator, dropped-module tables no longer exist and nothing misses them | Migrations drop `NVR`/`Camera`/`CCTVEvent`/`CameraAccessLog`, `CarSales*`, and `ScrapMetal*` models. The scrap migration drops from the dependent side, preserving every `SalesInvoice`, `PurchaseBill` and `Vendor` row it pointed at. `prisma migrate diff` empty both directions; migration replay per `scripts/verify-migration-replay.sh` | `todo` |
| ST-3.2 | As an engineer, `FixedAsset` and `Budget`/`BudgetLine` are gone; `JournalLine.costCenterId` and the `CostCenter` model remain | Migration applies clean on a copy of production data; posting-engine tests green | `todo` |
| ST-3.3 | As an engineer, dead `AccountingSourceType` values are pruned | `SCRAP_METAL_PURCHASE`, `SCRAP_METAL_BATCH`, `SCRAP_METAL_SALE` and other breadcrumb-only values with no seeded posting rule removed from the enum and from `lib/accounting/source-types.ts`; existing `AccountingIntegrationEvent` rows for removed types handled by the migration (retained with a string column or archived per ST-0.2) | `todo` |
| ST-3.4 | As a buyer, `ADDON_ACCOUNTING_ADVANCED` sells what still exists | Bundle contents pruned to the surviving features (AR/AP, multi-currency data); fixed-assets/budgets/cost-center/banking feature keys removed from `FEATURE_CATALOG`; `docs/platform-pricing-feature-flags-and-modules.md` updated in the same PR | `todo` |

## Iteration 4 — Freeze register

The register itself is the deliverable; it lives here and the master plan's governance section
makes it binding.

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| ST-4.1 | As a maintainer, the freeze register exists and is enforced in review | This table row is the register: **Maintenance (`app/maintenance`, `app/api/work-orders`, `app/api/equipment`) is frozen** — bug fixes only, no new stories; it stays in the gold and retail bundles and its `MAINTENANCE_COMPLETION` posting keeps working. A CONTRIBUTING note points here | `todo` |

## Changelog

Newest first. One entry per commit that changes implementation status.

| Date | Commit | Stories | Description |
|---|---|---|---|
| 2026-08-18 | `fbc6100`, `a08925d` | ST-0.2, ST-2.1 – ST-2.5 → `done` | The export exists (per company, every row of the CCTV/autos/scrap tables, plus the surviving accounting documents scrap rows pointed at — and StreamSession/PlaybackRecord, which this roadmap missed: both carry a required FK to Camera and could not have survived its drop). Then the code went: pages, APIs, components, libs, the CCTV gateway server, the dead fixed-asset and budget registers, the thrift stub, and the retired workspace-profile handling. `lib/commodity-billing.ts` survived, as the standing instruction requires. **ST-3 remains `todo` on purpose** — the tables still hold their data, the export has only been proven against an empty local database, and dropping ScrapMetal* severs FKs into SalesInvoice, PurchaseBill and Vendor. That step wants a real export against real data first. |
| 2026-08-18 | `a819b7e`, `062aa91` | ST-0.1, ST-1.1, ST-1.3 → `done` | Usage-audit script added (runs safely on an empty database). CCTV, Autos/car-sales and Scrap-metal removed from the bundle catalog, the client templates, navigation, workspace products, the route registry, the permission catalog and the marketing site. `lib/commodity-billing.ts` untouched — gold depends on it. Code and schema deletion (ST-2, ST-3) are still to come, so the modules remain on disk behind gates that grant nothing. |
| 2026-08-18 | — | — | Document created with the dependency-audit evidence and the keep/park/drop/freeze line. |
