# 30 · Stock — build spec

Area: **03 Stock** (canvas page `stock`, 16 boards, plus `StockFlow`, `ProductNewStock`, `IntakeNew` and the stock parts of
`Product` that the stock boards open from). Workflows W-21 to W-28. Canvas: Corelith data tables, version 32. Board images:
`scratchpad/shots-v32/<Board>.png` (1440 wide; `CountPhone.png` is 390 wide). Unit ids STK-01 … STK-09. Migration slot
`20261004133000` onwards (`2026100413MMSS`).

The handover brief's rules apply (scratchpad `handover-brief.md`): the canvas chooses the direction; every value is real data from
Postgres; every button works server-side; roles are enforced on the server; no backward compatibility.

Workflow map lede, quoted because every rule below follows from it: "Stock belongs to a site, and a shop with one site never sees the
word. Locations inside a site are optional. Every change is a movement with a reason, so the balance always has a story."

Foundations this area builds on, written in `00-foundations.md` and **not** re-specified here:

| Alias | Foundations unit | What this area uses from it |
|---|---|---|
| FND-THEME | FND-01, FND-02 | Tender tokens, `StateBadge` tones `ok / warn / bad / info / neutral / hollow / pending / gold`, mono figures. |
| FND-SHELL | FND-03 | Rail mark Stock (`Stack`), panel "Stock" with On hand · Movements · Counts · Transfers · Empties, badges from `GET /api/v2/retail/nav/badges`, page header, routes in 5.3.4. |
| FND-LIST | FND-04, FND-05 | List source (`ReportDefinition.list`), `GET /api/v2/reports/[key]` list mode, tabs with counts, toolbar, selection bar, cells (5.4.7), Σ totals band, pager, row menu, empty guide, phone cards, export (W-55). |
| FND-RECORD | FND-06 | RecordFrame: header with back/title/reference, action group + ⋯, primary, strip (steps, chips, figure), KPI strip, chart panel with range, tabs from list sources with a `parent` filter, details rail edited in place (W-62), Activity tab (W-60), ConfirmDialog asks. |
| FND-SHEET | FND-07 | SheetForm (520px, 760px `wide`), field types, `auto` lookups with inline add (`/api/v2/retail/lookup/[noun]`), `?sheet=` addressing, footer, done toast. |
| FND-SETTINGS, FND-DASH | FND-08, FND-09 | Not used directly. Approval limits are read from the admin spec's Approvals settings (W-58); Overview low-stock tile and Insights › Stock health are the floor and insights specs' and read `lib/retail/stock/levels.ts` from this area. |

Other specs this area touches (named, not re-specified): **setup** (`10-setup.md`: SET-02 sites and places, SET-07 the `RetailMessage`
outbox, SET-09 posting role accounts `STOCK`, `BREAKAGE`, `DEPOSITS_HELD`); **products** (the product record `/retail/products/[id]`,
the `product` sheet kind, the `product` and `category` nouns, packs W-12); **buying** (the supplier model and `supplier` noun with its
"delivers in N days" lead time, deliveries/GRNs, the New order sheet, the Receive board's "Empties going back"); **floor** (the till, its
sale/refund services in `app/api/v2/retail/_services.ts`, cash movements); **admin** (the `person` noun, people's phones, Approvals
settings W-58).

Role names map to `UserRole` exactly as the Roles board says: **Owner** = `SUPERADMIN`; **Manager** = `MANAGER`, `SHOP_MANAGER`;
**Cashier** = `CASHIER`; **Stock clerk** = `STOCK_CLERK`; **Bookkeeper** = `FINANCE_OFFICER`.

Copy rule: every string in quotes is the board's own wording. Strings marked **Defined here** are not on any board and are needed to make
a state or an action work; keep them as written unless the product owner changes them. Where two boards disagree, the choice is stated in
the row and repeated in Open questions.

---

## 1. Boards

Canvas reading order of page `stock`, then the boards reachable from it that belong to this area. "Code today" was checked by reading the
code at `c78d01f` and by screenshots of the running app as `owner@bottlestore.test`, saved in `scratchpad/smoke/stock30/`
(`onhand.png`, `movements.png`, `count.png`, `count-new.png`, `transfers.png`, `empties.png`).

| # | Board file | Canvas title | What it is | Target route, or where it opens | Code status today | Notes |
|---|---|---|---|---|---|---|
| 1 | `StockList.dc.html` | On hand: Low, Out, Too much | list (`List` kind `stock`) | `/retail/stock` | **Exists but differs.** `app/retail/stock/page.tsx` is a `RecordListShell` + `ColumnList` register: product with the code stacked under it, Category, Level (only "Out of stock" / "Running low" dots, "Low" = on hand ≤ reorder level), On hand, Reorder at; one "Level" filter (Site filter only with two sites); count "16 of 16"; primary "Count stock" (blue). No tabs, no Code/Site/Cover/Value at cost columns, no "Too much", no sort/group/columns/export, no selection or bulk actions, no totals, no pager. | Rows are stock lines (a product at a site). Too wide for 1440: the ⋯ column scrolls off on the board. |
| 2 | `Reorder.dc.html` | Reorder levels from what sells | sheet (`Sheet` kind `reorder`, wide) | `?sheet=reorder-levels&ids=<lineIds>` over `/retail/stock` | **Missing.** Reorder level is edited one product at a time on the product page "Reorder at" row (`PATCH /api/v2/retail/catalog/[id]` `reorderLevel` → `InventoryItem.minStock`). No suggestion from sales, no case rounding, no bulk. | Opened by the On hand bulk action "Change reorder level". |
| 3 | `MovementsList.dc.html` | W-28  Movements: every in and out | list (`List` kind `movements`) | `/retail/stock/movements` | **Exists but differs.** The page renders the stores module's `StockMovementsFeed`: sentences grouped by day ("Farai Moyo issued 6 bottles of Castle Lager 340ml from Shop floor"), people chips, a Type filter (Received, Issued, Adjusted), "Export CSV". No table, no balance, no reference links, no site, no reasons, no reverse or print. Seeded sales have no movements (10 movements on the tenant). | Also the source of the product record's "Stock movements" tab (W-28). |
| 4 | `CountsList.dc.html` | Counts | list (`List` kind `counts`) | `/retail/stock/counts` (FND-03 moves `/retail/stock/count`) | **Exists but differs.** `app/retail/stock/count/page.tsx` "Stock counts" lists `ADJUSTMENT` movements (reference, product, counted time, by, change). There are no count documents, states, tabs or differences. | Row → CountRecord. |
| 5 | `CountNew.dc.html` | 1  Start a count, blind | sheet (`countnew`) | `?sheet=count-new` over `/retail/stock/counts` | **Exists but differs.** "Count stock" centred dialog (Product, Counted, Note) that posts one product's adjustment at once (`POST /api/v2/retail/stock/count`). No scope, counter, blind count or keep-selling, nothing to approve. | Also opened by the On hand bulk action "Count these". |
| 6 | `CountPhone.dc.html` | 2  Count on a phone | flow (phone page, 390 wide) | `/retail/stock/counts/[id]/count` (full screen, no shell) | **Missing.** | The counter opens it from the WhatsApp link or a notification. |
| 7 | `CountReview.dc.html` | 3  Approve the differences | flow (hand-built page in the shell) | `/retail/stock/counts/[id]/review` | **Missing.** | Its sample lines (Jameson −2, Johnnie Walker −1, Gordon's +1, −US$65.50) disagree with CountRecord and CountsList for the same CNT-0020 (−US$41.20); the seed follows CountsList/CountRecord. |
| 8 | `CountRecord.dc.html` | A count: the lines that differ, then approve | record (`Record` kind `count`) | `/retail/stock/counts/[id]` | **Missing.** | Primary "Approve the differences" → the review page. |
| 9 | `StockAdjust.dc.html` | W-23  Adjust stock from the product | sheet (`adjust`) over the product record | `?sheet=stock-adjust&productId=<id>[&siteId=]` over `/retail/products/[id]` (and over `/retail/stock` from a row menu) | **Missing as designed.** The only way to change on hand by hand is the single-product count dialog (sets on hand, `RETAIL_STOCK_ADJUSTMENT`); no reasons, note, photo or PIN limit. The product page has no "Adjust stock". | The product record is the products spec's; this area owns the sheet and adds the action entry. |
| 10 | `BreakCase.dc.html` | W-26  Break a case into singles | sheet (`breakcase`) over the product record | `?sheet=case-break&productId=<id>` over `/retail/products/[id]`; the till calls the same endpoint | **Exists but differs.** Product page ⋯ "Open cases into singles" opens `components/retail/break-case-dialog.tsx` (centred), posting `POST /api/v2/retail/catalog/[id]/break-case` (`lib/retail/cases.ts`): one case out, singles in, same site, one transaction — this works. No case picker, no "Then" preview, no reference (BRK-), movements carry no reason. | |
| 11 | `TransfersList.dc.html` | W-24  Transfers | list (`List` kind `transfers`) | `/retail/stock/transfers` | **Exists but differs.** The page (hidden from the nav unless one site has two places) reclassifies a whole stock line between places inside one site; on this tenant it reads "Each site has one stock location, so there is nowhere to move stock to." No transfers between sites, no documents, no states. | Shown in the nav only when the company has two or more open sites. |
| 12 | `TransferNew.dc.html` | Move stock | sheet (`transfer`, wide) | `?sheet=transfer-new` over `/retail/stock/transfers` | **Exists but differs.** "Move stock" dialog (Site, Product, To place, Note) for the same-site move; `recordStockMovement` refuses moves between sites. | Also opened by the On hand bulk action "Move to another site". |
| 13 | `TransferReceive.dc.html` | The other site receives it | sheet (`transferreceive`, wide) | `?sheet=transfer-receive&id=<transferId>` over `/retail/stock/transfers` and over the record | **Missing.** | |
| 14 | `TransferRecord.dc.html` | A transfer on the way, then received | record (`Record` kind `transfer`) | `/retail/stock/transfers/[id]` | **Missing.** | |
| 15 | `EmptiesList.dc.html` | Empties ledger | list (`List` kind `empties`) | `/retail/stock/empties` | **Missing** (404). Deposits exist only per sale line (`RetailSaleLine.depositAmount`, `emptiesBack` at the till, `lib/retail/deposits.ts`), on the Z report and in posting (account 2240). No ledger of empties, no supplier returns. | Liquor store only: nav item shown when the business type is Liquor store and "Empties and deposits" is on. |
| 16 | `EmptiesReturn.dc.html` | Return empties for a credit | sheet (`emptiesreturn`) | `?sheet=empties-return` over `/retail/stock/empties` | **Missing.** | |
| 17 | `StockFlow.dc.html` (page `products`) | Stock to sellable: four steps become one | explainer | Rules for W-09 and for On hand (5.21) | Partly: one product form exists (task C3) as a centred dialog (`components/retail/product-dialogs.tsx`). | The products spec builds the form; this area shows what it creates. |
| 18 | `ProductNewStock.dc.html` (page `products`) | The same form from On hand | sheet (`product`) | `?sheet=product-new` over `/retail/stock` | **Exists but differs.** On hand's primary is "Count stock"; the product form opens only from Products. | Sheet kind and endpoint are the products spec's; STK-02 adds the opener. |
| 19 | `IntakeNew.dc.html` (page `buying`) | W-25  Take in stock with no order | sheet (`intake`, wide) | `?sheet=intake-new` over `/retail/buying/deliveries` | **Partly.** The Deliveries dialog "Receive a delivery" with "No order" posts a GRN to stock (`POST /api/v2/retail/purchasing/receipts`). No supplier lookup, no paying section, no requisition. | W-25 is in this area's workflow list; the board, its list, the GRN and the money side are the buying spec's. Built there (section 2, W-25). |
| 20 | `Product.dc.html` (page `products`), stock parts | 2  Product record: click a detail to change it | record (hand-built) | `/retail/products/[id]` | Product page exists (products spec). Stock parts today: a "Reorder at" row; no movements tab, no "Adjust stock". | This area supplies: the "Stock movements" tab source, the Stock rail rows' endpoint (Reorder at, Reorder), "Adjust stock" and "Break a case". |

The Stock module panel (from `List.dc.html` `M.stock`): "On hand" (badge "5 low"), "Movements", "Counts" (badge "1 to approve"),
"Transfers", "Empties".

---

## 2. Workflows

Each workflow: who, where it starts, the steps (as on `WorkflowMap.dc.html` `A.stock`), what the server does, permissions, side effects, and
what changes on other screens. "Code today" says what already works.

### Permissions this area uses (`lib/retail/permissions.ts`)

`retail.stock` keeps its name and narrows to On hand, Movements and stock-line settings. Four resources are added so the matrix says what
the Roles board says (Stock section). Bookkeeper (`FINANCE_OFFICER`) gets read on all five (the setup spec adds `FINANCE_OFFICER` to the
matrix).

| Resource | Owner | Manager | Cashier | Stock clerk | Bookkeeper | Roles board limit |
|---|---|---|---|---|---|---|
| `retail.stock` (On hand, Movements, reorder levels, shelf, place) | view, update | view, update | – | view | view | — |
| `retail.counts` | view, create, update, approve, delete | view, create, update, approve, delete | – | view, create, update | view | "Owner approves differences over US$100." |
| `retail.adjustments` (adjust stock, break a case, reverse) | view, create, update, approve, delete | view, create, update, approve | – | create | view | "Over US$50 needs a manager PIN." |
| `retail.transfers` | view, create, update, delete | view, create, update, delete | – | view, create, update | view | — |
| `retail.empties` | view, create, update, delete | view, create, update, delete | create | view, create, update | view | "Liquor store only." |

Cost (column "Value at cost", "At cost", "Cost", "Value" in lines) needs `retail.catalog:view-cost` ("Cashiers and stock clerks never see
cost."): the server strips those values for roles without it and the frames drop the columns.

`RESOURCE_LABELS` additions: `retail.counts` "stock counts", `retail.adjustments` "stock adjustments", `retail.transfers` "transfers",
`retail.empties` "empties". So a refusal reads "Your role cannot approve stock counts".

Every write below runs in one transaction with its `PlatformAuditEvent` (`lib/retail/audit.ts`), and every stock change goes through
`recordStockMovement` (`lib/inventory/stock-movements.ts`), which after STK-01 always writes `reason`, `reference`, `change` and
`balanceAfter` (section 3).

### W-21 See what is running low and reorder it — **Manager** — Overview, or On hand › Low

Steps: Tick the low ones · Add to an order · Send. Screens: stock, reorder, ordernew.

**Code today: partly.** "Running low" exists (on hand ≤ reorder level, one level per product edited on the product page). No Low tab, no
"Too much", no bulk add to an order, no levels from what sells.

1. **On hand** (`/retail/stock`) opens on the All tab; the manager picks **Low**. Low and Out are worked out on the server by
   `stockLevel()` in `lib/retail/stock/levels.ts` (one function, used by On hand, the nav badge, the Overview tile and Insights › Stock health):

   | Level | Rule | Tone |
   |---|---|---|
   | Out | on hand ≤ 0 | `bad` |
   | Low | product not archived, and either (reorder at is set and on hand ≤ reorder at) or (days of cover < 7) | `warn` |
   | Too much | days of cover > 56, or nothing sold in 30 days while on hand > 0 | `info` |
   | Fine | otherwise | `hollow` |

   Rows are tested top to bottom; the first that matches wins (a line at its reorder level that also sold nothing is Low).

   Days of cover = on hand ÷ (net units sold at that site in the last 30 days ÷ 30). 7 and 56 are half and four times `COVER_AIM = 14` —
   the constants Insights already uses (`lib/retail/insights.ts`), moved into `levels.ts` so both read one rule. This is why Amarula Cream
   (13 on hand, reorder at 12, about 6 days of cover) is Low on the board while Gordon's Gin (18, reorder at 6, 8 days) is Fine.
   The panel badge "5 low" is the Low tab plus the Out tab (provider `/retail/stock` in `lib/retail/nav-badges.ts`, requires
   `retail.stock:view`; it refines FND 4.3's "at or below reorder level" to this rule).
2. **Tick the low ones** → selection bar → **"Add to an order"** opens the buying spec's New order sheet (OrderNew board) with the ticked
   stock lines: `?sheet=order-new&lineIds=<…>`. That sheet suggests quantities and sends the order (W-30, buying). Requires
   `retail.purchasing:create`; the action is not drawn for roles without it.
3. **Change reorder level** (bulk) opens the **Change reorder levels** sheet (Reorder board):
   - `GET /api/v2/retail/stock/reorder?lineIds=…` returns each line's product, site, unit, net units sold per day over 30 days, current
     reorder at, unit cost (view-cost only), the supplier's lead time in days (the product's supplier from the products spec, its
     "delivers in" from the buying spec; 0 when either is unknown) and the case size (the `packSize` of the active case product whose
     `packOf` is this product; null when none).
   - The sheet computes each line with the pure `suggestReorderLevel({ perDay, keepDays, leadDays, caseSize, round })` in
     `lib/retail/stock/reorder.ts`: `ceil(perDay × (keepDays + leadDays))`, then rounded **up** to a multiple of the case size when
     "Whole cases" is chosen and the product has a case. Johnnie Walker (2 a day, 14 + 2 days) → 32; Castle Lager (30 a day, case of
     24) → 480.
   - "One number for all" replaces the two inputs with one "Reorder at" field and sets every line to it.
   - **Save** → `PUT /api/v2/retail/stock/reorder { levels: [{ lineId, reorderAt }] }` (requires `retail.stock:update`: owner, manager).
     Writes `InventoryItem.minStock` per line; for each changed line one `RETAIL_RECORD.EDITED` event with entity `Product`/`productId`,
     field `reorderAt`, label "Reorder at", from/to — so the product's Activity reads "Changed Reorder at from 12 to 32". Toast "Reorder
     levels saved for 4 products." The list refetches; Low, the badge, the Overview tile and suggested orders change at once.
4. **Send** is the buying spec's (W-30).

Other screens: Overview's low-stock tile (floor spec) and Insights › Stock health (insights spec) call `stockLevel()`; the product record's
chip "Reorder soon · about 6 days left" is the products spec's wording of Low.

### W-22 Count stock — **Manager, staff** — On hand › Counts — guided

Steps: Pick what to count · Count on a phone · Review differences · Approve. Screens: counts, countrec, countnew, countphone, countreview.

**Code today: missing.** Only the one-product count dialog, which changes on hand immediately with no review.

1. **Pick what to count** — Counts › "Start a count" (or On hand bulk "Count these") opens **Start a count** (CountNew). The hint under
   Categories ("61 products.") comes from `GET /api/v2/retail/stock/counts/preview?siteId=&scope=&categoryIds=&lineIds=&placeId=` →
   `{ products: n }`. "Start counting" → `POST /api/v2/retail/stock/counts` (requires `retail.counts:create`: owner, manager, stock clerk):
   - Resolves the lines at the site: Everything = every stock line of a product (archived included while it holds stock; binned
     excluded); Some categories = products whose `categoryId` is in the list; Some products = the given lines; A place = lines whose
     `locationId` is the place. Refuses 400 `{ fieldErrors: { cats: "Nothing to count there." } }` when none. Refuses 409 "3 products are
     already being counted in CNT-0021. Finish that count first." when any line is in a count that is Counting or To approve.
   - Creates `RetailStockCount` (number `CNT-0022` from the `RETAIL_STOCK_COUNT` sequence, status `COUNTING`, name derived: one category →
     "<Category> shelf", two or more → "<A> and <B>", a place → the place's name, some products → "<n> products" or the product's name,
     everything → "Everything") and one `RetailStockCountLine` per stock line with `expected` = on hand now, `unitCost` = the line's cost,
     `sortKey` = shelf then product name.
   - Audit `RETAIL_STOCK_COUNT.STARTED { countNo, lines, counterId, blind, keepSelling }` (entity `RetailStockCount`).
   - Tells the counter (unless the counter is the caller): an in-app notification (`RETAIL_COUNT_ASSIGNED`, entity `RETAIL_STOCK_COUNT`,
     view path `/retail/stock/counts/<id>/count`) and, when the person has a phone, a WhatsApp `RetailMessage` (setup spec SET-07 outbox,
     template `count-link`): "Tafara Nyathi asked you to count the spirits shelf at Harare Main Branch: <origin>/retail/stock/counts/<id>/count"
     **Defined here**.
   - Response → toast "CNT-0022 sent to Rudo Moyo. 61 products to count." with "Open".
2. **Count on a phone** — the counter opens the link (signed in; any role may count a count they are assigned to). Each figure saves on
   blur or Enter: `PUT /api/v2/retail/stock/counts/[id]/lines/[lineId] { counted }` (the assigned counter, or `retail.counts:update`). The
   server stores `counted`, `countedAt`, `countedById`, **`expectedAtCount` = the line's on hand at that moment**, `difference = counted −
   expectedAtCount`, and sets the count's `firstCountedAt` on the first save. Because the snapshot is taken per line when its figure
   arrives, sales during the count are allowed for "line by line". When "Keep selling while counting" is off, the till refuses those
   products until the count is sent: `createSale` in `app/api/v2/retail/_services.ts` answers 409 "Castle Lager 340ml is being counted.
   It sells again when the count is sent." **Defined here**.
   - "Done, send for review" → `POST /api/v2/retail/stock/counts/[id]/submit`: refuses 409 "Count every line first: 35 to go." **Defined
     here**; else status `TO_APPROVE`, `submittedAt`; audit `RETAIL_STOCK_COUNT.SUBMITTED { lines, differ }`; notification
     `RETAIL_COUNT_SUBMITTED` to every owner and manager ("CNT-0020 is ready to approve", view path `/retail/stock/counts/<id>/review`);
     the Counts badge "1 to approve" rises.
3. **Review differences** — CountRecord (`/retail/stock/counts/[id]`) and its primary "Approve the differences" → CountReview
   (`/retail/stock/counts/[id]/review`, requires `retail.counts:approve`). The approver may correct a figure (same `PUT`; it keeps the
   line's `expectedAtCount` from when it was counted and recomputes `difference`; writes `RETAIL_STOCK_COUNT.LINE_CHANGED { product, from,
   to }`), set Why (`PATCH …/lines/[lineId] { why: "BROKEN" | "NOT_KNOWN" | "FOUND" }`),
   tick lines and **Recount**: `POST …/recount { lineIds }` (empty = every line that differs) clears those lines' figures, marks them
   `recount`, puts the count back to `COUNTING`, audit `RETAIL_STOCK_COUNT.RECOUNT_ASKED { lines }`, and tells the counter (notification and
   WhatsApp "Please count these 3 again: <link>" **Defined here**). The phone then shows only those lines.
4. **Approve** — "Approve and adjust" → `POST /api/v2/retail/stock/counts/[id]/approve` (requires `retail.counts:approve`):
   - Only from `TO_APPROVE` (409 "This count is not waiting for approval.").
   - Limit from the admin spec's Approvals settings (`getApprovalLimits(companyId).countDifferences`, default "Owner approves over
     US$100"): when the net difference at cost is more than US$100.00 in either direction and the caller is not the owner → 403 "Over
     US$100.00 needs the owner. Tendai Mhlanga has been told." and a notification to every owner.
   - For each line whose `difference` ≠ 0: `recordStockMovement` `ADJUSTMENT` by `difference` (so on hand = counted + whatever moved since
     the line was counted), `reason COUNT`, `reference` = `CNT-0020`, `sourceType RETAIL_STOCK_ADJUSTMENT`, `sourceId <countId>:<lineId>`,
     `notes` = the Why. `unitCost` is refreshed from the line, `value = difference × unitCost`.
   - One journal through `postRetailJournal` (`sourceType RETAIL_STOCK_ADJUSTMENT`, `sourceId <countId>`, subtype `LOSS` when the net is
     negative else `GAIN`, amount = |net|, inventory lines per product): Dr Breakage and losses / Cr Stock for a loss, the reverse for a
     gain (the existing rule; SET-09 points its lines at the `BREAKAGE` and `STOCK` role accounts). Nothing is posted when the net is 0.
   - Count: status `APPROVED`, `approvedAt`, `approvedById`, `differenceValue`, `shortValue`, `overValue`. Audit
     `RETAIL_STOCK_COUNT.APPROVED { lines, differ, net, short, over }`.
   - The review page shows "Approved. Stock set to what was counted. −US$65.50 posted to Breakage and losses."; On hand, Movements
     ("Count, two broken"), Insights › Losses ("Count differences") and the badge change.
5. **Cancel** — "Cancel the count" (review aside link, record ⋯) → ask `cancelcount` → `POST …/cancel` (requires `retail.counts:delete`:
   owner, manager) from `COUNTING` or `TO_APPROVE`: status `CANCELLED`; nothing on hand changes; audit `RETAIL_STOCK_COUNT.CANCELLED`;
   notification to the counter.

Bulk from Counts: "Approve the differences" → ask `approvecounts` → `POST /api/v2/retail/stock/counts/approve { ids }` (each count through
the same service; counts not To approve are skipped; counts over the owner limit wait) → toast "2 counts approved." or "1 count approved.
CNT-0023 waits for the owner." **Defined here**. "Print count sheets" → `POST /api/v2/retail/stock/counts/print { ids }` → one PDF.

### W-23 Record breakage, waste or own use — **Manager** — Product record, or the till

Steps: Pick product · How many and why · Save. Screens: product, stockadjust, moves.

**Code today: partly.** On hand can be set by the count dialog; no reason, no value, no limit, no product action.

1. On the product record the action "Adjust stock" opens **Adjust stock** `?sheet=stock-adjust&productId=<id>` (the products spec's record
   lists the action; STK-04 adds it to `lib/retail/record-kinds/products.ts`). Also from an On hand row menu, and from the till (floor spec's
   till calls the same endpoint). When the product has stock lines at more than one site the sheet shows an "At" field (default: the
   shop's default site); with one site it never does.
2. **How many and why** — Why is one of four cards; How many is a count (or, for "Fix a mistake", the number on hand).
3. **Save** → `POST /api/v2/retail/stock/adjustments` (requires `retail.adjustments:create`: owner, manager, stock clerk):
   - delta: Broken or spoilt and Own use or gift = −n; Found more = +n; Fix a mistake = n − on hand.
   - Validation: n is a number ≥ 0 with at most four decimals (whole for units sold singly); not more than on hand for a take-off
     (`fieldErrors.n` "Only 13 on hand."); Fix a mistake must differ (`fieldErrors.n` "That is what is on hand already."); "What happened"
     1–500 characters (`fieldErrors.note` "Say what happened."). **Defined here.**
   - Value = |delta| × unit cost. When value > the Approvals limit (`getApprovalLimits(companyId).adjustmentPinOver`, default US$50.00)
     and the caller lacks `retail.adjustments:approve` (the stock clerk), the request must carry `approver: { userId, pin }`: the user must
     hold `retail.adjustments:approve` and their `RetailTillPin` must match, with the till PIN lockout (`evaluateTillPinAttempt`: 5 tries,
     15 minutes). Without it → 409 `{ error: "Over US$50.00 needs a manager PIN.", needsApprover: true }`; wrong PIN → 400
     `fieldErrors.pin` "That PIN is not right." ; locked → 429 "Too many tries. Try again in 15 minutes." **Defined here.**
   - `recordStockMovement` `ADJUSTMENT` by delta, `reason` BROKEN | OWN_USE | FOUND | CORRECTION, `reference` from the
     `RETAIL_STOCK_ADJUSTMENT` sequence (`ADJ-0031`), `notes` = what happened, `photoUrl`, `approvedBy` = the approver's name (the caller's
     when they hold approve), `sourceType RETAIL_STOCK_ADJUSTMENT`, `sourceId` = the movement's own id after create.
   - Journal: `postRetailJournal` `RETAIL_STOCK_ADJUSTMENT` subtype LOSS/GAIN at value (Own use or gift posts the same way; Insights tells
     them apart by `reason`).
   - Audit `RETAIL_STOCK.ADJUSTED { reference, why, delta, value, approvedBy }` with entity `Product`/`productId`, so the product's Activity
     shows it ("Took 2 off: broken or spoilt, US$26.06").
   - Toast: "2 off Amarula Cream 750ml. 11 left." (board) / "2 added to Amarula Cream 750ml. 15 on hand." / "Amarula Cream 750ml set to 11
     on hand." (**Defined here**).

Other screens: Movements and the product's Stock movements tab show the row ("Broken or spoilt", ADJ-0031); On hand and its level change;
Insights › Losses counts BROKEN and OWN_USE as "Breakage".

Reversing a mistake: Movements bulk "Reverse" (W-28 section) puts back adjustments and case breaks.

### W-24 Move stock between sites — **Manager** — Stock › Transfers

Steps: From, to, what · Send · Other site receives. Screens: transfers, transferrec, transfernew, transferreceive.

**Code today: missing.** The existing "transfer" moves a whole line between places in one site; `recordStockMovement` refuses
cross-site moves by design ("Issue it at the sending site and receive it at the receiving one") — which is exactly what this workflow does.

1. **From, to, what** — Transfers › "Move stock" (or On hand bulk "Move to another site") opens **Move stock**. The Transfers item and the
   bulk action exist only when the company has two or more open sites.
2. **Send** → `POST /api/v2/retail/stock/transfers` (requires `retail.transfers:create`: owner, manager, stock clerk):
   - From ≠ To (`fieldErrors.to` "Pick a different site."), both open sites of the company; 1–200 lines; each line a stock line at From with
     quantity > 0 and ≤ on hand (`fieldErrors["lines.2"]` "Only 9 at Harare Main Branch."); Taken by is an active person; Arrives 1–60
     characters. **Defined here.**
   - Creates `RetailStockTransfer` (`TRF-0008`, status `ON_THE_WAY`, `sentAt`, `sentById`, `driver` = the chosen person's name,
     `arrives`) and its lines with `unitCost` = the From line's cost.
   - For each line `recordStockMovement` `ISSUE` at From, `reason TRANSFER_OUT`, `reference TRF-0008`, `sourceType RETAIL_STOCK_TRANSFER`,
     `sourceId <transferId>:<lineId>`. Stock leaves From now ("It leaves stock here now").
   - No journal: the stock stays on the same Stock account while it is on the way; the on-the-way value is the transfer lines' value (Stock
     health and the Value KPI read it).
   - Audit `RETAIL_STOCK_TRANSFER.SENT { lines, units, value }` (entity `RetailStockTransfer`). Notification `RETAIL_TRANSFER_SENT` to every
     user with `retail.transfers:update` except the sender ("TRF-0008 is on the way to Borrowdale", view path the record). When the admin
     spec gives people sites, only people at the To site are told.
   - Toast "TRF-0008 sent. Borrowdale will see it to receive."
3. **Other site receives** — the record's primary "Receive it" (or the list row menu) opens **Receive TRF-0008** →
   `POST /api/v2/retail/stock/transfers/[id]/receive { lines: [{ id, received }], short: "STILL_COMING" | "LOST" }` (requires
   `retail.transfers:update`):
   - Only while `ON_THE_WAY` (409 "TRF-0008 has already been received."). Each `received` 0 ≤ n ≤ still to come (`fieldErrors` "Only 10
     were sent.").
   - For each line with received > 0: find or create the product's stock line at To (`itemCode` = product code, `unit`, `unitCost` = the
     line's cost, place = the site's first open place, `minStock` empty), then `recordStockMovement` `RECEIPT` at To, `reason TRANSFER_IN`,
     `reference TRF-0008`, `unitCost` only when the line was created. Received stock sells at once at To (the till reads the To line).
   - What is short: `STILL_COMING` keeps those units on the transfer (it stays On the way, labelled "Part received, 2 to come", and can be
     received again); `LOST` writes them off: `quantityLost` on the line and a `RETAIL_STOCK_ADJUSTMENT` LOSS journal at their cost
     (Insights › Losses reads transfer losses from the lines). When nothing is left to come, status `RECEIVED`, `receivedAt`,
     `receivedById`.
   - Audit `RETAIL_STOCK_TRANSFER.RECEIVED { received, lost, stillComing }`. Toast: board "TRF-0008 received at Borrowdale. 2 bags of ice
     written off."; built "TRF-0008 received at Borrowdale. 2 × Ice 2kg bag written off." / "TRF-0008 received at Borrowdale." / "TRF-0008
     received at Borrowdale. 2 × Ice 2kg bag still to come." The short part comes from `shortWords(lines)` in
     `lib/retail/stock/transfer-words.ts`: one product short → "<n> × <product name>", several → "<n> units" (**Defined here**: a product
     name cannot be shortened to the board's hand-written "2 bags of ice" reliably).
4. **Change the lines** (record action, only while On the way and nothing received) → `PUT /api/v2/retail/stock/transfers/[id]/lines`:
   for each changed line an `ISSUE` (more sent) or `RECEIPT` (`reason TRANSFER_BACK`, fewer sent) at From; added lines issue; removed lines
   come back. Audit `RETAIL_STOCK_TRANSFER.CHANGED`. 409 "Part of it has been received. Receive the rest or cancel it." **Defined here.**
5. **Cancel** (record ⋯ "Cancel the transfer", list bulk "Cancel") → ask → `POST …/cancel` (requires `retail.transfers:delete`: owner,
   manager): every unit still to come goes back on From (`RECEIPT`, `reason TRANSFER_BACK`), status `CANCELLED` when nothing was received,
   else `RECEIVED` with the rest returned; audit `RETAIL_STOCK_TRANSFER.CANCELLED`; notification to the To site.
6. Rail edits (W-62): `PATCH /api/v2/retail/stock/transfers/[id] { toSiteId? (only while nothing received), vehicle?, driver?, note? }`
   (requires `retail.transfers:update`), one `RETAIL_RECORD.EDITED` per field.

### W-25 Take in stock with no order — **Manager** — Deliveries

Steps: Supplier · What came · Post to stock. Screens: deliveries, intakenew.

**Code today: partly** — a delivery with "No order" posts a GRN and its stock (`POST /api/v2/retail/purchasing/receipts`).

**Built by the buying spec** with its Deliveries list: the board (`IntakeNew`) is on the buying canvas page and the supplier, the GRN, the
paying section ("Cash now", "On account", "Not yet", "Paid from", "REQ-0017, raised for you") and the money accounts are all buying's. This
area fixes the stock side every delivery must satisfy, and STK-01 makes the shared GRN posting write it:

- Each GRN line posts `recordStockMovement` `RECEIPT` with `reason RECEIVED`, `reference` = the GRN number, `sourceType
  RETAIL_GOODS_RECEIPT`, `sourceId <receiptId>:<itemId>`, at the delivered unit cost.
- A line for a product with no stock line at the site creates one (same rule as a transfer received).
- A product added inline on the line ("Tonic water 200ml — New product, added here") is created through the products spec's create service
  first, then received.
- On hand, Movements ("Received", GRN-0006) and the product's Stock movements tab show it at once; the toast "GRN-0006 posted. 112 units in
  stock." is the buying spec's.

### W-26 Break a case into singles — **Cashier, manager** — Till, or the product record

Steps: Pick the case · Confirm · Singles go up. Screens: breakcase, moves.

**Code today: works** through the old dialog and route (see board 10); no reference, no reason, no preview.

1. Product record ⋯ "Break a case" (**Defined here**: shown when the product is a case, or a single that has a case, and the company's
   "Cases and singles" is on) opens **Break a case** with the case preselected. The till's "No singles left … Open a case?" prompt (Liquor
   board, floor spec) calls the same endpoint.
2. **Confirm** → `POST /api/v2/retail/stock/case-breaks { caseProductId, siteId?, cases }` — `lib/retail/stock/cases.ts` (moved from
   `lib/retail/cases.ts`):
   - Allowed for `retail.adjustments:create` (owner, manager, stock clerk), or for `retail.sell:create` (cashier) when the request comes from
     the caller's open shift at that site and the singles line has less than one on hand (the till prompt's case).
   - Refusals as today (409): "That product is not this shop's.", "<case> is not set up as a case of singles.", "There is no <case> in stock
     at this branch.", "There are only 4 of <case> to open."; plus 409 "Cases and singles is off for this shop." **Defined here**.
   - One transaction: `ISSUE` cases on the case line and `RECEIPT` cases × pack size on the single line (singles at the case cost ÷ pack
     size), both `reason CASE_BROKEN`, the same `reference` from the `RETAIL_CASE_BREAK` sequence (`BRK-0012`). No journal (same goods,
     same account).
   - Audit `RETAIL_STOCK.CASE_BROKEN { reference, cases, singles }` with entity `Product`/case product id.
3. **Singles go up** — toast "1 case broken. 26 singles on hand."; On hand, Movements ("Case broken into singles", BRK-0012) update.

### W-27 Empties: deposits in and out — **Cashier, manager** — Till, and the supplier record

Steps: Charge a deposit · Take bottles back · Return to supplier for credit. Screens: empties, emptiesreturn, receive.

**Code today: partly.** The till charges deposits per returnable line, takes empties back within a sale (`emptiesBack`, capped at the line's
quantity), refunds deposits with goods, and posts deposits to 2240 "Bottle Deposits Held". There is no empties ledger, no bottles or crates in
the store, nothing owed by suppliers, no returns.

The Empties ledger (`RetailEmptiesEntry`, section 3) is the one place the store's empties and the two deposit balances live. Every entry is
written by `lib/retail/stock/empties.ts` under a per-site advisory lock so "In the store" stays a true running balance. All empties writes
refuse 409 "Empties and deposits is off for this shop." unless the business type is Liquor store and the switch is on.

1. **Charge a deposit** (till; floor spec's sale) — after a sale posts, `recordSaleEmpties(tx, sale)` (called from `createSale` in
   `app/api/v2/retail/_services.ts`) writes, for a sale whose lines carry a deposit, one `DEPOSIT_CHARGED` entry: deposit = the sale's
   `depositAmount`, reference = the sale number, `saleId`, `customerId`; and when the sale took empties back, one `BOTTLES_BACK` entry:
   bottles = the empties counted, deposit = −(their deposit). A refund that hands deposit back writes `DEPOSIT_REFUNDED` (deposit −n). No new
   journal: the sale's existing posting already moves 2240.
2. **Take bottles back** without a sale (till "Bottles back · Pay", Liquor board; till UI is the floor spec's) →
   `POST /api/v2/retail/empties/bottles-back { shiftId, bottles, crates, customerId? }` (requires `retail.empties:create`, the shift must be
   the caller's open shift): `BOTTLES_BACK` entry (+bottles, +crates, deposit −(bottles × bottle deposit + crates × crate deposit)) and,
   in the same transaction, a `PAYOUT` `RetailCashMovement` of that amount on the shift with reason `BOTTLES_BACK` (added to
   `RetailCashMovementReason` by this area's migration, label "Bottles back" in `lib/retail/cash-movements.ts`), so the drawer's expected
   cash allows for it. Response `{ paid: "8.40" }`.
3. **Return to supplier for credit** — Empties › "Return empties to a supplier" opens **Return empties to a supplier** →
   `POST /api/v2/retail/empties/returns { supplierId, bottles, crates, goingBackWith, siteId? }` (requires `retail.empties:create`): bottles
   and crates ≥ 0, not both 0, not more than in the store (`fieldErrors.bottles` "Only 412 bottles in the store."); writes
   `RETURNED_TO_SUPPLIER` (−bottles, −crates, deposit + (bottles × bottle deposit + crates × crate deposit)), supplier id and name, note =
   going back with; audit `RETAIL_EMPTIES.RETURNED`. Toast "Return booked. Delta owes US$84.00 in deposits." ("Delta" is the supplier's
   name up to the first space). From the supplier record (buying spec) the same sheet opens with `&supplierId=<id>` prefilled. The
   buying spec's Receive board ("Empties going back · Crates · Deposit back") calls the same service with
   `goodsReceiptId` and reference = the GRN number.
4. **Credit** — when the supplier's credit note arrives, the Empties row menu "Record their credit note" (**Defined here**) →
   `POST /api/v2/retail/empties/returns/[id]/credit { creditNote, amount, note? }` (requires `retail.empties:update`): amount > 0 and ≤ still
   owed on that return; writes `CREDIT_RECEIVED` (deposit −amount, reference = credit note, `returnId`); audit `RETAIL_EMPTIES.CREDITED`.
   Toast "Delta Beverages credited US$84.00." **Defined here**. Posting of supplier deposit credits is an open question for the bookkeeper
   (none is written in this unit).

Balances on the Empties tabs: "Held for customers" = Σ deposit over DEPOSIT_CHARGED, DEPOSIT_REFUNDED and BOTTLES_BACK; "Owed by suppliers" =
Σ deposit over RETURNED_TO_SUPPLIER and CREDIT_RECEIVED; "In the store" = the latest entry's `bottlesAfter · cratesAfter` per site.

### W-28 Trace a product's stock — **Owner, manager** — Product record

Steps: Read the ledger · Open the sale, delivery or count. Screens: product, moves.

**Code today: partly** — the stores feed lists movements as sentences; no balance, no reasons, no links to documents.

1. **Read the ledger** — the product record's "Stock movements" tab is the list source `retail-stock-movements` with its `product` parent
   filter (newest first, 10 rows, Σ line); "All movements" → `/retail/stock/movements?product=<productId>`.
2. **Open the sale, delivery or count** — the Reference cell links by reason: SALE, REFUND, VOID → `/retail/sales/<saleId>`; RECEIVED,
   DELIVERY_DIFFERENCE, SUPPLIER_RETURN → the buying spec's delivery record `/retail/buying/deliveries/<receiptId>`; COUNT →
   `/retail/stock/counts/<countId>`; TRANSFER_* → `/retail/stock/transfers/<transferId>`; adjustments and case breaks have no page (plain
   mono reference).
3. **Reverse** (Movements bulk, owner and manager): `POST /api/v2/retail/stock/movements/reverse { ids }` (requires
   `retail.adjustments:approve`). Only BROKEN, OWN_USE, FOUND, CORRECTION and CASE_BROKEN movements that are not already reversed are put
   back: a movement the other way (`reason REVERSAL`, same reference, `reversesId` = the original — unique, so twice is impossible), the
   opposite journal for adjustments, both legs for a case break. Others are skipped with why ("SALE-31862 is a sale: refund it from the
   sale."). Audit `RETAIL_STOCK.MOVEMENTS_REVERSED { references }`. Toast "2 movements reversed. 1 was a sale: refund it from the sale."
   **Defined here**.
4. **Print** (bulk) = the list Export as PDF over the ticked rows (FND 4.2 `rowIds`).

---

## 3. Data

### 3.1 Models used

`Site`, `StockLocation` (a site's places, SET-02), `InventoryItem` (a stock line: one product at one site; `minStock` is "Reorder at"),
`StockMovement` (the ledger), `Product` (`packOfId`, `packSize`, `returnable`, `depositAmount`, `archivedAt`, `categoryId`),
`RetailCategory`, `RetailSale`, `RetailSaleLine` (net units sold, deposits, empties back), `RetailGoodsReceipt` (GRN numbers),
`RetailShopProfile` (`businessType`, `emptiesAndDeposits`, `casesAndSingles`, `defaultSiteId` from SET-01), `RetailShift`, `RetailTillPin`
(manager PIN), `User` (`phone`, `role`), `Notification`, `RetailMessage` (SET-07), `PlatformAuditEvent`, `PostingRule`/`PostingRuleLine`,
`JournalEntry` (through `postRetailJournal`), `IdSequence` (through `reserveIdentifier`).

What is wrong today, and fixed below:

- A movement says "ISSUE 6 EACH" and its `sourceType`; a count, a breakage and a case break are all `RETAIL_STOCK_ADJUSTMENT`. Nothing says
  *why* in words a shop uses, nothing gives the document number a person reads, and nothing records the balance after, so "Balance" cannot be
  shown without replaying history.
- `recordStockMovement` reads the line and writes `currentStock` back without a lock: two sales at once can lose one.
- There are no count, transfer or empties documents.

### 3.2 Schema changes, by migration

Every migration ships its witness test in the same commit (pattern: `lib/retail/sale-line-deposit-migration.test.ts`). Apply with
`npx prisma migrate deploy`, then `set -a; . ./.env; set +a; DATABASE_URL="$DATABASE_URL_TEST" npx prisma migrate deploy`. Never
`prisma db push`.

#### `20261004133000_retail_stock_ledger` (STK-01) · witness `lib/inventory/stock-ledger-migration.test.ts`

```prisma
/// Why stock moved, in the shop's words. Retail writes one on every movement; the stores module passes null.
enum StockMovementReason {
  OPENING
  SALE
  REFUND
  VOID
  RECEIVED
  DELIVERY_DIFFERENCE
  SUPPLIER_RETURN
  COUNT
  BROKEN
  OWN_USE
  FOUND
  CORRECTION
  TRANSFER_OUT
  TRANSFER_IN
  TRANSFER_BACK
  CASE_BROKEN
  REVERSAL
  PLACE_MOVE
}

model StockMovement {
  // … existing fields unchanged …
  reason       StockMovementReason?
  /// The document number a person reads: SALE-31862, GRN-0004, CNT-0019, TRF-0007, BRK-0012, ADJ-0031.
  reference    String?
  /// Signed effect on the line's on hand: +40 received, −1 sold, 0 for a move between places.
  change       Decimal  @default(0) @db.Decimal(12, 4)
  /// The line's on hand straight after this movement.
  balanceAfter Decimal? @db.Decimal(12, 4)
  /// On a reversal: the movement it puts back. Unique, so a movement is reversed at most once.
  reversesId   String?  @unique

  reverses   StockMovement? @relation("StockMovementReversal", fields: [reversesId], references: [id], onDelete: Restrict)
  reversedBy StockMovement? @relation("StockMovementReversal")

  @@index([itemId, createdAt])
}

model InventoryItem {
  // … existing; `minStock` is "Reorder at" …
  /// "Reorder": how many to order when it is low. Suggested orders start from it.
  reorderQty Decimal? @db.Decimal(12, 4)
  /// Where on the shelf it lives ("Shelf 2, top"). The phone count sorts and labels lines by it.
  shelf      String?
}

enum NotificationType {
  // … existing …
  RETAIL_COUNT_ASSIGNED
  RETAIL_COUNT_SUBMITTED
  RETAIL_TRANSFER_SENT
}

enum NotificationEntityType {
  // … existing …
  RETAIL_STOCK_COUNT
  RETAIL_STOCK_TRANSFER
}
```

SQL, after the DDL:

1. `change` from existing rows: `RECEIPT` → `+quantity`, `ISSUE` → `−quantity`, `ADJUSTMENT` → `quantity` (already signed), `TRANSFER` → 0.
2. `reason`: `RETAIL_SALE` → SALE, `RETAIL_REFUND` → REFUND, `RETAIL_VOID` → VOID, `RETAIL_GOODS_RECEIPT` → RECEIVED,
   `RETAIL_STOCK_ADJUSTMENT` with notes starting "Opened " → CASE_BROKEN, other `RETAIL_STOCK_ADJUSTMENT` → CORRECTION,
   `RETAIL_STOCK_TRANSFER` → PLACE_MOVE; everything else stays null.
3. `reference`: sales → `RetailSale.saleNo` (join on the id before ":" in `sourceId`), refunds/voids the same, GRNs →
   `RetailGoodsReceipt.receiptNo`; others null.
4. `balanceAfter` per line: `currentStock − sum(change) over (partition by itemId order by createdAt desc, id desc rows between unbounded
   preceding and 1 preceding)` (the latest movement's balance equals today's on hand).

Witness asserts: the enum and its 18 values; the five columns with types and nullability; the unique index on `reversesId`; the
`(itemId, createdAt)` index; the two `InventoryItem` columns; and, on data, that for every line the newest movement's `balanceAfter` equals
`InventoryItem.currentStock`.

`ReservableIdEntity` (code, `lib/id-generator.ts`) gains `RETAIL_STOCK_ADJUSTMENT` (prefix `ADJ`) and `RETAIL_CASE_BREAK` (`BRK`), both
company-scoped, whose first-use scan reads `StockMovement.reference` for the company's lines with that prefix.

#### `20261004133100_retail_stock_counts` (STK-05) · witness `lib/retail/stock-counts-migration.test.ts`

```prisma
enum RetailStockCountScope {
  EVERYTHING
  CATEGORIES
  PRODUCTS
  PLACE
}

enum RetailStockCountStatus {
  COUNTING
  TO_APPROVE
  APPROVED
  CANCELLED
}

/// Why a counted line differs, as the approver records it ("Why" on the review).
enum RetailStockCountWhy {
  BROKEN
  NOT_KNOWN
  FOUND
}

model RetailStockCount {
  id              String                 @id @default(uuid())
  companyId       String
  countNo         String
  siteId          String
  /// "Spirits shelf". Shown as "Shelf" in the record's rail, editable there.
  name            String
  scope           RetailStockCountScope
  categoryIds     String[]               @default([])
  placeId         String?
  blind           Boolean                @default(true)
  keepSelling     Boolean                @default(true)
  status          RetailStockCountStatus @default(COUNTING)
  counterId       String
  createdById     String
  firstCountedAt  DateTime?
  submittedAt     DateTime?
  approvedAt      DateTime?
  approvedById    String?
  cancelledAt     DateTime?
  cancelledById   String?
  /// Set on approval, at cost, signed. Short ≤ 0, over ≥ 0, difference = short + over.
  differenceValue Decimal?               @db.Decimal(14, 2)
  shortValue      Decimal?               @db.Decimal(14, 2)
  overValue       Decimal?               @db.Decimal(14, 2)
  createdAt       DateTime               @default(now())
  updatedAt       DateTime               @updatedAt

  company     Company               @relation(fields: [companyId], references: [id], onDelete: Cascade)
  site        Site                  @relation(fields: [siteId], references: [id], onDelete: Restrict)
  place       StockLocation?        @relation(fields: [placeId], references: [id], onDelete: SetNull)
  counter     User                  @relation("RetailStockCountCounter", fields: [counterId], references: [id], onDelete: Restrict)
  createdBy   User                  @relation("RetailStockCountCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  approvedBy  User?                 @relation("RetailStockCountApprovedBy", fields: [approvedById], references: [id], onDelete: SetNull)
  cancelledBy User?                 @relation("RetailStockCountCancelledBy", fields: [cancelledById], references: [id], onDelete: SetNull)
  lines       RetailStockCountLine[]

  @@unique([companyId, countNo])
  @@index([companyId, status, createdAt])
  @@index([companyId, siteId, name])
}

model RetailStockCountLine {
  id              String               @id @default(uuid())
  companyId       String
  countId         String
  inventoryItemId String
  productId       String?
  /// On hand when the count started: what a counter sees when the count is not blind.
  expected        Decimal              @db.Decimal(12, 4)
  counted         Decimal?             @db.Decimal(12, 4)
  countedAt       DateTime?
  countedById     String?
  /// On hand at the moment the figure was saved: sales during the count are allowed for, line by line.
  expectedAtCount Decimal?             @db.Decimal(12, 4)
  /// counted − expectedAtCount.
  difference      Decimal?             @db.Decimal(12, 4)
  unitCost        Decimal              @default(0) @db.Decimal(14, 2)
  why             RetailStockCountWhy?
  recount         Boolean              @default(false)
  /// Shelf, then product name: the phone's order.
  sortKey         String
  createdAt       DateTime             @default(now())
  updatedAt       DateTime             @updatedAt

  count         RetailStockCount @relation(fields: [countId], references: [id], onDelete: Cascade)
  inventoryItem InventoryItem    @relation(fields: [inventoryItemId], references: [id], onDelete: Restrict)
  product       Product?         @relation(fields: [productId], references: [id], onDelete: SetNull)
  countedBy     User?            @relation("RetailStockCountLineCountedBy", fields: [countedById], references: [id], onDelete: SetNull)

  @@unique([countId, inventoryItemId])
  @@index([companyId, inventoryItemId])
}
```

Back-relations added on `Company`, `Site`, `StockLocation`, `User` (five named relations), `InventoryItem`, `Product`.
`ReservableIdEntity` gains `RETAIL_STOCK_COUNT` (`CNT`, scan `RetailStockCount.countNo`). Witness asserts the three enums and values, both
tables' columns and types, `categoryIds` default `{}`, the unique keys, and `ON DELETE CASCADE` from line to count.

#### `20261004133200_retail_stock_transfers` (STK-07) · witness `lib/retail/stock-transfers-migration.test.ts`

```prisma
enum RetailStockTransferStatus {
  ON_THE_WAY
  RECEIVED
  CANCELLED
}

model RetailStockTransfer {
  id            String                    @id @default(uuid())
  companyId     String
  transferNo    String
  fromSiteId    String
  toSiteId      String
  status        RetailStockTransferStatus @default(ON_THE_WAY)
  sentAt        DateTime                  @default(now())
  sentById      String
  /// "Taken by" on the sheet, "Driver" in the rail: a name, which need not be staff.
  driver        String?
  vehicle       String?
  /// As typed: "Today, by 11:00".
  arrives       String?
  note          String?
  receivedAt    DateTime?
  receivedById  String?
  cancelledAt   DateTime?
  cancelledById String?
  createdAt     DateTime                  @default(now())
  updatedAt     DateTime                  @updatedAt

  company     Company                   @relation(fields: [companyId], references: [id], onDelete: Cascade)
  fromSite    Site                      @relation("RetailStockTransferFrom", fields: [fromSiteId], references: [id], onDelete: Restrict)
  toSite      Site                      @relation("RetailStockTransferTo", fields: [toSiteId], references: [id], onDelete: Restrict)
  sentBy      User                      @relation("RetailStockTransferSentBy", fields: [sentById], references: [id], onDelete: Restrict)
  receivedBy  User?                     @relation("RetailStockTransferReceivedBy", fields: [receivedById], references: [id], onDelete: SetNull)
  cancelledBy User?                     @relation("RetailStockTransferCancelledBy", fields: [cancelledById], references: [id], onDelete: SetNull)
  lines       RetailStockTransferLine[]

  @@unique([companyId, transferNo])
  @@index([companyId, status, sentAt])
  @@index([companyId, fromSiteId, toSiteId])
}

model RetailStockTransferLine {
  id               String   @id @default(uuid())
  companyId        String
  transferId       String
  productId        String
  fromItemId       String
  /// The line at the receiving site; set when the first units are received.
  toItemId         String?
  quantitySent     Decimal  @db.Decimal(12, 4)
  quantityReceived Decimal  @default(0) @db.Decimal(12, 4)
  quantityLost     Decimal  @default(0) @db.Decimal(12, 4)
  unitCost         Decimal  @db.Decimal(14, 2)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  transfer RetailStockTransfer @relation(fields: [transferId], references: [id], onDelete: Cascade)
  product  Product             @relation(fields: [productId], references: [id], onDelete: Restrict)
  fromItem InventoryItem       @relation("RetailStockTransferLineFrom", fields: [fromItemId], references: [id], onDelete: Restrict)
  toItem   InventoryItem?      @relation("RetailStockTransferLineTo", fields: [toItemId], references: [id], onDelete: SetNull)

  @@unique([transferId, productId])
  @@index([companyId, productId])
}
```

Still to come on a line = sent − received − lost. `ReservableIdEntity` gains `RETAIL_STOCK_TRANSFER` (`TRF`). Witness asserts the enum, both
tables, the unique keys, and a `CHECK ("fromSiteId" <> "toSiteId")` constraint added in the SQL.

#### `20261004133300_retail_empties` (STK-09) · witness `lib/retail/empties-migration.test.ts`

```prisma
enum RetailEmptiesKind {
  DEPOSIT_CHARGED
  DEPOSIT_REFUNDED
  BOTTLES_BACK
  RETURNED_TO_SUPPLIER
  CREDIT_RECEIVED
}

/// The Empties ledger: every empty bottle and crate in or out of the store, and every deposit held for customers or owed by suppliers.
model RetailEmptiesEntry {
  id             String            @id @default(uuid())
  companyId      String
  siteId         String
  kind           RetailEmptiesKind
  /// Change to empties in the store at this site, signed.
  bottles        Int               @default(0)
  crates         Int               @default(0)
  /// Signed: + raises what is held for customers (charged) or owed by suppliers (returned); − lowers it.
  deposit        Decimal           @default(0) @db.Decimal(14, 2)
  /// "In the store" after this entry, at this site.
  bottlesAfter   Int
  cratesAfter    Int
  saleId         String?
  customerId     String?
  /// The buying spec's supplier model (named `RetailSupplier` here; rename to match it).
  supplierId     String?
  supplierName   String?
  goodsReceiptId String?
  /// On a credit: the return it settles.
  returnId       String?
  /// SALE-31870, GRN-0005, CN-2210.
  reference      String?
  note           String?
  createdById    String?
  createdAt      DateTime          @default(now())

  company   Company              @relation(fields: [companyId], references: [id], onDelete: Cascade)
  site      Site                 @relation(fields: [siteId], references: [id], onDelete: Restrict)
  sale      RetailSale?          @relation(fields: [saleId], references: [id], onDelete: SetNull)
  customer  Customer?            @relation(fields: [customerId], references: [id], onDelete: SetNull)
  supplier  RetailSupplier?      @relation(fields: [supplierId], references: [id], onDelete: SetNull)
  receipt   RetailGoodsReceipt?  @relation(fields: [goodsReceiptId], references: [id], onDelete: SetNull)
  return    RetailEmptiesEntry?  @relation("RetailEmptiesCredit", fields: [returnId], references: [id], onDelete: Restrict)
  credits   RetailEmptiesEntry[] @relation("RetailEmptiesCredit")
  createdBy User?                @relation("RetailEmptiesEntryCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)

  @@index([companyId, createdAt])
  @@index([companyId, kind, createdAt])
  @@index([siteId, createdAt])
  @@index([supplierId])
}

model RetailShopProfile {
  // … existing (and SET-01's additions) …
  /// Liquor: the deposit on one returnable bottle, used to value empties going back to a supplier.
  bottleDeposit Decimal @default(0.10) @db.Decimal(14, 2)
  /// Liquor: the deposit on one returnable crate.
  crateDeposit  Decimal @default(3.00) @db.Decimal(14, 2)
}

enum RetailCashMovementReason {
  // … existing …
  /// Cash paid out at the till for empties brought back without a sale.
  BOTTLES_BACK
}
```

Witness asserts the enum, the table, its indexes, the two profile columns with defaults 0.10 and 3.00, the new cash-movement reason, and
the self-relation's `ON DELETE RESTRICT`.

### 3.3 Audit event types added to `RETAIL_AUDIT_EVENTS`

| Constant | Event type | Entity | Payload |
|---|---|---|---|
| `stockAdjusted` | `RETAIL_STOCK.ADJUSTED` | `Product` | `{ reference, why, delta, value, siteId, approvedBy }` |
| `caseBroken` | `RETAIL_STOCK.CASE_BROKEN` | `Product` (the case) | `{ reference, cases, singles, siteId }` |
| `movementsReversed` | `RETAIL_STOCK.MOVEMENTS_REVERSED` | `Product` (one per product) | `{ references }` |
| `countStarted` | `RETAIL_STOCK_COUNT.STARTED` | `RetailStockCount` | `{ countNo, lines, counterId, blind, keepSelling }` |
| `countSubmitted` | `RETAIL_STOCK_COUNT.SUBMITTED` | `RetailStockCount` | `{ lines, differ }` |
| `countLineChanged` | `RETAIL_STOCK_COUNT.LINE_CHANGED` | `RetailStockCount` | `{ product, from, to }` |
| `countRecountAsked` | `RETAIL_STOCK_COUNT.RECOUNT_ASKED` | `RetailStockCount` | `{ lines }` |
| `countApproved` | `RETAIL_STOCK_COUNT.APPROVED` | `RetailStockCount` | `{ lines, differ, net, short, over }` (money as strings) |
| `countCancelled` | `RETAIL_STOCK_COUNT.CANCELLED` | `RetailStockCount` | `{}` |
| `transferSent` | `RETAIL_STOCK_TRANSFER.SENT` | `RetailStockTransfer` | `{ lines, units, value }` |
| `transferChanged` | `RETAIL_STOCK_TRANSFER.CHANGED` | `RetailStockTransfer` | `{ units }` |
| `transferReceived` | `RETAIL_STOCK_TRANSFER.RECEIVED` | `RetailStockTransfer` | `{ received, lost, stillComing }` |
| `transferCancelled` | `RETAIL_STOCK_TRANSFER.CANCELLED` | `RetailStockTransfer` | `{ returned }` |
| `emptiesReturned` | `RETAIL_EMPTIES.RETURNED` | `RetailEmptiesEntry` | `{ supplier, bottles, crates, deposit }` |
| `emptiesCredited` | `RETAIL_EMPTIES.CREDITED` | `RetailEmptiesEntry` (the return) | `{ creditNote, amount }` |

Edits from rails and the reorder sheet use FND's `RETAIL_RECORD.EDITED`. `lib/retail/audit.test.ts` is updated in each unit that adds
events. Activity sentences (`lib/retail/activity-words.ts`, FND 5.6.9):

| Event | Sentence | Tone |
|---|---|---|
| `RETAIL_STOCK.ADJUSTED` | "Took 2 off: broken or spoilt, US$26.06" / "Took 1 off: own use or gift, US$13.03" / "Added 2: found more" / "Set on hand from 13 to 11" | `warn` |
| `RETAIL_STOCK.CASE_BROKEN` | "Broke 1 case into 24 singles (BRK-0012)" | `hollow` |
| `RETAIL_STOCK.MOVEMENTS_REVERSED` | "Reversed ADJ-0031" | `hollow` |
| `RETAIL_STOCK_COUNT.STARTED` | "Started the count: 38 products, sent to Rudo Moyo" | `info` |
| `RETAIL_STOCK_COUNT.SUBMITTED` | "Counted 38 lines and sent them for review" | `info` |
| `RETAIL_STOCK_COUNT.LINE_CHANGED` | "Changed Gordon’s Gin 750ml from 19 to 20" | `info` |
| `RETAIL_STOCK_COUNT.RECOUNT_ASKED` | "Asked for 3 lines to be counted again" | `warn` |
| `RETAIL_STOCK_COUNT.APPROVED` | "Approved: stock set to what was counted, −US$41.20 to Breakage and losses" | `ok` |
| `RETAIL_STOCK_COUNT.CANCELLED` | "Cancelled the count" | `bad` |
| `RETAIL_STOCK_TRANSFER.SENT` | "Sent 540 units to Borrowdale" | `info` |
| `RETAIL_STOCK_TRANSFER.CHANGED` | "Changed the lines: 560 units on the way" | `info` |
| `RETAIL_STOCK_TRANSFER.RECEIVED` | "Received at Borrowdale: 538 units, 2 lost on the way" | `ok` (`warn` when lost) |
| `RETAIL_STOCK_TRANSFER.CANCELLED` | "Cancelled: 540 units back at Harare Main Branch" | `bad` |
| `RETAIL_EMPTIES.RETURNED` | "Booked 240 bottles and 20 crates back to Delta Beverages, US$84.00 owed" | `info` |
| `RETAIL_EMPTIES.CREDITED` | "Delta Beverages credited US$84.00 (CN-2210)" | `ok` |

`lib/retail/record-activity.ts` registers `RetailStockCount` (read `retail.counts:view`) and `RetailStockTransfer` (read
`retail.transfers:view`).

### 3.4 Movement words (`lib/retail/stock/movement-words.ts`, + test)

One table turns a movement into its Movement cell. "Short" is the Movements list (which has a Site column); "long" is the product record's
tab (no Site column), as the two boards show.

| Reason | Short label | Long label | Tone (badge on the list, dot on the tab) | Kind filter group |
|---|---|---|---|---|
| SALE / REFUND / VOID | "Sale" / "Refund" / "Void" | same | `hollow` | Sales and refunds |
| RECEIVED | "Received" | "Received" | `ok` | Deliveries |
| DELIVERY_DIFFERENCE | "Delivery difference" | same | `warn` | Deliveries |
| SUPPLIER_RETURN | "Returned to supplier" | same | `info` | Deliveries |
| COUNT | "Count, two broken" (see below) | same | `warn` | Counts |
| BROKEN / OWN_USE | "Broken or spoilt" / "Own use or gift" | same | `warn` | Breakage and own use |
| FOUND / CORRECTION / OPENING / REVERSAL / PLACE_MOVE | "Found more" / "Fixed a mistake" / "Opening stock" / "Reversed" / "Moved to Back store" | "Reversed: broken or spoilt" for a reversal | `ok` / `neutral` / `ok` / `neutral` / `neutral` | Corrections |
| TRANSFER_OUT / TRANSFER_IN / TRANSFER_BACK | "Transfer out" / "Transfer in" / "Back from a transfer" | "Transfer to Borrowdale" / "Transfer from Harare Main Branch" / "Back from TRF-0008" | `info` | Transfers |
| CASE_BROKEN | "Case broken into singles" | same | `neutral` | Cases |
| null (stores rows) | "Received" / "Issued" / "Adjusted" / "Moved" by `movementType` | same | `hollow` | — |

COUNT labels are "Count, <number word> <why>": number words one … ten, digits above; why = "broken" (BROKEN), "found" (FOUND),
"missing" (NOT_KNOWN, short) or "extra" (NOT_KNOWN, over) — "Count, two broken" on the board. All other labels except the board's are
**Defined here**.

### 3.5 Seed / demo data — extend `scripts/seed-retail-demo.ts`

One function per unit, called from `main()` after staff, sites (SET-02) and the sales history exist; idempotent by natural key (document
numbers, product codes). Dates are relative to the run; "today" is the run date in Africa/Harare. People: Tendai Mhlanga (owner), Tafara
Nyathi (manager), Chipo Dube, Farai Moyo, Kuda Banda (cashiers), Rudo Moyo (stock clerk, phone `+263 77 118 2044`, email
`rudo.stock@bottlestore.test`) — the admin spec seeds Kuda Banda and Rudo Moyo; if its seed has not run, `seedStockPeople()` upserts them
by these emails with the People board's roles and phones, so both seeds converge.

| Unit | Seed |
|---|---|
| STK-01 | Every stock line gets a coherent ledger: an `OPENING` movement 31 days ago (reference "Opening") with the balance that, after the history below, lands on the target on hand; a `SALE` movement for every seeded sale line in the last 30 days (reference = sale number, by = the cashier, at the sale's time); the documents below post their own movements. `balanceAfter` follows. Shelves: spirits at Harare Main Branch get "Shelf 2, top" (Jameson, Johnnie Walker), "Shelf 2, middle" (Gordon's), "Shelf 3" (Amarula, Two Keys, Bols Brandy, Hennessy). |
| STK-02 | Target stock lines (product, code, site, on hand, reorder at, unit cost): Jaggermeister 750ml `JAGER-750` HRE 0 bottles, 6, US$24.00 (new product, Spirits, price US$32.00; sold out 6 days ago); Johnnie Walker Black 750ml `BLKLABEL-750` HRE 6, 12, US$33.60; Jameson Irish Whiskey 750ml `JAMESON-750` HRE 9, 12, US$22.15; Amarula Cream 750ml `AMARULA-750` HRE 13, 12, US$13.03, reorder qty 24; Castle Lager 340ml `CASTLE-340` HRE 26, 96, US$0.86; Gordon’s Gin 750ml `GORDONS-750` HRE 18, 6, US$12.40; Bohlinger’s 330ml `BOHLINGER-330` **BDL** 96, 36, US$1.08 (and no line at HRE); Chibuku Scud 1L `CHIBUKU-1L` HRE 210 cartons, 60, US$0.82; Ice 2kg bag `ICE-2KG` HRE 40 bags, 20, US$1.00. Values at cost then equal the board to the cent (US$201.60, 199.35, 169.39, 22.36, 223.20, 103.68, 172.20, 40.00). Net units sold in the last 30 days at that site (so cover and levels match): Johnnie Walker 60, Jameson 90, Amarula 63, Castle 90 from the singles line (the board's 9 days; see Open questions), Gordon's 68, Bohlinger's 70 at BDL, Chibuku 102, Ice 86, Jaggermeister 18 (all before it ran out). Other seeded lines keep the catalogue's figures; Coca-Cola 500ml at HRE gets 180 so nothing else reads Out. Result: Out = Jaggermeister; Low = Johnnie Walker, Jameson, Amarula, Castle; Too much includes Chibuku (≈62 days); badge "5 low". `RetailShopProfile.defaultSiteId` = HRE. |
| STK-03 | Nothing beyond STK-01 (the board's movements are the documents' own: SALE, GRN, CNT-0019, TRF-0007, BRK-0012). |
| STK-04 | BRK-0012: 30 September 18:02 at HRE by Farai Moyo on his open shift (the till rule: singles at 0): Castle Lager case of 24 −1 (22 cases after), Castle Lager 340ml +24. ADJ-0030: 1 October 10:15, Amarula Cream 750ml −1, Own use or gift, "Taken for the owner’s function", by Tafara Nyathi. ADJ-0031: 2 October 15:40, Two Keys Whisky 750ml −1, Broken or spoilt, "Dropped while restocking the shelf.", by Rudo Moyo (US$7.20, under the PIN limit). |
| STK-05 / STK-06 | Costs used: Gordon’s Gin US$12.40, Nederburg Cabernet 750ml US$9.40, Bols Brandy 50ml US$1.20 (new product, Spirits, price US$1.80). CNT-0016 "Spirits shelf" (CATEGORIES Spirits), HRE, Tafara Nyathi, approved 16 September, −US$22.15. CNT-0017 "Soft drinks" (CATEGORIES Soft drinks), approved 23 September, −US$8.00. CNT-0018 "Everything", HRE, Tafara Nyathi, approved 30 September 07:00, every HRE line, 9 differ, −US$63.10, of which −US$33.60 on spirits. CNT-0019 "Beer, back store" (PLACE Back store, where the beer lines are kept), Tafara Nyathi, approved 2 October 09:12, 1 differs (Zambezi Lager 375ml −2, Why Broken, at US$0.86), −US$1.72. CNT-0020 "Spirits shelf" (CATEGORIES Spirits and Wine, so the shelf's wine is in it), HRE, blind, keep selling, counter Rudo Moyo, started today 10:06, first figure 10:12, submitted 10:40, To approve; lines = every Spirits and Wine line at HRE; differing: Gordon’s Gin 750ml 22 → 20 (Not known), Nederburg Cabernet 750ml 18 → 16 (Not known), Bols Brandy 50ml 6 → 8 (Found); the rest match → −US$41.20 (short −US$43.60 on 2 lines, over +US$2.40 on 1). CNT-0021 "Cold room" (PLACE Cold room), counter Kuda Banda, started today 11:05, 40 lines, 12 counted, Counting. Counts badge "1 to approve"; CNT-0020's history: CNT-0016, CNT-0018, CNT-0020 (aside "Today −US$41.20 · 30 September −US$33.60 · 16 September −US$22.15"). |
| STK-07 / STK-08 | TRF-0006 Borrowdale → Harare Main Branch, 27 September 16:20, Rudo Moyo, Ice 2kg bag 46 sent at US$1.00, 44 received, 2 lost (state "Received, 2 short", US$46.00). TRF-0007 Harare Main Branch → Borrowdale, 1 October 12:03 by Tafara Nyathi, received 12:40 by Rudo Moyo: Amarula Cream 750ml 4, Jameson Irish Whiskey 750ml 2, Gordon’s Gin 750ml 2 (Received). TRF-0008 Harare Main Branch → Borrowdale, today 08:30 by Tafara Nyathi, On the way, vehicle "Shop bakkie, AEZ 4471", driver "Simba Mutasa", note "For the weekend at Borrowdale", arrives "Today, by 11:00": Castle Lager 340ml 240 at US$0.86, Coca-Cola 500ml 120 at US$0.52, Chibuku Scud 1L 120 at US$0.82, Fanta Orange 500ml 60 at US$0.76 (new product, Soft drinks) → 540 units, US$412.80. HRE lines are raised before sending so the post-send on hand still equals the STK-02 targets. Borrowdale's lines total 664 units before TRF-0008 so the KPI reads "Borrowdale holds 1,204 +540" (Bohlinger’s 96 plus other Borrowdale lines from the products spec's catalogue; adjust the seeded Borrowdale opening stock to make 664). Ten transfers in all between the two sites over eight months for the chart (Mar 2, Apr 1, May 3, Jun 2, Jul 4, Aug 2, Sep 3, Oct 1 minus the three above), every one Received. |
| STK-09 | `RetailShopProfile.bottleDeposit` 0.10, `crateDeposit` 3.00. Empties at HRE: a run of older BOTTLES_BACK entries (customers, 12–48 bottles, 1–4 crates) so the store holds 628 · 49 before the four board rows; then 2 October 09:30 CREDIT_RECEIVED Delta Beverages CN-2210 −US$84.00 against an earlier return; yesterday 17:40 RETURNED_TO_SUPPLIER Delta Beverages GRN-0005 −240 −20 US$84.00; today 11:02 BOTTLES_BACK Tapiwa Marange +24 +2 −US$8.40; today 12:10 DEPOSIT_CHARGED sale SALE-31870 (or the seeded sale nearest that time) US$4.20 → In the store 412 · 31. DEPOSIT_CHARGED entries for the seeded sales of the last 30 days with deposits, and returns and credits for Delta Beverages and Natbrew, chosen so the tabs read Held for customers US$84.30 and Owed by suppliers US$231.00 (the seed asserts both and fails loudly otherwise). |

---

## 4. API

Conventions are FND section 4: `requireRetailSession`, `requireRetailPermission`, `successResponse`/`errorResponse`, every query scoped to
`session.user.companyId` and ids re-checked against it, 400 `{ error, fieldErrors }` for sheets, 409 sentences shown as given, audit in the
same transaction. Money in responses as numbers to two places; quantities as numbers. Cost fields are omitted for roles without
`retail.catalog:view-cost`.

### 4.1 List sources (FND 4.1 `GET /api/v2/reports/[key]` and 4.2 export)

Definitions in `lib/reports/definitions/retail/stock.ts`, loaders in `lib/reports/loaders/retail/stock.ts`, all `catalog: false`. Columns,
filters and tabs are in section 5.

| Key | Loader | Parent filters | Read |
|---|---|---|---|
| `retail-stock-on-hand` | in memory (≤ 5,000 lines) | — | `retail.stock:view` |
| `retail-stock-movements` | database `page()` (sorts, filters, search, group, totals by `aggregate`/`groupBy` on `change`) | `product` (productId), `site` | `retail.stock:view` |
| `retail-stock-counts` | in memory | — | `retail.counts:view` |
| `retail-stock-count-differences` / `retail-stock-count-lines` | in memory | `count` (countId) | `retail.counts:view` |
| `retail-stock-transfers` | in memory | — | `retail.transfers:view` |
| `retail-stock-transfer-lines` | in memory | `transfer` (transferId) | `retail.transfers:view` |
| `retail-empties` | database `page()` | — | `retail.empties:view` |

Engine additions this area needs (small, additive changes to FND-04/05 files, each landing in the unit that first needs it):

| Addition | Where | Unit |
|---|---|---|
| `requires: "multi-site"` on a column or filter: stripped by `fetchListPage` when the company has one open site (like `view-cost`) | `lib/reports/request.ts`, `types.ts` | STK-02 |
| `sign: "plain" \| "gain"` on `num`/`money` cells: always signed ("+40", "−1", "US$0.00"); `gain` colours positives `--ok` without a pill | `components/list-frame/list-cell.tsx` | STK-03 |
| A tab whose badge is a money sum: `tabs[].badge = { sum: "<column>" }` (sum over the tab's rows ignoring search and filters, formatted with the column's currency) | `list-query.ts` `tabCounts`, `list-tabs.tsx` | STK-09 |
| `when` cells with `relative: true`: "Today 12:10", "Yesterday 17:40", else "2 Oct 09:30" | `lib/workspace/format.ts` (`formatWhenRelative`), `list-cell.tsx` | STK-09 |
| Header sub and sub link from a parent filter: the source's `parentLabel(filters)` returns e.g. "Amarula Cream 750ml" and the frame shows it as the header sub with "All products" clearing it | `list-frame.tsx` | STK-03 |

### 4.2 Stock lines and reorder levels (STK-02)

`GET /api/v2/retail/stock/lines?productId=&siteId=` (`retail.stock:view`, or `retail.adjustments:create` for the adjust sheet) →

```ts
{ data: Array<{
    id: string; site: { id: string; name: string }; place: { id: string; name: string } | null;
    product: { id: string; name: string; code: string; packOf: { id: string; name: string } | null; packSize: number | null };
    unit: string; onHand: number; reorderAt: number | null; reorderQty: number | null; shelf: string | null;
    unitCost?: number | null; perDay: number; coverDays: number | null; level: "OUT" | "LOW" | "FINE" | "TOO_MUCH";
    cases: Array<{ productId: string; name: string; packSize: number; lineId: string | null; onHand: number }>;   // case products of this single
  }>; siteCount: number }
```

`GET /api/v2/retail/stock/lines/[id]` → one of the above. 404 "That stock line is not this shop’s."

`PATCH /api/v2/retail/stock/lines/[id]` (`retail.stock:update`; FND 4.9 contract) body any of
`{ reorderAt: number | null, reorderQty: number | null, shelf: string | null, placeId: uuid }` → `{ data, changed }`. Validation:
`reorderAt` ≥ 0 ("Reorder at is a number, 0 or more."), `reorderQty` > 0 ("Reorder is a number above 0."), `shelf` ≤ 60, `placeId` an open
place of the line's site ("That place is not at this site."). **Defined here.** A place change writes a `PLACE_MOVE` movement (change 0,
"Moved to Back store") and the line's `locationId`. One `RETAIL_RECORD.EDITED` per field on entity `Product`, labels "Reorder at",
"Reorder", "Shelf", "Place". The product record's Stock rail rows (products spec) save through this endpoint.

`GET /api/v2/retail/stock/reorder?lineIds=<≤500 comma-separated>` (`retail.stock:update`) →

```ts
{ data: Array<{ lineId: string; product: string; site: string; unit: string; perDay: number; reorderAt: number | null;
                unitCost?: number | null; leadDays: number; caseSize: number | null }>;
  keepDays: 14 }
```

`PUT /api/v2/retail/stock/reorder` (`retail.stock:update`) body `{ levels: Array<{ lineId: uuid; reorderAt: number | null }> }` (1–500) →
`{ saved: number }`. 400 `fieldErrors["levels.<i>"]` "Reorder at is a number, 0 or more.".

### 4.3 Adjust stock, break a case, reverse (STK-03, STK-04)

`POST /api/v2/retail/stock/adjustments` (`retail.adjustments:create`)

```ts
// body
{ productId: uuid; siteId?: uuid; why: "BROKEN" | "OWN_USE" | "FOUND" | "CORRECTION";
  n: string;            // "2" — how many; for CORRECTION the number on hand
  note: string;         // 1–500
  photoUrl?: string | null;
  approver?: { userId: uuid; pin: string } }
// 201
{ data: { reference: "ADJ-0031"; movementId: string; lineId: string; delta: number; onHand: number; value?: number },
  message: "2 off Amarula Cream 750ml. 11 left." }
```

Errors: 400 `fieldErrors` (`n`, `note`, `pin`); 403 role; 404 "That product has no stock at that site."; 409 `{ error: "Over US$50.00 needs
a manager PIN.", needsApprover: true }`; 429 "Too many tries. Try again in 15 minutes.".

`POST /api/v2/retail/stock/case-breaks` (`retail.adjustments:create`, or the till rule in W-26) body
`{ caseProductId: uuid; siteId?: uuid; cases: number (int 1–500) }` → 201
`{ data: { reference: "BRK-0012"; cases; singles; caseOnHand; singleOnHand }, message: "1 case broken. 26 singles on hand." }`. Errors 400
"Say how many cases to open" (zod), 409 refusals in W-26.

`POST /api/v2/retail/stock/movements/reverse` (`retail.adjustments:approve`) body `{ ids: uuid[] (1–200) }` →
`{ reversed: Array<{ id; reference }>; skipped: Array<{ id; reference; why }> }`.

### 4.4 Counts (STK-05, STK-06)

| Method and path | Who | Body / query | Response | Errors |
|---|---|---|---|---|
| `GET /api/v2/retail/stock/counts/preview` | `retail.counts:create` | `siteId, scope, categoryIds, lineIds, placeId` | `{ products: number }` | 400 |
| `POST /api/v2/retail/stock/counts` | `retail.counts:create` | `{ scope, categoryIds?: uuid[], lineIds?: uuid[], placeId?: uuid, siteId?: uuid, counterId: uuid, blind: boolean, keepSelling: boolean }` | 201 `{ data: { id, countNo, lines, counter: { id, name }, messaged: boolean } }` | 400 fieldErrors (`cats`, `who`, `site`), 409 already counting |
| `GET /api/v2/retail/stock/counts/[id]` | `retail.counts:view`, or the counter | — | `CountView` (below) | 404 |
| `PATCH /api/v2/retail/stock/counts/[id]` | `retail.counts:update` | `{ name: string (1–80) }` | `{ data, changed }` | 409 "Approved counts do not change." |
| `GET /api/v2/retail/stock/counts/[id]/lines` | counter or `retail.counts:view` | `?tab=differ\|match\|all\|recount` | `{ lines: CountLine[], progress: { counted, total } }` (`expected` omitted for the counter of a blind count) | 404 |
| `PUT /api/v2/retail/stock/counts/[id]/lines/[lineId]` | counter (while Counting) or `retail.counts:approve` (while To approve) | `{ counted: string }` (≥ 0, ≤ 4 decimals) | `{ line, progress }` | 400 `fieldErrors.counted` "Type how many are there.", 409 "This count is closed." |
| `PATCH /api/v2/retail/stock/counts/[id]/lines/[lineId]` | `retail.counts:approve` | `{ why: "BROKEN" \| "NOT_KNOWN" \| "FOUND" }` | `{ line }` | 409 |
| `POST /api/v2/retail/stock/counts/[id]/submit` | counter or `retail.counts:update` | — | `{ status: "TO_APPROVE" }` | 409 "Count every line first: 35 to go." |
| `POST /api/v2/retail/stock/counts/[id]/recount` | `retail.counts:approve` | `{ lineIds?: uuid[] }` | `{ lines: number }` | 409 not To approve |
| `POST /api/v2/retail/stock/counts/[id]/approve` | `retail.counts:approve` | — | `{ data: { differenceValue, accountingStatus } }` | 403 owner limit, 409 |
| `POST /api/v2/retail/stock/counts/[id]/cancel` | `retail.counts:delete` | — | `{ status: "CANCELLED" }` | 409 "Approved counts cannot be cancelled." |
| `POST /api/v2/retail/stock/counts/[id]/remind` | `retail.counts:update` | — | `{ messaged: boolean }` | 409 not Counting |
| `GET /api/v2/retail/stock/counts/[id]/sheet.pdf` | `retail.counts:view` | — | PDF "Count sheet" (product, shelf or place, expected — blank when blind —, a box to write in) | 404 |
| `GET /api/v2/retail/stock/counts/[id]/export.pdf` | `retail.counts:view` | — | PDF of the record: header, KPIs, every line with expected, counted, difference, value | 404 |
| `POST /api/v2/retail/stock/counts/approve` | `retail.counts:approve` | `{ ids: uuid[] (≤100) }` | `{ approved: string[], waiting: string[], skipped: string[] }` (count numbers) | — |
| `POST /api/v2/retail/stock/counts/print` | `retail.counts:view` | `{ ids }` | one PDF of count sheets | — |

```ts
type CountView = {
  id: string; countNo: string; name: string; status: "COUNTING" | "TO_APPROVE" | "APPROVED" | "CANCELLED";
  scope: string; scopeLabel: string;            // the name without a trailing " shelf" ("Spirits") — the review aside's "<scopeLabel>, last three counts"
  site: { id: string; name: string }; place: { id: string; name: string } | null;
  blind: boolean; keepSelling: boolean;
  counter: { id: string; name: string; role: string }; createdBy: { name: string };
  startedAt: string; firstCountedAt: string | null; submittedAt: string | null; approvedAt: string | null; approvedBy: string | null;
  lines: number; counted: number; differ: number; recount: number;
  short?: { value: number; lines: number }; over?: { value: number; lines: number }; difference?: number;   // cost roles only
  approves: "A manager" | "The owner";
  // Approved counts at the same site that shared at least one product with this one, plus this one, oldest first; `difference` is
  // each count's difference at cost on the shared products only — "this shelf". Feeds the chart and the review aside.
  history: Array<{ id: string; countNo: string; at: string; difference: number }>;
};
```

### 4.5 Transfers (STK-07, STK-08)

| Method and path | Who | Body | Response | Errors |
|---|---|---|---|---|
| `POST /api/v2/retail/stock/transfers` | `retail.transfers:create` | `{ fromSiteId, toSiteId, lines: [{ lineId, quantity: string }], takenById: uuid, arrives: string }` | 201 `{ data: { id, transferNo, units, value? } }` | 400 fieldErrors (`to`, `lines.<i>`, `who`, `when`) |
| `GET /api/v2/retail/stock/transfers/[id]` | `retail.transfers:view` | — | `TransferView` | 404 |
| `PATCH /api/v2/retail/stock/transfers/[id]` | `retail.transfers:update` | `{ toSiteId?, vehicle?, driver?, note? }` | `{ data, changed }` | 409 "Part of it has been received, so it is going to Borrowdale." |
| `PUT /api/v2/retail/stock/transfers/[id]/lines` | `retail.transfers:update` | `{ lines: [{ lineId, quantity }] }` | `{ data }` | 409 part received |
| `POST /api/v2/retail/stock/transfers/[id]/receive` | `retail.transfers:update` | `{ lines: [{ id, received: string }], short: "STILL_COMING" \| "LOST" }` | `{ data, message }` | 400, 409 |
| `POST /api/v2/retail/stock/transfers/[id]/cancel` | `retail.transfers:delete` | — | `{ data }` | 409 "TRF-0007 has been received." |
| `GET /api/v2/retail/stock/transfers/[id]/delivery-note.pdf` | `retail.transfers:view` | — | PDF "Delivery note": number, from, to, sent, by, driver, vehicle, lines (product, sent, received), "Sent by" and "Received by" signature lines | 404 |
| `POST /api/v2/retail/stock/transfers/print` | `retail.transfers:view` | `{ ids }` | one PDF of delivery notes | — |
| `POST /api/v2/retail/stock/transfers/cancel` | `retail.transfers:delete` | `{ ids }` | `{ cancelled: string[], skipped: string[] }` | — |

```ts
type TransferView = {
  id: string; transferNo: string; status: "ON_THE_WAY" | "RECEIVED" | "CANCELLED"; stateLabel: string;   // "Part received, 2 to come"
  from: { id: string; name: string }; to: { id: string; name: string };
  sentAt: string; sentBy: string; driver: string | null; vehicle: string | null; arrives: string | null; note: string | null;
  receivedAt: string | null; receivedBy: string | null;
  lines: Array<{ id: string; product: { id: string; name: string }; sent: number; received: number; lost: number; toCome: number;
                 unitCost?: number; value?: number }>;
  units: number; value?: number; toSiteHolds: number;            // units on hand at the To site now
  history: Array<{ month: string; transfers: number }>;           // between these two sites, either way, last 36 months
};
```

### 4.6 Empties (STK-09)

| Method and path | Who | Body | Response | Errors |
|---|---|---|---|---|
| `GET /api/v2/retail/empties/summary?siteId=` | `retail.empties:view` | — | `{ site: { id, name }, inStore: { bottles, crates }, heldForCustomers, owedBySuppliers, bottleDeposit, crateDeposit }` | 409 liquor off |
| `POST /api/v2/retail/empties/returns` | `retail.empties:create` | `{ supplierId, bottles: int ≥ 0, crates: int ≥ 0, goingBackWith: string (1–80), siteId? }` | 201 `{ data: { id, deposit }, message }` | 400 `fieldErrors` (`bottles`, `crates`, `sup`), 409 liquor off |
| `POST /api/v2/retail/empties/returns/[id]/credit` | `retail.empties:update` | `{ creditNote: string (1–40), amount: string, note?: string }` | 201 `{ data: { id }, message }` | 400 `fieldErrors.amount` "Delta Beverages owes US$84.00 on this return." |
| `POST /api/v2/retail/empties/bottles-back` | `retail.empties:create` (the caller's open shift) | `{ shiftId, bottles, crates, customerId? }` | 201 `{ paid }` | 409 "Open a shift to pay out." |

Internal services (`lib/retail/stock/empties.ts`): `recordSaleEmpties(tx, sale)`, `recordRefundEmpties(tx, refund)`,
`bookEmptiesReturn(tx, { siteId, supplierId, bottles, crates, goodsReceiptId?, reference?, note })` (also called by the buying spec's
Receive).

### 4.7 Lookups (FND 4.4, `lib/retail/lookups.ts`)

| Noun | Search | Sub | Quick add | Unit |
|---|---|---|---|---|
| `stock-line` | product name, code or barcode, lines at `context.siteId` (barcode scan picks exactly) | transfer: "9 at Harare Main Branch"; count/reorder: "9 bottles" | none | STK-02 |
| `pack` | case products (`packOfId` set) with a line at `context.siteId` | "4 cases" | Single, How many in it → the products spec's pack create (W-12) when present; no add option otherwise | STK-04 |
| `site` | open sites | "Default" for the default site | Name → the setup spec's site create (SET-02, `retail.sites:create`) | STK-05 (if SET-02 has not registered it) |
| `place` | open places at `context.siteId` | the number of lines kept there | none | STK-05 |

`person` (Counted by, Taken by, Manager) and `supplier` (To) are the admin and buying specs' nouns. `person` takes `context.can`
(`"retail.adjustments:approve"`) to list only people who may approve.

### 4.8 Nav badges (FND 4.3, `lib/retail/nav-badges.ts`)

| Href | Count | Label | Requires |
|---|---|---|---|
| `/retail/stock` | stock lines whose level is Low or Out | "<n> low" | `retail.stock:view` |
| `/retail/stock/counts` | counts To approve | "<n> to approve" | `retail.counts:approve` |

---

## 5. UI per page

Frames are FND's; this section is the content. Widths are the board's grid tracks. "Priority" is FND 5.4.2 (3 leaves first).

### 5.1 On hand — `/retail/stock` (STK-02) · board `StockList.png`

`app/retail/stock/page.tsx` → `<ListFrame source="retail-stock-on-hand" title="On hand" />`.

- **Header**: title "On hand"; no back, no sub; primary "+ Add a product" → `?sheet=product-new` (the products spec's kind; requires
  `retail.catalog:create`). Panel: Stock › On hand current, badge "5 low".
- **Tabs** (counts ignore search and filters): "All" (default), "Low", "Out", "Too much".
- **Toolbar**: search "Name, code or barcode" (keys: product name, code, barcode). Filters:

  | Filter | Where | Options | Default |
  |---|---|---|---|
  | Category | row | "Any", then the company's categories by sort order | Any |
  | Site | row, `requires: "multi-site"` | "All sites", then open sites | All sites |
  | Place | Filters, multi-site or more than one place | "Anywhere", then places ("Harare Main Branch · Back store") **Defined here** | Anywhere |
  | Archived | Filters | "Hide archived", "Show archived" **Defined here** | Show archived (they still count) |

  Sorts: "Least cover first" (default: Out first, then cover ascending, then name), "Name A–Z", "Most value first", "Most on hand"
  (**Defined here** except the first). Groups: "Level", "Category", "Site".
- **Columns** (grid `40px minmax(190px,1.4fr) 130px 110px 140px 110px 90px 130px 110px 44px`, min width 1180px + 84):

  | Column | Key | Cell | Align | Priority | Value |
  |---|---|---|---|---|---|
  | Product | `product` | `link` → `/retail/products/{productId}` | start | 1 | product name |
  | Code | `code` | `mono` | start | 2 | product code |
  | Level | `level` | `state`, tones Out `bad`, Low `warn`, Fine `hollow`, Too much `info` | start | 1 | `stockLevel()` |
  | Site | `site` | `muted`, `requires: "multi-site"` | start | 3 | site name |
  | On hand | `onHand` | `num`, sortable | end | 1 | `formatQuantity(onHand, unit)` "6 bottles", "210 cartons" |
  | Reorder at | `reorderAt` | `num` | end | 2 | number, "—" when not set |
  | Cover | `cover` | `bar` `{ pctKey: "coverPct", warnBelow: 35 }` | start | 2 | words "3 days" (rounded, "1 day", "Not sold in 30 days" with a full bar); "—" when Out; `coverPct = min(100, coverDays × 5)` (20 days fills it) |
  | Value at cost | `value` | `money`, total sum, `requires: "view-cost"` | end | 1 | on hand × unit cost |

- **Totals**: "Σ 9" and the Value at cost total ("US$1,131.78"); nothing else.
- **Row link**: the product name. **Row menu** (**Defined here**): "Open the product"; "Adjust stock" (`?sheet=stock-adjust&productId=&siteId=`,
  `retail.adjustments:create`); "Count it" (`?sheet=count-new&ids=<lineId>`, `retail.counts:create`); "Move to another site"
  (`?sheet=transfer-new&ids=<lineId>`, multi-site, `retail.transfers:create`); "Change reorder level" (`?sheet=reorder-levels&ids=<lineId>`,
  `retail.stock:update`).
- **Bulk** (board order): "Add to an order" (`?sheet=order-new&lineIds=`, buying), "Count these" (`?sheet=count-new&ids=`), "Move to another
  site" (`?sheet=transfer-new&ids=`, multi-site only), "Change reorder level" (`?sheet=reorder-levels&ids=`); then "Export <n>". Each only
  for roles that may.
- **Empty** (`everEmpty`, **Defined here**): "What is on the shelf?" / "Add a product and it is stock at once; deliveries and counts keep it
  true." Steps: "**Add a product with its opening stock.** Cost and reorder level can come later." · "**Receive deliveries against
  orders.** Each one adds to what is here." · "**Count a shelf now and then.** Differences wait for your approval." Primary "Add a product",
  secondary "Import a spreadsheet" → the setup spec's Import page (W-08; `/retail/catalog/import`, which moves with the Products list to `/retail/products/import`).
- **Phone card**: title product, badge level, figure on hand ("6 bottles"), meta "{code} · reorder at {n} · {cover}", figure2 value at cost
  (cost roles).
- **Roles**: Owner, Manager, Bookkeeper see everything; Stock clerk sees no Value at cost and no "Change reorder level"/"Add to an order";
  Cashier: 403 "Your role cannot view stock."

### 5.2 Change reorder levels — sheet `reorder-levels` over On hand (STK-02) · board `Reorder.png`

From `K.reorder`. Wide (760px).

| Part | Content |
|---|---|
| Title / sub | "Change reorder levels" / "<n> products ticked" ("1 product ticked" for one) |
| Section 1 | **Set** `seg` "From what sells" (default) \| "One number for all". When "From what sells": **Keep enough for** `text` mono half, default "14 days" (accepts "14" or "14 days", 1–120), hint "Plus the supplier’s lead time."; **Round up to** `seg` half "Singles" \| "Whole cases" (default "Whole cases"). When "One number for all" (**Defined here**): **Reorder at** `text` mono half, hint "Every ticked product gets this level." |
| Section "Levels" | `lines` ql "Reorder at", cl "Cost": one row per line: name; sub "Sells 2 a day · now 12" (rate words: whole numbers from 1, "Sells about 1 every 4 days" below 1, "Not sold in 30 days" at 0; "now <reorderAt>" or "now not set"); Reorder at input (the suggestion, editable); Cost; Value = reorder at × cost; × removes the line. Add row: "Add a product: search, scan, or add a new one" over `stock-line` at the same site (no new product here). Σ "<n> lines", total reorder units, total value. Cost and Value columns are absent for roles without view-cost. |
| Recompute | changing Keep enough for, Round up to or Set recomputes every untouched row; a row typed by hand keeps its figure |
| Footer | note "Low stock and suggested orders use these."; "Cancel"; primary "Save" |
| Submit | `PUT /api/v2/retail/stock/reorder`; invalidates `["list","retail-stock-on-hand"]`, `["nav-badges"]` |
| Done | "Reorder levels saved for 4 products." |
| Requires | `retail.stock:update` |

### 5.3 New product from On hand — sheet `product-new` over On hand · board `ProductNewStock.png`

The products spec's `product` kind (title "New product", sub "Adds it to Products, On hand and the Retail price list", fold "More details",
secondary "Add, then another", primary "Add product", done "Savanna Dry 330ml is on sale at US$2.10 on every till."). STK-02 adds only the
opener and the invalidation of `retail-stock-on-hand`. The new product appears on On hand at once with its opening stock at the chosen site
("At", asked only with two sites), Level Out when the opening stock is 0.

### 5.4 Movements — `/retail/stock/movements` (STK-03) · board `MovementsList.png`

`<ListFrame source="retail-stock-movements" title="Movements" />`.

- **Header**: "Movements"; no primary. With `?product=<id>`: sub = the product's name and sub link "All products" (clears it).
- **Tabs**: none.
- **Toolbar**: search "Product or reference" (product name, code, reference). Filters: Kind (row; "Any", "Sales and refunds", "Deliveries",
  "Counts", "Breakage and own use", "Corrections", "Transfers", "Cases"); Site (row, `requires: "multi-site"`; "All sites" + sites); When
  (Filters; period, default **Last 30 days**, so the board's "Filters 1"); By (Filters; "Anyone" + people who moved stock) **Defined here**.
  Sorts "Newest first" (default), "Oldest first", "Biggest change". Groups "Movement", "Site", "By".
- **Columns** (grid `40px 150px minmax(180px,1.3fr) 150px 120px 140px 80px 80px 120px 44px`, min width 1100px + 84):

  | Column | Key | Cell | Align | Priority | Value |
  |---|---|---|---|---|---|
  | When | `at` | `when` ("3 Oct 13:12"), sortable | start | 1 | `createdAt` |
  | Product | `product` | `link` → `/retail/products/{productId}` | start | 1 | |
  | Movement | `movement` | `state` with the 3.4 tones | start | 1 | short label (3.4) |
  | Reference | `reference` | `ref` → by reason (W-28 step 2); plain mono when no page | start | 1 | "SALE-31862", "GRN-0004" |
  | Site | `site` | `muted`, multi-site | start | 3 | |
  | Change | `change` | `num`, `sign: "gain"`, total sum | end | 1 | "−1", "+40" |
  | Balance | `balance` | `num` | end | 2 | `balanceAfter`, "—" when null |
  | By | `by` | `muted` | start | 2 | `issuedBy.name` |

  Hidden columns available to the product tab and exports: `movementLong`, `in` (positive changes, total sum), `out` (negative, total sum).
- **Totals**: "Σ 7" and Change total ("+58").
- **Row menu** (**Defined here**): "Open <reference>" (when it has a page), "Open the product", "Reverse" (`--bad`, reversible reasons only,
  `retail.adjustments:approve`).
- **Bulk**: "Reverse" (ask `reversemovements`, `retail.adjustments:approve`), "Print" (PDF export of the ticked rows); "Export <n>".
- **Empty** (**Defined here**): icon `Clock`, "No movements yet", "Every sale, delivery, count and transfer shows here with what it left on
  the shelf."
- **Phone card**: title product, badge movement, figure change, meta "{when} · {reference} · {by}", figure2 balance.

### 5.5 Counts — `/retail/stock/counts` (STK-05) · board `CountsList.png`

`<ListFrame source="retail-stock-counts" title="Counts" />` (FND-03 moved the old `count` page here; STK-05 replaces it).

- **Header**: "Counts"; primary "+ Start a count" → `?sheet=count-new` (`retail.counts:create`). Badge "1 to approve".
- **Tabs**: "To approve" (default), "Counting", "Done" (Approved and Cancelled), "All".
- **Toolbar**: search "Count or shelf" (count number, name). Filters Site (row, multi-site, "All sites"), State (row; "Any", "Counting", "To
  approve", "Approved", "Cancelled"); Counted by (Filters, "Anyone") **Defined here**. Sorts "Newest first" (default), "Oldest first",
  "Biggest difference" **Defined here**. Groups "State", "Site", "Counted by".
- **Columns** (grid `40px 110px minmax(180px,1.3fr) 150px 140px 90px 90px 130px 150px 44px`):

  | Column | Key | Cell | Align | Value |
  |---|---|---|---|---|
  | Count | `countNo` | `ref` → `/retail/stock/counts/{id}` | start | "CNT-0020" |
  | What | `name` | `text` | start | "Spirits shelf" |
  | Counted by | `counter` | `muted` | start | |
  | When | `when` | `text` | start | To approve: submitted "Today, 10:40"; Counting: "Started 11:05" ("Started 2 Oct, 11:05" on other days); Approved: approved "2 Oct, 09:12"; Cancelled: cancelled time. Words from `formatDayTime` ("Today, 10:40", "Yesterday, 17:40", "30 Sep, 07:00") |
  | Lines | `lines` | `num` (text) | end | "38"; while counting "12 of 40" |
  | Differ | `differ` | `num`, total sum | end | lines with a difference; blank while counting |
  | Difference | `difference` | `money`, total sum, `requires: "view-cost"` | end | signed at cost ("−US$41.20"); "–" (`--faint`) while counting |
  | State | `state` | `state`: To approve `warn`, Counting `info`, Approved `hollow`, Cancelled `neutral` | start | |

- **Totals**: "Σ 4", Differ "13", Difference "−US$106.02".
- **Row menu** (**Defined here**): "Open", "Approve the differences" (To approve → review page), "Print count sheet", "Cancel the count"
  (`--bad`, Counting or To approve).
- **Bulk**: "Approve the differences" (ask `approvecounts`, `retail.counts:approve`), "Print count sheets"; "Export <n>".
- **Empty** (**Defined here**): "When did you last count?" / "A blind count on a phone finds what the till cannot." Steps: "**Pick a shelf
  or a category.** Or everything, after hours." · "**Send it to whoever counts.** They count on their phone, without seeing what is
  expected." · "**Approve the differences.** Only then does stock change." Primary "Start a count".
- **Phone card**: title "{name}", badge state, figure difference, meta "{countNo} · {counter} · {when}", figure2 "{differ} differ".

### 5.6 Start a count — sheet `count-new` over Counts (STK-05) · board `CountNew.png`

From `K.countnew`. 520px.

| Field | Type | Options / default | Validation and hint |
|---|---|---|---|
| Count | `seg` | "Everything", "Some categories" (default), "Some products", "A place" (shown only when the site has more than one place) | — |
| Categories (when Some categories) | `tags` with `category` lookups | default from the opener (board: "Spirits"); placeholder "Add a category, then Enter" | at least one; hint "<n> products." from preview |
| Products (when Some products, **Defined here**) | `tags` with `stock-line` lookups at the site | from On hand bulk/row: the ticked lines at that site | at least one; hint "<n> products." |
| Place (when A place, **Defined here**) | `auto` noun `place` | — | required; hint "<n> products." |
| At | `auto` noun `site`, quick "Name"; `multiSite` | the default site (sub "Default") | shown only with two or more sites |
| Counted by | `auto` noun `person` (sub = role), quick "Name", "Phone or WhatsApp" "+263 7" | the caller | required; hint "They get a link on WhatsApp and count on their phone." |
| Blind count | `toggle` | on | hint "The counter does not see what the system expects. Counts come out truer." |
| Keep selling while counting | `toggle` | on | hint "Sales during the count are allowed for, line by line." |

Footer note "Nothing changes until you approve the differences."; "Cancel"; primary "Start counting". Submit `POST /api/v2/retail/stock/counts`;
invalidates `["list","retail-stock-counts"]`. Done "CNT-0022 sent to Rudo Moyo. 61 products to count." (with "Open"); when the counter is
the caller: "CNT-0022 is yours to count. 61 products." with "Count now" → the phone page; when the counter has no phone: "CNT-0022 is ready
for Rudo Moyo. They have no WhatsApp number, so tell them it is in Notifications." (**Defined here**). From On hand with lines at several
sites, the sheet keeps those at the first site and its footer note reads "2 lines at Borrowdale were left out." (**Defined here**). Requires
`retail.counts:create`.

### 5.7 Count on a phone — `/retail/stock/counts/[id]/count` (STK-05) · board `CountPhone.png`

`app/retail/stock/counts/[id]/count/page.tsx` + `components/retail/stock/count-phone.tsx`. Full-screen, no rail or panel (like the till),
built for 390px and usable wider (content max-width 480, centred). Theme tokens as everywhere.

- **Head** (padding 52 16 12 on phones, gap 8, bottom `--line`): "CNT-0020 · Harare Main Branch" (12.5 `--ink-3`; the site part only with
  two sites); title 20/600 −0.02em "Counting the spirits shelf" ("Counting everything", "Counting the cold room"; recount: "Counting 3 lines
  again" **Defined here**); progress: a 6px `--tray` track filled `--ok` to counted/total, then "3 of 38" (figures mono `--ink`).
- **Scan box** (margin 12 16, 44px, 1px `--line-strong`, radius 10, barcode icon 16, `--ink-3`): an input "Scan a bottle to jump to it";
  a scanned barcode scrolls to and focuses that line; unknown → line under the box "Not in this count." (`--warn`, **Defined here**).
- **Lines** (`ul`, rows padding 12 16, bottom `--line-soft`): name 15/500; sub 12.5 `--ink-3` = shelf, else the place, else the category;
  when not blind the sub ends " · expected 9" (**Defined here**). Right: a 72×44 input (1px `--line-strong`, radius 10, mono 18/600,
  right-aligned, `inputmode="decimal"`, `aria-label="Counted, <name>"`). The current line has `#fff8f2`-tone background (`--action-soft`)
  and a 2px `--action` border on its input. Enter or blur saves (`PUT …/lines/[lineId]`) and moves to the next uncounted line; a failed save
  keeps the figure and shows "Not saved. Tap to try again." under the name (`--bad`, **Defined here**).
- **Footer** (padding 12 16 28, top `--line`, gap 8): note centred 12.5 `--ink-3` "You do not see what is expected. Count what is there."
  (blind) or "Count what is there." (not blind, **Defined here**); primary 48px full width radius 10 "Done, send for review". With lines
  uncounted the button shows the server's "Count every line first: 35 to go." above it in `--warn`.
- **After sending** (**Defined here**): the list is replaced by a centred block: check-circle 32 `--ok`, "Sent for review", "Tafara Nyathi
  or the owner approves it. You can close this page."
- **States**: loading shows the head with "—" and six skeleton rows; a cancelled or approved count shows "This count is closed." with "Back
  to Counts" (for roles who can see Counts); 403 "This count is not yours to count." (**Defined here**).
- **Who**: the counter, or anyone with `retail.counts:update`.

### 5.8 A count — `/retail/stock/counts/[id]` (STK-06) · board `CountRecord.png`

`<RecordFrame kind="count" id={id} />`, kind in `lib/retail/record-kinds/stock.ts`, type `RetailStockCount`, not binnable.

- **Header**: back "Counts"; title = name ("Spirits shelf"); reference "CNT-0020". Actions: "Print count sheet" (download `sheet.pdf`),
  "Recount 3 lines" (To approve only; n = lines that differ; `POST …/recount` with every differing line; `retail.counts:approve`). ⋯:
  "Export as PDF" (`export.pdf`), "Cancel the count" (`--bad`, ask `cancelcount`, Counting or To approve). Primary: To approve → "Approve the
  differences" → `/retail/stock/counts/[id]/review`; Counting and the caller is the counter → "Count it" → the phone page (**Defined here**);
  otherwise none. While Counting the action group gains "Send the link again" (`POST …/remind`, toast "Rudo Moyo has the link again."
  **Defined here**).
- **Strip**: steps "Started", "Counted", "To approve", "Approved" (Counting: Started done, Counted now; To approve: first two done, To approve
  now; Approved: all done; Cancelled: steps as they stood with a chip "Cancelled" `plain`). Chips: "Blind count" (`plain`, when blind); "3
  lines differ" (`warn`, To approve), "12 of 40 counted" (`info`, Counting), "Approved by Tafara Nyathi" (`ok`, Approved) — the last two
  **Defined here**. Figure "Difference" "−US$41.20" (`warn` tone while To approve; "—" while Counting; cost roles only, else "Differ 3").
- **KPI strip** (5): "Lines" "38" note "counted"; "Differ" "3" delta "8%" (`warn`) note "of the lines"; "Short" "−US$43.60" delta "2" (`bad`)
  note "lines"; "Over" "+US$2.40" delta "1" note "line"; "Took" "34 min" (submitted − started) note "Rudo Moyo". While Counting: "Lines" "40"
  note "12 counted", Differ/Short/Over "—" note "after the count", "Took" "26 min" note "so far, Kuda Banda" (**Defined here**). Short and
  Over need view-cost; without it they show line counts only.
- **Chart**: "Difference at each count", unit "this shelf"; bars = |difference| at cost from `history` (counts at this site that shared
  products with this one, on those products only), labelled by count number, this count dark (`--data`), earlier ones light (`#c9c0b8`
  role `--data-soft`); range "3 months", "12 months" (default), "All time"; tooltip "CNT-0018 · before" / "US$34". Hidden for roles without
  view-cost.
- **Tabs**: "Differences" (source `retail-stock-count-differences`, parent `count`), "Every line" (`retail-stock-count-lines`), "Activity".
  Columns (grid `minmax(0,1fr) 100px 100px 110px 110px`): Product (`text`), Expected (`num`, end; expected at count, else expected),
  Counted (`num`), Difference (`diff`: −2 `bad`, +2 `warn`), Value (`diff` money, view-cost). Σ row "Σ 3 lines · 46 · 44 · −2 · −US$41.20".
  Footer "1–3 of 3" and the all link "All 38 lines" (switches to Every line, **Defined here**). While Counting, Differences shows "Nothing to
  compare until the count is in." (**Defined here**).
- **Rail**: group "Count" (hint "click any value to change it"): "Shelf" = name (editable `text`, `PATCH`, `retail.counts:update`, not when
  Approved or Cancelled); "Site"; "Started" (mono "Today, 10:06"); "Finished" (mono submitted, "—" while counting). Group "People": "Counted
  by"; "Blind" ("Yes, expected quantities hidden" / "No, counter sees what is expected" **Defined here**); "Approves" ("A manager" or "The
  owner").
- **Activity**: FND tab (counts "4" on the board).

### 5.9 Approve the differences — `/retail/stock/counts/[id]/review` (STK-06) · board `CountReview.png`

Hand-built page in the shell (`app/retail/stock/counts/[id]/review/page.tsx` + `components/retail/stock/count-review.tsx`). Only for
`retail.counts:approve`; a count that is not To approve redirects to its record.

- **Header** (48px): back "Counts"; "/"; h1 "CNT-0020" (600); then the name in mono `--ink-3` ("Spirits shelf"); spacer; "Recount the 3"
  (32px outline; n = ticked lines, or every line that differs when none is ticked); primary "Approve and adjust".
- **Strip** (48px, `--ground`, bottom `--line`): badge "To approve" (`warn`); sentence "Counted blind by Rudo Moyo on a phone, today 10:12 to
  10:40. Sales during the count are allowed for." (not blind: "Counted by …"; other days "yesterday" / "on 2 October"; keep selling off: "The
  till stopped selling these while they were counted." **Defined here**); spacer; "Difference" (`--ink-3`) and the net in mono 15/600 `--bad`
  when negative, `--ok` when positive ("−US$65.50").
- **Body**: grid `minmax(0,1fr) 320px`. Main (padding 16 24): tabs "Differ 3", "Match 35", "All 38" (Differ default). Table (grid
  `minmax(0,1fr) 76px 84px 84px 100px 110px 72px`, head 34 on `--ground`, rows 48 with `--line-soft`): Product; Expected (mono `--ink-2`
  right); Counted (a 64×30 input, mono 600 right, `inputmode="numeric"`, `aria-label="Counted, <name>"`, saves on blur through `PUT`);
  Difference (mono signed, `--bad` short, `--ok` over, "–" `--faint` when equal); At cost (mono signed money, view-cost); Why (text; for a
  differing line it is a menu button — pen on hover — with "Broken", "Not known", "Found"; defaults Not known for short and Found for over);
  Recount (a checkbox `aria-label="Recount <name>"`, differing lines only). Matching lines at 60% opacity.
- **Aside** (`--ground`, left `--line`, padding 20, gap 18): "When you approve" (h2 14/600) with three lines: "Stock on hand becomes what was
  counted for all 38 lines."; "The difference, −US$65.50, is posted to Breakage and losses and shows in Insights › Losses."; "Ticked lines
  are sent back to Rudo to count again first." (first name of the counter). Then "Cancel the count" (underlined `--bad`, ask `cancelcount`)
  and "Nothing on hand changes." (12.5 `--ink-3`). Then "<scopeLabel>, last three counts" ("Spirits, last three counts") with rows date
  ("Today", "30 September", "16 September") and difference mono right.
- **Approve**: "Approve and adjust" → `POST …/approve`; while running the button shows a spinner; success: a status line above the tabs
  (`--ok-soft`, `--ok`) "**Approved.** Stock set to what was counted. −US$65.50 posted to Breakage and losses.", the strip badge becomes
  "Approved" (`hollow`), the header buttons leave, inputs become text. 403 owner limit: the same line in `--bad-soft` with the server's
  sentence.
- **Recount**: `POST …/recount` → toast "3 lines sent back to Rudo Moyo." (**Defined here**) and redirect to the record.
- **Phone** (< 720px): aside under the table; table columns Product, Counted, Difference only, the rest in a second line.

### 5.10 Adjust stock — sheet `stock-adjust` over the product record (STK-04) · board `StockAdjust.png`

From `K.adjust`. 520px. `load` = `GET /api/v2/retail/stock/lines?productId=&siteId=`.

| Part | Content |
|---|---|
| Title / sub | "Adjust stock" / "Amarula Cream 750ml · 13 on hand at Harare Main Branch" (" at <site>" only with two sites) |
| At (**Defined here**) | `auto` noun `site`, shown only when the product has lines at two or more sites; changing it reloads the sub |
| Why | `cards` 2 columns, no label, required, default "Broken or spoilt": "Broken or spoilt" — "Comes off stock and shows in Losses."; "Own use or gift" — "Comes off at cost. Who took it is noted."; "Found more" — "Goes up. Usually a count is better."; "Fix a mistake" — "Set the number on hand." |
| How many | `text` mono right half, default "1" (board "2"); label becomes "On hand now" for Fix a mistake (**Defined here**) |
| At cost | `read` mono right half: |delta| × cost ("US$26.06"); view-cost only |
| What happened | `area` 2 rows, required; placeholder "What happened, and for own use who took it" (**Defined here**) |
| Photo | `photo` optional "Add a photo" / "Drop it here, or take one on a phone" |
| Manager’s approval (conditional, **Defined here**) | shown when At cost > the limit and the caller lacks approve, or after the server answers `needsApprover`: **Manager** `auto` noun `person` (`context.can = "retail.adjustments:approve"`) half; **PIN** `text` mono half, 4 digits, masked; hint "A manager types their PIN to approve it." |
| Footer | note "Over US$50.00 needs a manager PIN. Every adjustment shows in Activity." (the limit from Approvals); "Cancel"; primary "Save" |
| Submit / done | `POST /api/v2/retail/stock/adjustments`; invalidates the product record, `retail-stock-on-hand`, `retail-stock-movements`, `["nav-badges"]`; done from the response ("2 off Amarula Cream 750ml. 11 left.") |
| Requires | `retail.adjustments:create` |

### 5.11 Break a case — sheet `case-break` over the product record (STK-04) · board `BreakCase.png`

From `K.breakcase`. 520px.

| Part | Content |
|---|---|
| Title / sub | "Break a case" / the chosen case's name ("Castle Lager 340ml, case of 24") |
| Case | `auto` noun `pack` at the site, sub "4 cases"; default: the product itself when it is a case, else its first case |
| Cases | `text` mono right half, default "1", whole number 1 to on hand |
| Then | `read` half: "Cases 4 → 3, singles 2 → 26" (from the case and single lines' on hand) |
| Footer | note "Tills do this on their own when singles run out, if Break cases at the till is on."; "Cancel"; primary "Break 1 case" / "Break 2 cases" |
| Submit / done | `POST /api/v2/retail/stock/case-breaks`; done "1 case broken. 26 singles on hand." (from the response) |
| Requires | `retail.adjustments:create` |

### 5.12 Transfers — `/retail/stock/transfers` (STK-07) · board `TransfersList.png`

`<ListFrame source="retail-stock-transfers" title="Transfers" />`. Nav item and page only with two or more open sites (with one site the
route answers the 403-style body "Transfers need a second site." with "Add a site" → `/retail/manage/sites` **Defined here**).

- **Header**: "Transfers"; primary "+ Move stock" → `?sheet=transfer-new` (`retail.transfers:create`).
- **Tabs**: "On the way" (default; includes part received), "Received", "All" (adds cancelled).
- **Toolbar**: search "Transfer or product" (transfer number, any line's product name). Filters From (row, "Any site"), To (row, "Any
  site"). Sorts "Newest first" (default), "Oldest first", "Most value" **Defined here**. Groups "State", "From", "To".
- **Columns** (grid `40px 110px 170px 170px 110px 130px 140px 150px 44px`):

  | Column | Key | Cell | Align | Value |
  |---|---|---|---|---|
  | Transfer | `transferNo` | `ref` → `/retail/stock/transfers/{id}` | start | "TRF-0008" |
  | From | `from` | `text` | start | |
  | To | `to` | `text` | start | |
  | Lines | `lines` | `num`, total sum | end | |
  | Value | `value` | `money`, total sum, view-cost | end | Σ sent × cost |
  | Sent | `sent` | `text` | start | `formatDayTime(sentAt)` "Today, 08:30", "1 Oct, 12:03" |
  | State | `state` | `state`: "On the way" `info`, "Part received, 2 to come" `info`, "Received" `hollow`, "Received, 2 short" `warn`, "Cancelled" `neutral` | start | |

- **Totals**: "Σ 3", Lines "8", Value "US$657.00".
- **Row menu** (**Defined here**): "Open", "Receive it" (On the way, `retail.transfers:update`), "Print delivery note", "Cancel the transfer"
  (`--bad`, On the way, `retail.transfers:delete`).
- **Bulk**: "Print delivery notes", "Cancel" (ask `canceltransfers`; skips received ones); "Export <n>".
- **Empty** (**Defined here**): icon `ArrowsLeftRight`, "Nothing has moved between sites yet", "Send stock to another site and it shows
  here until they receive it.", primary "Move stock".
- **Phone card**: title "{from} to {to}", badge state, figure value (or "{units} units"), meta "{transferNo} · {sent}", figure2 lines.

### 5.13 Move stock — sheet `transfer-new` over Transfers (STK-07) · board `TransferNew.png`

From `K.transfer`. Wide.

| Part | Content |
|---|---|
| Title / sub | "Move stock" / "Stock › Transfers" |
| From | `auto` noun `site` half, default the default site (sub "Default") |
| To | `auto` noun `site` half, default the other site when there are exactly two |
| Section "What goes" | `lines` ql "Sending", cl "Cost": rows name + sub "9 at Harare Main Branch"; quantity input; Cost; Value; ×. Add row "Add a product: search, scan, or add a new one" over `stock-line` at From (no add of a new product). Σ "<n> lines", units, value. Changing From drops the lines that are not at the new site (footer note "2 lines were not at Borrowdale and were left out." **Defined here**). Cost/Value absent without view-cost. |
| Section "On the way" | **Taken by** `auto` noun `person` half (quick "Name", "Phone or WhatsApp"); **Arrives** `text` half, placeholder "Today, by 11:00" |
| Footer | note "It leaves stock here now and arrives when Borrowdale receives it." (the To site's name); "Cancel"; primary "Send" |
| Submit / done | `POST /api/v2/retail/stock/transfers`; invalidates transfers, on hand, movements; done "TRF-0008 sent. Borrowdale will see it to receive." with "Open" |
| Requires | `retail.transfers:create` |

From On hand (`ids`) the lines arrive prefilled with an empty Sending figure.

### 5.14 A transfer — `/retail/stock/transfers/[id]` (STK-08) · board `TransferRecord.png`

`<RecordFrame kind="transfer" id={id} />`, type `RetailStockTransfer`, not binnable.

- **Header**: back "Transfers"; title "<From> to <To>" ("Harare Main Branch to Borrowdale"); reference "TRF-0008". Actions "Print delivery
  note", "Change the lines" (On the way and nothing received → `?sheet=transfer-lines&id=`). ⋯ "Export as PDF" (delivery note with
  received), "Cancel the transfer" (`--bad`, ask `canceltransfer`). Primary "Receive it" (On the way → `?sheet=transfer-receive&id=`).
- **Strip**: steps "Packed" (done), "On the way" (now while on the way), "Received" (done when received); chip "On the way 2h 10m" (`info`;
  "Received in 4h 10m" `ok`, "Cancelled" `plain` **Defined here**); figure "Value" "US$412.80" (cost roles; others "Units 540").
- **KPIs**: "Lines" "4" note "products"; "Units" "540" note "sent"; "Value" "US$412.80" note "at cost" (cost roles; else "Received" "0 of 540");
  "Sent" "08:30" delta "today" note "by Tafara Nyathi"; "<To> holds" "1,204" delta "+540" (`ok`) note "units once received" (after receipt:
  "Borrowdale holds" "1,744" note "units now" **Defined here**).
- **Chart**: "Moved between the sites, by month", unit "transfers", bars per month (either direction between these two sites), range "3
  months", "12 months" (default), "All time", tooltip "Jul · 4 transfers".
- **Tabs**: "Lines" (source `retail-stock-transfer-lines`, parent `transfer`) and "Activity". Columns (grid `minmax(0,1fr) 90px 100px 90px
  110px`): Product, Sent (`num`), Received (`num`, "—" until received), Cost (`money`, view-cost), Value (`money`, view-cost). Σ "Σ 4 lines ·
  540 · — · · US$412.80". Footer "1–4 of 4" and "All transfers" → `/retail/stock/transfers?from=<fromId>&to=<toId>&tab=all`.
- **Rail**: group "Transfer" (hint "click any value to change it"): "From" (read); "To" (editable `auto` site while nothing received);
  "Sent" (mono "Today, 08:30"); "Sent by". Group "Moving": "Vehicle" (editable text), "Driver" (editable text), "Note" (editable area). Edits
  need `retail.transfers:update`.

### 5.15 Receive a transfer — sheet `transfer-receive` (STK-08) · board `TransferReceive.png`

From `K.transferreceive`. Wide.

| Part | Content |
|---|---|
| Title / sub | "Receive TRF-0008" / "From Harare Main Branch · sent today 08:30 by Tafara Nyathi" |
| Section "Count what came" | `lines` ql "Came", cl "Cost": the lines still to come, prefilled with what is to come; sub "4 sent" (second receipt: "2 still to come" **Defined here**), `--warn` when Came is less; no add row (nothing can arrive that was not sent). Σ lines, units, value. Field hint, built from the shortfall with `shortWords` (W-24): board "2 bags of ice short. They go back on Harare Main Branch’s stock unless you mark them lost." → built "2 × Ice 2kg bag short. They go back on Harare Main Branch’s stock unless you mark them lost."; nothing short → no hint. |
| Section "The difference" (only when something is short) | **What is short** `seg` "Still coming" \| "Lost on the way" (default "Lost on the way") |
| Footer | note "Received stock is on sale at Borrowdale at once."; "Cancel"; primary "Receive" |
| Submit / done | `POST …/receive`; done from the response ("TRF-0008 received at Borrowdale. 2 × Ice 2kg bag written off.") |
| Requires | `retail.transfers:update` |

### 5.16 Change the lines — sheet `transfer-lines` (STK-08) · reuses `TransferNew.png` (**Defined here**)

Title "Change the lines", sub "TRF-0008 · Harare Main Branch to Borrowdale"; From and To shown as `read`; the "What goes" lines prefilled;
no "On the way" section; note "Changes leave or come back to Harare Main Branch’s stock now."; primary "Save". `PUT …/lines`; done
"TRF-0008 changed: 560 units on the way.".

### 5.17 Empties — `/retail/stock/empties` (STK-09) · board `EmptiesList.png`

`<ListFrame source="retail-empties" title="Empties" />`. Nav item and page only when the business type is Liquor store and "Empties and
deposits" is on (else 404).

- **Header**: title "Empties"; sub "Liquor store · deposits on returnable bottles and crates"; primary "+ Return empties to a supplier" →
  `?sheet=empties-return` (`retail.empties:create`).
- **Tabs**: "Ledger" (count of rows, default), "Held for customers" (badge = held balance "US$84.30"; rows DEPOSIT_CHARGED,
  DEPOSIT_REFUNDED, BOTTLES_BACK), "Owed by suppliers" (badge "US$231.00"; rows RETURNED_TO_SUPPLIER, CREDIT_RECEIVED).
- **Toolbar**: search "Customer, supplier or reference". Filters Kind (row; "Any", "Deposit charged", "Deposit refunded", "Bottles back",
  "Returned to supplier", "Credit received"), Item (row; "Any", "Bottles", "Crates" — rows that move that item); Site (Filters,
  multi-site); When (Filters, period, "Any time"). Sorts "Newest first" (default), "Oldest first". Group "What happened".
- **Columns** (grid `40px 140px 190px minmax(160px,1.2fr) 90px 90px 120px 120px 44px`):

  | Column | Key | Cell | Align | Value |
  |---|---|---|---|---|
  | When | `at` | `when` `relative` ("Today 12:10") | start | |
  | What happened | `kind` | `state`: "Deposit charged" `hollow`, "Deposit refunded" `hollow`, "Bottles back" `ok`, "Returned to supplier" `info`, "Credit received" `hollow` | start | |
  | Who | `who` | `text` | start | "Sale SALE-31870"; the customer's name; "Delta Beverages, GRN-0005"; "Delta Beverages, CN-2210"; "Delta Beverages, the next delivery, 7 October" |
  | Bottles | `bottles` | `num` `sign: "plain"`, total sum | end | blank when 0 |
  | Crates | `crates` | `num` `sign: "plain"`, total sum | end | blank when 0 |
  | Deposit | `deposit` | `money` signed | end | |
  | In the store | `inStore` | `num` | end | "412 · 31" (bottles after · crates after) |

- **Totals**: "Σ 4", Bottles and Crates sums, Deposit blank, In the store = the site's current "412 · 31".
- **Row link**: none. **Row menu** (**Defined here**): "Open the sale" (sale rows), "Open the delivery" (GRN rows), "Record their credit
  note" (RETURNED_TO_SUPPLIER rows with something still owed, `retail.empties:update`).
- **Bulk**: "Export" only.
- **Empty** (**Defined here**): icon `Package`, "No empties yet", "Deposits charged at the till, bottles brought back and crates returned to
  suppliers all show here.", primary "Return empties to a supplier".
- **Phone card**: title "{what happened}", figure deposit, meta "{when} · {who}", figure2 "{bottles} · {crates}".

### 5.18 Return empties to a supplier — sheet `empties-return` (STK-09) · board `EmptiesReturn.png`

From `K.emptiesreturn`. 520px. `load` = `GET /api/v2/retail/empties/summary`.

| Part | Content |
|---|---|
| Title / sub | "Return empties to a supplier" / "Liquor store · 412 bottles and 31 crates in the store" |
| To | `auto` noun `supplier` (sub "Beverages, 30 days"), quick "Name", "Phone or WhatsApp"; required |
| Bottles | `text` mono right half, whole ≥ 0, ≤ in the store |
| Crates | `text` mono right half, whole ≥ 0, ≤ in the store; bottles and crates not both 0 ("Say how many bottles or crates." **Defined here**) |
| Deposit owed to you | `read` mono right half, tone `ok`: bottles × bottle deposit + crates × crate deposit ("US$84.00") |
| Going back with | `text` half, required, placeholder "The next delivery, 7 October" |
| Footer | note "The deposit shows as owed by Delta until their credit note arrives." (the supplier's first word); "Cancel"; primary "Book the return" |
| Submit / done | `POST /api/v2/retail/empties/returns`; invalidates `retail-empties`; done "Return booked. Delta owes US$84.00 in deposits." |
| Requires | `retail.empties:create` |

### 5.19 Record their credit note — sheet `empties-credit` (STK-09) · no board (**Defined here**)

Title "Record their credit note", sub "Delta Beverages · US$84.00 owed on this return"; fields **Credit note** (`text` mono half, required,
placeholder "CN-2210"), **Amount** (`money` half, default what is still owed), **Note** (`area`, optional); note "What they owe falls by this
amount."; primary "Record it"; done "Delta Beverages credited US$84.00.". `POST …/returns/[id]/credit`.

### 5.20 The product record's stock parts (STK-03, STK-04) · board `Product.png`

The products spec owns the record; this area supplies, in `lib/retail/record-kinds/products.ts`:

- Action "Adjust stock" (second in the group, after "Edit") → `?sheet=stock-adjust&productId=<id>`, requires `retail.adjustments:create`.
- ⋯ "Break a case" (**Defined here**) after "Sell it by the case too", for a case or a single with a case, when Cases and singles is on.
- Tab "Stock movements" (first tab, count = movements of the product): source `retail-stock-movements` with parent `product`, columns When
  (`date` + `timeKey`), Movement (dot + long label), Reference (`ref`), By, Change (`num` signed, `--ok` for +), Balance; the Σ row "Σ 30
  days · in +24 · out −41 · −17 · 13" (the `in`/`out` totals over the last 30 days and the current on hand); all link "All movements" →
  `/retail/stock/movements?product=<id>`.
- Rail group "Stock" rows "Reorder at" ("12 bottles") and "Reorder" ("24 bottles") save through `PATCH /api/v2/retail/stock/lines/[id]` for the
  default site's line, requires `retail.stock:update`.

### 5.21 The StockFlow rules, as On hand must show them · board `StockFlow.png`

"One record. The product is the thing you sell and the thing you stock. Its stock is kept per site, made for you on save." → On hand lists
the line the product form created, at once, no separate stock item. "No site or location to choose. One site: it is used. Two or more: the
form asks once, under More details. Places inside a site only appear if you add them." → every stock sheet here hides site and place
questions on a one-site, one-place shop (`multiSite` field flag, `requires: "multi-site"` columns). "On sale when saved." → a product with 0
opening stock is on On hand as Out and on the till.

### 5.22 Confirm dialogs added to `lib/retail/asks.ts` (FND 5.8) — all **Defined here** except the sentence in `cancelcount`

| Key | Title | Body | Keep | Go | Fill |
|---|---|---|---|---|---|
| `cancelcount` | "Cancel CNT-0020?" | "Nothing on hand changes. What has been counted stays on the count for the record, and Rudo Moyo is told it is off." | "Keep the count" | "Cancel the count" | bad |
| `approvecounts` | "Approve 2 counts?" | "Stock on hand becomes what was counted for 41 lines, and −US$106.02 is posted to Breakage and losses. A count over US$100.00 waits for the owner." | "Not yet" | "Approve the differences" | action |
| `canceltransfer` | "Cancel TRF-0008?" | "The 540 units on the way go back on Harare Main Branch’s stock, as if they never left. Borrowdale is told." | "Keep it on the way" | "Cancel the transfer" | bad |
| `canceltransfers` | "Cancel 2 transfers?" | "Everything still on the way goes back on the stock of the site it came from. Received transfers are left as they are." | "Keep them" | "Cancel them" | bad |
| `reversemovements` | "Reverse 2 movements?" | "Each goes back with a movement the other way, dated now, and the books follow. Sales, deliveries, counts and transfers are not reversed here; open them instead." | "Keep them" | "Reverse them" | bad |

### 5.23 Loading, empty, error, permission, phone

Lists and records follow FND 5.4.11, 5.4.12 and 5.6. Hand-built pages (review, phone count) show skeletons with the real header, "This
count could not be loaded." with the server's message and "Try again" on error, and the role refusal sentence on 403. At < 720px the review
page's aside goes under the table; the phone count is the phone layout at every width.

---

## 6. What to remove

No redirects, no compatibility layers. Each removal lands in the unit named.

| Remove | Replaced by | Unit |
|---|---|---|
| `app/retail/stock/page.tsx` as it is (register, client filtering over `/api/v2/retail/catalog`, "Count stock" primary) | `<ListFrame source="retail-stock-on-hand" />` | STK-02 |
| `reorderLevel` in the catalogue PATCH schema (`lib/retail/product-details.ts`, `app/api/v2/retail/catalog/[id]/route.ts` `minStock` write) and the product page's inline "Reorder at" save through it | `PATCH /api/v2/retail/stock/lines/[id]` from the product rail | STK-02 |
| `app/retail/stock/movements/page.tsx` (`RetailShell` + `StockMovementsFeed`) — the component stays for the stores module | `<ListFrame source="retail-stock-movements" />` | STK-03 |
| `app/retail/stock/counts/page.tsx` as moved by FND-03 from `count/` (single-product count dialog, ADJUSTMENT movements list) and `app/api/v2/retail/stock/count/route.ts` | Counts list, CountNew sheet, counts API | STK-05 |
| `app/retail/stock/transfers/page.tsx` (same-site reclassify) and the `POST` in `app/api/v2/retail/stock/transfers/route.ts` | Transfers list and the new `POST` at the same path | STK-07 |
| `canReclassifyStockBetweenLocations`, `activeStockLocationSiteIds` (`lib/workspaces.ts`, `components/layout/app-sidebar.tsx`) and the "/retail/stock/transfers" skip | nav visibility "two or more open sites" on the Transfers item | STK-07 |
| `app/api/v2/retail/catalog/[id]/break-case/route.ts`, `components/retail/break-case-dialog.tsx`, the product page's "Open cases into singles" item | `POST /api/v2/retail/stock/case-breaks`, the `case-break` sheet, "Break a case" | STK-04 |
| `lib/retail/cases.ts` | `lib/retail/stock/cases.ts` (same service, reason and reference added) | STK-04 |
| `COVER_AIM` and `daysOfCover` in `lib/retail/insights.ts` | imports from `lib/retail/stock/levels.ts` | STK-01 |
| Retail's use of `/api/inventory/items` and `/api/inventory/movements` (from the removed pages) — the routes stay for the stores module | the list sources | STK-03, STK-05, STK-07 |

---

## 7. Build units

In build order. Every unit: `pnpm typecheck` passes (one at a time on this machine); `npx eslint <changed files>` has no new errors; the
named tests pass (`npx vitest run <files>`); migrations applied to dev and test databases with their witness test in the same commit;
screenshots with `scratchpad/smoke/lib.js` as `owner@bottlestore.test` (and the roles named) at 1440×960 unless stated, compared side by
side with the board PNG; seeds re-run with `pnpm tsx scripts/seed-retail-demo.ts --slug hurudza-creative --days 160 --reset`.

| Unit | Title | Size | Depends on | Boards | Workflows | Routes |
|---|---|---|---|---|---|---|
| STK-01 | Stock ledger: reasons, references, balances; permissions; stock levels | M | — | — | W-21, W-25, W-28 (server) | — |
| STK-02 | On hand and reorder levels | L | STK-01, FND-LIST, FND-SHEET, FND-SHELL | StockList, Reorder, ProductNewStock, StockFlow | W-21 | `/retail/stock` |
| STK-03 | Movements and tracing a product | M | STK-01, FND-LIST, FND-RECORD, FND-SHELL | MovementsList, Product (tab) | W-28 | `/retail/stock/movements` |
| STK-04 | Adjust stock and break a case | M | STK-01, FND-SHEET, FND-RECORD | StockAdjust, BreakCase, Product (actions) | W-23, W-26 | `/retail/products/[id]?sheet=stock-adjust`, `?sheet=case-break` |
| STK-05 | Start a count and count on a phone | L | STK-01, FND-LIST, FND-SHEET, FND-SHELL, SET-02, SET-07 | CountsList, CountNew, CountPhone | W-22 (steps 1–2) | `/retail/stock/counts`, `/retail/stock/counts/[id]/count` |
| STK-06 | Approve a count: record, review, recount, cancel | L | STK-05, FND-RECORD | CountRecord, CountReview | W-22 (steps 3–4) | `/retail/stock/counts/[id]`, `/retail/stock/counts/[id]/review` |
| STK-07 | Transfers: list and send | M | STK-01, FND-LIST, FND-SHEET, FND-SHELL, SET-02 | TransfersList, TransferNew | W-24 (steps 1–2) | `/retail/stock/transfers` |
| STK-08 | A transfer: record, receive, change, cancel | M | STK-07, FND-RECORD | TransferRecord, TransferReceive | W-24 (step 3) | `/retail/stock/transfers/[id]` |
| STK-09 | Empties ledger and returns | L | STK-01, FND-LIST, FND-SHEET, FND-SHELL | EmptiesList, EmptiesReturn | W-27 | `/retail/stock/empties` |

### STK-01 · Stock ledger: reasons, references, balances; permissions; stock levels · M

Builds migration `20261004133000_retail_stock_ledger` (3.2) and its witness; `recordStockMovement` takes required `reason` (nullable for the
stores module) and `reference`, locks the line (`SELECT … FOR UPDATE` inside the transaction) before reading on hand, writes `change` and
`balanceAfter`, accepts `reversesId`; every existing caller passes them (sale, refund and void in `_services.ts` with the sale number; GRNs in
`purchasing/receipts` with the receipt number; the stores route with null); `ADJ`/`BRK` id entities; the permission resources (section 2);
`lib/retail/stock/levels.ts` (`stockLevel`, `daysOfCover`, `COVER_AIM`) and `movement-words.ts`; Insights imports them. Seed STK-01 rows.

Acceptance:
- `lib/inventory/stock-ledger-migration.test.ts` passes on dev and test databases; on the seeded tenant every line's newest `balanceAfter`
  equals `currentStock`.
- `lib/inventory/stock-movements.test.ts`: `change` and `balanceAfter` for RECEIPT, ISSUE, ADJUSTMENT, TRANSFER; two concurrent ISSUEs of 1
  on a line of 1 → one succeeds, one "Insufficient stock." (no lost update); a second reversal of the same movement fails on the unique key.
- `lib/retail/stock/levels.test.ts`: Amarula (13, reorder 12, 63 sold) → Low; Gordon's (18, 6, 68) → Fine; Chibuku (210, 60, 102) → Too
  much; 0 → Out; no sales and 40 on hand → Too much; archived never Low.
- `lib/retail/permissions.test.ts`: the five rows of the matrix exactly; a stock clerk cannot `approve` counts; a cashier can `create` empties
  only.
- A sale at the till (`POST /api/v2/retail/pos/sales`) writes a movement with `reason SALE`, `reference` = its sale number and the right
  balance; Insights › Stock health shows the same figures as before.

### STK-02 · On hand and reorder levels · L

Builds 5.1, 5.2, the opener of 5.3, 4.2, the `stock-line` noun, the `/retail/stock` badge provider, the `requires: "multi-site"` engine
addition, the seed STK-02 rows. Removes the STK-02 rows of section 6.

Acceptance:
- `/retail/stock` side by side with `StockList.png`: "On hand" and "+ Add a product"; tabs All · Low · Out · Too much with counts; toolbar
  "Name, code or barcode", "Category Any", "Site All sites", Filters, count, "Least cover first", Group, Columns, Export; rows Jaggermeister
  (Out, "—" cover, US$0.00), Johnnie Walker (Low, 6 bottles, 12, ~3 days, US$201.60), Jameson, Amarula (Low at 13 > 12), Castle, Gordon's
  (Fine), Bohlinger's at Borrowdale, Chibuku (Too much), Ice — badges and cover bars in the board's tones; Σ with the Value at cost total
  equal to `SELECT sum(currentStock × unitCost)` for the filtered lines; panel badge "5 low".
- Low tab → tick Johnnie Walker, Jameson, Amarula, Castle → "Change reorder level" → `Reorder.png`: "4 products ticked", From what sells, 14
  days, Whole cases, lines with "Sells 2 a day · now 12" subs and suggested levels (Johnnie Walker 32 when its supplier delivers in 2 days),
  Σ row; Save → toast "Reorder levels saved for 4 products.", Reorder at column updated, the product's Activity shows "Changed Reorder at
  from 12 to 32".
- "Add to an order" opens the buying spec's New order sheet with the four lines (or, before that unit exists, is not drawn).
- "+ Add a product" opens the products spec's sheet over On hand (`ProductNewStock.png`); a product saved with opening stock 48 appears on
  On hand with 48.
- As `rudo.stock@bottlestore.test` (stock clerk): no Value at cost column, no "Change reorder level", no "Add to an order"; as a cashier the
  page answers "Your role cannot view stock."; a one-site tenant shows no Site column or filter. 390×844: cards per 5.1.
- `lib/retail/stock/reorder.test.ts` (32, 48, 480 cases) and `lib/reports/loaders/retail/stock.test.ts` (levels, tab counts, cost stripped
  for STOCK_CLERK) pass.

### STK-03 · Movements and tracing a product · M

Builds 5.4, 5.20's tab and all link, the movements source with database `page()`, reverse (4.3), Print, the `sign` and parent-sub engine
additions. Removes the STK-03 rows of section 6.

Acceptance:
- `/retail/stock/movements` side by side with `MovementsList.png`: "Movements", toolbar "Product or reference", "Kind Any", "Site All sites",
  "Filters 1", "Newest first"; rows with mono times, product links, Movement badges ("Sale" hollow, "Received" green, "Count, two broken"
  amber, "Transfer out"/"Transfer in" indigo, "Case broken into singles" neutral), reference links, site, signed change ("+40" in green),
  balance, by; Σ change equal to SQL over the filtered movements on every page.
- Clicking GRN, CNT, TRF and SALE references opens the delivery, count, transfer and sale pages.
- `/retail/products/<Amarula>` "Stock movements" tab lists Amarula's movements newest first with long labels ("Transfer to Borrowdale"),
  balances and the Σ 30 days line; "All movements" opens `/retail/stock/movements?product=…` with the sub "Amarula Cream 750ml" and "All
  products".
- Tick ADJ-0031 and a sale → Reverse → ask → toast "1 movement reversed. 1 was a sale: refund it from the sale."; a REVERSAL row appears,
  on hand is back, a reverse journal exists; reversing ADJ-0031 again is skipped. As the stock clerk Reverse is not drawn.
- `lib/reports/loaders/retail/stock-movements.test.ts`: page 2 totals equal page 1 totals; Kind filter groups; parent `product` filter.

### STK-04 · Adjust stock and break a case · M

Builds 5.10, 5.11, 5.20's actions, 4.3 adjustments and case breaks, the manager-PIN check (`lib/retail/manager-pin.ts`, reusing
`evaluateTillPinAttempt` — the floor spec uses it for refunds too), `getApprovalLimits` consumption (admin spec W-58; its defaults until
then), the `pack` noun, seed STK-04 rows. Removes the STK-04 rows of section 6.

Acceptance:
- `/retail/products/<Amarula>?sheet=stock-adjust` side by side with `StockAdjust.png`: "Adjust stock", "Amarula Cream 750ml · 13 on hand at
  Harare Main Branch", four cards, How many 2, At cost US$26.06, What happened, Photo optional, the footer note. Save → toast "2 off Amarula
  Cream 750ml. 11 left."; Movements shows "Broken or spoilt" ADJ-00nn −2 balance 11; a journal Dr Breakage and losses Cr Stock US$26.06; the
  product's Activity "Took 2 off: broken or spoilt, US$26.06".
- As the stock clerk adjusting Johnnie Walker by 2 (US$67.20): the "Manager’s approval" section appears; Tafara Nyathi with a wrong PIN →
  "That PIN is not right."; with his PIN → saved with "Approved by Tafara Nyathi" in the movement; five wrong PINs lock for 15 minutes.
- Taking off more than on hand → "Only 13 on hand." under How many; Fix a mistake to the same number → "That is what is on hand already.".
- `?sheet=case-break` on Castle Lager case of 24 side by side with `BreakCase.png`: "Then" reads "Cases 22 → 21, singles 26 → 50"; "Break 1
  case" → toast, two CASE_BROKEN movements with one BRK reference; with Cases and singles off → "Cases and singles is off for this shop.".
- `lib/retail/stock/adjustments.test.ts` and `cases.test.ts` pass (deltas, limit, PIN, refusals, reference shared by both legs).

### STK-05 · Start a count and count on a phone · L

Builds migration `20261004133100_retail_stock_counts` and witness, 5.5, 5.6, 5.7, 4.4 (start, preview, lines, put, submit, remind, sheet
PDF, print), `site` and `place` nouns when SET-02 has not registered them, the till refusal when keep selling is off, notifications and the
`count-link` WhatsApp message through SET-07, the `/retail/stock/counts` badge provider, seed STK-05 rows. Removes the STK-05 row of
section 6.

Acceptance:
- `/retail/stock/counts` side by side with `CountsList.png`: "Counts", "+ Start a count", tabs To approve 1 · Counting 1 · Done 18 · All 20
  (the seeded figures), rows CNT-0020 (To approve, "Today, 10:40", 38, 3, −US$41.20), CNT-0021 (Counting, "Started 11:05", "12 of 40"),
  CNT-0019, CNT-0018; Σ Differ and Difference equal SQL.
- `?sheet=count-new` side by side with `CountNew.png`; Some categories + Spirits shows "<n> products." matching the Spirits lines; Counted by
  Rudo Moyo → toast "CNT-0022 sent to Rudo Moyo. <n> products to count."; a `RetailMessage` QUEUED to `+263 77 118 2044` with the link; Rudo
  Moyo has a notification.
- Signed in as Rudo Moyo at 390×844, `/retail/stock/counts/<CNT-0022>/count` side by side with `CountPhone.png`: head, progress "0 of n",
  scan box, lines with shelves, blind note, "Done, send for review"; typing figures saves each (progress rises); Done with lines left →
  "Count every line first: <n> to go."; all counted → "Sent for review"; the owner's badge reads "2 to approve".
- With keep selling off, a till sale of a counted product answers "… is being counted. It sells again when the count is sent."; selling
  during a keep-selling count works and the line's `expectedAtCount` is the on hand after that sale.
- As a cashier who is not the counter the phone page answers "This count is not yours to count."; starting a count over lines already in
  CNT-0021 answers the 409 sentence.

### STK-06 · Approve a count: record, review, recount, cancel · L

Builds 5.8, 5.9, 4.4 (view, rename, why, recount, approve, cancel, export PDF, bulk approve), the asks `cancelcount` and `approvecounts`,
activity sentences, seed STK-06 rows.

Acceptance:
- `/retail/stock/counts/<CNT-0020>` side by side with `CountRecord.png`: "‹ Counts / Spirits shelf CNT-0020", "Print count sheet | Recount 3
  lines | ⋯", "Approve the differences"; steps with To approve current, chips "Blind count" and "3 lines differ", "Difference −US$41.20";
  five KPIs; the chart over CNT-0016 … CNT-0020 with this one dark and the range control; tabs Differences 3 · Every line · Activity; Σ row;
  rail Count and People groups; renaming Shelf saves and shows in Activity.
- "Approve the differences" → `/review` side by side with `CountReview.png` (with the seeded lines): header, strip sentence "Counted blind by
  Rudo Moyo on a phone, today 10:12 to 10:40. …", Differ/Match/All tabs, inputs, Why menu, Recount ticks, aside texts and "Spirits, last
  three counts". "Approve and adjust" → the Approved line; on hand of Gordon's, Nederburg (or its substitute) and Bols Brandy change by the
  differences; three "Count, …" movements with CNT-0020; one journal of −US$41.20; the badge drops to "1 to approve" (CNT-0022).
- A seeded count with a −US$141.20 net approved by Tafara Nyathi → "Over US$100.00 needs the owner. Tendai Mhlanga has been told." and the
  owner has a notification; the owner approves it.
- Tick one line → "Recount the 1" → toast, the count is Counting, Rudo Moyo's phone shows only that line. Cancel from the aside → ask →
  Cancelled, nothing on hand changed. As the stock clerk the review page answers "Your role cannot approve stock counts.".
- `lib/retail/stock/counts.test.ts`: approval applies difference to the current on hand after sales during the count; owner limit both
  directions; cancel changes nothing; bulk approve reports approved, waiting and skipped.

### STK-07 · Transfers: list and send · M

Builds migration `20261004133200_retail_stock_transfers` and witness, 5.12, 5.13, `POST` transfers, delivery-note PDF and print, the
`canceltransfers` ask, nav visibility on two sites, seed STK-07 rows. Removes the STK-07 rows of section 6.

Acceptance:
- `/retail/stock/transfers` side by side with `TransfersList.png`: tabs On the way 1 · Received · All, "From Any site", "To Any site", rows
  TRF-0008 (On the way, US$412.80, "Today, 08:30"), TRF-0007 (Received), TRF-0006 ("Received, 2 short"), Σ lines and value equal SQL.
- `?sheet=transfer-new` side by side with `TransferNew.png`: From Harare Main Branch, To Borrowdale, lines with "<n> at Harare Main Branch"
  subs, Σ row, Taken by, Arrives, the note naming Borrowdale. Send 4 Jameson → toast "TRF-00nn sent. Borrowdale will see it to receive.";
  Jameson's on hand at Harare Main Branch falls by 4 at once with a "Transfer out" movement; Borrowdale users have a notification.
- Sending more than on hand → "Only 9 at Harare Main Branch." on that line; From = To → "Pick a different site.".
- On hand bulk "Move to another site" with two ticked lines opens the sheet with those lines.
- A one-site tenant has no Transfers item and the route shows "Transfers need a second site.".

### STK-08 · A transfer: record, receive, change, cancel · M

Builds 5.14, 5.15, 5.16, `GET`/`PATCH`/lines/receive/cancel endpoints, the `canceltransfer` ask, activity sentences, seed STK-08 rows.

Acceptance:
- `/retail/stock/transfers/<TRF-0008>` side by side with `TransferRecord.png`: "‹ Transfers / Harare Main Branch to Borrowdale TRF-0008",
  "Print delivery note | Change the lines | ⋯", "Receive it"; steps Packed ✓, On the way current, Received; chip "On the way …"; "Value
  US$412.80"; KPIs including "Borrowdale holds 1,204 +540"; the monthly chart with range; Lines tab with "—" received and Σ; rail Transfer
  and Moving groups, Vehicle/Driver/Note editable.
- "Receive it" → `TransferReceive.png` layout with TRF-0008's lines; Fanta 58 of 60, Lost on the way → toast "TRF-0008 received at
  Borrowdale. 2 × Fanta Orange 500ml written off."; Borrowdale on hand rises by 538 with "Transfer in"
  movements; a loss journal of 2 × US$0.76; state "Received, 2 short". Still coming instead → "Part received, 2 to come", receivable again.
- "Change the lines" on an unreceived transfer adjusts Harare Main Branch's on hand by the difference; Cancel → ask → every unit back at Harare
  Main Branch with "Back from a transfer" movements, state Cancelled.
- `lib/retail/stock/transfers.test.ts`: receive creates the To line when missing; lost posts a loss; cancel after a part receipt returns only
  the rest.

### STK-09 · Empties ledger and returns · L

Builds migration `20261004133300_retail_empties` and witness, 5.17, 5.18, 5.19, 4.6, `recordSaleEmpties`/`recordRefundEmpties` called from
`_services.ts`, `bookEmptiesReturn` for the buying spec, the bottles-back endpoint, the money-sum tab and relative `when` engine
additions, nav visibility for Liquor store, seed STK-09 rows.

Acceptance:
- `/retail/stock/empties` side by side with `EmptiesList.png`: title and sub, "+ Return empties to a supplier", tabs "Ledger <n>", "Held for
  customers US$84.30", "Owed by suppliers US$231.00", "Kind Any", "Item Any", rows Today 12:10 Deposit charged, Today 11:02 Bottles back
  (Tapiwa Marange, +24 +2, −US$8.40), Yesterday 17:40 Returned to supplier (Delta Beverages, GRN-0005, −240 −20, US$84.00), 2 Oct 09:30 Credit
  received (CN-2210, −US$84.00), In the store "412 · 31".
- `?sheet=empties-return` side by side with `EmptiesReturn.png` ("412 bottles and 31 crates in the store"); Delta, 240, 20 → Deposit owed
  US$84.00 → "Book the return" → toast "Return booked. Delta owes US$84.00 in deposits."; In the store 172 · 11; Owed by suppliers +US$84.00.
  500 bottles → "Only 412 bottles in the store.".
- Row menu "Record their credit note" on that return → CN-2211, 84.00 → Owed falls by 84.00; 90.00 → "Delta Beverages owes US$84.00 on this
  return.".
- A till sale of 12 Castle with deposit adds a Deposit charged row with its sale number; a sale taking 12 empties back adds Bottles back +12;
  `POST /api/v2/retail/empties/bottles-back` as Chipo Dube on her open shift writes the row and a payout on the shift.
- Turning "Empties and deposits" off (Company) removes the nav item and the page answers 404; the endpoints answer 409.
- `lib/retail/stock/empties.test.ts`: running in-store balance under two concurrent entries; tab sums equal the held and owed balances.

---

## 8. Open questions

1. **W-25 ownership.** The workflow map puts W-25 in Stock; its board, list, document and money are buying's. This spec gives it to the
   buying spec and fixes only the stock side (STK-01 makes GRNs write `RECEIVED` with the GRN number). Confirm the buying spec builds the
   IntakeNew sheet.
2. **Cases "counted in singles".** CompanySettings' hint says "Stock is counted in singles", and the Liquor board says "cases and singles
   never disagree"; BreakCase, On hand and TransferNew keep separate case and single balances ("Cases 4 → 3, singles 2 → 26", "22 cases").
   This spec keeps separate balances (today's model) and breaks cases by movement. If the owner wants case stock derived from singles, the
   BreakCase board and On hand's case rows change.
3. **"Break cases at the till".** The BreakCase note and the Liquor board refer to a setting no board draws. This spec builds the till's
   prompt path (cashier may break a case when singles are at 0) but not an automatic switch. Where should the switch live (Till rules?).
4. **Transfer shortfalls.** The Receive hint says short units "go back on Harare Main Branch’s stock unless you mark them lost", while the
   choice is "Still coming" | "Lost on the way". This spec keeps "Still coming" units on the transfer (receivable later; returned to the
   sender if the rest is cancelled). Confirm, or the option should read "Back to Harare Main Branch".
5. **Empties signs.** The board shows "Deposit charged +12 +1" and "Bottles back −24 −2" raising and lowering "In the store", which does not
   match bottles physically in the store. This spec counts physical empties: a sale moves no empties; bottles back add; returns remove. The
   seeded rows follow that, so their Bottles and Crates signs differ from the board for those two kinds.
6. **Supplier deposit credits in the books.** Customer deposits post to Deposits held today. What should a supplier's credit for returned
   empties post to (a receivable from suppliers, or against their bill)? STK-09 writes the ledger only.
7. **Bottle and crate deposit amounts** (`bottleDeposit` 0.10, `crateDeposit` 3.00) have no board to edit them. Suggest two money fields
   under Company › Liquor store features.
8. **Sample data that cannot all hold.** CountReview's lines and −US$65.50 vs CountRecord/CountsList's −US$41.20 for the same CNT-0020 (seed
   follows the latter); Castle Lager "9 days" of cover on On hand vs "Sells 31 a day" on Reorder (seed follows On hand); Jameson "2 days" vs
   "Sells 3 a day"; Nederburg Cabernet (wine) on the spirits shelf count; Movements' "CNT-0019 Amarula −2" vs CNT-0019 "Beer, back store";
   "Rumbi Gora" receiving TRF-0007 is not in People (seed uses Rudo Moyo); CountNew lists Rudo Moyo as a cashier, People says stock clerk.
9. **Approval limits** come from the admin spec's Approvals settings (W-58). STK-04 and STK-06 call `getApprovalLimits`; until that unit
   exists the function returns the board's defaults (US$50.00; owner over US$100). Confirm the admin spec exposes that function.
10. **Manager PIN service.** STK-04 adds `lib/retail/manager-pin.ts` (pick a manager, type their till PIN, till lockout). The floor spec needs
    the same for refunds over the limit; one of the two specs should own it — this one builds it first in the order above.
11. **Supplier lead time and product supplier** feed the reorder suggestion ("Plus the supplier’s lead time"). They come from the buying and
    products specs; with neither, lead time is 0 and Johnnie Walker's suggestion is 28, not 32.
12. **People and sites.** "Borrowdale will see it to receive" implies people belong to sites; until the admin spec links people to sites, every
    user who may receive is told.
13. **Reference numbers.** Sales are `S-000930` and GRNs `GRN-00001`/`RGR-0001` today; the boards show `SALE-31862` and `GRN-0004`. The floor
    and buying specs own those formats; Movements shows whatever the document's number is.
