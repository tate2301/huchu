# 67 · Take a payment on account (CUS-08)

## Screen
Sheet `account-payment` over the customer record (`/retail/customers/[id]?sheet=account-payment&id=<accountId>`, header "Take a payment") and over Accounts (row menu). Payment receipt PDF.

## Units
CUS-08.

## Boards
- `CustPayment.png` (drawn over Tapiwa Marange's record for Mbare Sports Club — template reuse; in the product the sheet is always for the record's own account): sheet "Take a payment" / "Mbare Sports Club · owes US$612.40, US$212.40 overdue". "Amount" US$ 300.00 (half); "Paid by" seg "Cash · EcoCash · **Bank transfer**" (half); "Reference" mono "CBZ 0310 4412" (half); "Paid on" "3 October 2026" (half); "Pays" read bold "The oldest sales first: US$212.40 overdue, then US$87.60 of September."; footer note "A receipt goes to them on WhatsApp."; "Cancel"; primary "Record US$300.00".
- `CustomerRecord.png` header now reads "Adjust points | Take a payment | Message on WhatsApp | ⋯".

## Workflows
- **W-49 (record payment)**: amount · paid by · reference · paid on → `POST /api/v2/retail/accounts/[id]/payments`; a receipt on WhatsApp.

## Roles
`retail.accounts:update` (owner, manager, bookkeeper). Cashier and stock clerk: none. Accounts: owner `owner@bottlestore.test`, manager `tafara.manager@bottlestore.test`, bookkeeper `bookkeeper@bottlestore.test`, cashier `chipo.till@bottlestore.test` (`RetailDemo123!`).

## Data
Existing (packet 66): `RetailCustomerAccount`, `RetailAccountCharge`, `RetailAccountPayment` (`paymentNo`, `method`, `reference`, `paidOn`, `shiftId`, `cashMovementId`), `RetailAccountAllocation`; `RetailCashMovement` (`TAKEN_IN` from packet 58); `TenderAccountMapping` (ON_ACCOUNT → 1100 exists in SET-09's defaults); `RetailMessage` (media columns, C-02).

Migration suffix `retail_account_payment_posting` (stamp after the newest folder), witness `lib/retail/accounts/payment-posting-migration.test.ts`: first statements `ALTER TYPE "AccountingSourceType" ADD VALUE 'RETAIL_ACCOUNT_PAYMENT'` and `ALTER TYPE "RetailCashMovementReason" ADD VALUE 'ACCOUNT_PAYMENT'`; then for every company with the retail pack and no active company-level `TenderAccountMapping` for `ON_ACCOUNT`, insert one (`clearingAccountId` = its 1100 "Accounts Receivable", priority 45 as the defaults). Witness: both enum values; on a fixture company with the pack, exactly one `ON_ACCOUNT` mapping pointing at its 1100.
Rule (`RETAIL_POSTING_RULES`, fallback "Retail account payment", company scope, GUIDED): **Dr `TENDER_MAPPING` (repeat over `payments`: the method) · Cr `EVENT_ACCOUNT` `receivable` AMOUNT** (BUY-05's line source).

## Server
`lib/retail/accounts/`:
- `allocate.ts#allocate(charges, amount)` (pure): oldest first (`dueOn`, then `chargedAt`), each charge takes `min(left, amount − credited − paid)`; returns `[{ chargeId, saleNo, date, amount, overdue }]`. `allocationSentence(allocs, today)` → "The oldest sales first: US$212.40 overdue, then US$87.60 of September." (forms: all overdue "Pays everything overdue: US$212.40."; one month "Pays US$87.60 of September."; everything "Pays it all.").
- `payments.ts#recordAccountPayment(actor, accountId, input)`:
```ts
const paymentInput = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Write the amount, like 300.00."),
  method: z.enum(["CASH", "ECOCASH", "TRANSFER"]),
  reference: z.string().trim().min(4).max(40).optional(),
  paidOn: z.string(),            // "3 October 2026" or "2026-10-03"
  shiftId: z.string().uuid().optional(),
});
```
  Validation: account open (409 "The account is closed."); `0 < amount ≤ owed` (400 `fieldErrors.amt` "Mbare Sports Club owes US$612.40." — overpayments refused, spec open question 6); reference 4–40 required for ECOCASH and TRANSFER (400 `fieldErrors.ref` "Add the reference."); `paidOn` ≤ today and ≥ the account's opening (400 `fieldErrors.date` "It cannot be paid before the account was opened."). Cash: packet 56's `resolveDrawer` at the person's site (packet 50's `defaultSiteFor`) — none → 409 "Open a shift at Harare Main Branch to take cash."; several and no `shiftId` → 409 with `choose`.
  **One transaction**: lock the account and its unsettled charges `FOR UPDATE`; re-read owed; `RetailAccountPayment` (`PMT-0042` via `reserveIdentifier("RETAIL_ACCOUNT_PAYMENT")`); allocations from `allocate` and `paid += alloc` on each charge; cash → a `RetailCashMovement` `TAKEN_IN` / `ACCOUNT_PAYMENT` ("Account payment PMT-0042", no journal of its own) on the drawer with `expectedCash += amount` (guarded on OPEN) and `cashMovementId` on the payment; a hold lifts by itself when nothing is left overdue (`held = false`, `RETAIL_ACCOUNT.RELEASED { by: "payment" }`); audit `RETAIL_ACCOUNT.PAYMENT_RECORDED { accountId, paymentNo, amount, method, reference, allocations: [{ saleNo, amount }] }` (entity `Customer`).
  **Invariants**: Σ allocations = amount exactly; every charge keeps `credited + paid ≤ amount` (the DB CHECK); owed after = owed before − amount; cash lands in exactly one drawer and the Z-report sees it as a movement.
  After commit: `lib/retail/accounts/posting.ts` posts `RETAIL_ACCOUNT_PAYMENT` with `payload.payments = [{ tenderType: method, amount, currency: "USD" }]` and `payload.accounts.receivable` = the company's ON_ACCOUNT mapping's clearing account (missing → `EVENT_ACCOUNT_MISSING`, PENDING for the drain; a locked period leaves it PENDING) — Dr the method's account (cash 1000, EcoCash 1016, transfer 1017) / Cr 1100, equal to the amount. Receipt: the A6 PDF uploaded through `lib/uploads/upload-file.ts` (company folder `receipts/`, signed link 7 days) and an outbox WhatsApp (template `account-payment`, `mediaUrl/mediaName/mediaKind DOCUMENT`) to the customer's WhatsApp number when they have one: "Harare Bottle Store received US$300.00 from Mbare Sports Club by bank transfer, CBZ 0310 4412, on 3 October 2026. You owe US$312.40." (Defined here).
  Response 201 `{ data: { paymentNo, owes, overdue, receiptUrl } }`.
- `receipt-pdf.ts`: A6 — shop, "Received from", amount, how, reference, date, what it paid (sales and amounts), what is still owed (`renderPdfFromHtml`).

**Routes**
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/v2/retail/accounts/[id]/payment-preview?amount=` | `retail.accounts:update` | `{ text, allocations, drawer: { shiftId, label, hint } \| { choose } \| { none: true }, default: { amount /* overdue, else everything owed */ } }`; 400 bad amount |
| POST | `/api/v2/retail/accounts/[id]/payments` | `retail.accounts:update` | record |
| GET | `/api/v2/retail/accounts/payments/[paymentId]/receipt` | `retail.accounts:view` | `application/pdf`; 404 |

Audit/words: `accountPayment` "Took US$300.00 by bank transfer, CBZ 0310 4412" (ok); `accountReleased` "Took the account off hold" (ok). `lib/retail/cash-movements.ts` reason label "Account payment".

## UI
- Sheet `account-payment` (`lib/retail/sheet-kinds/customers.ts`): title "Take a payment"; sub "Mbare Sports Club · owes US$612.40, US$212.40 overdue" ("Tapiwa Marange · owes US$31.00" with nothing overdue). Fields: `amt` money half (default what is overdue, else everything owed — Defined here); `how` seg half "Cash", "EcoCash", "Bank transfer" (default Cash — Defined here), Cash shows the drawer hint "Goes into the front till’s drawer (Chipo Dube)." or a "Drawer" seg when several; `ref` text mono half (label gains "optional" while Cash is chosen); `date` text half (today, "3 October 2026"); `alloc` read, live from payment-preview. Note "A receipt goes to them on WhatsApp." (no number: "They have no WhatsApp number. Print the receipt from the Account tab." — Defined here); primary "Record US$300.00" (follows the amount; "Record it" while empty). Done "US$300.00 recorded. Mbare Sports Club owes US$312.40." ("… owes nothing now."). Invalidate the record, `["list","retail-accounts"]`, `retail-account-lines`, `nav-badges`, `retail-shift`. requires `[["retail.accounts","update"]]`.
- Customer record: header action "Take a payment" (an open account; `retail.accounts:update`) between "Adjust points" and "Message on WhatsApp".
- Accounts list: row menu "Take a payment" (owing rows; `?sheet=account-payment&id={id}`). The Account tab's payment rows link "PMT-0042" to its receipt PDF.

## Reuse
Packet 56 `resolveDrawer`, packet 50 `defaultSiteFor`, packet 58's `TAKEN_IN` movement type, packet 66 (balances, state), BUY-05 `EVENT_ACCOUNT` line source, `app/api/v2/retail/_helpers.ts#postRetailJournal`, `lib/uploads/upload-file.ts`, SET-07 outbox with media, `lib/documents/pdf-renderer.ts`.

## Remove
Nothing.

## Seed (`seedAccountPayments`)
The four payments seeded by packet 66 get their `RETAIL_ACCOUNT_PAYMENT` postings (PENDING in a locked period); the cash one (Tapiwa, 1 Oct 45.50) gets its `TAKEN_IN` movement on that day's Front till shift.

## Tests
- Witness.
- `lib/retail/accounts/allocate.test.ts`: oldest first; part-paid and credited charges; the sentence's forms.
- `lib/retail/accounts/payments.test.ts` (test DB): overpay → 400; reference rule; cash path raises the drawer's expected cash through a TAKEN_IN movement; no drawer → 409; two concurrent payments never over-settle a charge; the hold lifts when nothing is overdue; receipt queued with a document.
- `lib/retail/accounts/posting.test.ts`: the entry balances and reads the method's account and 1100.

## Acceptance
1. Tapiwa Marange's record header reads "Adjust points | Take a payment | Message on WhatsApp | ⋯" as `CustomerRecord.png`.
2. Mbare Sports Club's record → "Take a payment" beside `CustPayment.png`: sub "Mbare Sports Club · owes US$612.40, US$212.40 overdue"; 300.00, Bank transfer, "CBZ 0310 4412", "3 October 2026"; Pays "The oldest sales first: US$212.40 overdue, then US$87.60 of September."; "Record US$300.00" → "US$300.00 recorded. Mbare Sports Club owes US$312.40.".
3. The Accounts row reads US$312.40 owed, "US$0.00" overdue, Last paid "3 Oct 2026", Owing (Activity "Took the account off hold"); the badge is gone; SQL: a `RETAIL_ACCOUNT_PAYMENT` journal Dr 1017 US$300.00 / Cr 1100 US$300.00; a queued receipt message with the PDF.
4. A cash payment while only the Front till is open → a `TAKEN_IN` movement on Chipo Dube's shift and its "Should be in the drawer" rises by the amount; with no shift open → "Open a shift at Harare Main Branch to take cash.".
5. 700.00 → "Mbare Sports Club owes US$312.40." under Amount.
6. Migration on dev and test; witness, named tests, eslint, one `pnpm typecheck`.

## Depends on
Packet 66 (accounts), packet 56 (drawer rule), packet 58 (`TAKEN_IN`), BUY-05 (`EVENT_ACCOUNT`), SET-09 (posting, on main), SET-07 (outbox media, on main). Locks **P** (posting), **CR** (record).

## Risk
money (receivables settled, cash into a drawer, a journal per payment). Pitfalls: lock charges before allocating; refuse overpayment; the drawer and the journal must agree on cash.

## Open questions
- Correcting a payment and writing off a debt are not on the canvas (spec open question 7) — not built.
