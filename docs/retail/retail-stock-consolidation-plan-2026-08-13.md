# Retail depends on Stores & Inventory

**Date:** 2026-08-13 · **Secondary to:** `docs/retail/retail-hardening-plan-2026-08-12.md`
**Status:** the §2b consolidation, specified.

This plan obeys the primary plan. Where the primary plan's §2b sketched a
direction, this one states the mechanism. Where the primary plan is now known to
be *wrong about the facts*, §0 says so before anything is built on top of it.

---

## 0. Two corrections, measured

Both explored by reading the repository, not remembered.

### 0.1 Retail does not own stock. It never did.

The primary plan's §2b says retail "grew its own stock and pricing surfaces …
alongside a catalogue of its own, while the core Stores module already has stock
on hand". Half of that is true.

There is **no** `RetailStockLevel`, `RetailStockCount`, `RetailStockTransfer` or
`RetailPriceList` model. On-hand quantity has only ever lived in the core
`InventoryItem.currentStock`. Every retail stock mutation — sale, refund, void,
goods receipt, stock take, transfer — already funnels through **one** function,
`recordRetailInventoryMovement` (`app/api/v2/retail/_helpers.ts:384`), which
writes a core `StockMovement` and updates the core `InventoryItem`. Half the
retail stock UI already fetches from `/api/inventory/items`,
`/api/stock-locations` and `/api/inventory/movements`.

So "two systems counting the same bottles" was not the problem. The real
divergences are narrower and sharper:

| | What is actually duplicated |
|---|---|
| **Pricing** | `RetailCatalogItem.unitPrice` / `compareAtPrice` / `taxPercent` are literal columns. Core's `PriceList` / `ProductPrice` / `Product.standardPrice` are **never referenced anywhere in retail** — verified by grep across `app/api/v2/retail`, `lib/retail`, `app/retail`, `components/retail`. |
| **Item identity** | `RetailCatalogItem` is a second item master beside core `Product`. `RetailCatalogItem.productId` exists as a column and **is never written by any code**. |
| **The movement service** | Two writers: the core one inline in `app/api/inventory/movements/route.ts` POST, and retail's `recordRetailInventoryMovement`. Retail's is strictly better — it accepts a transaction client and reserves an identifier. |

This makes the work smaller than §2b implied, and it changes its shape: the job
is to **retire a duplicate price and a duplicate item master**, and to **promote
retail's movement service into core**, not to move a stock ledger.

### 0.2 Card usage is not what it looks like

The instruction was that "card usage is still rampant across the module". The
mechanism is not the one that phrase implies, and it is worth being exact
because the fix differs.

**Zero files** under `app/retail/**` or `components/retail/**` import
`@/components/ui/card`. Not one `<Card>`, `<CardHeader>` or `<CardContent>`.
Every one of the 48 `Card` substring matches is a false positive — tender labels
(`case "CARD": return "Card"`), a `<SelectItem value="CARD">`, and the string
`"Card, mobile, transfer"`.

What is actually there is worse, and it is what the observation is picking up on:
**retail built its own parallel card primitives.**

| Primitive | Defined at | Uses |
|---|---|---|
| `KpiCard` | `app/retail/page.tsx:150` | local |
| `SectionCard` | `app/retail/page.tsx:177` | local, 9 call sites |
| `PosMetricCard` | `components/retail/portal/pos-primitives.tsx:162` | 25 call sites across 6 views |
| `PosPanel` / `PosPanelHeader` | same file | throughout the till |

So the surfaces read as card-heavy — correctly — while the grep for the
violation comes back clean. Retail also has **zero** direct `@corelithzw/react`
imports, but so does almost everything: the package is consumed through the
`components/ui/*` wrappers by 212 files repo-wide, and retail uses those
wrappers. The primary plan's R-4.1 ("Retail imports `@corelithzw/react`, as
schools and CRM do") is measuring the wrong thing — schools' 58 files are mostly
`components/ui/*` re-exports too.

**The real ticket** is: delete the bespoke card primitives, compose with the
shared ones, and honour `04-composition.md` — one body block per surface, no
card-in-card, and never a stat grid or a table wrapped in a card. That is
retitled as **S-6** below and it is a genuine, large piece of work. It is just
not the work the word "Card" would have found.

### 0.3 Four defects found while mapping

Not part of the consolidation, but they are in the blast radius and two are
demo-blocking.

1. **`TRANSFER` does not move stock.** `_helpers.ts:426-428` branches on
   `RECEIPT`, `ISSUE` and `ADJUSTMENT`. `TRANSFER` falls through all three, so
   `nextStock` is unchanged and `InventoryItem.locationId` is never touched. A
   transfer writes a movement row, posts an accounting event, and moves nothing.
2. **The purchasing orders page calls routes that do not exist.**
   `app/retail/purchasing/orders/page.tsx` fetches `/api/v2/retail/purchase-orders`
   and `/api/v2/retail/purchase-orders/{id}/receive`. The real routes are under
   `/api/v2/retail/purchasing/orders`. The screen is broken.
3. **Goods receipt is not transactional.** `purchasing/receipts/route.ts:148-215`
   creates the receipt, then N movements, then increments PO lines, then updates
   PO status — four separate awaits, no `$transaction`. A failure halfway leaves
   stock added against a receipt that says it was not.
4. **Offline sync trusts the device's price.** `pos/sync/route.ts:383` persists
   `unitPrice` verbatim with no catalogue re-check and no manager-override gate.
   The online path enforces both (`pos/sales/route.ts:467-513`). A tampered or
   stale device writes whatever price it likes.

---

## 1. The design

### 1.1 One price engine, with a retail profile

The user's decision: one engine, not two features.

Core keeps `PriceList` / `ProductPrice` as the single store of prices. It gains
what retail needs rather than retail keeping a private copy:

- **`PriceListKind.RETAIL`** — a shelf-price list, distinct from
  `STANDARD`/`WHOLESALE`/`TRADE`/`VIP`/`REGIONAL`.
- **Tax-inclusive pricing.** A Zimbabwean shelf price is what the customer pays.
  `PriceList.taxInclusive Boolean` says how `ProductPrice.unitPrice` is meant,
  and the till derives the ex-VAT line and the VAT from it rather than adding
  15% to a shelf price and printing a number nobody at the counter recognises.
- **Currency is already on `PriceList`.** A tenant runs a USD list and, when it
  wants one, a ZWG list — rather than a rate applied at the till to a USD shelf
  price, which is how you get a price that changes between the shelf and the
  slip.

**The offline constraint, and why this is not patchwork.** The schema comment at
`prisma/schema.prisma:4301` states the blocker plainly: the offline POS reads
`unitPrice`/`taxPercent` literally and "must not have to resolve a price list
with no network". That is a real constraint and it stays satisfied — by making
the till cache a **materialised projection**, not a second source of truth:

- The server resolves each sellable item's shelf price through the core resolver
  at bootstrap and ships a flat `{ productId, unitPrice, taxPercent,
  taxInclusive, currency, pricedAt, priceListId }` snapshot.
- The till reads that snapshot literally. It never resolves a price list, online
  or off. Nothing about the offline runtime gets slower or more complex.
- `pricedAt` and `priceListId` travel back with every offline sale, so **sync can
  re-validate** — closing 0.3(4) as a side effect. A sale priced off a snapshot
  the tenant has since superseded is flagged, not silently trusted.

The difference between this and patchwork is that the price has exactly one
author (the price list) and the cache is derived and stamped. Today
`RetailCatalogItem.unitPrice` *is* the author, and there is nothing to derive it
from.

**The editable table stays**, per instruction. `PriceListEntriesSheet`
(`components/inventory/price-lists-panel.tsx:409`) is the surviving editor and
gains the retail columns. `app/retail/merchandising/pricing/page.tsx` — the
screen whose design we are keeping — is what it should look like.

### 1.2 `RetailCatalogItem` retires

The user's decision: retire it, retail reads core.

`Product` becomes the single item master. Retail-only attributes move onto it
behind a retail profile — `barcode`, and the bottle-store ones that matter on
day one: `ageRestricted` (a liquor licence is not optional), `depositAmount` and
`returnable` (a scud comes back and the empty is worth money, which is ordinary
Zimbabwean bottle-store trade and currently unmodelled anywhere).

`RetailSaleLine.catalogItemId` becomes `productId`. `RetailSaleLine.inventoryItemId`
stays — it is the stock row that moved, and it is not the same thing as the
product that was sold.

**History is not rewritten.** 12,598 existing sale lines keep their
`inventoryItemId` and their `itemName`, which is what a receipt reprint needs.
The migration maps each `RetailCatalogItem` to a `Product`, repoints the lines,
and only then drops the table.

### 1.3 One movement service

`recordRetailInventoryMovement` moves to `lib/inventory/stock-movements.ts` and
loses its retail prefix. It becomes the only way any module moves stock, and
gains what it is missing:

- a `TRANSFER` branch that actually moves stock (0.3(1)),
- `sourceType` / `sourceId` **persisted on `StockMovement`**, not merely passed to
  accounting — today the movement row cannot say what caused it,
- a widened `sourceType` union so schools, gold and CRM can use it.

`app/api/inventory/movements/route.ts` POST is rewritten to call it instead of
hand-rolling the same logic worse.

### 1.4 Core money becomes Decimal — the prerequisite nobody asked for

This is the part the instruction did not anticipate and it cannot be skipped.

R-1.1 moved 29 retail columns from `Float` to `Decimal` because float money is
wrong money. Core stock and pricing are still `Float`:

| Model | Float columns |
|---|---|
| `InventoryItem` | `currentStock`, `minStock`, `maxStock`, `unitCost` |
| `StockMovement` | `quantity` |
| `Product` | `standardPrice`, `costPrice`, `defaultTaxRate`, `maxDiscountPercent` |
| `ProductPrice` | `unitPrice`, `minQuantity` |

Making retail depend on core for stock and pricing, as instructed, would route
every carefully-Decimal retail number through eleven `Float` columns and **undo
R-1.1**. So core has to meet retail's precision bar first. Same method as R-1.1:
a script that measures what would round before it casts and refuses on overflow,
plus a witness test reading `information_schema`.

### 1.5 Nav: Range & Stock is the one door

The user's decision: remove Stores & Inventory from Retail entirely.

`lib/workspaces.ts:593` already defines section `retail-range`, title
**"Range & Stock"**. It becomes the single stock entry point in a retail
workspace and hosts the core surfaces. `stores` is added to the RETAIL profile's
`nativeModules` (it is absent today, which is why Stores & Inventory only
appeared under "More"), and the Stores & Inventory section is filtered out of
the retail sidebar.

Feature keys: `stores.catalogue` and `stores.price-lists` are created — both
screens ride on `stores.inventory` today, so a tenant cannot be given price
lists without being given the whole stock module. `feature-dependencies.ts`
gains `"retail.catalog": ["retail.core", "stores.inventory"]`, which is what
"depends on Stores & Inventory" means in the entitlement layer.

**Care required, per instruction.** The two nav definitions already disagree —
`RETAIL_TABS` (`lib/retail/tab-config.ts`) has no `/retail/catalog` and no
`/retail/merchandising/pricing` entry at all, while `lib/workspaces.ts` does.
R-4.6 in the primary plan reconciles them; this plan **must not** merge Range &
Stock into a nav model that is itself two contradictory models. R-4.6 comes
first.

---

## 1.6 The POS portal — the omission in both plans

Neither this plan nor the primary one has a single ticket for the till. It is
the highest-traffic surface in the module by an order of magnitude: the
back-office screens are opened by one manager a few times a day, and the till
is used by two cashiers continuously for the whole trading day. Both plans
treated it as done because it exists and works.

**There is a build contract and we were not reading it.**
`docs/design-system/06-reference-urls.md` lists a `pos` portal prototype —
*"Cashiers, field buyers · Tablet · Sales entry, payments, receipts, till
reconciliation"* — and `docs/design-system/portals/README.md` states the rule
for this class of artefact plainly: **"every feature in a demo is required."**
The three school portals were downloaded and treated as a contract; the POS one
never was. It is now at `docs/design-system/portals/pos.html`, alongside
`docs/design-system/verticals/retail.html`.

### What the demo has that the till does not

| Demo surface | Ours | Assessment |
|---|---|---|
| Cash drop / pickup | **missing** | Not a feature gap — a **correctness** one. See below. |
| Z-report (end-of-day) | **missing** | Expected by Zimbabwean retail, and the document fiscalisation will attach to. |
| Offline queue | runtime only | The till sells offline and the cashier cannot see what is waiting to sync. |
| Audit log | **missing** | |
| Settings — till identity, currency & tax, discount limits, PINs, printer, receipt template | back office only | Reachable at `/retail/setup`, not from the till. |
| Help & keyboard shortcuts | **missing** | |
| PIN sign-in | password | The demo signs a cashier in on a 4-digit PIN. Typing a password on a tablet between customers is not a thing a queue tolerates. |

Matching screens: sell/cart, saved sales, refund, void, customers, find-an-item,
open-shift, cash-up, and the hour-by-hour / top-items / tender-mix summaries.

### Cash drop is a reconciliation defect, not a missing screen

`RetailShift` carries `openingFloat`, `expectedCash`, `countedCash` and
`variance`, and there is **no model for cash leaving the drawer mid-shift**.

A bottle store on a Friday or on the 25th takes more cash across the counter
than a drawer should hold, and the manager removes some of it to the safe. That
is ordinary practice, not an edge case. With nowhere to record it:

- `expectedCash` still counts money that is no longer in the drawer,
- `countedCash` correctly does not,
- so `variance` reads as a shortfall exactly equal to what was banked,
- and the cashier is short on paper at the end of their shift.

This is the user's own third-ranked requirement — *money is right and
reconciles at cash-up* — failing on the busiest day of the week. It is the one
POS gap that produces a **wrong number** rather than an absent feature, and it
ranks above everything else outstanding.

### Tickets

| # | Ticket | Done when |
|---|---|---|
| **S-7.1** | Cash movements | `RetailCashMovement` (shift, type, amount, currency, reason, actor). `expectedCash` accounts for drops, pickups, payouts and float top-ups. Cash-up arithmetic has a hand-worked test. Till screen. |
| **S-7.2** | Z-report | End-of-day summary per register per trading day: takings by tender, VAT, voids, refunds, discounts, cash movements, opening and closing float. Reprintable, and identical on reprint. |
| **S-7.3** | Offline queue screen | What is pending, what failed, what a superseded price did (S-3 stamps this). |
| **S-7.4** | Till settings | The setup surfaces the demo puts on the till, at the till, gated by the permissions matrix. |
| **S-7.5** | PIN sign-in | A cashier signs in on a PIN, not a password. Needs a considered auth decision — a 4-digit PIN is not a password and must not be stored or rate-limited like one. |
| **S-7.6** | Audit log, help & shortcuts | The remaining two demo surfaces. |

**Sequencing.** S-7.1 first and alone — it is the only one that makes a number
wrong. S-7.2 depends on it (a Z-report that ignores cash drops is wrong in the
same way). S-7.3 depends on S-3, which has landed. S-7.4–S-7.6 are additive.

**S-7.5 carries a real decision and should not be taken quietly.** Moving
cashier auth from password to PIN changes the credential model for the people
who handle the money. It is the right call for a tablet till in a queue, and it
is what the demo does — but it wants an explicit choice about lockout, reuse
across shifts, and whether a PIN can authorise a manager override (it must not:
the override gate exists precisely so that the person approving is not the
person ringing up).

---

## 2. Tickets

Ordered by demo risk, not by dependency elegance. The till must survive a day of
trade at a Harare bottle store; everything is ranked against that.

| # | Ticket | Done when |
|---|---|---|
| **S-0** | Fix the broken purchasing page (0.3(2)) | `app/retail/purchasing/orders/page.tsx` calls routes that exist. Demo blocker, ten minutes. |
| **S-1** | Core money → `Decimal` | 11 columns. Measure-then-cast script, witness test, refuses on overflow. §1.4. |
| **S-2** | One movement service | `lib/inventory/stock-movements.ts`. `TRANSFER` moves stock. `sourceType`/`sourceId` persisted. Goods receipt wrapped in `$transaction`. Closes 0.3(1) and 0.3(3). |
| **S-3** | Price engine | `PriceListKind.RETAIL`, `taxInclusive`, resolver used by retail, snapshot cached for the till with `pricedAt`, sync re-validates. Closes 0.3(4). §1.1. |
| **S-4** | Retire `RetailCatalogItem` | Products migrated, lines repointed, table dropped. §1.2. |
| **S-5** | Nav | R-4.6 first, then Range & Stock as the one door. §1.5. |
| **S-6** | Kill the bespoke cards | `KpiCard`, `SectionCard` deleted; surfaces composed per `04-composition.md`. §0.2. |

### Progress

| Ticket | State |
|---|---|
| S-2 one movement service | **done** — `lib/inventory/stock-movements.ts`; `TRANSFER` moves stock; receipt transactional; `sourceType`/`sourceId` persisted |
| S-1 core money → Decimal | **in flight** — scoped to the six *pricing* columns; see the scope cut below |
| S-0 broken purchasing page | in flight |
| S-6 bespoke cards | in flight |
| R-4.6 one nav (blocks S-5) | in flight |
| S-3 price engine | not started |
| S-4 retire `RetailCatalogItem` | not started |
| S-5 nav: Range & Stock as the one door | **done** — see the scope note below |

**The stock half of the instruction is already satisfied.** "Purchasing feeds stock,
sales subtract, stock takes and stock transfers affect the stock module" is true as
of S-2, and now literally so: there is exactly one writer, `recordStockMovement`,
and every retail path calls it. What remains genuinely retail-owned is **pricing**,
which is S-3 and S-4.

### What S-5 landed, and the one place it departs from §1.5

`stores` is a native module of the RETAIL profile, so Stores & Inventory no
longer renders a rail of its own in a retail workspace — its destinations arrive
inside **Range & Stock**, which is banded *What we sell* / *Stock*. Every other
profile still gets the section.

Range & Stock holds retail's range (catalog, pricing, promotions), the core
stock surfaces (stock on hand, movements, locations), and the three retail stock
screens, each kept because core has no answer for it:

| Retail screen | Why it survived |
|---|---|
| `/retail/stock` | Carries open-order and goods-received value from retail purchase orders and receipts. The core stock overview has no purchasing figures. |
| `/retail/stock/count` | Posts a counted-vs-system variance as an `ADJUSTMENT`. The Stores module offers Issue and Receive dialogs and **no adjustment surface at all**. |
| `/retail/stock/transfers` | The only `TRANSFER` surface in the product. Nothing under `/stores` posts one. |

**Transfers hides itself** below two active stock locations at one site. Derived,
not hard-coded: the sidebar reads `/api/stock-locations?active=true` and asks
whether any site has two, which is exactly the condition `recordStockMovement`
requires. Same rule as the till's site picker at one branch.

**The departure.** §1.5 reads as though Range & Stock hosts *all* the core
surfaces. `/stores/catalogue` and `/stores/price-lists` are not in it. They are a
second item master and a second price book that no retail surface reads today
(§0.1), and putting them beside retail's own Catalog and Pricing would offer the
shopkeeper a choice with no right answer. They stay entitled and remain one tab
click away inside the Stores shell. The two new keys — `stores.catalogue` and
`stores.price-lists`, both depending on `stores.inventory` — are what makes that
possible: retail *must* hold `stores.inventory` for its own stock, and until
those keys existed there was no way to hold it without the duplicate screens.
S-3 and S-4 collapse the pair, and the nav follows that rather than pre-empting
it. `/stores/dashboard` and `/stores/fuel` are also out: a third overview of rows
two other entries already open, and a mining surface the RETAIL vertical switches
off.

### Two entitlement breaks found while wiring it up

Both would have shown as dead links, which is what R-4.6 exists to prevent.

1. **The till was dark on the retail template.** `ADDON_RETAIL_SUITE` shipped
   `portal.pos` without `portal.core`, and that dependency is *restrictive* — the
   enforcer denies a feature whose dependencies are missing. Any tenant
   provisioned from `TEMPLATE_RETAIL` was entitled to the POS and refused at the
   door. The demo tenant only worked because `retail-demo-focus.ts` keeps
   `portal.core` by hand. `portal.core` is now in the suite.
2. **`ADDON_RETAIL_SUITE` did not require Stores Core.** With
   `"retail.catalog": ["retail.core", "stores.inventory"]` declared, selling the
   Retail Suite alone would have denied the catalogue. `BUNDLE_DEPENDENCIES` now
   says the suite requires `ADDON_STORES_CORE`.

`TEMPLATE_GOLD_MINE` has three of the same class of break
(`portal.schools → schools.core`, `portal.autos → autos.core`,
`portal.pos → retail.pos`). Pre-existing, out of this ticket, unfixed.

### Scope cut on S-1, and why

§1.4 lists eleven `Float` columns. Only **six** are being converted — the pricing
ones on `Product` and `ProductPrice`. The five quantity columns
(`InventoryItem.currentStock`/`minStock`/`maxStock`/`unitCost`,
`StockMovement.quantity`) are deferred.

Measured, not guessed: `currentStock` is referenced in **38 files** and `unitCost`
in **28**, spanning gold, schools, the executive dashboard and operations search.
`standardPrice` is in 8 and the price-list columns in 6. Taking a 38-file cascade
across four other modules the day before a client demo buys nothing for this
demo — bottle-store quantities are whole bottles and whole cases — while risking
a regression in modules that are not being tested this week.

The deferred five are a named ticket, not an oversight. They must land before any
module starts doing money arithmetic on `unitCost`, because that column *is* money
and it is what feeds `costUnit` and therefore every margin figure retail reports.

### Found while doing the above

- **`vitest.config.ts` excluded the wrong worktree path.** `.worktrees/**` matched
  nothing; agent worktrees live under `.claude/worktrees/`. Every worktree's copy of
  every test was collected alongside the real one — and because a copy is a
  *snapshot*, a test just fixed keeps failing from a stale checkout while naming the
  right filename at a path nobody reads closely. It cost one wrong diagnosis: a
  `search.test.ts` failure recorded as a transient Neon blip was a pre-fix copy.
  10 collected files down to 6.
- **Refunds and voids carried no currency.** They took the column defaults — USD at
  rate 1, `baseAmount` zero — so a ZWG sale handed back changed currency on the way
  out and contributed nothing to the day's base-currency takings. Sale and reversal
  could balance on the receipt and still not net off in the ledger.
- **The guard-coverage test passed while lying.** Gating six reads with
  `requireRetailPermission` left it green, because that name was not in
  `GUARD_MARKERS` — so the handlers still counted as ungated and the allowlist still
  matched exactly. A test that goes green because it cannot see the change is worse
  than one that goes red.
- **The demo tenant has one stock location.** `SHOP`, at Harare Main Branch. With
  on-hand held per site, a transfer has nowhere to go, so the transfers surface
  should be hidden below two locations — the same rule as the site picker.

**Sequencing.** S-0 stands alone. S-1 blocks S-3 and S-4 (both write money into
core columns). S-2 is independent of the pricing work and can run beside it. S-5
depends on R-4.6 from the primary plan. S-6 depends on nothing and is the most
visible.

## 3. Risk posture

The user chose to **ship the redesign outright** — no per-tenant switch, no
fallback to the old path — over the recommendation to keep one. That decision is
recorded here because it changes what "done" has to mean: with nothing to fall
back to at the shop, each ticket carries its own test coverage before the next
one starts, and the seed is re-run and the till exercised end to end after every
schema change. Heavier verification is the compensation for having no switch.

## 4. Explicitly not in this plan

- **ZIMRA fiscalisation** — still out of scope, per the primary plan §5.
- **Weighted-average costing.** Goods receipt overwrites `InventoryItem.unitCost`
  wholesale (`_helpers.ts:464`). Real, and a different ticket.
- **Location-level quantity.** `InventoryItem` holds one on-hand figure per
  (site, itemCode); there is no per-location or per-bin quantity, which is why
  `TRANSFER` had nowhere to move stock *to* even before 0.3(1). A bottle store
  with one shop does not need it. A second branch would.
