# 43 · Buying › Deliveries: list, differences, photos, reverse, take in stock with no order

## Screen
- `/retail/buying/deliveries` — list (ListFrame, source `retail-deliveries`), primary "+ Take in stock"
- `/retail/buying/deliveries/[id]` (packet 38's record) gains: actions "Record a difference", "Add photos"; ⋯ "Email to supplier",
  "Reverse this delivery"; tabs Differences and Photos; rail Differences group
- Sheets: `?sheet=intake` (`&productIds=`), `?sheet=delivery-difference&id=<delivery id>`, `?sheet=delivery-reverse&id=<id>`
- Order record and supplier record gain their Deliveries tab
- Ask `postdeliveries` (bulk "Post to stock")

## Units
BUY-08 (40-buying §7 BUY-08, §W-33 row "Record a difference after posting", §W-25, §3.5 `RETAIL_DELIVERY_DIFFERENCE` rows, §4.1
`retail-deliveries` (+ lines, differences, photos), §4.4 differences/photos/reverse/email/notes, §5.5, §5.6 tabs, §5.24–§5.26).
"Verbatim §x" = that section of `docs/handover/40-buying.md`.

## Boards
- `DeliveriesList.png` — "Deliveries", "+ Take in stock"; toolbar "Delivery number or supplier", "Supplier Any", "Differences Any",
  "Filters", count, "Received, newest", Group, Columns, Export. Columns Delivery (mono) · Supplier · Order (mono / "No order" faint) ·
  Received · Lines · Units · Value · Against the order ("● No order" neutral, "○ Matches" hollow, "● 12 short" warn, "● 2 damaged" bad;
  "To check" pending) · Received by · ⋯; Σ "4", 8, 429, US$897.72.
- `DeliveryDiff.png` — "Record a difference" / "GRN-0002 · Delta Beverages": Line "Chibuku Scud 1L"; On the note (read "66") + Counted
  ("60"); Why seg **Short** · Broken · Wrong item · Extra; Settle by seg **Ask for a credit** · Bring it next time · Write it off; Photo
  optional ("Add a photo"); note "Stock moves by the difference, and it shows on the supplier record.", "Cancel", "Save difference".
- `IntakeNew.png` — 760px "Take in stock with no order" / "Buying › Deliveries": From "Mutare Wholesalers" with hint "No open orders with
  them. When a supplier has one, you are offered it here to receive against."; Delivery note optional "MW-0192" + Into "Harare Main
  Branch"; "What came" lines (Product, Came, Cost, Value, ×; "Tonic water 200ml / New product, added here" in warn), add row "Add a product:
  search, scan, or add a new one. It sells as soon as you post.", Σ "3 lines" 112 "US$ 67.28"; "Paying": Paid seg **Cash now** · On account ·
  Not yet; Paid from "Front till float" + Requisition (read "REQ-0017, raised for you") with hint "So the till float balances at close.";
  note "Use this for walk-in suppliers. Anything regular should be an order.", "Cancel", "Post to stock".
- `DeliveryRecord.png` — tabs Differences 2 · Photos 3; actions "Record a difference | Add photos"; rail Differences (Short "12 units,
  US$9.36", Credit "Asked for, 13 August", Photos "3 of the boxes").

## Workflows
- W-33 row 8 "Record a difference after posting" — verbatim §W-33 (line 264), with the settle effects stated in Server below.
- W-25 Take in stock with no order (Manager; "Deliveries"): Supplier · What came · Post to stock — verbatim §W-25 (lines 274–286),
  incl. the three paying modes.
- Reverse a delivery (**Defined here**, §5.26), photos, email, bulk post, delivery notes.

## Roles
`retail.purchasing`: receive (Owner, Manager, Stock clerk) — take in stock (a stock clerk's intake is COUNTED, "Send for checking"),
add photos; update (Owner, Manager) — differences, email; approve (Owner, Manager) — post, reverse; view — list (Bookkeeper reads).
Cash now additionally needs the poster to be able to approve that requisition amount (owner any; manager ≤ `requisitionOwnerOver`).
Accounts: `tafara.manager@`, `tendai.stock@`, `owner@`, `bookkeeper@`, `chipo.till@` (refused).

## Data
Existing: `RetailGoodsReceipt(+Line)` (packet 38's fields), `RetailDeliveryDifference`, `RetailAttachment`, `RetailPurchaseOrder(+Line)`,
`CrmRequisition`, `PurchaseBill`, `PurchasePayment`, `BankAccount`/`BankTransaction`, `StockMovement`, `RetailMessage`.
Migration `<stamp>_retail_intake_paying` (**added**: a counted intake must remember which account Cash now pays from until it is posted),
witness `lib/retail/buying/intake-paying-migration.test.ts`: `RetailGoodsReceipt.payingAccountId String?` → `BankAccount` (SetNull) +
back-relation. Witness: the column and its FK.

## Server
`lib/retail/buying/deliveries.ts` / `differences.ts` / `intake.ts` (+ tests):
- `recordDifference(actor, deliveryId, { lineId, counted, why, settle?, photoUrl? })` — POSTED only; counted whole ≥ 0 and ≠ the line's
  current quantity (400 `fieldErrors.count` "That is what is already counted."); d = counted − current. Effects (one transaction):
  line `quantity` = counted, `lineTotal` recomputed; `recordStockMovement` ADJUSTMENT d (reason `DELIVERY_DIFFERENCE`, reference GRN,
  sourceType `RETAIL_DELIVERY_DIFFERENCE`); `RetailDeliveryDifference` (kind, quantity d, value |d| × cost, settle, photo as
  `RetailAttachment` PHOTO).
  - d < 0 (Short, Broken, Wrong item): **Ask for a credit** → order line `receivedQuantity += d` (what is in stock from the order), a
    claim ("Credit asked" until packet 44 settles it); ledger Dr 2300 / Cr Stock (role STOCK) at |d| × cost. **Bring it next time** →
    order line `receivedQuantity += d`, order back to PARTIAL via `orderStatusFor`; refused on a CLOSED order (409 "PO-0003 is closed.
    Reopen it, or ask for a credit."); disabled with no order; ledger Dr 2300 / Cr Stock. **Write it off** → order unchanged (it was
    delivered; the shop lost it); ledger Dr Breakage (role BREAKAGE, 5410) / Cr Stock.
  - d > 0 (Extra): no settle; order line `receivedQuantity += d`; ledger Dr Stock / Cr 2300 (the bill will include it).
  - Stock never below zero: a reduction larger than on hand at the site → 409 "Only 4 of Sprite 500ml are left on the shelf." (**Defined
    here**).
  Audit `RETAIL_GOODS.DIFFERENCE { item, from, to, why, settle }`. After commit post `RETAIL_DELIVERY_DIFFERENCE` (subtypes CREDIT,
  NEXT_TIME, WRITE_OFF, EXTRA; rules in `lib/accounting/defaults.ts`; source type in `RETAIL_SOURCE_TYPES`, `kindOf` → "deliveries").
  Toasts verbatim §W-33 ("Difference saved. Credit for US$4.92 asked of Delta." / "… 6 Chibuku Scud 1L are back on order." / "…
  US$4.92 written off." / "… 6 more in stock.").
- `addPhotos(actor, id, files)` → `RetailAttachment` PHOTO each; audit `RETAIL_GOODS.PHOTOS_ADDED { n }`; toast "3 photos added.".
- `reverseDelivery(actor, id, reason 1–300)` — POSTED only; refused when a non-binned bill exists (409 "INV-88120 is recorded against it.
  Move the bill to the bin first."); refused when on hand at the site is less than any line's quantity (409 "Only 12 of Castle Lager
  340ml are left on the shelf. Record a difference instead."); stock ISSUE per line quantity (reason `REVERSAL`); order lines
  `receivedQuantity −= noteQuantity` and lines this delivery closed short reopened, status recomputed; the GRN journal reversed
  (`reverseJournalEntry`), each difference's journal reversed; a linked requisition is unlinked; status REVERSED, `reversedAt/ById`,
  `reverseReason`; audit `RETAIL_GOODS.REVERSED`. Toast "GRN-0002 reversed.".
- `emailDelivery(actor, id)` → one EMAIL `RetailMessage` per address (the order's recipients' emails, else the supplier's) with the
  delivery note link; 409 "Delta Beverages has no email.".
- `deliveryNotesPdf(ids)` → one PDF, a note per page (packet 38's renderer).
- **Intake** `receiveDelivery` with no order (packet 38's service) + `paying: { mode, moneyAccountId }`:
  - ON_ACCOUNT → nothing more (the delivery offers "Record a bill").
  - NOT_YET → a bill now through packet 41's `recordBill` (number = the delivery note, else the GRN number; amount = value with VAT; due
    today).
  - CASH_NOW → in the same transaction: a requisition `REQ-nnnn` (category STOCK, purpose "Cash for Mutare Wholesalers, GRN-0006",
    amount = value with VAT) asked, approved and paid out from the chosen account by the poster and accounted for with spent = amount
    (packet 34/36 services, `receipts` = the delivery itself: no file required); a bill as NOT_YET, which packet 41's
    `applySupplierCredits` pays from the payout's credit row (method Cash → "Paid in cash"). Refused when the poster may not approve the amount (403
    `fieldErrors.paid` "Cash over US$500.00 needs the owner. Choose On account and ask for money.") or the account lacks the cash (409
    "Front till float has US$40.00."). **C-33: no `RetailCashMovement`, no drawer.** Money invariant: the money account falls by the
    value with VAT exactly once (one `BankTransaction`, the payout's; no `recordSupplierPayment` call, no second draw); ledger: payout
    Dr 2000 / Cr money account, bill Dr 2300 + Dr 2210 / Cr 2000 → 2000 nets to zero for this delivery.
  - A stock clerk's intake is COUNTED and keeps `paying` + `payingAccountId`; posting runs the paying step then.
  - Open orders: choosing a supplier with an open order shows the hint "Mutare Wholesalers has PO-0002 open. Receive against it instead."
    linking to its Receive page.
  - New products through PRD-03's `product` quick add (`createProduct`); they sell once posted.
  Toast "GRN-0006 posted. 112 units in stock." / "GRN-0006 sent for checking.".

API (`app/api/v2/retail/buying/deliveries/**`), verbatim §4.4:
| Method · path | Permission | Body | Success | Errors |
|---|---|---|---|---|
| POST `/deliveries` (no order) | receive (+ approve to post) | `{ supplierId, siteId, noteNumber?, lines, paying: { mode, moneyAccountId? }, post }` | 201 | 400; 403; 409 |
| POST `/deliveries/[id]/differences` | `retail.purchasing:update` | `{ lineId, counted, why, settle?, photoUrl? }` | 201 `{ data, delivery }` | 400; 409 |
| POST `/deliveries/[id]/photos` | `retail.purchasing:receive` | `{ files: [...] }` | `{ data }` | 400 |
| POST `/deliveries/[id]/reverse` | `retail.purchasing:approve` | `{ reason }` | `{ data }` | 409 |
| POST `/deliveries/[id]/email` | `retail.purchasing:update` | — | `{ queued }` | 409 |
| POST `/deliveries/notes` | `retail.purchasing:view` | `{ ids }` | pdf | — |
| POST `/deliveries/bulk/post` | approve | `{ ids }` | `{ posted, skipped }` | — (packet 38 built the route; this unit adds the bulk action) |
Lookup `line` (`retail.purchasing:update`): `context.deliveryId`, its lines, sub "60 counted". Audit `goodsDifference`, `goodsReversed`,
`goodsPhotosAdded` + `LIST_WORDS`.

## UI
- `app/retail/buying/deliveries/page.tsx` → `<ListFrame source="retail-deliveries" title="Deliveries" />` (replaces the old register and
  dialog). Source database-side; filters supplier, `differences` (Any, Matches, Short, Damaged, No order, To check), Filters › Received
  (period) and Site; sorts "Received, newest", "Received, oldest", "Value, highest"; Group None/Supplier/Against the order; columns,
  totals, row ⋯ (Open · Post to stock · Record a difference · Record a bill · Print delivery note), bulk (Print delivery notes · Post to
  stock → ask `postdeliveries` · Export), empty and phone card verbatim §5.5. Parent filters `supplierId`, `orderId`. Sources
  `retail-delivery-differences` (When · Product · Why · Units · Value · Settle by · State: "Credit asked" warn, "Credited" ok, "Back on
  order" info, "Written off" hollow, "Returned" hollow) and `retail-delivery-photos` (96px tiles, name and "Added 13 Aug by Tafara Nyathi";
  click opens the file).
- Delivery kind: actions "Record a difference" (POSTED, update) and "Add photos" (file picker, multiple, upload through packet 34's
  attachments route then POST photos); ⋯ "Email to supplier", "Reverse this delivery" (bad → `delivery-reverse`); tabs Differences,
  Photos; KPIs "Lines … with differences", "Value … −US$9.36 short"; rail Differences group verbatim §5.6.
- Order kind gains its Deliveries tab (`retail-deliveries` parent `orderId`); supplier kind gains its Deliveries tab ("All 21 deliveries").
- Sheets (`lib/retail/sheet-kinds/buying.ts`): `intake` (§5.24; the paid seg default by terms — on delivery → Cash now; Requisition read
  "REQ-0017, raised for you" = the next number; hint **reworded** "So <account> balances." — e.g. "So Front till float balances." —
  because the account is a money account, not a drawer, C-33), `delivery-difference` (§5.25; Why default Short, Extra when counted >
  current; Settle hidden for Extra; "Bring it next time" disabled with no order), `delivery-reverse` (§5.26, danger-filled primary).
- Product record "Receive stock" (PRD): open order with this product → its Receive page, else `?sheet=intake&productIds=<id>` over
  Deliveries.

## Reuse
Packet 38's `receiveDelivery`/`postDelivery`/renderer, packet 34/36 requisition services, packet 41's `recordBill`,
`applySupplierCredits`, `lib/inventory/stock-movements.ts`, `lib/retail/stock/reverse.ts` (STK-03's movement
reversal, if its shape fits the ISSUE-per-line reversal), `reverseJournalEntry`, PRD-03 `product` lookup.

## Remove
- `app/retail/buying/deliveries/page.tsx`'s old register and its "No order" receive dialog (whole file rewritten as the ListFrame page).
- The whole `app/api/v2/retail/purchasing/` folder (`receipts/route.ts` GET/POST and whatever is left), and their
  `route-guard-coverage.test.ts` rows. (Route registry prefixes go in packet 45.)

## Seed
- GRN-0002 re-seeded as on its note: Castle 120, Chibuku 66, Coca-Cola 90, Sprite 36 posted 13 Aug 10:42 (counted by Tafara, checked by
  Tendai Mhlanga, note DB-778104, driver "Simon, truck AEZ 4471", 3 photos "boxes"), then two SHORT differences on 13 Aug (Chibuku 66 →
  60, Sprite 36 → 30, Ask for a credit) → 300 units, "12 short", value as the data gives (board US$216.00 vs lines US$214.80: figures
  follow the data, spec open question 6).
- GRN-0004: Ice Cold Supplies, no order, today, Ice 2kg bag 40 at 1.00, counted by Chipo Dube, posted by Tafara, Cash now from Front
  till float → REQ-0010 (accounted for) and a bill paid in cash.
- `settleMoneyAccountOpenings()` after.

## Tests
- `lib/retail/buying/differences.test.ts`: each settle's stock, order and ledger effect (amounts and accounts; Σ Dr = Σ Cr); Extra; next
  time refused on a closed order and disabled with no order; "That is what is already counted."; stock floor.
- `lib/retail/buying/intake.test.ts`: on account (no bill), not yet (bill due today), cash now (one requisition ACQUITTED, one bill PAID
  "Paid in cash", **exactly one** `BankTransaction` CREDIT for the value with VAT, no `RetailCashMovement`); manager over the limit → 403;
  account short → 409; counted intake keeps paying and runs it on post; new product sells after posting.
- `lib/retail/buying/deliveries.test.ts` (reverse): stock out, order expects again, journals reversed, refused when billed or stock short.
- **Race:** two concurrent differences on the same line → the second sees the first's quantity (row lock on the line).

## Acceptance
1. Migration on dev + test; witness green; reseed.
2. `/retail/buying/deliveries` vs `DeliveriesList.png`: header, toolbar, rows GRN-0005 (To check), GRN-0004 (No order), GRN-0003
   (Matches), GRN-0002 (12 short), GRN-0001 (2 damaged) with the board's cells; Σ lines, units, value.
3. On GRN-0002 "Record a difference" vs `DeliveryDiff.png`: Line Chibuku Scud 1L (sub "60 counted"), On the note 66, Counted 55, Short,
   Ask for a credit → "Difference saved. Credit for US$4.10 asked of Delta."; On hand Chibuku −5; Differences tab 3; PO-0003 Chibuku
   delivered 55; after "Post now" journal Dr 2300 / Cr Stock 4.10.
4. "+ Take in stock" vs `IntakeNew.png`: From Mutare Wholesalers → "Mutare Wholesalers has PO-0002 open. Receive against it instead.";
   From Ice Cold Supplies → "No open orders with them. …"; three lines incl. a product added inline ("New product, added here"); Paid Cash
   now, Front till float, "REQ-00nn, raised for you", hint "So Front till float balances." → "GRN-00nn posted. 112 units in stock."; a
   requisition ACCOUNTED, a bill "Paid in cash" on Bills, Front till float balance down by the value with VAT exactly once, the new product
   on sale; **no `RetailCashMovement`**.
5. Reverse a posted, unbilled delivery → stock out, the order's lines expect the units again, journal reversed; on GRN-0002 (billed) →
   "INV-88120 is recorded against it. Move the bill to the bin first.".
6. Bulk "Post to stock" on GRN-0005 → ask `postdeliveries` → posted, "Checked by" the poster.
7. Refusals: as `tendai.stock@` intake reads "Send for checking" and saves COUNTED; "Record a difference" absent and POST → 403; Cash now
   for US$600 as Tafara → 403 "Cash over US$500.00 needs the owner. Choose On account and ask for money."; `bookkeeper@` read-only.
8. `grep -rn "api/v2/retail/purchasing" app lib components` → nothing.
9. `npx eslint <changed>`; `npx vitest run lib/retail/buying`; `pnpm typecheck` alone.

## Depends on
Packets 38 (receiving, record), 41 (bills, payments, credits), 34/36 (requisitions, money accounts). PRD-03 (`product` quick add).
Holds the posting lock (P).

## Risk
**money** — stock value, GRNI, shrinkage, money-account balance, AP. Pitfalls: Cash now must draw the account once (the payout's credit
row allocated to the bill, not a second payment); every difference is one stock movement and one journal; reversal must reverse the
differences' journals too; lock lines before reading quantities.

## Open questions
- Settle semantics (the spec leaves the order effect of "Ask for a credit" open): every short/broken settle except Write it off lowers the
  order line's delivered count (what is in stock from the order), which is what the boards' PO-0003 shows (Chibuku 60 delivered, 66 on
  the note, credit asked).
- C-33 / spec open question 8: the intake hint names the money account instead of "the till float".
- Added migration `retail_intake_paying` for a counted intake's Cash now account.
