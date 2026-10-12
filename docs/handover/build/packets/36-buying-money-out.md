# 36 · Buying › Requisition record: pay it out, account for it (money out)

## Screen
On `/retail/buying/requisitions` and `/retail/buying/requisitions/[id]` (packet 34):
- `?sheet=req-payout&id=<id>` (bulk stepping `&ids=`), `?sheet=req-acquit&id=<id>`
- Record primaries "Pay out" (APPROVED) and "Account for it" (DISBURSED); list row ⋯ and bulk "Pay out"; Receipts tab
- Worker: receipts-overdue reminders (in `runBuyingFollowUps`)

## Units
BUY-05 (40-buying §7 BUY-05, §W-31 rows "Paid out" and "Receipt attached", §W-32 rows "Pay" and "Account for it", §3.3 D (minus
the `BankAccount` kind/ledger, moved to packet 34), §3.5 payout/change/supplier-payment rows, §4.5 pay/acquit, §4.9 second half,
§5.22, §5.23). "Verbatim §x" = that section of `docs/handover/40-buying.md`.

**C-33 (98-decisions): a payout never moves a till drawer.** It writes a money-account `BankTransaction` and a ledger event, never
a `RetailCashMovement`; no shift's expected cash changes. "Front till float" is a cash money account in the books, not a drawer.

## Boards
- `ReqPayout.png` — 520px "Pay out REQ-0014" / "Cash to pay Afdis for order PO-0005"; steps ✓ Asked — ✓ Approved — **3 Paid out** —
  Accounted for; Approved (read, mono right, "US$1,940.00") + Paying (money, "1,940.00"); From "Office safe" with hint "US$470.00
  left in it after this."; To "Tafara Nyathi, to pay Afdis"; How seg Cash · Bank transfer · EcoCash; "Reference optional"
  placeholder "Optional for cash". Note "Receipts are due three days after paying out.", "Cancel", primary "Record payout".
- `ReqAcquit.png` — "Account for REQ-0014" / "US$1,940.00 paid out to Afdis Distillers"; steps at 4 Accounted for; Paid out (read)
  + Spent (money "1,902.40"); Change back (read, ok tone "US$37.60") + Change goes to "Office safe"; Receipts drop zone "Add the
  Afdis invoice and receipt / Drop it here, or take one on a phone"; "Note optional" placeholder "Anything the owner should know".
  Note "The order, the receipt and the change all link back to this requisition.", "Cancel", primary "Account for it".

## Workflows
- W-31 Paid out · Receipt attached — verbatim §W-31 rows 4–5 (lines 214–215).
- W-32 Pay · Account for it — verbatim §W-32 rows 5–6.
Effects elsewhere: the money account's balance (every "Pay from"/"From" sub, the record's "Cash at hand"), the supplier's Owed
(credit) once packet 41 counts credits, the order chips "Cash paid out" (ok).

## Roles
Pay out: `retail.requisitions:update` (Owner, Manager). Account for it: the asker, or `retail.requisitions:update`. Bookkeeper,
other cashiers and stock clerks: no pay/acquit actions; API 403 "Your role cannot change requisitions". Accounts: owner `owner@`,
manager `tafara.manager@` (pays REQ-0013 to himself to pay Pamela), cashier `chipo.till@` (asker of REQ-0012: accounts for it),
bookkeeper `bookkeeper@` (refused).

## Data
Existing: `CrmRequisition` (payout/acquittal columns from packet 34), `BankAccount` (+ kind/ledger from packet 34),
`BankTransaction` (Float `amount`, `direction` DEBIT/CREDIT, `sourceType`, `sourceId`), `PurchasePayment`, `RetailAttachment`,
`PostingRule`/`PostingRuleLine`, `AccountingIntegrationEvent`, `JournalEntry`, `RetailExpenseType.ledgerAccountId`.

Migration `<stamp>_retail_money_accounts`, witness `lib/retail/buying/money-accounts-migration.test.ts`: verbatim §3.3 D minus the
`MoneyAccountKind`/`BankAccount` block — `PostingRuleLineAccountSource` + `EVENT_ACCOUNT`; `PostingRuleLine.eventAccountKey
String?`; `PurchasePayment` + `vendorId`, `groupNo`, `requisitionId`, relations, `@@index([companyId, vendorId, billId])`,
`@@index([companyId, groupNo])`; `AccountingSourceType` + `RETAIL_REQUISITION_PAYOUT`, `RETAIL_REQUISITION_CHANGE`,
`RETAIL_SUPPLIER_PAYMENT`. SQL: `PurchasePayment.vendorId` from its bill's vendor. Witness: enum values, columns, indexes, a payment
inserted with a bill before has the bill's vendor after. Code: id entity `RETAIL_SUPPLIER_PAYMENT` `{ prefix: "PAY",
requiresSiteId: false }`.

## Server
1. **`EVENT_ACCOUNT` in `lib/accounting/posting.ts`** (+ `posting.test.ts` case): a line with `accountSource EVENT_ACCOUNT` posts to
   `payload.accounts[line.eventAccountKey]` (a `ChartOfAccount` id), with the same active-and-ledger checks as fixed lines; missing →
   code `EVENT_ACCOUNT_MISSING`, the event stays PENDING and is retried (add the code to `RETAIL_PENDING_POSTING_CODES` in
   `app/api/v2/retail/_helpers.ts`).
2. **Rules** in `lib/accounting/defaults.ts` beside "Retail goods receipt" (company scope, GUIDED, `isFallback`), verbatim §3.5:
   - `RETAIL_REQUISITION_PAYOUT` subtype `ORDER`: Dr 2000 / Cr EVENT_ACCOUNT `moneyAccount`.
   - `RETAIL_REQUISITION_PAYOUT` subtype `EXPENSE`: Dr EVENT_ACCOUNT `expenseAccount` / Cr EVENT_ACCOUNT `moneyAccount`.
   - `RETAIL_REQUISITION_CHANGE` `ORDER`: Dr `changeAccount` / Cr 2000. `EXPENSE`: Dr `changeAccount` / Cr `expenseAccount`.
   - `RETAIL_SUPPLIER_PAYMENT`: Dr 2000 / Cr `moneyAccount` (used by packet 41; defined here with the source type).
   All AMOUNT basis, one amount per event. Add the three source types to `RETAIL_SOURCE_TYPES` in
   `lib/retail/posting-settings.ts` (they begin `RETAIL_`, so the shop's posting schedule applies: END_OF_DAY leaves them PENDING
   until the 23:00 run or "Post now"); `kindOf` → "other".
3. **`lib/retail/buying/posting.ts`** (+ `posting.test.ts`): `postPayout(req)`, `postChange(req)`, `postSupplierPayment(group)` —
   build the event payload (`accounts: { moneyAccount: <BankAccount.ledgerAccountId>, expenseAccount: <expense type's account>,
   changeAccount: <change account's ledgerAccountId> }`, amount, memo "REQ-0014 · Afdis Distillers") and call `postRetailJournal`
   **after commit** (as the goods receipt does); the facts stand if posting is pending or fails.
4. **`payOut(actor, id, { paid, fromId, toId, how, reference? })`** in `lib/retail/buying/requisitions.ts` — APPROVED only (409
   "REQ-0014 has been paid out." / not approved); `0 < paid ≤ approvedAmount` (400 `fieldErrors.paid` "Pay the approved amount or
   less."); From active, same currency as the requisition (400 `fieldErrors.from` "Office safe holds US dollars."); a CASH account
   cannot go below zero (paid 0 → 400 `fieldErrors.paid` "Write an amount."; 409 `fieldErrors.from` "Office safe has US$410.00." — the balance read **inside** the transaction after a
   `SELECT … FOR UPDATE` on the `BankAccount` row, so two payouts cannot both pass); a reference for Bank transfer and EcoCash (400
   `fieldErrors.ref` "Add the reference."); To = an active user of the company. One transaction: DISBURSED (`assertTransition`),
   `disbursedById/At`, `paidAmount`, `bankAccountId` = from, `paidToId`, `payoutMethod`, `payoutReference`, `receiptsDueAt` = paid +
   3 days; `BankTransaction` CREDIT `paid` on From (`sourceType RETAIL_REQUISITION_PAYOUT`, `sourceId` = req id, description "REQ-0014
   · Cash to pay Afdis …", reference); for an order requisition one `PurchasePayment` (billId null, `vendorId` = payee, `method`
   "Cash"/"Bank transfer"/"EcoCash", `reference` "REQ-0014", `requisitionId`, `groupNo` = new `PAY-nnnn`, `paymentNumber`
   "PAY-nnnn/1", `paidAt`, `amount` = paid, `bankAccountId`); audit `RETAIL_REQUISITION.PAID { amount, from, to, how }`. **No
   `RetailCashMovement`, no shift touched.** After commit: `postPayout`; the asker told when someone else paid. Response `{ data,
   accountingStatus }`. Toast "US$1,940.00 paid out. Receipts due by 9 October.".
5. **`accountFor(actor, id, { spent, changeIntoId?, receipts ≥1, note? })`** — the asker or update right; DISBURSED only; `0 ≤ spent ≤
   paidAmount` (400 `fieldErrors.spent` "Spent is more than was paid out. Ask for the rest as a new requisition."); ≥1 receipt
   (400 `fieldErrors.rec` "Add the receipt."); change = paid − spent; change > 0 needs `changeIntoId` (same currency). One
   transaction: ACQUITTED, `acquittedAt/ById`, `acquittedAmount` = spent, `changeAmount`, `changeAccountId`, `acquittalNote`;
   receipts as `RetailAttachment` kind RECEIPT (`entityType "CrmRequisition"`); with change: `BankTransaction` DEBIT change on the
   change account (`sourceType RETAIL_REQUISITION_CHANGE`); for an order requisition the payout's `PurchasePayment` credit row
   `amount −= change` — refused 409 "US$1,940.00 of this cash is already against bills; record the change as a supplier refund." when
   its unallocated part is smaller than the change (allocation arrives with packet 41; until then none is allocated). Audit
   `.ACCOUNTED { spent, change, into }`. After commit `postChange` (when change > 0). Toast "REQ-0014 accounted for. US$37.60 back in
   the office safe." / "REQ-0014 accounted for.".
   Invariants the tests assert: after accounting, Σ of the requisition's `BankTransaction`s = −spent on the money accounts;
   the ledger nets Dr 2000 (order) or Dr expense (expense) = spent; the supplier credit row = spent.
6. **Receipts overdue** — add to packet 33's `runBuyingFollowUps`: DISBURSED requisitions past `receiptsDueAt` → once (skip when a
   `CRM_REQUISITION_DECIDED` notification for that requisition with the overdue title exists) notify the asker "REQ-0012: receipts
   were due yesterday." (`… were due on 2 October.` for older).
7. Retail requisitions no longer call `postRequisitionDisbursement` (it stays for the CRM; its test unchanged).

API (`app/api/v2/retail/buying/requisitions/**`):
| Method · path | Permission | Body | Success | Errors |
|---|---|---|---|---|
| POST `/requisitions/[id]/pay` | `retail.requisitions:update` | `{ paid: "1940.00", fromId, toId, how: "Cash"\|"Bank transfer"\|"EcoCash", reference? }` | `{ data, accountingStatus }` | 400 paid/from/ref; 409 state/balance; 404 |
| POST `/requisitions/bulk/pay` | same | one requisition per call from the stepping sheet (same body + `id`) | same | same |
| POST `/requisitions/[id]/acquit` | asker or update | `{ spent, changeIntoId?, receipts: [{ url, name, contentType, size }], note? }` | `{ data, accountingStatus }` | 400; 409 |
Audit: `requisitionPaid`, `requisitionAccounted` (§3.4) + `LIST_WORDS`.

## UI
- Sheets in `lib/retail/sheet-kinds/buying.ts`: `req-payout` (verbatim §5.22; steps at Paid out; From hint live "US$470.00 left in it
  after this." / bad "Office safe has only US$410.00."; How default by the From account's kind; Reference required unless Cash;
  stepping via packet 31's `stepping` with `ids`, Cancel → "Skip"), `req-acquit` (verbatim §5.23; Change back live, ok tone; Change
  goes to hidden at 0; receipts are a multi-file `photo` field uploading through packet 34's attachments route; expense variants of
  the sub and note).
- Requisition kind: APPROVED primary "Pay out" (payers) + ⋯ "Pay out"; DISBURSED primary "Account for it" (asker, payers) + ⋯; chip
  "Receipt overdue" (bad) after `receiptsDueAt`; figures "Paid out US$1,940.00" / "Spent US$1,902.40"; "Cash at hand" note "US$470.00
  left now" after paying; rail Currency "US dollars, cash"/"… bank transfer", Receipt due "9 October" / "Came 7 October"; Receipts
  tab filled (thumbnails, the spent figure under the first).
- List: row ⋯ Pay out · Account for it; bulk "Pay out" (`req-payout&ids=`, approved ticked only); tab Receipts due counts DISBURSED;
  state badge "Paid, receipt due" / "Receipt overdue".
- Order kind chips: "Cash paid out" (ok) for a DISBURSED/ACQUITTED requisition.

## Reuse
`lib/retail/buying/money-accounts.ts`, attachments route, `lib/retail/buying/requisitions.ts` (packet 34), `lib/crm/requisitions.ts`
`assertTransition`, `app/api/v2/retail/_helpers.ts` `postRetailJournal`, `lib/accounting/posting.ts`, `lib/accounting/defaults.ts`,
`lib/retail/posting-settings.ts` `RETAIL_SOURCE_TYPES`, `lib/id-generator.ts`.

## Remove
- The "Retail stops at paid … no acquittal here" rule went with `lib/retail/requisitions.ts` in packet 34; confirm no retail caller of
  `postRequisitionDisbursement` remains (`grep -rn postRequisitionDisbursement app/api/v2/retail lib/retail` → nothing).

## Seed
Through `payOut`/`accountFor`, verbatim §3.6 Requisitions table: REQ-0012 (Chipo, Fridge repair, front till, 85.00, Repairs and
maintenance, pay to CoolTech Repairs, paid out from Front till float today − 2 by Tafara, receipts due today + 1); REQ-0011 (Tendai
Mhlanga, Liquor licence renewal, 240.00, Licences and fees, paid from CBZ by bank transfer, spent 240.00, receipt attached); REQ-0009
(Tafara, Cash to pay Afdis for order PO-0023, 1,940.00, paid from Office safe, spent 1,902.40, US$37.60 back to Office safe — its
credit pays AF-20931 when packet 41 seeds the bill); the six acquitted history requisitions (fuel, cleaning, repairs) across eight
months so "Money asked for, by month" has bars. REQ-0010 is packet 43's (intake Cash now). Receipt files: small PDFs/PNGs under
`public/demo/receipts/`. Then `settleMoneyAccountOpenings()` (packet 34) so Office safe reads US$2,410.00 and Front till float
US$120.00. Tabs then read To approve 2 · To pay out 1 · Receipts due 1 · All 14 (+ packet 43's REQ-0010 → 15).

## Tests
- Witness.
- `lib/retail/buying/requisitions.test.ts` (pay/acquit): paid > approved refused; currency mismatch refused; cash account short
  refused with the balance in the sentence; reference required for transfer/EcoCash; **no `RetailCashMovement` row is written and an
  open shift's expected cash is unchanged** (compute it before/after with the floor's expected-cash function); `BankTransaction`
  CREDIT on From; order payout writes one credit `PurchasePayment` (billId null, groupNo PAY-…); expense payout writes none; acquit
  with change writes a DEBIT on the change account and reduces the credit row; spent > paid refused; no receipt refused;
  **race:** two concurrent payouts from an account holding enough for one → exactly one succeeds (run with `Promise.all` against the
  test DB).
- `lib/retail/buying/posting.test.ts`: each event balances (Σ Dr = Σ Cr) and hits the right accounts: ORDER payout Dr 2000 / Cr 1005;
  EXPENSE payout Dr 5300 / Cr 1005; ORDER change Dr 1005 / Cr 2000; EXPENSE change Dr 1005 / Cr 5300; missing expense account →
  PENDING `EVENT_ACCOUNT_MISSING`.
- `lib/accounting/posting.test.ts`: `EVENT_ACCOUNT` resolution and refusal of an inactive/non-ledger account.
- CRM: `postRequisitionDisbursement` test unchanged and green.

## Acceptance
1. Migration on dev + test; witness green; reseed.
2. As `tafara.manager@` on REQ-0013 (approved, PO-0004): "Pay out" → sheet vs `ReqPayout.png`: Approved read, Paying, From Office
   safe with "US$… left in it after this.", To "Tafara Nyathi, to pay Pamela", How Cash, Reference placeholder "Optional for cash",
   steps at Paid out → "Record payout" → toast "US$637.80 paid out. Receipts due by <d Month>." (amount as seeded). DB: DISBURSED,
   one `BankTransaction` CREDIT on Office safe, one `PurchasePayment` (billId null, vendor Pamela, groupNo PAY-…), **zero new
   `RetailCashMovement` rows**; `/retail/shifts` open shifts' expected cash unchanged; after "Post now" (Setup › Posting to the
   books) a journal Dr 2000 / Cr 1005 for 637.80. The next sheet's Office safe sub is 637.80 lower.
3. Paying from Front till float more than it holds → "Front till float has US$120.00." under From; nothing written.
4. As `chipo.till@` on REQ-0012: "Account for it" vs `ReqAcquit.png` (expense variant: "Add the receipt"): Spent 80.00 → Change back
   US$5.00 (ok tone), Change goes to Front till float, a receipt file → toast "REQ-0012 accounted for. US$5.00 back in the front
   till float."; DB: ACQUITTED, DEBIT 5.00 on Front till float, Receipts tab 1; after posting, journal Dr 1005 / Cr 5300 for 5.00.
5. An expense payout posts Dr the expense type's account / Cr the money account; the CRM's requisitions still post through
   `postRequisitionDisbursement`.
6. Refusals: as `bookkeeper@`, POST pay → 403 "Your role cannot change requisitions"; paid above approved → 400
   `fieldErrors.paid` "Pay the approved amount or less."; paid 0 → 400 `fieldErrors.paid` "Write an amount." (**Defined here**).
7. `npx eslint <changed>`; `npx vitest run lib/retail/buying lib/accounting/posting.test.ts lib/crm`; `pnpm typecheck` alone.

## Depends on
Packet 34 (requisitions, money-account kind and balances, attachments). SET-09 (landed: posting runs, role mappings). Packet 33 (the
worker job it extends). Holds the posting (P) and worker (W) locks.

## Risk
**money** — money-account balances, ledger postings, supplier credit. Pitfalls: `BankAccount.openingBalance` and
`BankTransaction.amount` are Float — convert to Decimal once and round to cents; lock the account row before the balance check;
post journals after commit only; END_OF_DAY schedule leaves events PENDING, so acceptance runs "Post now" before checking journals;
C-33 forbids any drawer movement.

## Open questions
- C-33 resolved by the owner: payouts never touch a drawer; "Front till float" is a CASH money account.
- Zero spent with full change back is allowed (spent ≥ 0).
- Refusal for a zero payout amount (not in the spec): "Write an amount." (**Defined here**).


> Coordinator note (2026-10-06, 85a): when Paid/Spent/Back exist, add the `retail-requisitions` `report:` face (§5.14) and the
> built-in `requisitions-paid` (§5.13, Money) in 85a's three steps (face, row in `RETAIL_BUILT_INS`, `templates.test.ts`).
