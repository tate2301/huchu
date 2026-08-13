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
| S-5 nav: Range & Stock as the one door | blocked on R-4.6 |

**The stock half of the instruction is already satisfied.** "Purchasing feeds stock,
sales subtract, stock takes and stock transfers affect the stock module" is true as
of S-2, and now literally so: there is exactly one writer, `recordStockMovement`,
and every retail path calls it. What remains genuinely retail-owned is **pricing**,
which is S-3 and S-4.

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
