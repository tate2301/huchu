# Hardening Retail to the schools standard

**Date:** 2026-08-12 · **Base:** `main` @ `86df20b0` · **Method:** `docs/system-reference/building-a-vertical.md`

This plan applies the vertical-building method to Retail. Everything in §1 was read
off the repository at the commit above and the numbers were counted, not estimated.
Where this contradicts `building-a-vertical.md` §4, the contradiction is stated
plainly in §2 rather than smoothed over.

---

## 1. Verified state

### 1.1 What is genuinely there

Retail is not a blank page, and the method doc is right about that. It has 34 route
files under `app/api/v2/retail` plus `/api/v2/pos`, 27 screen files across 16
directories, a POS portal with a real offline runtime (`lib/retail/offline-*.ts`,
`pos-offline-queue.ts`), accounting postings on sales/refunds/voids/shifts, a
global-search arm, and feature keys wired through the route registry for both page
and api scopes.

### 1.2 Measured against the other verticals

| | Retail | Schools | CRM |
|---|---|---|---|
| API route files | 34 | 156 | 96 |
| `lib/<module>/` files | 20 | 69 | 96 |
| Test files | **1** | 34 | 47 |
| Prisma enums | **0** | 30 | 31 |
| `Float` columns | **29** | 2 | 22 |
| Design-system (`@corelithzw/react`) files | **0** | 58 | 65 |
| `[id]` detail routes | **0** | 9 | 10 |
| Mobile-aware files | 1 | 24 | 3 |
| `provision.ts` | **none** | ✅ | — |
| Demo seed | **none** | ✅ | — |
| Screenshot spec | **none** | ✅ (24 e2e specs, 0 touch retail) | — |

### 1.3 Guards — the doc's numbers are correct

Audited with the canonical five gate names (`requireRetailManager`,
`requireRetailStock`, `requireRetailPos`, `canManageRetailTransactions`,
`canAccessPosPortal`):

**25 of 34 route files guarded.** The nine that are not are exactly the nine the doc
lists, and every one of them exports **`GET` only** — verified per file. No unguarded
writes. This is a real gate layer in an unusual shape, not a missing one.

### 1.4 Schema, measured against §1a of the method

| Model | own `companyId` | `Float` cols | `String` status | `Company` relation |
|---|---|---|---|---|
| RetailRegister | yes | 0 | 0 | **no** |
| RetailCatalogItem | yes | 3 | 2 | **no** |
| RetailPromotion | yes | 1 | 2 | **no** |
| RetailPurchaseOrder | yes | 0 | 1 | **no** |
| RetailPurchaseOrderLine | **no** | 4 | 0 | **no** |
| RetailGoodsReceipt | yes | 0 | 1 | **no** |
| RetailGoodsReceiptLine | **no** | 3 | 0 | **no** |
| RetailShift | yes | 4 | 1 | **no** |
| RetailHeldCart | yes | 0 | 1 | **no** |
| RetailSale | yes | 6 | 2 | **no** |
| RetailSaleLine | **no** | 7 | 0 | **no** |
| RetailSalePayment | **no** | 1 | 1 | **no** |

Four of twelve models carry no `companyId` of their own, and they are precisely the
four that hold the money and the cost. All four are reached by direct queries today
(`app/api/v2/retail/pos/sales/[id]/route.ts:67`,
`purchasing/orders/[id]/route.ts:94`, `purchasing/receipts/route.ts:191,202`), which
is the condition §1a names: *if a table can be reached by a query, it carries its own
`companyId`*.

No model has a `Company` relation, so there is no cascade and no referential
integrity on `siteId`, `cashierId` or `inventoryItemId`. This is also why the read
paths hand-roll their joins — `catalog/route.ts` fetches items, then fetches
inventory items and sites by id list and stitches them with `Map`s, where a relation
would be one `include`.

### 1.5 There is no currency in Retail

`RetailSale` has no `currency`, no `exchangeRate`, no `baseAmount`.
`RetailSalePayment` has no `currency`. `lib/retail/tender-policy.ts` and
`lib/retail/checkout.ts` contain no currency handling at all.

`normalizeRetailPostingPayments` in `app/api/v2/retail/_helpers.ts:91` *accepts* a
`currency` per payment and carries it through the normaliser — and it is then
dropped on the floor, because there is no column to write it to. A till that takes
USD and ZWG records both as bare numbers in one pool.

Money arithmetic throughout is `number` with `Number(value.toFixed(2))`
(`_helpers.ts:81`) — the epsilon-rounding pattern `lib/money.ts` was written to
replace.

### 1.6 Other findings

- **Unbounded query.** `app/api/v2/retail/catalog/route.ts:58` runs
  `retailCatalogItem.findMany` with no `take`. Others are hard-capped with no
  pagination: customers `take: 2_500`, shifts `take: 100`.
- **One unscoped query.** `pos/sales/[id]/route.ts:30` fetches `sourceSale` by
  `findUnique({ where: { id } })` with no `companyId`. Every sibling query in the
  same `Promise.all` is scoped. Not reachable by an attacker today because
  `sourceSaleId` is set internally, but it is the exact hole a relation would close.
- **Two competing nav definitions.** `lib/navigation.ts:353` renders `RETAIL_TABS`
  from `lib/retail/tab-config.ts`, whose ten hrefs are all *alias* paths
  (`/retail/sell`, `/retail/buy`, `/retail/merchandise`, `/retail/insights`,
  `/retail/cash-control`). `lib/workspaces.ts:193` builds a second, different list
  that gates on those alias paths but pushes the *real* ones (`/retail/sales`,
  `/retail/catalog`, `/retail/purchasing/orders`, `/retail/reports`).
- **Seven alias routes exist only as feature-gate keys.** `sell`, `buy`,
  `merchandise`, `insights`, `cash-control`, `pos`, `accounting` are five-line
  `redirect()` files. AGENTS.md: *remove obsolete paths instead of adding
  compatibility layers*. Untangling them means moving the registry keys and the
  `has()` checks onto the real paths first.
- **`RetailShell` is a heading wrapper**, 21 lines, and does not consume
  `RETAIL_TABS`. Gold, Payroll, People and Accounting all have a shell that does.
- **No empty/loading/error states** on `reports` (440 lines), `setup` (271) and
  `setup/branding` (262). Design-system invariant 8 requires all three.
- **Fat client pages.** Every retail page is `"use client"` and does its own
  fetching: catalog 621 lines, shifts 526, sales 510, overview 508, reports 440.
  Schools pages are thin server components that compose from `components/schools/`.
- **Lint:** 10 errors, 32 warnings across `app/retail`, `components/retail`,
  `lib/retail`, `app/api/v2/retail`.
- **Zero audit events.** No retail route writes `PlatformAuditEvent`. Shift close and
  refund are money-moving and unaudited.
- **Fiscalisation is configured but never performed.** `lib/retail/pos-policy.ts`,
  `setup-profile.ts` and `setup-snapshot.ts` read and write
  `FiscalisationProviderConfig`, using it as a settings bag. No retail sale is ever
  fiscalised. See §5.

`npx tsc --noEmit` is clean (after `prisma generate` — the checked-in client was
stale and OOM'd the default heap; use `NODE_OPTIONS=--max-old-space-size=8192`).

---

## 2. Two corrections to `building-a-vertical.md` §4

**§4's table marks Retail's schema ✅. By §1a's own rules it is not.** §1a requires
`Decimal` not `Float`, enums not `String` statuses, and `companyId` on the row for
anything a query can reach. Retail has 29 `Float` columns, zero enums against 11
`String` status columns, and four money-bearing tables with no `companyId`. It is the
only module in the repo with no enums at all — ScrapMetal and CarSales both have
them. This is the largest piece of work in the plan and §4 currently reads as though
it were done.

**§4 says "no tenant in the dev database has retail on".** Not in this database.
Five tenants have all seven `retail.*` keys enabled — Spar, ACME Inc, Chop Chop,
Hurudza Creative, and one called Retail — holding 11 sales, 8 shifts, 3 registers and
3 catalogue items. This matters for sequencing: **screenshots are possible now**, so
the baseline can be photographed before any code changes rather than waiting on the
seed. The data is too thin to show real shape, which is what §5's seed is for, but it
is not zero.

§4 is right about the guards, right that there is no provisioning, no seed and no
screenshots, and right about the order of work. The plan below follows it.

---

## 2a. Progress

| Ticket | State |
|---|---|
| R-0.1 guard coverage | **done** — `lib/retail/route-guard-coverage.test.ts`, 77 assertions |
| R-0.2 lint | **done** — 42 problems to zero |
| R-0.3 tenant scoping | **done** — three unscoped queries closed |
| R-0.4 baseline screenshots | **superseded** — R-6.1's `e2e/retail-shots.spec.ts` photographs 17 retail and 12 POS screens at three viewports, which is what this ticket wanted and more of it |
| R-1.2 enums | **done** — 11 columns, 2 bugs found, witness test at `lib/retail/schema-migration.test.ts` |
| R-1.1 money → Decimal | **done** — 29 columns, 120 call sites, epsilon comparison retired |
| R-1.5 currency | **done** — `currency`/`exchangeRate`/`baseAmount` on sale and payment; `scripts/retail-currency-columns.ts` applied |
| Sites optional | **done** — `resolveRetailSite`, seven routes, both shift dialogs |
| R-5.2 seed | **done** — `scripts/seed-retail-demo.ts`: a bottle store, 180 days, 5,044 sales, four staff |
| Workspace focus | **done** — `scripts/retail-demo-focus.ts` narrows a tenant to retail |
| Offline till | **done** — `retail-pos` was never warmed by anybody; `lib/offline/workflow-catalog.test.ts` pins it |
| R-1.3 `companyId` on line tables | **done** — 4 tables, backfilled from parent, indexed; `scripts/retail-line-company-id.ts` |
| R-2.1/R-2.2 permissions matrix | **done** — `lib/retail/permissions.ts` + 42 tests, 1,771 decisions swept |
| R-4.6 one nav | **done** — `RETAIL_TABS` deleted, the items live on the real paths in `lib/navigation.ts`, eight alias routes removed |
| R-1.4 FK relations | **done** — 46 constraints across the twelve models, applied by `scripts/retail-foreign-keys.ts`. This row said "not started, deferred behind S-4" long after the constraints were in the database; the entry was stale, not the work |
| R-2.3/R-2.4 wiring | **done** — the sixteen ungated reads are each decided, the five role-set gates are deleted, and `UNGATED_READS` is empty and asserted empty |
| R-3.1 zod | **done** — `lib/retail/request.ts`; every input a retail route accepts is parsed by a schema, path ids included |
| R-3.2 pagination | **done** — sales and shifts page by cursor, customers by offset over its aggregate, the back-office catalogue is bounded at all |
| R-3.3 audit events | **done** — `lib/retail/audit.ts`, seven event types written inside the transaction that performs the act; cash-up also writes the `ApprovalAction` triple under a new `RETAIL_SHIFT` target |
| R-4.3 detail routes | **done** — sales, shifts, purchase orders and catalogue items each have an address |
| R-4.4 empty/loading/error | **done** — four list surfaces were folding loading into `emptyState` and had no error branch, so a 500 rendered as "No orders" |
| R-4.7 `RetailShell` earns its name | **done** — a section rail derived from `lib/navigation.ts`, not a second nav |
| R-5.1 provisioning | **done** — `lib/retail/provision.ts`; a retail template used to hand over a tenant with no site and no register, so the first drawer of the first morning failed with *Invalid site* |
| R-4.5 mobile | **partly** — the three lists a shopkeeper opens on a phone become cards; the other nine tables do not. See below |
| R-6.2 composition audit | **partly** — the state surfaces and the action budget are now asserted in `lib/retail/areas.test.ts`; a card-in-card sweep of all 16 directories is not |
| Stock/pricing into core | **done** — see `retail-stock-consolidation-plan-2026-08-13.md` |

### What is left

Four tickets and a structural one, named rather than implied.

**R-4.2, thinning the pages.** Nine `page.tsx` files are over 400 lines, the
largest 715. The ticket asks for each to become a server component composing
from `components/retail/<area>/`. Nothing has been extracted; the detail routes
added in R-4.3 pulled one shared body out (`components/retail/sale-detail.tsx`)
and that is the only piece so far. This is a refactor with no user-visible
change and real regression risk, and it should be done deliberately rather than
at the end of a long session.

**R-4.5, the other nine tables.** `DataTable` has taken a `mobileCardRenderer`
all along and twelve screens elsewhere use it; retail used it nowhere.
`stock`, `catalog` and `customers` have cards now — the three a shopkeeper
opens on a phone. The rest (pricing, promotions, purchasing ×2, stock count,
stock transfers, sales, shifts, and the five report tables) still fall back to
a horizontally scrolling table below `md`.

**R-6.2, the composition sweep.** The mechanical half is pinned: every list
surface has its four states, and no page declares more than three header
actions. Reading all 16 screen directories against `04-composition.md` by eye —
card-in-card, one body block, a stat grid that should not be in a card — is a
design review and has not been done.

**Fiscalisation.** Still out of scope, still the thing that decides whether
"production ready" is true for a Zimbabwean shop. §5 below has not changed.

### The migration history and the retail scripts have drifted apart

Found on 2026-08-20 while clearing an orphan that was blocking `migrate deploy`,
and worth writing down because it is structural rather than a one-off.

Retail's schema changes ship as idempotent scripts under `scripts/` — R-1.1
money, R-1.2 enums, R-1.3 `companyId`, R-1.5 currency, S-1 quantities, S-4's
drop, R-3.3's enum label, `clientRef`. That convention exists for a good reason:
`prisma db push` cannot reach this database (P1001 — only a Neon pooler host is
configured), and a measure-then-cast script refuses on overflow where a push
would fail halfway.

The cost is that **`prisma/migrations/` does not describe the retail schema**.
`clientRef` and its unique index are in the database and in
`prisma/schema.prisma`, and in no migration; the same is true of every column
those scripts touched. On this database that is invisible, because the scripts
have run. On a database built from `migrate deploy` alone it is not: the schema
Prisma produces would be missing them, and the till would fail on its first sale.

Two ways out, and they are a real choice rather than a formality:

1. **One catch-up migration** that reproduces what the scripts applied, guarded
   with `IF NOT EXISTS` so it is a no-op here and correct on a fresh database.
   Cheap to write, and it puts the schema back under one mechanism.
2. **Keep the scripts as the mechanism** and say so — a documented bootstrap
   order, `migrate deploy` then the retail scripts in sequence. Honest, but it
   means every new environment needs a runbook rather than one command.

Nobody has decided. Until somebody does, a fresh environment needs the scripts
run by hand after `migrate deploy`, and that is not written down anywhere a
person setting one up would look.

**`RetailSale.clientOperationId` is dead and still there.** An abandoned first
attempt at the idempotency key `clientRef` now provides — not in
`prisma/schema.prisma`, so Prisma cannot write it, and null on all 5,102 sale
rows. It carries a unique index on `(companyId, clientOperationId)`. Dropping it
is safe and is one small migration; it is listed here rather than done because
the drift above should be settled first, and the column costs nothing while it
waits. See `prisma/migrations/20260818090000_retail_sale_client_operation_id/README.md`
for how it got there.

### Two defects the phone found

Both were invisible on a laptop, which is the argument for R-4.5 rather than a
footnote to it.

1. **`Decimal <= Decimal` is a string comparison.** S-1 moved
   `InventoryItem.currentStock` and `minStock` off `Float`, and four low-stock
   filters written as `currentStock <= minStock` silently became lexicographic
   — `"14" <= "6"` is true. TypeScript permits it between two values of the
   same object type while *rejecting* `Decimal <= number`, which is the form
   that works: the compiler refuses the safe comparison and waves through the
   broken one. Found by reading a card that said "Amarula Cream · 14.00 bottle ·
   6.00 bottle · −8.00 bottle short". `atMost`/`atLeast` in `lib/money.ts`, and
   `lib/money.test.ts` pins the trap by asserting the wrong answer too.
2. **The provisioning test was littering the shared database.** Its teardown was
   `company.delete(...).catch(() => {})`, and R-1.4's `Site → Restrict` made
   that delete fail every time. Forty tenants accumulated in an afternoon, the
   ranged set went from thirty to eighty, and
   `shelf-price-integrity.test.ts` began failing with *timeout exceeded when
   trying to connect* — an error about the network caused by a swallowed
   `catch`. Cleaned up by `scripts/clean-provision-test-tenants.ts`; the
   teardown now unwinds in order and throws if a tenant survives.

### Found while doing the above

Four bugs that the demo data surfaced and three notes worth keeping:

- **Aliased feature keys resolved by row order.** `normalizeFeatureKey` folds
  `thrift.core` onto `retail.core`; `getCompanyFeatureMap` wrote whichever row Prisma
  returned last. Disabling the four `thrift.*` keys took four `retail.*` capabilities
  with them while every retail flag still read `true`. Fixed with an explicit
  precedence rule. **A data migration is still owed** — merge the duplicate legacy
  rows and drop the aliases; there is a `TODO` on the code.
- **The POS offline runtime never ran.** `retail-pos` is a fully specified offline
  module and no workflow-catalogue entry named it, so `resolveOfflineWorkflowCatalog`
  returned `false` for it — for every tenant, since the module was written. A till
  that cannot sell when the line drops is not a till. Three scrap modules are still
  orphaned the same way and are pinned in a test rather than quietly fixed.
- **Duplicate React keys in the charts** when a day had two shifts.
- **`baseAmount` would have defaulted to zero** on every sale the till took, so a
  day's takings would have read as nothing. Stated at posting now.
- **Entitlement changes need a fresh sign-in.** The sidebar is built from the
  session JWT, so a tenant narrowed to retail keeps showing Gold and Schools until
  the user signs out and in. Worth knowing before the demo, not a bug.
- **Dev-mode page loads are 4–10s** against the pooled Neon endpoint. Much of that
  is dev compilation; it should be measured against a production build before
  anybody concludes anything about the till's speed.
- **`prisma db push` cannot run in this environment** (P1001, pooler-only host), so
  every schema change ships as a script under `scripts/`.

**R-1.1 notes.** `scripts/retail-money-decimal.ts` measures before it casts: it reports
how many values each column would round and by how much, and refuses outright on an
overflow. On this database nothing rounded. The 120 typecheck errors that followed were
worked through with `lib/money.ts`, and three things came out of it beyond the type
change:

- **The epsilon fudge is gone.** The refund path compared payments to the refund value
  with `Math.abs(a - b) > 0.01` — a refund could be a cent away from the money actually
  handed back, every time, and be called balanced. It is now exact equality.
- **A comparison that could never be true.** `variance !== 0` on what is now a `Decimal`
  is an object-to-number comparison; TypeScript flagged it as having no overlap. In
  float form it worked, but it is the same shape as the `(shift.variance ?? 0) !== 0`
  in the accounting replay, which the compiler also caught.
- **Three duplicated derivations collapsed.** The posting lines and their `totalCost`
  were each walked separately, re-deriving unit cost from a fallback map — two chances
  for a total to stop matching the lines it totals. Now derived once.

`checkout.ts` deliberately stays in `number`: it is shared with the offline till, which
stores plain JSON, and moving it means shipping decimal.js into that bundle and
reworking the offline store. Its own ticket.

**A helper I wrote and deleted.** I built `lib/retail/serialise.ts` to stop `Decimal`
reaching the client as a JSON string — a real hazard, since `Decimal.toJSON()` returns
a string and every retail screen reads numbers. It was redundant: `successResponse`
already calls `lib/serialize-decimals.ts`, and all 33 retail routes go through it. The
wire contract was never at risk.

**The guard audit was wrong, including mine.** Counting *files* gave 9 ungated routes;
counting *handlers* gives 22. `purchasing/orders/route.ts` names `requireRetailStock`
in its `POST` and has no gate on its `GET`, and it also imported
`requireRetailManager` without ever calling it — a dead import was enough to make the
file look covered. The sharper statement: **every write is gated (26 of 26), and 22 of
24 reads are not.** Only `pos/context` and `shifts/context` check a role before
answering. The coverage test now works per handler and refuses an allowlist entry that
is not a `GET`.

**Two bugs the `String` columns were hiding**, both caught by the enum conversion and
both pinned by the witness test:

- `pos/sync/route.ts` wrote `"RELEASED"` to `RetailHeldCart.status` — a value found
  nowhere else in the codebase. It survived because the list query filters on `HELD`,
  so an unrecognised value hides the row and reads as success. It is a real terminal
  state (the offline runtime's discard path, which has no online equivalent) and is now
  a named enum value rather than a typo.
- The trading dashboard filtered purchase orders on `["DRAFT", "APPROVED", "PARTIAL"]`.
  Nothing has ever written `APPROVED`.

Both were found by the compiler the moment the vocabulary became a type. My own first
harvest of the vocabulary missed `RELEASED` because I grepped for values I expected
rather than extracting every literal assigned to those columns.

## 2b. Revision — 2026-08-13

Three changes of direction, and a hard deadline the plan did not have when it was
written. They reorder everything below.

### The deadline is a liquor store

The module is being demonstrated to a bottle-store client and then run for a **full
working day, in their shop, by their staff**. That makes the ranking:

1. the till survives a day of real trade,
2. cashiers can do their job and cannot do the manager's,
3. money is right and reconciles at cash-up,
4. the screens look finished.

Decisions are made for the Zimbabwean market without asking: **USD is the pricing
currency with ZWG taken alongside it**, **EcoCash sits beside cash and card as a
first-class tender**, and shelf prices carry **15% VAT**. Demo data reads like a
bottle store — beers, spirits, ciders, singles and cases — not a generic shop.

### Retail stops owning stock and pricing

Retail grew its own stock and pricing surfaces (`/retail/stock`,
`/retail/stock/count`, `/retail/stock/transfers`, `/retail/merchandising/pricing`)
alongside a catalogue of its own, while the core Stores module already has stock on
hand, locations, movements, a catalogue and price lists. Two systems counting the
same bottles is one too many.

**The capability moves into the core stock module** and is exposed to retail through
feature keys, so a retail workspace sees it and a workspace without retail does not.
Retail keeps the surfaces that are genuinely retail — the till, shifts, promotions,
purchasing — and stops keeping a second stock ledger.

**The editable pricing table design stays.** It is the good part of
`/retail/merchandising/pricing` and the reason to move the function rather than
delete it; it becomes how price lists are edited in core, for every module.

### Sites are optional

A single-site workspace must not be asked which branch it means. Site pickers
disappear when a tenant has one site, and a site is resolved rather than demanded.
This is not cosmetic: a bottle store has one shop, and the shift dialog currently
cannot be submitted without choosing a branch from a list of one. It is also the
trap the method doc names — *do not gate a lookup on a narrowing field* — which
already cost the crew query on People.

### Consequences for the phases below

- **R-1.3/R-1.4/R-1.5 stand**, and R-1.5 (currency) is promoted: dual currency is
  the difference between a usable till in Harare and a demo.
- **Phase 2 (permissions) is promoted** above the UI work. Their staff use this, and
  a cashier who can reach cost price or the trading dashboard is a problem on day
  one, not a tidiness issue.
- **Phase 4 gains the consolidation** above, and loses the retail stock screens it
  was going to restyle.
- **A liquor-store seed replaces the generic one**, and provisioning (R-5.1) has to
  produce a shop that can trade on its first morning.

## 2c. Revision — 2026-08-13, second pass

**The consolidation is specified in
`docs/retail/retail-stock-consolidation-plan-2026-08-13.md`.** That document is
secondary to this one and obeys it. Read it before touching stock or pricing.

Two things this plan asserts are **wrong**, established by reading the repo. The
secondary plan's §0 carries the measurements; the corrections are recorded here
so nobody builds on the wrong statement:

- **§2b's "two systems counting the same bottles" is false.** Retail has never
  owned a stock quantity. `InventoryItem.currentStock` has always been the only
  on-hand figure, and every retail mutation already goes through one function
  that writes core rows. What is genuinely duplicated is **pricing**
  (`RetailCatalogItem.unitPrice`/`taxPercent` versus core `PriceList`, which
  retail never once references) and **item identity** (`RetailCatalogItem`
  beside core `Product`, whose `productId` link exists as a column and is never
  written). The work is smaller than §2b implied and differently shaped.
- **R-4.1's premise is wrong.** "Retail imports `@corelithzw/react`, as schools
  and CRM do — zero files today" measures nothing: the package is consumed
  through `components/ui/*` wrappers by 212 files repo-wide, and schools' 58 are
  mostly those same wrappers. Retail's actual design-system defect is that it
  built **parallel card primitives** — `KpiCard`, `SectionCard`, `PosMetricCard`,
  `PosPanel` — instead of composing with the shared ones. There is not one
  `<Card>` in retail. R-4.1 is superseded by **S-6**.

Four defects found while mapping, two of them demo-blocking: `TRANSFER` writes a
movement and moves no stock; the purchasing orders page calls routes that do not
exist; goods receipt is four writes with no transaction; offline sync persists
the device's price with no re-check and no manager gate. All four are tickets in
the secondary plan.

**The decision on risk posture was the user's and it went against the
recommendation:** ship the redesign outright, with no per-tenant switch and no
fallback to the old path. The compensation is heavier per-ticket verification.

---

## 3. Plan

Screenshots after every phase, against the `spar` tenant, per the standing
instruction. Phase 0 photographs the baseline first so every later set has something
to be compared against.

### Phase 0 — Pin what exists

No visible change. This phase exists so the later phases cannot quietly regress.

| # | Ticket | Done when |
|---|---|---|
| R-0.1 | `lib/retail/route-guard-coverage.test.ts` | Canonical gate-name list lives in the test. Asserts file count > 30 so it cannot pass vacuously. The nine reads are an explicit allowlist with a one-line reason each, so the list shrinks deliberately. Break one guard on purpose and watch it go red before committing. |
| R-0.2 | Clear lint | 0 errors, 0 warnings on the four retail paths. |
| R-0.3 | Scope the `sourceSale` query | `pos/sales/[id]/route.ts:30` filters on `companyId`. |
| R-0.4 | Baseline screenshots | Every retail surface photographed at desktop and mobile, against `spar`. |

### Phase 1 — Schema

The biggest phase, and first because every layer above it changes shape. `Decimal`
crosses JSON as a string, so this forces edits in the API and UI layers anyway —
doing the design-system migration first would mean touching those files twice.

`prisma db push` will not cast text to an enum and will not add a required column to
a populated table. Each of these is a script under `pnpm db:migrate:data`, with a
witness test that reads `information_schema` rather than the schema file.

| # | Ticket | Done when |
|---|---|---|
| R-1.1 | Money `Float` → `Decimal` | 29 columns: amounts `Decimal(14,2)`, quantities and rates `Decimal(12,4)`, tax percent `Decimal(5,2)`. All arithmetic through `lib/money.ts`. `Number(v.toFixed(2))` deleted from `_helpers.ts`. Witness test + a hand-worked receipt test in the shape of `lib/schools/fee-money.test.ts`. |
| R-1.2 | Statuses → enums | 11 columns across 9 models. Normalise script first, then push. Enums that audit rows hold may gain values and must never lose one. |
| R-1.3 | `companyId` on the four line tables | Added, backfilled from parent, indexed. |
| R-1.4 | FK relations | `Company`, `Site`, `User`, `InventoryItem` relations across all 12 models with explicit `onDelete`. The hand-rolled `Map` joins in `catalog/route.ts` and friends collapse into `include`. |
| R-1.5 | Currency | `currency`, `exchangeRate Decimal(12,4)`, `baseAmount Decimal(14,2)` on `RetailSale`; `currency` on `RetailSalePayment`. Wired through `resolveExchangeRate`/`toBaseAmount` from `lib/money.ts`. The value `normalizeRetailPostingPayments` already carries stops being dropped. |

### Phase 2 — Permissions

Per §4's recommended order, and it depends on nothing in Phase 1, so it can run in
parallel if there is a second pair of hands.

| # | Ticket | Done when |
|---|---|---|
| R-2.1 | `lib/retail/permissions.ts` | Resource × action × role matrix, default deny. Resources: `retail.sell`, `retail.catalog`, `retail.purchasing`, `retail.stock`, `retail.cash-control`, `retail.reports`, `retail.setup`. `retailPermissionDenial` returns a message when refused, null when allowed — the HR shape, because these routes return through `errorResponse` and a throw would surface as a 500. |
| R-2.2 | `permissions.test.ts` | Asserts the negatives. A cashier reaches neither purchasing nor cash control nor cost price. |
| R-2.3 | Decide the nine reads | Each one granted in the matrix or gated, individually. `pos/catalog` open to a cashier is correct; `setup/overview` and the trading dashboard at `retail/route.ts` probably are not. |
| R-2.4 | Collapse the five gates | The five names express themselves in terms of the matrix; duplicates deleted. R-0.1's allowlist reaches zero. |

### Phase 3 — API

| # | Ticket | Done when |
|---|---|---|
| R-3.1 | Zod on the remaining 13 routes | 22 of 35 have it today. |
| R-3.2 | Pagination | Catalog is bounded (it is unbounded today). Customers, shifts and sales take page/cursor params rather than a hard cap. |
| R-3.3 | Audit events | Sale, refund, void, shift close and goods receipt write `PlatformAuditEvent`. Cash-control gets the `ApprovalAction` triple — it is the retail payroll run. |

### Phase 4 — Screens on the design system

The phase the user will actually see. `docs/design-system/04-composition.md` is the
contract; `08-cookbook-patterns.md` carries the table and dashboard recipes.

| # | Ticket | Done when |
|---|---|---|
| R-4.1 | Corelith migration | Retail imports `@corelithzw/react`, as schools and CRM do. Zero files today. |
| R-4.2 | Thin the pages | Each `page.tsx` is a server component that composes from `components/retail/<area>/`. The five pages over 400 lines come down first. |
| R-4.3 | Detail routes | `/retail/sales/[id]`, `/retail/shifts/[id]`, `/retail/purchasing/orders/[id]`, `/retail/catalog/[id]`. Retail has none; a posted sale cannot currently be opened. |
| R-4.4 | Empty, loading, error | On every data surface. `reports`, `setup` and `setup/branding` have none. |
| R-4.5 | Mobile | Table → cards per the playbook. |
| R-4.6 | One nav | `RETAIL_TABS` and `lib/workspaces.ts` reconciled to one definition on real paths. Registry keys and `has()` checks moved off the aliases, then the seven alias routes deleted. |
| R-4.7 | `RetailShell` earns its name | Tab rail, like `GoldShell` and `PayrollShell`. At most two visible actions. |

### Phase 5 — Provisioning and seed

| # | Ticket | Done when |
|---|---|---|
| R-5.1 | `lib/retail/provision.ts` | Idempotent by code. Creates the smallest set that lets a shop trade on its first morning: a site, a register, a tender policy, a starter catalogue. A shop with no register cannot take a sale. |
| R-5.2 | `scripts/seed-retail-demo.ts` | A shift open, a held cart, a posted sale, a refund against it, a live promotion, a part-received purchase order — and deliberately broken rows so the blocker paths render. Seed the unhappy row on purpose. |

### Phase 6 — Photograph it

| # | Ticket | Done when |
|---|---|---|
| R-6.1 | `e2e/retail-shots.spec.ts` | Modelled on `hr-payroll-shots.spec.ts`: `SCREENS` array, viewport legs, `SHOT_ONLY` filter, and the check that fails a screen photographing its own error banner. |
| R-6.2 | Composition audit | All 16 screen directories against `04-composition.md`. One body block each, forms in dialogs, no card-in-card. |

---

## 4. Sequencing

```
Phase 0 ──┬── Phase 1 (schema) ──┬── Phase 3 (api) ──┐
          │                      │                   ├── Phase 4 (screens) ── Phase 6
          └── Phase 2 (perms) ───┘                   │
                                  Phase 5 (seed) ────┘
```

Phase 2 is independent of Phase 1. Phase 5 needs Phase 1's shape but not Phase 4's
screens, so the seed can be written while the UI work is in flight — and it should
be, because Phase 4 is much easier to judge against a tenant with real shape in it.

---

## 5. Named out of scope

**Fiscalisation.** `docs/accounting/zimra-fiscalisation.md` and
`lib/accounting/fiscalisation.ts` exist, and retail already reads and writes
`FiscalisationProviderConfig` — but only as a settings bag for POS policy. No retail
sale is ever submitted to a fiscal device. A Zimbabwean retail receipt has statutory
obligations a school invoice does not, so "production ready" may not be true without
this. It is a product decision and a phase of its own; it is not folded into the
plan above.

**CRM's 22 `Float` columns.** Same class of defect as R-1.1, different module.
Recorded here only so it is not lost.
