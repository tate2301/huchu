# 38 · Buying › Receive a delivery against the order; the delivery record

## Screen
- `/retail/buying/orders/[id]/receive` — hand-built page in the shell (Deliveries panel item current)
- `/retail/buying/deliveries/[id]` — record (RecordFrame, kind `delivery`): Lines tab, Activity, rail; primary "Post to stock"
- Orders list bulk "Mark received" (ask `markreceived`); Deliveries bulk "Post to stock" arrives with packet 43
- Ask `leavereceive` (leaving with typed counts)

## Units
BUY-06 (40-buying §7 BUY-06, §W-33 rows "Open" … "Check and post a counted delivery", §3.3 E, §4.4 (receiving, deliveries POST,
GET/PATCH record, post, bulk post), §5.6 (record header/strip/KPIs/chart/Lines/rail), §5.7, §5.32 `markreceived`, `postdeliveries`,
`leavereceive`). "Verbatim §x" = that section of `docs/handover/40-buying.md`.

## Boards
- `Receive.png` — header 48px "‹ PO-0003 / **Receive delivery** Delta Beverages, second delivery" (mono 12 `--ink-3`), outline "Fill
  as ordered", primary "Post to stock". Strip (`--ground`, 48px): 300px scan input with barcode icon "Scan or type a product to jump
  to it"; chip "48 days late" (bad); "300 of 780 came on 13 August"; right "Receiving US$300.36" (mono 15/600). Guide card (closable ×)
  three numbered items: "**Count each line.** Type what came, or scan it. What is already filled is what the order says is due." ·
  "**Put breakages aside.** Damaged bottles go in their own column, so they are claimed, not sold." · "**Decide on the rest.** Anything
  short stays on order, unless you close it short.". Table: Product (name + "120 came on 13 Aug") · Ordered · This time (input) ·
  Damaged (input, red when > 0) · To come (warn when kept; "–" faint at 0) · The rest (Keep | Close, chosen bold; or "✓ All in" green)
  · Value; Σ "4 lines" 780 · 426 · 6 (bad) · 54 (warn) · — · "US$300.36". Under: "Quantities are single units. Damaged units are counted
  in, claimed from the supplier and kept off the shelf.". Aside 320px: "When you post" four dotted sentences; "The delivery note"
  (Note number "DB-778233", Counted by "Tafara Nyathi", drop zone "Add a photo of the signed note / Drop it here, or take one on the
  phone"); "Empties going back" + tag "Liquor store" (Crates 30, Deposit back "US$90.00", hint "Chibuku crates at US$3.00 each,
  credited against this order."); "Paying for it" ("On account with Delta, 30 days from delivery. The bill for this delivery falls due
  on 2 Nov.", "Paid in cash instead?" auto "Search requisitions, or ask for money", hint "Cash for a supplier comes from a
  requisition, like REQ-0014, so the safe always balances."). The board's panel draws four items; the five-item panel wins.
- `DeliveryRecord.png` — "‹ Deliveries / Delta Beverages GRN-0002"; "Record a difference | Add photos | Print | ⋯", primary "Post to
  stock"; steps ✓ Arrived — ✓ Counted — **Checked** — In stock — Billed, chip "● 12 short" (warn); figure "Value US$216.00". KPIs Units
  300 "312 on the note" · Lines 4 "2 with differences" · Value "US$216.00" "−US$9.36 short" · Against "PO-0003" "38% of it delivered" ·
  Received "13 Aug" "10:42 by Tafara N…". Chart "Counted against the delivery note % of each line" (no range per the kind). Tabs Lines 4
  · Differences 2 · Photos 3 · Activity 5, Export; Lines: Product · On the note · Counted · Difference ("−6" warn pill, "0") · Cost ·
  Value; Σ 312 · 300 · −12 · US$214.80; footer "Delivery note PDF". Rail Delivery (Supplier, Order, Note number, Driver), Received
  (When, By, Checked by, Site), Differences (Short "12 units, US$9.36", Credit "Asked for, 13 August", Photos "3 of the boxes").
  This unit builds the counted→posted state and the Lines tab; Differences/Photos tabs, "Record a difference", "Add photos", "Email to
  supplier", "Reverse" are packet 43; "Record a bill" packet 41.

## Workflows
W-33 Receive a delivery, whole or part (Manager, staff; "The order, or Deliveries"; guided): Count what came · Note short or broken ·
Keep the rest on order or close · Post to stock — verbatim §W-33 rows 1–7 (lines 257–263), incl. "Counting only" by a stock clerk and
"Check and post a counted delivery". (Row 8, differences after posting, is packet 43.)

## Roles
`retail.purchasing:receive` (Owner, Manager, Stock clerk) to count; `retail.purchasing:approve` (Owner, Manager) to post. A stock
clerk's Receive saves COUNTED ("Send for checking"); an owner/manager posts at once and is both counter and checker. Bookkeeper reads
the record. Cashier: none. Accounts: `tafara.manager@` (posts), `tendai.stock@` (counts), `owner@`, `bookkeeper@`, `chipo.till@`.

## Data
Existing: `RetailGoodsReceipt(+Line)` (vendorId from packet 31), `RetailPurchaseOrder(+Line)`, `InventoryItem`, `Product`
(`costPrice`, `supplierId`), `StockMovement` (`recordStockMovement`, reason `RECEIVED`), `RetailAttachment`, `CrmRequisition`,
`Notification`. Migration `<stamp>_retail_deliveries`, witness `lib/retail/buying/deliveries-migration.test.ts`, verbatim §3.3 E
(lines 827–930): `RetailGoodsReceiptStatus` gains `COUNTED` (before POSTED) and `REVERSED`, column default COUNTED; enums
`RetailDeliveryDifferenceKind`, `RetailDeliverySettle`, `RetailDeliveryPaying`; receipt fields `noteNumber`, `driver`,
`countedById`, `checkedById`, `checkedAt`, `paying`, `requisitionId`, `reversedAt`, `reversedById`, `reverseReason` + relations; line
fields `noteQuantity`, `damagedQuantity`, `vatRate`; model `RetailDeliveryDifference`; `CrmRequisition.deliveries`;
`AccountingSourceType` + `RETAIL_DELIVERY_DIFFERENCE`; `NotificationType` + `RETAIL_DELIVERY_TO_CHECK`; `NotificationEntityType` +
`RETAIL_GOODS_RECEIPT`. SQL backfill: lines `noteQuantity = quantity`, `vatRate` from the product; receipts `checkedById =
receivedById`, `checkedAt = postedAt`, `countedById = receivedById`. Witness: enum order, columns, backfilled `noteQuantity`.

## Server
`lib/retail/buying/deliveries.ts` — grows packet 31's first layer (+ `deliveries.test.ts`):
- `receivingView(actor, orderId)` → verbatim §4.4 GET receiving shape: order (poNo, supplier, site, late, `deliveriesSoFar`,
  `deliveredSummary` "300 of 780 came on 13 August" / "Nothing has come yet"), lines (`before` "120 came on 13 Aug" / "First
  delivery", barcodes, case barcode and size, ordered, due, unitCost, vatRate), terms sentence (from `payTermsDays` and the order's
  `payment`: "On account with Delta, 30 days from delivery. The bill for this delivery falls due on 2 Nov." / "Cash on delivery to
  Pamela."), empties (`{ on, perCrate, crateWord }` when the shop is a liquor store with Empties and deposits on — from STK-09's
  settings), paid-out requisitions for this supplier not yet linked, default counter. Order state: SENT/PARTIAL; DRAFT offered
  "Send it first, or receive it anyway" (receiving marks it sent `BY_HAND`); CLOSED 409 "PO-0003 is closed. Reopen it to book a
  delivery against it."; RECEIVED 409 "Everything on PO-0003 has already come.".
- `receiveDelivery(actor, input)` — body verbatim §4.4 POST deliveries. One transaction (identifier reserved outside; journal after
  commit): `GRN-nnnn`, `vendorId` (order's, or `supplierId` with no order), `siteId`, lines with `noteQuantity` = this time,
  `damagedQuantity` = damaged, `quantity` = this time − damaged, `unitCost`, `vatRate`, `lineTotal` = quantity × cost; `countedById`;
  `noteNumber`; photo → `RetailAttachment` DELIVERY_NOTE; `requisitionId` (a DISBURSED requisition for this supplier, not linked).
  Refusals: damaged ≤ this time (400 "More damaged than came on Castle Lager 340ml."); this time ≤ due on the line (409 kept "Only 120
  of Castle Lager 340ml are still to come on this order."); `post: true` without `retail.purchasing:approve` → 403 "Your role cannot
  approve purchase orders". **Counting only** (`post: false`): COUNTED, nothing else moves; notification `RETAIL_DELIVERY_TO_CHECK` to
  owners and managers of the site ("GRN-0005 from Delta Beverages is counted and waiting to be checked."); audit
  `RETAIL_GOODS.COUNTED`.
- `postDelivery(tx, actor, receipt, { rest })` — the posting half, also behind `POST /deliveries/[id]/post` (COUNTED only, 409
  "GRN-0005 is already in stock."; runs against the order as it is now; `checkedById` = the poster): POSTED, `checkedById/At`,
  `postedAt`; (cost followers: `repriceCostFollowers(tx, companyId, productId)` lives in `lib/retail/prices/change.ts`, added by
  PRD-05 per the products packets); `recordStockMovement` RECEIPT (reason `RECEIVED`, reference GRN, sourceType `RETAIL_GOODS_RECEIPT`) for each line's
  `quantity` only — **damaged units never enter stock**; order lines `receivedQuantity += this time` (the order counts what came,
  damaged included — it was delivered and is claimed), via `matchDeliveryToOrder`; lines marked Close get
  `closedShortAt`/`closedShortById`; status via `orderStatusFor`; `InventoryItem.unitCost` and `Product.costPrice` = the delivered cost,
  then PRD-03's `repriceCostFollowers`; products with no supplier get this one; each damaged line → `RetailDeliveryDifference` (kind
  BROKEN, quantity −damaged, value damaged × cost, settle CREDIT, `atReceiving` true — no stock movement and no journal: the units
  never entered stock or GRNI; packet 44 returns them); empties → STK-09's `bookEmptiesReturn(tx, { actor, siteId, supplierId, bottles: 0, crates,
  goodsReceiptId, reference: GRN })` (C-21 name; signature as the stock packet 17 defines it); audit existing `auditGoodsReceived { receiptNo, units, value, short, damaged }`, plus
  `RETAIL_PURCHASE_ORDER.CLOSED` when every remaining line was closed. Journal after commit: `RETAIL_GOODS_RECEIPT` Dr Stock (role
  STOCK) / Cr 2300 GRNI at Σ quantity × cost ex VAT (existing rule). Response `{ data: { id, receiptNo, status, units, value,
  stillOnOrder, orderClosed }, accountingStatus }`.
  Money/stock invariants (tested): stock in = Σ (this time − damaged); GRNI credit = Σ quantity × cost; the damaged value is a claim
  (difference), never stock and never GRNI; Σ order line `receivedQuantity` rises by Σ this time.
- `markReceived(actor, ids)` — each open order received in full as ordered (post) → `{ posted: [{ poNo, receiptNo }], skipped }`.
- `changeDelivery(actor, id, { noteNumber?, driver?, countedById? })` (counted by only while COUNTED) — `RETAIL_RECORD.EDITED`.
- `deliveryView(actor, id)` → §4.4 `DeliveryView` (steps §3.2 delivery steps, chips, figure, KPIs, chart, lines, rail, bill null until
  packet 41, counts, can).
- Renderer `renderDeliveryNotePdf` in `lib/retail/buying/documents.ts`, registered as `RetailGoodsReceipt` in `lib/retail/record-pdf.ts`
  ("Print", "Export as PDF", the Lines tab's "Delivery note PDF").

API (`app/api/v2/retail/buying/**`):
| Method · path | Permission | Body | Success | Errors |
|---|---|---|---|---|
| GET `/orders/[id]/receiving` | `retail.purchasing:receive` | — | receiving view | 404; 409 order state |
| POST `/deliveries` | `receive`; `post: true` also `approve` | §4.4 body (`purchaseOrderId`, lines `{ purchaseOrderLineId, inventoryItemId, quantity, damaged, unitCost, rest }`, `noteNumber`, `countedById`, `photoUrl`, `empties`, `requisitionId`, `post`) | 201 `{ data, accountingStatus }` | 400; 403; 409 |
| GET `/deliveries/[id]` | `retail.purchasing:view` | — | `{ data: DeliveryView }` | 404 |
| PATCH `/deliveries/[id]` | `retail.purchasing:update` | one field | `{ data, changed }` | 400 |
| POST `/deliveries/[id]/post` · `/deliveries/bulk/post` | `retail.purchasing:approve` | — / `{ ids }` | `{ data }` / `{ posted, skipped }` | 409 |
| POST `/orders/bulk/receive` | `retail.purchasing:approve` | `{ ids }` | `{ posted, skipped }` | — |
| GET `/api/v2/retail/records/RetailGoodsReceipt/[id]/pdf` | `retail.purchasing:view` | — | pdf | 404 |
Lookup `requisition` (`retail.purchasing:receive`): paid-out requisitions for `context.supplierId` not yet linked, label "REQ-0014", sub
"US$1,940.00 paid out"; last option "Ask for money" (opens `req-new&for=order&orderId=`).
Audit `goodsCounted` (+ `LIST_WORDS`); record activity `RetailGoodsReceipt` → `retail.purchasing:view`.

## UI
- `app/retail/buying/orders/[id]/receive/page.tsx` + `components/buying/receive/*` — verbatim §5.7: grid main (padding 16 24) + aside
  320px (left `--line`); header actions; strip; guide with "Hide the guide" remembered in `localStorage` `huchu.buying.receive.guide`
  (wrapped in try/catch); table (`role="table" aria-label="Lines on this delivery"`, inputs 72×30 mono 600 right with `aria-label`s
  "Coming now, <name>" / "Damaged units, <name>", bad border + hint "More than is still to come." above due, rows with nothing coming
  on `--ground`, Keep/Close `aria-pressed`); live totals and the four "When you post" sentences (ok/warn/hollow/bad dots); the delivery
  note section (`auto` person, photo through packet 34's attachments route); empties section (only for a liquor store with empties on);
  paying section (terms sentence, `auto` requisition, the REQ link hint); scan box: typed name or barcode focuses that line's This
  time, a scan adds 1 (case barcode adds the case size), a product not on the order offers "Castle Lager case of 24 is not on PO-0003.
  Add it to this delivery?" → extra line; keyboard Enter This time → Damaged → next line; after posting the guide becomes the status
  line "**Posted to stock.** 420 units in stock, 36 still on order." with "Open GRN-0005", inputs read-only, primary gone; counting
  only: "**Sent for checking.** Tafara Nyathi or Tendai Mhlanga will post it."; leaving with typed counts asks `leavereceive`; an order
  that cannot be received shows FND's error block with the 409 sentence and a link back. Phone (<720px): aside under the table, one
  card per line (name, before, Ordered · To come, This time and Damaged side by side, Keep/Close), scan box on top, header 44px icon
  primary.
- Delivery kind (`lib/retail/record-kinds/buying.ts`), verbatim §5.6 header/strip/KPIs/chart (no range)/rail; tabs Lines
  (`retail-delivery-lines`, parent `deliveryId`, footer link "Delivery note PDF") and Activity now; primary "Post to stock" (COUNTED,
  approve right; toast "GRN-0005 posted. 20 units in stock."). Page `app/retail/buying/deliveries/[id]/page.tsx` → `<RecordFrame
  kind="delivery" id={id} />`.
- Order kind: primary "Receive a delivery" → the Receive page (SENT/PARTIAL; DRAFT shows "Send it first, or receive it anyway" as
  the page's first state). Orders list row ⋯ "Receive a delivery", bulk "Mark received" (ask `markreceived`). The product record's
  "Receive stock" (PRD) → `/retail/buying/orders/<open order with this product>/receive`.
- Asks `markreceived`, `postdeliveries`, `leavereceive` verbatim §5.32.

## Reuse
Packet 31's `lib/retail/buying/deliveries.ts`, `lib/retail/purchase-orders.ts` (`matchDeliveryToOrder`, `orderStatusFor`,
`isOpenForDelivery`), `lib/inventory/stock-movements.ts`, `auditGoodsReceived`, `postRetailJournal`, PRD-05's
`repriceCostFollowers`, STK-09's `bookEmptiesReturn` and empties settings, `figures.ts`, attachments route (packet 34),
`components/workspace/*` inputs, `components/record-frame/*`.

## Remove
- The receive-against-an-order path of the old dialog in `app/retail/buying/deliveries/page.tsx` (its Order select) and
  `GET /api/v2/retail/purchasing/orders` (it only fed that select). The old dialog stays for **"No order" only** until packet 43's
  intake sheet replaces it; `POST /api/v2/retail/purchasing/receipts` stays for that path and refuses `purchaseOrderId` with
  "Receive it from the order." (keeps "take in stock with no order" working; packet 43 deletes both).
- `route-guard-coverage.test.ts` rows updated.

## Seed
Through `receiveDelivery`/`postDelivery`, verbatim §3.6 Deliveries: GRN-0001 (Mutare, PO-0002, 12 Aug, Coca-Cola 42 this time / 2
damaged / 40 in stock, Ice 25/0/25; counted by Farai Moyo, checked by Tafara Nyathi → a BROKEN difference at receiving, credit asked);
GRN-0002, GRN-0003 and history as packet 31 (now with `noteQuantity`, `countedById`, `checkedById`); GRN-0005 (Ice Cold Supplies, no
order, today 09:15, Ice 2kg bag 20, counted by Tendai Sibanda, `post: false` → COUNTED, paying On account) — its "Post to stock" state
matches `DeliveryRecord.png`'s Checked step. Empties for the Receive board come from STK-09's seed (Chibuku crates at US$3.00).

## Tests
- Witness.
- `lib/retail/buying/deliveries.test.ts`: damaged never in stock (movement = this time − damaged), damaged > this time refused, more
  than due refused with the kept sentence, per-line Close sets `closedShortAt` and the order goes CLOSED when every remaining line is
  closed, counted vs posted (COUNTED moves nothing; post later moves stock with `checkedById` = poster), receiving a DRAFT marks it sent
  BY_HAND, product cost and supplier set, `repriceCostFollowers` called, BROKEN difference created at receiving with value damaged ×
  cost, GRNI journal amount = Σ quantity × cost (Dr Stock / Cr 2300 balance), stock clerk `post: true` → 403; **race:** two concurrent
  posts of the same COUNTED delivery → one succeeds, the other 409 "GRN-0005 is already in stock." (lock the receipt row
  `FOR UPDATE`); two concurrent receipts against the same order line that together exceed what is due → one refused.
- `components/buying/receive/*.test.tsx`: totals and the four sentences for the board's counts (120/6, 144, 90, 72; Keep, Keep, Keep,
  Close → 780 · 426 · 6 · 54, US$300.36 at the board's costs — assert with the seeded costs).

## Acceptance
1. Migration on dev + test; witness green; reseed.
2. As `tafara.manager@`, `/retail/buying/orders/<PO-0003>/receive` vs `Receive.png`: header "‹ PO-0003 / Receive delivery Delta
   Beverages, second delivery", "Fill as ordered", "Post to stock"; strip chip "48 days late", "300 of 780 came on 13 August",
   "Receiving US$…"; the guide; four lines "120 came on 13 Aug" … with This time prefilled to what is due; aside sections (Empties only
   with STK-09's settings on).
3. Type the board's counts (Castle 120 + 6 damaged, Chibuku 144, Coca-Cola 90, Sprite 72; Keep, Keep, Keep, Close) → totals 780 · 426
   · 6 · 54 and the four sentences as the board ("420 units go into stock at Harare Main Branch, on sale at once.", "1 line stays on
   order: 36 units still to come. The order stays part delivered.", "1 line is closed short. You pay only for what came.", "A claim for
   6 damaged units, US$5.16, goes to Delta Beverages.").
4. "Post to stock" → status line "Posted to stock. 420 units in stock, 36 still on order." with "Open GRN-00nn"; DB: On hand Castle +114,
   Chibuku +144, Coca-Cola +90, Sprite +72; PO-0003 "726 of 780" (Castle 240, Chibuku 204, Coca-Cola 180, Sprite 102), still to come
   36 (Chibuku); Sprite line `closedShortAt` set; one BROKEN difference of 6 Castle with settle CREDIT; after "Post now" a journal
   Dr Stock / Cr 2300 = Σ in-stock quantity × cost; Activity on the order and the delivery.
5. As `tendai.stock@` the primary reads "Send for checking"; the delivery is COUNTED, no stock moves, owners and managers notified; the
   delivery record shows steps ✓ Arrived ✓ Counted · Checked (now) and, as Tafara, primary "Post to stock" (compare with
   `DeliveryRecord.png`'s strip) → posted, "Checked by Tafara Nyathi".
6. `/retail/buying/deliveries/<GRN-0002>` vs `DeliveryRecord.png` for header, strip, KPIs, chart, Lines tab and rail (Differences/
   Photos tabs and actions with packet 43; billed state with packet 41).
7. Refusals: This time above due → bad border and "More than is still to come."; the server answers "Only 120 of Castle Lager 340ml are
   still to come on this order."; Damaged 7 with This time 6 → "More damaged than came on Castle Lager 340ml."; `POST /deliveries`
   with `post: true` as `tendai.stock@` → 403 "Your role cannot approve purchase orders"; as `chipo.till@` → 403.
8. Old Deliveries page: the dialog has no Order field; "No order" still posts stock (until packet 43).
9. Orders bulk "Mark received" on PO-0005 → ask → GRN posted for every line as ordered, PO-0005 RECEIVED.
10. `npx eslint <changed>`; `npx vitest run lib/retail/buying components/buying lib/retail/purchase-orders.test.ts`; `pnpm typecheck` alone.

## Depends on
Packets 31 (first-layer service, orders), 34/36 (requisition link, attachments). PRD-03 (product supplier), PRD-05 (`repriceCostFollowers`).
STK-09 (`bookEmptiesReturn`, empties settings — other planner, lands before in the build plan; if not on main, this packet waits).
Holds the posting lock (P).

## Risk
**money** (stock value, GRNI journal). Pitfalls: damaged units are counted on the order but never in stock and never in GRNI; reserve
the GRN number outside the transaction; lock the order lines (`SELECT … FOR UPDATE` on the order) so two receipts cannot over-fill;
journals after commit (END_OF_DAY leaves them PENDING: acceptance runs "Post now").

## Open questions
- Spec open question 5 (two people on a delivery): kept — stock clerks count, owners/managers post.
- The old dialog keeps "No order" until packet 43 rather than leaving the shop with no way to take in stock in between.
- `receivedQuantity` counts what came (damaged included): the order is delivered against; the damaged units are a claim on the
  delivery, not a shortfall on the order.


> Coordinator note (2026-10-06, 85a): with receipts in place, add the `retail-orders` `report:` face (§5.14; Came and Still due
> from received quantities) and the built-in `orders-and-deliveries` (§5.13, Buying) in 85a's three steps.
