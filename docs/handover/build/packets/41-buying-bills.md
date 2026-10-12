# 41 · Buying › Bills and supplier payments

## Screen
- `/retail/buying/bills` — list (ListFrame, source `retail-bills`); the bill's own record is the sheet `?sheet=bill-edit&id=<id>`
- Sheets: `?sheet=bill-new` (`&supplierId=`, `&deliveryId=`), `?sheet=bill-edit&id=`, `?sheet=payment-new&supplierId=<id>`
  (`&billId=`, stepping `&supplierIds=`)
- On the supplier record (packet 30): actions "Record a payment", "Record a bill", ⋯ "Export statement as PDF", tabs Bills and
  Payments, figure/KPI Owed; on the delivery record (packet 38): primary "Record a bill", step Billed; on the order record: primary
  "Record a bill" (received, unbilled) and the reopen rule; nav item Bills "1 overdue"

## Units
BUY-07 (40-buying §7 BUY-07, §W-35, §W-70 row 3 (reopen bill rule), §3.3 F, §3.5 `RETAIL_SUPPLIER_BILL`, `RETAIL_SUPPLIER_PAYMENT`,
§4.2 statement PDF, §4.6, §5.2 Bills/Payments tabs, §5.10, §5.27–§5.29). "Verbatim §x" = that section of `docs/handover/40-buying.md`.

## Boards
- `BillsList.png` — "Bills", "+ Record a bill"; tabs To pay 4 · Overdue 1 · Paid 31 · All 35; toolbar "Bill number or supplier",
  "Supplier Any", "Due Any time", "Filters", count, "Due soonest", Group, Columns, Export. Columns Bill (mono) · Supplier · Delivery
  (mono "GRN-0002" / "No delivery") · Billed ("13 Aug 2026") · Due ("12 Sep 2026") · State ("● 21 days overdue" bad, "○ Paid in cash"
  hollow, "Due in 23 days" info, "Due in 3 days" warn, "Due in 27 days" info) · Amount · Owed · ⋯; Σ "5", "US$2,933.60", "US$1,031.20".
- `BillNew.png` — "Record a bill" / supplier: Supplier, For delivery ("GRN-0002 · 13 Aug", sub "US$214.80"), Bill number + Bill date,
  Amount + Due (hints), The bill (photo, optional); note "Bills show on the supplier statement and in what you owe.", "Cancel", "Save
  bill".
- `BillEdit.png` — title "INV-88120" / "Delta Beverages · 21 days overdue"; fields with current values; For delivery "GRN-0002 · 13 Aug
  · US$214.80"; Due hint "21 days overdue." (warn); The bill "INV-88120.pdf, added 13 August"; footer danger "Move to the bin", note
  "Changed by Tendai Mhlanga, 14 August.", secondary "Record a payment", primary "Save".
- `PaymentNew.png` — "Record a payment" / "Delta Beverages · owed US$624.00": Amount + Paid on; Paid by seg Cash · **Bank transfer** ·
  EcoCash; From "CBZ current account" + Reference "CBZ 0310 7781"; Pays (read) "INV-88120, INV-88504, oldest first" with hint "Anything
  over is held as credit on the account."; note "Delta sees it on their statement next month.", "Cancel", "Record payment".
- `SupplierRecord.png` tabs Bills 4 · Payments 19, figure "Owed US$624.00", KPI Owed "15 Oct due".

## Workflows
W-35 Record the supplier's bill and pay it (Owner, bookkeeper; "The delivery, or the supplier"): Match to the delivery · Due date ·
Record payment — every row verbatim §W-35 (lines 326–339): Open, Match, Due date, Change or bin, Record payment, Export for the
bookkeeper. W-70 Reopen: refused once a bill is recorded against the order. W-63 bin kind `bill`.

## Roles
`retail.bills` (landed): Owner and Bookkeeper view/create/update/delete; Manager **view only** (the Roles board's "R"); Cashier and
Stock clerk none (Bills nav item and supplier tabs hidden; 403 "Your role cannot view bills and supplier payments"). Manager sees no
primary, no bulk but Export, `bill-edit` read-only (only "Close"). Accounts: owner `owner@`, bookkeeper `bookkeeper@` (Ruvimbo Chari),
manager `tafara.manager@`, stock clerk `tendai.stock@`.

## Data
Existing: `PurchaseBill`, `PurchaseBillLine`, `PurchasePayment` (+ vendorId/groupNo/requisitionId, packet 36), `DebitNote`,
`BankAccount`/`BankTransaction`, `RetailGoodsReceipt`, `RetailAttachment`, `JournalEntry` + `reverseJournalEntry`
(`lib/accounting/journals.ts`), `recalcPurchaseBillBalance` (`lib/accounting/balances.ts`).
Migration `<stamp>_retail_bills`, witness `lib/retail/buying/bills-migration.test.ts`: verbatim §3.3 F — `PurchaseBill.goodsReceiptId
String? @unique` + relation, `archivedAt`, unique `(companyId, vendorId, billNumber)` **replacing** `(companyId, billNumber)`,
`@@index([companyId, vendorId, dueDate])`; `AccountingSourceType` + `RETAIL_SUPPLIER_BILL`. **Added** (the posting engine has no basis
for five different amounts on one entry): `PostingBasis` + `EVENT_AMOUNT` and `PostingRuleLine.eventAmountKey String?` (the line's
amount is `payload.amounts[eventAmountKey]`; zero lines are dropped as today). Witness: the new unique index exists and the old one is
gone, the columns, the enum values.

## Server
- `lib/accounting/posting.ts`: `EVENT_AMOUNT` basis (+ test), beside packet 36's `EVENT_ACCOUNT`.
- `lib/accounting/balances.ts`: `recalcPurchaseBillBalance(billId, client = prisma)` so it can run inside a transaction (callers
  unchanged).
- Rules in `lib/accounting/defaults.ts`, verbatim §3.5 `RETAIL_SUPPLIER_BILL`: Dr 2300 `amounts.grni` · Dr 2210 VAT input
  `amounts.tax` · Dr 5000 `amounts.priceOver` · Cr 5000 `amounts.priceUnder` · Cr 2000 `amounts.amount` (no delivery: Dr 5000
  `amounts.net`, Dr 2210 `amounts.tax`, Cr 2000 `amounts.amount` — a subtype `NO_DELIVERY`). Source type added to
  `RETAIL_SOURCE_TYPES`; `kindOf` → "other". `RETAIL_SUPPLIER_PAYMENT` rule is packet 36's.
- `lib/retail/buying/bills.ts` (+ `bills.test.ts`):
  - `recordBill(actor, { supplierId, deliveryId?, billNumber, billDate, amount, dueDate?, fileUrl? })` — supplier live; delivery
    POSTED, this supplier's, not billed (409 "GRN-0002 already has bill INV-88120."); bill number 1–40, unique for the supplier (409
    `fieldErrors.no` "Delta Beverages already sent INV-88120."); amount > 0; bill date ≤ today; due ≥ bill date (400 `fieldErrors.due`
    "It is due before it was billed."); due default = delivery date (or bill date) + `payTermsDays` (on delivery: the same day). Amounts:
    delivery value ex VAT `grni` = Σ line quantity × cost; delivery VAT `dv`; `tax` = round(amount × dv ÷ (grni + dv)) (no delivery:
    amount × r ÷ (100 + r) with r = the shop's standard VAT rate (15.5 on the demo) when the supplier has a VAT number, else 0);
    `net` = amount − tax; `priceOver` = max(0, net − grni), `priceUnder` = max(0, grni − net). Invariant: grni + tax + priceOver −
    priceUnder = amount (tested to the cent). `PurchaseBill` (status RECEIVED, `vendorId`, `goodsReceiptId`, `billNumber`, `billDate`,
    `dueDate`, `currency`, `subTotal` = net, `taxTotal` = tax, `total` = amount, `createdById`) + one `PurchaseBillLine` "Delivery
    GRN-0002" (net, VAT rate, tax); file → `RetailAttachment` BILL. Audit `RETAIL_BILL.RECORDED { billNumber, amount, due, delivery }`
    (on the bill and the delivery). After commit post `RETAIL_SUPPLIER_BILL`; then `applySupplierCredits(vendorId)`. Toast "Bill
    INV-88120 saved, due 12 September.".
  - `changeBill(actor, id, patch)` — amount not below what is paid (409 "US$100.00 is paid against INV-88120."); same validation;
    when amount, delivery or date change: `reverseJournalEntry` the posted entry and post again (revision suffix, as the sales invoice
    does); `RETAIL_RECORD.EDITED` per field. Toast "INV-88120 saved.". "Changed by …" line = the latest `RETAIL_BILL.*` /
    `RETAIL_RECORD.EDITED` on the bill, else "Recorded by …".
  - Bin kind `bill` in `lib/retail/bin.ts` (label "Bill", deleteRight `retail.bills:delete`): `move` refused 409 "US$100.00 has been
    paid against INV-88120. It cannot go to the bin." when anything is allocated; moving reverses the ledger entry; `restore` reposts
    it; `purge` deletes the bill and its lines when nothing refers to it. Binned bills leave every list, total and Owed.
  - `applySupplierCredits(tx, vendorId)` — unallocated `PurchasePayment` rows of the supplier (`billId` null, amount > 0) settle unpaid
    bills by `dueDate`, oldest first: a credit row splits into an allocated row (`billId`, same `groupNo`, `paymentNumber` "PAY-0019/2")
    and the remainder (billId null); `recalcPurchaseBillBalance(bill, tx)` per touched bill (PAID at zero). No ledger entry (the cash
    already posted as Dr 2000).
- `lib/retail/buying/payments.ts` (+ `payments.test.ts`):
  - `previewPayment({ supplierId, amount, billId? })` → `{ owed, pays: [{ billId, billNumber, amount }], credit, sentence: "INV-88120,
    INV-88504, oldest first" }` (the named bill first, then by due date).
  - `recordSupplierPayment(actor, { supplierId, amount, paidOn, how, fromId, reference?, firstBillId? })` — amount > 0; From active, same
    currency; a CASH account cannot go below zero (409 "Office safe has US$410.00.", row lock as packet 36); reference for Bank transfer
    and EcoCash (400 "Add the reference."); paid on ≤ today. One transaction: `groupNo` PAY-nnnn; one `PurchasePayment` per bill touched
    (`paymentNumber` "PAY-0019/1…", `vendorId`, `bankAccountId`, `method`, `reference`, `paidAt`), the rest one row with no bill
    (credit); `recalcPurchaseBillBalance` per bill; `BankTransaction` CREDIT amount on From (`sourceType RETAIL_SUPPLIER_PAYMENT`,
    `sourceId` = groupNo). After commit post `RETAIL_SUPPLIER_PAYMENT` (Dr 2000 / Cr money account). Audit
    `RETAIL_SUPPLIER_PAYMENT.RECORDED { groupNo, amount, bills }` (on the vendor and each bill). Toast "US$624.00 paid to Delta Beverages.
    Nothing owed." / "… US$120.00 still owed." / "… US$40.00 held as credit.".
  Money invariants (tested): Σ allocated + credit = amount; bill balance = total − Σ allocated − debit notes − write-offs, never < 0;
  supplier Owed = Σ balances − Σ credits − open return credits (packet 44) equals the ledger's 2000 balance for that supplier's retail
  documents in the seed check.
- Order reopen rule (packet 31's `reopenOrder`): refused 409 "INV-88120 is recorded against PO-0003. It cannot be reopened." when any
  delivery of the order has a non-binned bill. Order step "Billed" done when the order is RECEIVED/CLOSED and every posted delivery has
  a non-binned bill.
- Figures (`figures.ts`): bill state (§3.2: "Paid in cash" when every payment row's method is Cash; overdue/due today/due in n days),
  Owed and its note, delivery "Billed" step.
- Statement PDF: renderer `renderSupplierStatement` registered as `Vendor` in `lib/retail/record-pdf.ts` (read `retail.bills:view`):
  bills, payments, returns and credits in date order with a running balance, default the last 90 days (`?from=&to=`).
- Bookkeeper export: `POST /api/v2/retail/buying/bills/export { ids }` → `.xlsx` (exceljs) with sheets "Bills" (Bill, Supplier, Supplier
  VAT number, Delivery, Billed, Due, Net, VAT, Amount, Paid, Owed, Ledger entry) and "Payments" (Payment, Bill, Paid on, Paid by, From,
  Reference, Amount); audit `RETAIL_EXPORT.DOWNLOADED { key: "retail-bills-bookkeeper", rows }`.

API (`app/api/v2/retail/buying/**`), verbatim §4.6:
| Method · path | Permission | Body | Success | Errors |
|---|---|---|---|---|
| POST `/bills` | `retail.bills:create` | `{ supplierId, deliveryId?, billNumber, billDate, amount, dueDate?, fileUrl? }` | 201 `{ data: BillView, accountingStatus }` | 400; 409 |
| GET `/bills/[id]` | `retail.bills:view` | — | `{ data: BillView }` | 404 |
| PATCH `/bills/[id]` | `retail.bills:update` | any create field | `{ data, changed }` | 409 below paid |
| GET `/bills/compare?deliveryId=&amount=` | `retail.bills:create` | — | `{ deliveryValue, difference, hint, due, dueHint }` | 404 |
| bin kind `bill` (`POST /api/v2/retail/bin`, `/bin/restore`) | `retail.bills:delete` | `{ kind: "bill", id }` | FND | 409 paid against |
| GET `/payments/preview?supplierId=&amount=&billId=` | `retail.bills:create` | — | preview | 404 |
| POST `/payments` | `retail.bills:create` | `{ supplierId, amount, paidOn, how, fromId, reference?, firstBillId? }` | 201 `{ data: { groupNo, rows, owedAfter }, accountingStatus }` | 400; 409 |
| POST `/bills/export` | `retail.bills:view` | `{ ids }` | `.xlsx` | — |
| GET `/api/v2/retail/records/Vendor/[id]/pdf?from=&to=` | `retail.bills:view` | — | pdf | 404 |
Lookup `delivery` (`retail.bills:create`): `context.supplierId`, posted unbilled deliveries, label "GRN-0002 · 13 Aug", sub the value
with VAT; no quick add. Audit `billRecorded`, `supplierPaid` + `LIST_WORDS`; record activity `PurchaseBill` → `retail.bills:view`.
Nav badge "<n> overdue" (non-binned bills with a balance and due before today Africa/Harare, `retail.bills:view`).

## UI
- `app/retail/buying/bills/page.tsx` → `<ListFrame source="retail-bills" title="Bills" />`; database-side loader; tabs `topay` (balance
  > 0) · `overdue` · `paid` (balance 0) · `all`, default To pay; filters supplier, `due` (Any time, Overdue, This week, Next 30 days),
  Filters › Billed (period); sorts "Due soonest", "Billed, newest", "Most owed"; Group None/Supplier/State; columns verbatim §5.10 (dates
  in the short form "13 Aug 2026" — add `short: true` to FND's `date` cell kind); row link opens `?sheet=bill-edit&id=`; row ⋯ Open ·
  Record a payment · Move to the bin (bad); bulk "Record a payment" (`payment-new&supplierIds=…`, the ticked bills first) · "Export for
  the bookkeeper" · Export; empty and phone card verbatim §5.10. Source `retail-supplier-payments` (supplier record › Payments; columns
  §5.2; all link → `?supplier=<id>&tab=paid`).
- Sheets (`lib/retail/sheet-kinds/buying.ts`): `bill-new` (§5.27, live hints from `/bills/compare`), `bill-edit` (§5.28; danger "Move to
  the bin" hidden when anything is paid; read-only for the manager), `payment-new` (§5.29; From defaults to the first account of the
  chosen kind; Pays read live from the preview; stepping `supplierIds`, Cancel → "Skip").
- Supplier kind: actions "Record a payment" (`payment-new`), "Record a bill" (`bill-new&supplierId=`), ⋯ first "Export statement as
  PDF"; tabs Bills (`retail-bills`, parent `supplierId`, hidden for the stock clerk) and Payments; figure "Owed US$624.00" (warn > 0;
  "In credit US$40.00" plain < 0), KPI Owed with "15 Oct" "due"; Suppliers list Owed column live; row ⋯ and bulk "Record payments".
- Delivery kind: primary "Record a bill" (posted, unbilled, `retail.bills:create`) → `bill-new&deliveryId=`; steps Billed done; rail
  Credit row. Order kind: primary "Record a bill" (received/closed, unbilled deliveries) → `bill-new&deliveryId=<oldest unbilled>`.
- Nav: `lib/retail/nav/buying.ts` gains Bills (`Receipt` icon, `requires: [["retail.bills","view"]]`) with the badge.

## Reuse
`lib/accounting/journals.ts` (`reverseJournalEntry`), `lib/accounting/balances.ts`, `lib/accounting/posting.ts`, packet 36's
`lib/retail/buying/posting.ts` and money-account locking, `lib/retail/bin.ts`, `figures.ts`, exceljs as in `lib/reports` export,
`lib/retail/record-pdf.ts`.

## Remove
- `PurchaseBill @@unique([companyId, billNumber])` (replaced in the migration). The accounting module's own bill/payment routes stay
  (their `BILL-…` numbers stay unique per vendor).

## Seed
Through `recordBill`/`recordSupplierPayment`, verbatim §3.6 "Bills and payments": INV-88120 (Delta, GRN-0002, billed today − 51, due
today − 21, 216.00, unpaid → "21 days overdue"); AF-20931 (Afdis, PO-0023's delivery, today − 4, 1,902.40, paid by REQ-0009's cash credit
→ "Paid in cash"); INV-88504 (Delta, GRN-0003, today − 7, due today + 23, 408.00); SZ-4471 (Schweppes, PO-0020's delivery, today − 11,
due today + 3, 311.20); MW-0192 (Mutare, no delivery, today − 3, due today + 27, 96.00); 30 more bills for the historical deliveries,
paid in full by bank transfer from CBZ in groups PAY-0001…PAY-0019. Amounts are the boards'; the difference to the delivery posts to
5000. Then `settleMoneyAccountOpenings()`. Tabs To pay 4 · Overdue 1 · Paid 31 · All 35; Delta owes US$624.00.

## Tests
- Witness.
- `lib/retail/buying/bills.test.ts`: VAT share with and without a delivery (15.5% and a non-VAT supplier); the amounts identity to the
  cent; over and under the delivery post to 5000 the right way; journal balances; duplicate bill number per supplier refused but allowed
  for another supplier; delivery already billed refused; change reverses and reposts (two entries, the first reversed); bin refused when
  paid; bin reverses, restore reposts; `applySupplierCredits` oldest first with a partial bill.
- `lib/retail/buying/payments.test.ts`: allocation named bill first then by due date; overpayment leaves a credit row; cash account short
  refused; **race**: two concurrent payments from one cash account; preview equals what the record writes.
- `lib/accounting/posting.test.ts`: `EVENT_AMOUNT` lines, zero lines dropped, balance enforced.
- Order reopen refused with a bill (packet 31's test gains the case).

## Acceptance
1. Migration on dev + test; witness green; reseed.
2. As `bookkeeper@`, `/retail/buying/bills` vs `BillsList.png`: tabs To pay 4 · Overdue 1 · Paid 31 · All 35, the five rows with the
   board's bills, deliveries, short dates, states, amounts and owed; Σ US$2,933.60 and US$1,031.20.
3. Over Delta's record, "Record a bill" for a new posted delivery (receive one first): For delivery lists only unbilled deliveries with
   their value with VAT; an amount US$1.20 over shows "US$1.20 more than the delivery. Accept it, or ask for a credit."; "Save bill" →
   "Bill <no> saved, due <date>."; the delivery's Billed step done; after "Post now" the journal Dr 2300 / Dr 2210 / Dr 5000 1.20 / Cr
   2000, balanced.
4. INV-88120 from the row → `bill-edit` vs `BillEdit.png`: footer "Move to the bin", "Changed by …", "Record a payment", "Save".
5. "Record a payment" on Delta vs `PaymentNew.png`: Amount 624.00, Bank transfer, CBZ current account, a reference; Pays "INV-88120,
   INV-88504, oldest first" → "US$624.00 paid to Delta Beverages. Nothing owed."; both bills Paid; Delta's Owed US$0.00; Payments tab one
   PAY row naming both bills; CBZ balance −624.00; journal Dr 2000 / Cr 1010. Paying 700.00 instead (fresh reseed) → "US$76.00 held as
   credit." and the next bill recorded for Delta is paid from it (Bills shows it Paid).
6. Bin INV-88120 after a payment → 409 "US$… has been paid against INV-88120. It cannot go to the bin.".
7. Close PO-0003 with what came, then "Reopen the order" → "INV-88120 is recorded against PO-0003. It cannot be reopened.".
8. As `tafara.manager@`: Bills read-only (no primary, no bulk but Export, `bill-edit` only "Close"); POST `/bills` → 403. As
   `tendai.stock@`: no Bills nav item, no supplier Bills tab, 403. Export for the bookkeeper opens in a spreadsheet with both sheets.
9. `npx eslint <changed>`; `npx vitest run lib/retail/buying lib/accounting lib/retail/bin.test.ts`; `pnpm typecheck` alone.

## Depends on
Packets 38 (posted deliveries), 36 (money accounts, supplier credit rows, `RETAIL_SUPPLIER_PAYMENT` rule, account locking), 31 (orders,
reopen), 30 (supplier record). Holds the posting lock (P).

## Risk
**money** — AP, GRNI, VAT input, money-account balances. Pitfalls: Float columns on `PurchaseBill`/`PurchasePayment` — compute in Decimal,
store rounded; bill and payment postings after commit; reversal on change/bin must be exactly once (idempotent per source revision);
credits allocate oldest first without ever exceeding a bill's balance.

## Open questions
- Posting engine: `EVENT_AMOUNT` basis added (not in the spec) because one bill entry carries five different amounts.
- No-delivery VAT share uses the shop's standard rate (15.5% on the demo), not the spec's 15/115.
- Spec open question 9 (short dates): `date` cell gains `short`.
- Spec open question 11 (send statements): not built; the statement is exported only.


> Coordinator note (2026-10-06, 85a): add the `retail-bills` `report:` face (§5.14, Buying, no card) and the built-in
> `supplier-spend` (§5.13) in 85a's three steps.
> Coordinator note (2026-10-06, 90): bill date and due date fields are sheet fields `t: "date"` (90). No raw date inputs.
