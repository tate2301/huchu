# 31 · Buying › Orders: list, record, raise and send, close and reopen, remove a draft

## Screen
- `/retail/buying/orders` — list (ListFrame, source `retail-orders`)
- `/retail/buying/orders/[id]` — record (RecordFrame, kind `order`)
- Sheets: `?sheet=order-new` (`&supplierId=`, `&productIds=`, stepping `&supplierIds=`), `?sheet=order-edit&id=<id>`
- Asks: `closeshort`, `removeorder` (exist in `lib/retail/asks/buying.ts`)

## Units
BUY-02 (40-buying §7 BUY-02, §W-30, §3.3 B, §4.3, §4.8, §4.10, §5.3, §5.4, §5.15, §5.16), **plus two pieces moved in from
BUY-03 so nothing that works today is lost between merges**: close with what came / reopen (W-70, the existing
`purchasing/orders/[id]/close` behaviour, moved), and remove a draft to the bin (W-71, bin kind `order`; it replaces today's
hard delete). "Verbatim §x" means the copy/tables of that section of `docs/handover/40-buying.md` are part of this packet.

## Boards
- `OrdersList.png` — "Orders", "+ New order"; tabs Open 3 · Drafts 1 · Received 19 · All 23; toolbar "Order number or
  supplier", "Supplier Any", "Site Any", "Filters", count, "Expected, soonest", Group, Columns, Export. Columns Order (mono) ·
  Supplier · State (badge: Draft neutral, "48 days late" bad, Part delivered warn, Sent info, Received hollow) · Raised ·
  Expected · Delivered (bar + "300 of 780") · Value · Still to come (warn pill when part delivered/late, plain money when
  nothing came, muted US$0.00) · ⋯. Σ "5", "413 of 1,012", value Σ, still Σ.
- `OrderNew.png` — 760px "New order" / "Buying › Orders": Supplier; Expected (half) + Deliver to (half), hint "From their lead
  time: 2 days."; "Lines" table Product (sub "Low: 18 left, sells 31 a day" warn / "Usual order") · Quantity input · Cost ·
  Value · ×, add row "Add a product: search, scan, or add a new one", Σ "4 lines" 780 "US$ 559.20"; hint "Suggested from what is
  low and what you usually buy from Delta. Change any quantity."; "Paying and sending": Paying seg On account · Cash on
  delivery; toggle card "Ask for the cash now" / "Creates a requisition for the order total, for the owner to approve before the
  truck comes."; "Note to the supplier optional". Footer note "Delta pays 30 days. Their minimum is US$500.00.", "Save as
  draft", primary "Send on WhatsApp".
- `OrderRecord.png` — "‹ Orders / Delta Beverages PO-0003"; "Send a reminder | Edit lines | Print | ⋯", primary "Receive a
  delivery"; steps Draft ✓ — Sent ✓ — **Part delivered** — Received — Billed, chip "48 days late"; figure "Still to come
  US$384.00" warn. KPIs Ordered 780 "4 lines" · Delivered 300 "38% of the units" · Value US$624.00 "US$240.00 delivered" · Still to
  come US$384.00 "480 units" · Expected "16 Aug" "48 days late". Chart "Delivered, by line % of what was ordered" (bars Castle
  340ml, Chibuku 1L, Coke 500ml, Sprite 500ml; last darker). Tabs Lines 4 · Deliveries 1 · Messages 3 · Activity 6, Export; Lines
  table with warn pills in Still to come, Σ; footer "Order history". Rail: Order (Supplier, Site, Raised, Raised by, Sent
  "WhatsApp, 10 August 14:20"), Money (Lines, VAT, Total, Pays), Deliveries ("GRN-0002 | 13 August, 300 units", "Next | Promised
  for 7 October").
- `OrderRemove.png` — draft PO-0007: steps with Draft current, chip "Not sent", "Edit lines | Print | ⋯", primary "Send to
  Delta", figure "Value US$412.80"; ask "Remove PO-0007?" … "Keep it" / "Remove the order" (bad).
- `OrderEdit.png` — 760px "Edit PO-0003" / "Delta Beverages · part delivered": Expected + Deliver to; Lines with sub "120
  delivered"; hint "A line cannot go below what was delivered. To drop what is left, set it to what came."; footer danger
  "Cancel what is left" (packet 33), note "Delta gets the changed order on WhatsApp.", "Save without telling them", primary
  "Save and tell Delta".
- `OrderCloseShort.png` — ask "Close PO-0003 with what came?" body built (see `closeShortAsk`), "Keep waiting" / "Close the
  order".
Not here: "Send a reminder" (`order-chase`), "Cancel what is left", bulk "Send to suppliers"/"Cancel", Filters › Late → packet 33.
"Receive a delivery" opens the Receive page (packet 38); until then the primary links to the old Deliveries page's receive
dialog, which keeps working (see Remove).
The record board draws a chart range control; per 98-decisions FND #10 the order kind has none (spec §5.4).

## Workflows
- W-30 Raise and send an order (Manager): Suggested lines · Adjust · Send on WhatsApp or email — every row verbatim §W-30
  (lines 182–202): Open (incl. `&supplierId`, `&productIds`, Suppliers bulk "New order for each" stepping), Suggested lines,
  Adjust, Send, Message body, Send a draft (single; bulk is packet 33), Edit lines (with/without telling), Duplicate,
  Print / PDF.
- W-70 Close with what came · Reopen (without the bill rule — that arrives with packet 41) — verbatim §W-70 rows 1–3.
- W-71 Remove a draft · It goes to the bin for 30 days — verbatim §W-71.

## Roles
`retail.purchasing` (landed): Owner/Manager all; Stock clerk view + receive; Bookkeeper view; Cashier none.
- Stock clerk: list without primary, row ⋯ only Open and Receive a delivery, no bulk but Export; record actions "Print" and
  ⋯ "Export as PDF" only, primary "Receive a delivery"; `POST /orders` → 403 "Your role cannot create purchase orders"
  (the sheet's `requires` hides it; the server refuses anyway).
- Bookkeeper: read only; record "Print" (primary "Record a bill" arrives with packet 41).
- Cashier: no nav item, 403 "Your role cannot view orders and deliveries".
Accounts: `owner@`, `tafara.manager@`, `tendai.stock@`, `bookkeeper@`, `chipo.till@` (all `@bottlestore.test`).

## Data
Existing: `RetailPurchaseOrder`, `RetailPurchaseOrderLine`, `RetailGoodsReceipt`, `RetailGoodsReceiptLine`, `Vendor`
(packet 30), `RetailMessage` (+ direction/entity columns from packet 30), `InventoryItem`, `Product.defaultTaxRate`
(15.5% on the demo shelf), `PlatformAuditEvent`, `Notification`.

Migration `<stamp>_retail_purchase_orders`, witness `lib/retail/buying/purchase-orders-migration.test.ts`. Schema verbatim
§3.3 B (lines 506–651) **minus the `RetailMessage` block** (moved to packet 30) — i.e. enums `RetailOrderPayment`,
`RetailOrderSentVia`, `RetailOrderChaseAction`; status enum gains `SENT` (before `PARTIAL`) and `CANCELLED`;
`RetailPurchaseOrder`: `vendorId` (replaces `supplierName`), `firstExpectedDate`, `payment`, `noteToSupplier` (rename of
`notes`), `sentAt/sentById/sentVia`, `chaseAction/chasedAt/chasedById/followUpDoneAt`, `cancelledAt/cancelledById`,
`duplicatedFromId`, `archivedAt`, relations and `@@index([companyId, vendorId, status])`; line gains `vatRate`,
`sentQuantity`, `closedShortAt`, `closedShortById`, `sortOrder`; `RetailGoodsReceipt` gains `vendorId` (replaces
`supplierName`), the `purchaseOrder` relation, `@@index([companyId, vendorId])`; `Vendor` back-relations; enum additions
`NotificationType.RETAIL_ORDER_FOLLOW_UP`, `NotificationEntityType.RETAIL_PURCHASE_ORDER`.
SQL data, in this order: add enum values (do not *use* `SENT`/`CANCELLED` later in the same migration file — Postgres
refuses a new enum value inside the transaction that added it); vendors for every distinct `(companyId, supplierName)` on
orders and receipts with none of that name (case-insensitive), numbered after the company's highest `SUP-` code; set
`vendorId` by name; drop both `supplierName`; rename `notes` → `noteToSupplier`; `firstExpectedDate = expectedDate`; existing
PARTIAL/RECEIVED/CLOSED orders `sentAt = createdAt`, `sentVia = 'BY_HAND'`; `sentQuantity = quantity`; `vatRate` from
`InventoryItem.productId → Product.defaultTaxRate`. Witness: enum values in order (DRAFT, SENT, PARTIAL, RECEIVED, CLOSED,
CANCELLED), dropped columns, an order and a receipt inserted with `supplierName` "Delta Beverages" before → both point at a
`Vendor` named so after, `vatRate` backfilled from the product.
Code: `lib/id-generator.ts` `RETAIL_PURCHASE_ORDER` → `{ prefix: "PO", requiresSiteId: false }`, `RETAIL_GOODS_RECEIPT` →
`{ prefix: "GRN", requiresSiteId: false }`, both max-existing per company (the per-site `RPO`/`RGR` sequences go).

## Server
`lib/retail/purchase-orders.ts` — **kept**, extended (+ `purchase-orders.test.ts`):
- `outstanding(line)` → 0 for a line with `closedShortAt`.
- `orderStatusFor(lines, { closed, sent })` — CLOSED when closed; nothing received → SENT when sent else DRAFT; every line
  received in full or closed short → CLOSED if any line closed short else RECEIVED; otherwise PARTIAL. `CANCELLED` is set
  only by the cancel service (packet 33), never inferred.
- `isOpenForDelivery(status)` → DRAFT, SENT or PARTIAL (receiving a DRAFT marks it sent `BY_HAND` first — done in the receive
  service below).
- `planOrderLineEdits`, `matchDeliveryToOrder`, `OrderRefused` — kept as they are (their sentences are the spec's).

`lib/retail/buying/orders.ts` (+ test) — signatures and rules verbatim §W-30/§4.3:
- `raiseOrder(actor, input) → { order, requisition?, messages }` — supplier live (409 "You stopped buying from Pamela."),
  site in tenant, quantities whole > 0 (400 `fieldErrors.lines` "Each line needs a quantity."), ≥1 line to send (400 "Add at
  least one line."); `poNo` via `reserveIdentifier` (outside the main tx, as the receipts route does today); lines store
  `unitCost` ex VAT, `vatRate` = the product's `defaultTaxRate`, `lineTotal` = qty × cost; with `send`: SENT, `sentAt`,
  `sentById`, `sentVia`, `firstExpectedDate = expectedDate`, `sentQuantity = quantity`, messages (below). `askForCash` is
  accepted only once packet 34 lands (until then the toggle is not drawn and the body field is refused 400) — the
  requisition is created by packet 34's `askForMoney` in the same tx. Audit `RETAIL_PURCHASE_ORDER.CREATED { poNo, supplier,
  lines, value }` (+ `.SENT { via, to }`).
- `sendOrder(actor, id, via?)` — DRAFT only (409 "PO-0004 has already been sent."), ≥1 line.
- `changeOrder(actor, id, { expectedDate?, siteId?, lines?, tell?, supplierId? (drafts), payment? })` — `planOrderLineEdits`;
  site locked once anything came (409, existing sentence); refused on RECEIVED/CLOSED/CANCELLED (409 "PO-0001 is done.
  Duplicate it to order again."); status via `orderStatusFor`; with `tell` on a sent order a message "PO-0003 has changed:
  Castle Lager 340ml 240 → 300. Expected 7 October. The new order is attached." to the same recipients; `sentQuantity` =
  new quantity when told; audit `.CHANGED { changes: [{ item, from, to }], expected, told }`; rail single-field edits
  write `RETAIL_RECORD.EDITED`.
- `duplicateOrder(actor, id)` — new DRAFT, same supplier/site/products/quantities at today's costs, expected today + lead
  time, `duplicatedFromId`; audit `.DUPLICATED` on the new order.
- `closeOrder(actor, id, note?)` / `reopenOrder(actor, id)` — moved from `app/api/v2/retail/purchasing/orders/[id]/close/route.ts`
  with its 409s ("This order is already closed", "Everything on this order has come; there is nothing to close"); close marks
  CLOSED, `closedAt/closedById/closeNote`, and every line with something still to come gets `closedShortAt`; reopen clears
  them and recomputes status. The bill rule on reopen is packet 41's. Audit existing `orderClosed { units not delivered }`,
  `orderReopened`. Toasts "PO-0003 closed with what came. 480 units are no longer expected." / "PO-0003 reopened. 480 units
  are expected again.".
- Order messages: one `RetailMessage` per recipient (contacts whose `sends` = ORDERS → WhatsApp to their phone when the
  supplier sends on WhatsApp, else email; else `Vendor.whatsapp`; else email), `direction OUT`, `template "purchase-order"` /
  `"order-changed"`, `entityType "RetailPurchaseOrder"`, `entityId`, `mediaUrl` = a signed 30-day link to the order PDF,
  `mediaName` "PO-0031.pdf", `mediaKind DOCUMENT` (C-02). Email bodies end with the same link (the drain sends email
  without attachments). Body verbatim §W-30 "Message" row. "Save and print" sends nothing (`sentVia BY_HAND`).
- `lib/retail/buying/suggest.ts` (+ test) — rule verbatim §W-30 "Suggested lines": products with `supplierId` = this supplier,
  live, stocked at the site; **Low** = STK-01's `stockLevel` says OUT or LOW (C-34: one rule; do not re-derive from
  `minStock`): quantity = `InventoryItem.reorderQty` when set, else 14 days of the last 30 days' average daily sales plus the
  lead time, minus on hand, rounded up to the case size when the product has a pack, minimum 1; sub "Low: <on hand> left,
  sells <avg> a day". **Usual** = not low and on ≥2 of this supplier's last 3 orders: median quantity; sub "Usual order".
  Low first (most cover lost first), then usual by name. Cost = last delivered cost from this supplier, else
  `InventoryItem.unitCost`. With `productIds`: exactly those, supplier preset to the one most of them name.
- `lib/retail/buying/documents.ts` — `renderOrderPdf` (shop legal/trading name and VAT number from the company settings,
  PO number, supplier, deliver to, expected, lines with cost, VAT, total, payment, note) through `renderPdfFromHtml`
  (`lib/documents/pdf-renderer.ts`); registered as `RetailPurchaseOrder` in `lib/retail/record-pdf.ts`; `signDocumentToken(id,
  expiry)` / `checkDocumentToken` = HMAC-SHA256 over `<id>.<expiry>` with `NEXTAUTH_SECRET`; the PDF route accepts `?token=`
  (410 "This link has run out." when expired).
- Reply matching (C-04): add `orderReplyHandler` to `WHATSAPP_HANDLERS` in `lib/messaging/whatsapp-webhook.ts` (handler code
  in `lib/retail/buying/replies.ts`): an inbound `message` event whose sender digits equal a contact's phone, a rep's or a
  supplier's `whatsapp` (digits only) → for each company with such a supplier: a `RetailMessage` with `direction IN`,
  `channel WHATSAPP`, `fromNumber`, `externalId` = the event id (skip if a row with that `externalId` exists), `status SENT`,
  `sentAt` = event time (never QUEUED, so the drain never picks it up), `body` = text, `entityType` = the supplier's most
  recently messaged order that is DRAFT/SENT/PARTIAL (else `Vendor`); audit `RETAIL_MESSAGE.RECEIVED`; notification to the
  sender of the last OUT message on that order ("Delta Beverages replied about PO-0003."). No new route: `/api/webhooks/whatsapp`
  (SET-07) already verifies the signature.
- Bin kind `order` in `lib/retail/bin.ts` (`BIN_KINDS` + `KINDS`): label "Order, draft", entityType `RetailPurchaseOrder`,
  deleteRight `retail.purchasing:delete`, viewRight `retail.purchasing:view`, `move` DRAFT only (409 "PO-0003 has been sent.
  Cancel what is left instead."; 409 "REQ-0013 for PO-0004 has been paid out. Account for it first." once packet 34/36
  exist), `restore` clears `archivedAt`, `purge` deletes the order and its lines ("deleted"), `listBinned`. Binned orders leave
  every list, lookup and badge. Replaces today's hard `DELETE`.
- `lib/retail/buying/deliveries.ts` — **first layer** of `receiveDelivery` (grown by packet 38): the body of today's
  `POST /api/v2/retail/purchasing/receipts` moved into a service, unchanged in behaviour (post at once; stock RECEIPT movements
  with reason `RECEIVED`; order lines filled through `matchDeliveryToOrder`; status via `orderStatusFor`; journal after commit;
  `auditGoodsReceived`), now writing `vendorId` (the order's; for no order, a supplier id). The old route becomes a caller of it
  (see Remove) and the seed uses it.

API (`app/api/v2/retail/buying/orders/**`), verbatim §4.3 for: POST `/orders`, GET `/orders/[id]` (`OrderView` incl. `late`,
`steps`, `chips`, `figure`, `kpis`, `chart`, `lines`, `deliveries`, `rail`, `requisition`, `counts`, `can`), PATCH `/orders/[id]`,
POST `/orders/[id]/send`, POST `/orders/[id]/duplicate`, POST/DELETE `/orders/[id]/close`, GET
`/api/v2/retail/buying/suppliers/[id]/suggestions?siteId=&productIds=` (`retail.purchasing:create`), GET
`/api/v2/retail/records/RetailPurchaseOrder/[id]/pdf` (FND route; `retail.purchasing:view` or valid `?token=`), bin kind
`order` through FND's `POST /api/v2/retail/bin` / `bin/restore`. Errors exactly as in §W-30/§4.3. Lookup `order`
(`lib/retail/lookups/buying.ts`): drafts and open orders without a live requisition, label "PO-0005 · Afdis Distillers", sub
the total with VAT; read `retail.requisitions:create` (used by packet 34); quick add (`[["Supplier",""],["Expected",""]]`,
`retail.purchasing:create`) → an empty draft.
Nav badge "<n> open" on Orders: provider in `lib/retail/nav-badges/buying.ts` (one line in `nav-badges/index.ts`): SENT or
PARTIAL, not binned, for `retail.purchasing:view`.
Audit: `orderCreated`, `orderSent`, `orderChanged`, `orderDuplicated`, `messageReceived` + the existing close/reopen — sentences
verbatim §3.4; `LIST_WORDS` rows (packet 32's test). Record activity: `RetailPurchaseOrder` → `retail.purchasing:view`.

## UI
- `app/retail/buying/orders/page.tsx` → `<ListFrame source="retail-orders" title="Orders" />`. Source in
  `lib/reports/definitions/retail/buying.ts`, loader database-side `page()` in `lib/reports/loaders/retail/buying.ts`; tabs
  `open` (SENT, PARTIAL) · `drafts` · `received` (RECEIVED, CLOSED, CANCELLED) · `all`, default open; filters supplier,
  site (hidden with one site), Filters › Raised (period); sorts "Expected, soonest" (`firstExpectedDate`), "Raised, newest",
  "Most still to come", "Order number"; Group None/State/Supplier/Site; columns, totals, row ⋯ (Open · Send to <first word> ·
  Receive a delivery · Edit lines · Duplicate order · Close with what came · Remove the order (bad)), empty and phone card
  verbatim §5.3. Bulk this unit: "Mark received" waits for packet 38; "Send to suppliers"/"Cancel" for packet 33; Export now.
  Also `retail-order-lines` (parent `orderId`) and `retail-order-messages` (parent `orderId`; columns §5.4 Messages; row ⋯
  "Send again" for FAILED → re-queue).
- `app/retail/buying/orders/[id]/page.tsx` → `<RecordFrame kind="order" id={id} />` + the page-owned asks (pattern
  `app/retail/stock/transfers/[id]/page.tsx`): `closeShortAsk`, `removeOrderAsk` (exist). Kind in
  `lib/retail/record-kinds/buying.ts`: header per state, strip, KPIs, chart (no range; bar labels from
  `shortName(name)` in `lib/retail/buying/words.ts` = first word + the size token: "Castle 340ml", "Chibuku 1L", "Coca-Cola
  500ml" — the board's "Coke" is a nickname no data holds; tested), tabs Lines · Messages · Activity
  (the Deliveries tab is added by packet 43 together with its `retail-deliveries` source; until then the rail's Deliveries
  group lists them); rail Order/Money/Deliveries verbatim §5.4; bin `{ kind: "order" }` drafts only.
  Rail `Expected` edit: add `RailEdit.type: "date"` (parses "7 October 2026" → `YYYY-MM-DD`, error "Write a date, like 7
  October 2026."). "Print" opens the PDF with `?print=1`.
- Sheets (`lib/retail/sheet-kinds/buying.ts`): `order-new` (verbatim §5.15; the Lines field uses the existing `lines` type with
  `ql "Quantity"`, `cl "Cost"`, per-line `sub`/`warn`; the footer note is live from suggestions' `terms` and the total with VAT
  vs `minimumOrder`), `order-edit` (verbatim §5.16 without the danger). Two frame additions this unit owns, in
  `lib/workspace/sheet-kind.ts` + `components/sheet-form/sheet-form.tsx`: `alt?: { label: string|((v)=>string); submit:
  (values, ctx) => SheetRequest; done }` — a second submitting button (Save as draft / Save without telling them), drawn as the
  secondary; and `stepping?: { param: string }` (the URL param holding the comma list: `supplierIds`, `ids`) — the sheet walks the list, sub gains " · 1 of 3",
  Cancel reads "Skip" while stepping, the next item opens after each save (used again by packets 34, 36, 41).
- The supplier record (packet 30) gains: primary "New order" (`order-new&supplierId=`, `retail.purchasing:create`; hidden
  for a stopped supplier), the Orders tab (`retail-orders`, parent `supplierId`, columns §5.2 Orders row, "All 23 orders" →
  `/retail/buying/orders?supplier=<id>&tab=all`), chip "<n> order late"; Suppliers list row ⋯ "New order" and bulk "New order for
  each" (`order-new&supplierIds=…`, stepping). Product record / On hand "Add to an order" (PRD/STK) open
  `?sheet=order-new&productIds=…` — this sheet honours it.
- Phone: list cards (title "PO-0003 · Delta Beverages", state badge, figure Still to come, meta "300 of 780 · expected 16
  Aug"); record and sheets per FND.

## Reuse
`lib/retail/purchase-orders.ts` (kept), `app/api/v2/retail/purchasing/receipts/route.ts` body (moved into
`lib/retail/buying/deliveries.ts`), `app/api/v2/retail/purchasing/orders/[id]/close/route.ts` (moved), `lib/retail/asks/buying.ts`
(`closeShortAsk`, `removeOrderAsk`), `lib/retail/stock/levels.ts` (`stockLevel`, `COVER_AIM`, `COVER_WINDOW_DAYS`),
`lib/retail/bin.ts`, `lib/messaging/whatsapp-webhook.ts` (`WHATSAPP_HANDLERS`), `lib/retail/record-pdf.ts`,
`lib/documents/pdf-renderer.ts`, `lib/retail/buying/figures.ts` (packet 30), list/record/sheet patterns of STK-07/08.

## Remove
- `app/retail/buying/orders/page.tsx` (RecordListShell + ColumnList), `app/retail/buying/orders/_components/order-dialog.tsx`,
  `app/retail/buying/orders/[id]/page.tsx` (field list, `dsConfirm`) — replaced by the frames above.
- `app/api/v2/retail/purchasing/orders/[id]/route.ts` (GET/PATCH/DELETE — the hard delete goes) and
  `app/api/v2/retail/purchasing/orders/[id]/close/route.ts` (moved to `/buying/orders/[id]/close`); the POST in
  `app/api/v2/retail/purchasing/orders/route.ts`.
- **Kept until packet 38**, adapted to the new schema: `GET /api/v2/retail/purchasing/orders` (the old receive dialog's order
  list: answers `supplierName` from `vendor.name`, open = `isOpenForDelivery`) and `POST /api/v2/retail/purchasing/receipts`
  (now a thin caller of `receiveDelivery`; its "No order" free-text supplier resolves to the live supplier of that name,
  case-insensitive, else one is made through `createSupplier`). Kept until packet 43: `GET /purchasing/receipts` and the
  Deliveries register page. This keeps receiving working until the Receive page replaces it.
- Other readers of the dropped/changed columns, updated in this unit (typecheck finds them): `lib/retail/insights.ts` (~line 1495:
  `supplierName` → `vendor.name`; on-order statuses DRAFT/SENT/PARTIAL, not binned), `app/api/v2/retail/route.ts` (~line 295: open
  orders DRAFT/SENT/PARTIAL, not binned), `lib/accounting/integration.ts` (receipts — unchanged columns, check it compiles).
- `RPO`/`RGR` per-site sequences in `lib/id-generator.ts`; the seed's "Purchasing" block (`PO-00001`/`GRN-00001`,
  `scripts/seed-retail-demo.ts` ~line 1192).
- Route registry: nothing yet (old prefixes go with packet 45). `route-guard-coverage.test.ts`: drop removed routes, add new.

## Seed
`seedOrders()` after `seedSuppliers()`: orders verbatim §3.6 "Orders" table (PO-0001 … PO-0023 with PO-0007; numbers assigned by
the seed, sequence left at 23), each raised/sent as stated; deliveries for them posted through the first-layer
`receiveDelivery` with the dates in §3.6 "Deliveries" (GRN-0001 PO-0002 42/25 lines — damaged detail is packet 38's;
GRN-0002 PO-0003 120/60/90/30 at 10:42 by Tafara Nyathi — packet 43's seed later posts it as on its note, 66/36, and records the
two SHORT differences that end at the same 300; GRN-0003 PO-0022; history GRN-0006…), so On hand, movements and
journals agree; PO-0003's three messages (the order OUT 10 Aug 14:20 by Tafara, the reminder OUT yesterday, the reply IN
"Truck on Wednesday, 7 October.") and its chase fields (`chaseAction REMIND`, `expectedDate` today + 4, `firstExpectedDate`
today − 48). Money: the products are at 15.5% VAT (98-decisions SET-08), so totals with VAT differ from the boards' 15% figures;
**set PO-0005's line costs so its total with VAT is exactly US$1,940.00** (keep the six products and quantities, adjust Bols
Brandy's unit cost; assert it in the seed check) because packets 34–36 and the boards hang on that figure. Other totals follow
the data. Owner phone `+263 77 412 0098`, Tafara `+263 77 301 2290` (C-44).

## Tests
- Witness (above).
- `lib/retail/purchase-orders.test.ts`: `orderStatusFor` with sent/unsent, a closed-short line, all closed short → CLOSED;
  `outstanding` 0 for closed short; `isOpenForDelivery` (DRAFT/SENT/PARTIAL yes; RECEIVED/CLOSED/CANCELLED no).
- `lib/retail/buying/orders.test.ts`: raise as draft and sent (messages per recipient rule: contact Orders → WhatsApp; no
  WhatsApp → email; neither → BY_HAND, no message); stopped supplier refused; edit below delivered refused with the sentence;
  site change refused once something came; tell queues "order-changed"; duplicate copies at today's cost; close sets
  `closedShortAt` on the owed lines only; reopen clears; stop supplier (packet 30) refused while PO-0005 is SENT.
- `lib/retail/buying/suggest.test.ts`: low via `stockLevel`, reorderQty preferred, 14-day+lead formula, case rounding, usual
  median, ordering, `productIds` preset.
- `lib/retail/buying/replies.test.ts`: matching by contact/rep/supplier number, de-dup by `externalId`, stored on the latest
  open order else the vendor, never QUEUED.
- `lib/retail/buying/documents.test.ts`: token round trip, expired → refused.
- `lib/retail/bin.test.ts`: kind `order` move refused for a sent order; restore; purge deletes lines.
- `lib/retail/buying/deliveries.test.ts` (first layer): what the old receipts route test asserted, now on the service.

## Acceptance
1. Migration applied on dev and test; witness green. Reseed.
2. As owner, `/retail/buying/orders` vs `OrdersList.png`: tabs Open 3 · Drafts 2 · Received 18 · All 23 (board 1/19: it has no
   PO-0007 — figures follow data), toolbar words, state badges incl. "48 days late", bars "300 of 780", owed pills, Σ row.
3. "+ New order", Supplier Delta → Expected today+2 with "From their lead time: 2 days.", Deliver to Harare Main Branch,
   Castle Lager 340ml with a warn "Low: …" sub and usual lines; note "Delta pays 30 days. Their minimum is US$500.00.";
   "Send on WhatsApp" → toast "PO-0024 sent to Delta Beverages on WhatsApp." with "Open"; DB: order SENT, `sentVia WHATSAPP`,
   `RetailMessage` OUT to Tinashe Moyo's number with `mediaUrl` (QUEUED, or FAILED "WhatsApp is not set up" after a drain
   without credentials); badge "4 open". "Save as draft" on another → Drafts tab.
4. `/retail/buying/orders/<PO-0003>` vs `OrderRecord.png` (no range control): header, actions (no "Send a reminder" until
   packet 33), steps, chip, figure, five KPIs, four bars, Lines/Messages/Activity tabs (Deliveries tab with packet 43) and
   Lines Σ, rail rows incl. "GRN-0002 | 13 August, 300 units".
5. `/retail/buying/orders/<PO-0007>` vs `OrderRemove.png` (without the dialog); "Send to Delta" sends it (SENT, message
   queued). On another draft, ⋯ "Remove the order" → ask as the board → Orders without it, toast "PO-00xx is in the bin. You can
   restore it until <date>."; `/retail/manage/bin` lists it as "Order, draft"; Restore brings it back as a draft. On PO-0003 the
   item is absent and `POST /api/v2/retail/bin {kind:"order"}` → 409 "PO-0003 has been sent. Cancel what is left instead.".
6. Edit lines on PO-0003 vs `OrderEdit.png` (no danger yet): Castle to 100 → footer "120 of Castle Lager 340ml have already come;
   the order cannot ask for fewer."; Castle to 300 → "Save and tell Delta" → "PO-0003 changed. Delta has the new order.";
   message `order-changed` queued; Activity "Changed the lines: Castle Lager 340ml 240 → 300, told Delta".
7. ⋯ "Close with what came" on PO-0003 → ask vs `OrderCloseShort.png` (title and body built from data) → "Closed short", Received
   tab, figure US$0.00; Activity "Closed with what came, 480 units not delivered"; primary "Reopen the order" reopens.
8. Webhook: POST to `/api/webhooks/whatsapp` a signed inbound message from 263772149080 (sign with `META_WHATSAPP_APP_SECRET`
   as `lib/messaging/whatsapp.test.ts` does) → a reply row on PO-0003's Messages tab; Tafara Nyathi notified "Delta Beverages
   replied about PO-0003."; the same event again adds nothing.
9. Receiving still works: Deliveries (old page) → receive against PO-0002 → GRN-0007-style number, stock in, order filled.
10. Refusals: as `tendai.stock@` no primary; `?sheet=order-new` answers "Your role cannot create purchase orders"; as `bookkeeper@`
    no pens; as `chipo.till@` 403. Bad input: a line quantity 0 → "Each line needs a quantity.".
11. `npx eslint <changed>`; `npx vitest run lib/retail/purchase-orders.test.ts lib/retail/buying lib/retail/bin.test.ts
    lib/retail/route-guard-coverage.test.ts lib/messaging`; `pnpm typecheck` alone.

## Depends on
Packet 30 (BUY-01: `Vendor` fields, `supplier`/`contact` lookups, figures, RetailMessage entity columns). PRD-03 (`product`
lookup with quick add for "Add a product"; `Product.supplierId` for suggestions). SET-02, SET-07 (landed). STK-01 (`stockLevel`,
`reorderQty`, landed).

## Risk
money — the receive-and-post code (stock movements, GRNI journal) moves into `lib/retail/buying/deliveries.ts`; its behaviour must
not change (its tests move with it and stay green). Pitfalls: Postgres enum
values added in a migration cannot be used in that same migration; `reserveIdentifier` must stay outside the posting
transaction (as the receipts route does) to avoid serialisation retries; inbound messages must never be QUEUED; the webhook is
shared — a handler that throws is logged and skipped, so test it directly.

## Open questions
- Scope moved from BUY-03: close/reopen and remove-draft land here so the record never loses a working action (AGENTS: never
  trade a working product). Packet 33 keeps chase, cancel what is left, bulk send/cancel, Late filter and the worker.
- Spec open question 4 (VAT basis): taken as written (costs ex VAT, totals with VAT); the demo VAT rate is 15.5% (SET-08), so
  the board's PO-0003 "VAT US$64.80" does not reproduce; PO-0005 is pinned to US$1,940.00.
- `attachmentUrl` replaced by `mediaUrl/mediaName/mediaKind` (C-02); webhook route not built here (C-04, SET-07 owns it).

## Coordinator note (carried from BUY-01)
- Stopping a supplier that still has open orders (DRAFT/SENT/PART-received) must now be refused: the `stopbuying`
  action in `lib/retail/buying/suppliers.ts` (~494-504 has the deferred placeholder) answers 409 with the spec's
  sentence for an open order, using the new `vendorId` on orders. Add its test. The row ⋯ and record ask show the
  refusal through `onRefused`.


> Coordinator note (2026-10-06, packet 90): every date this packet takes is entered through the shared picker. Use sheet fields
> `t: "date"` (or `t: "datetime"` for a day and time) with `earliest`/`latest`, rail edits `type: "date"`, and list periods through
> ListFrame's "Choose dates…". Values are `YYYY-MM-DD` / `YYYY-MM-DDTHH:mm` shop days, which the server turns into instants with
> `startOfDayIn(day, SHOP_TIME_ZONE)`. Never use `<input type="date">` or `datetime-local`.
> If 90 lands before this, the rail `Expected` edit uses 90's `RailEdit.type: "date"`. If this lands first, 90 converts it.

## Coordinator note (stashed start)
An earlier builder of this packet was stopped mid-way; its uncommitted work is in `git stash list` as
"wip: Orders (BUY-02) builder stopped at owner's stage stop". It was started before packet 90 (date pickers) landed.
First `git stash apply` it (resolve against HEAD; use the new date fields from packet 90 for Expected), review what is
there, keep what is right, then finish the packet. Drop the stash (`git stash drop`) once its content is committed.

## Coordinator note
Product record (15) and Vouchers (23) shipped before this packet with slots for it: fill them in here.
