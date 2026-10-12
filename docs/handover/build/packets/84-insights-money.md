# 84 · Insights › Money (INS-04)

## Screen
`/retail/insights/money` (page file `app/retail/insights/[topic]/page.tsx`), builder `lib/retail/insights/money.ts`,
`findings/money.ts`. Owner and bookkeeper only.

## Units
INS-04. Spec `70-insights-reports.md` §3.7 (Money), §5.8, §7 INS-04. Overrides: direction 7 (headline), **direction 8**
(Plan and billing stays in Management; SET-10 is not built), C-21 (account payment route), C-33 (payouts from money
accounts, never a drawer), C-40.

## What already exists
- Gate: `GET …/insights/money` requires `retail.insights:view` **and** `retail.money:view` (manager 403 "Your role cannot view
  the money page"); the nav hides Money from managers. Both already landed.
- After packet 80, re-shaped only: KPIs "Cash in open tills", "On order from suppliers", "Requisitions to pay", "Bottle
  deposits held"; chart "In: sales and deposits" / "Out: deliveries and requisitions"; one tab "Still to pay or come" of
  requisitions and orders; actions "Decide the requisitions", "See the orders". Headline exists. No site chip.

## What INS-04 still adds or changes
1. KPIs exactly §5.8: "Cash at hand" = Σ balances of money accounts (BUY-05: `BankAccount` kinds Cash, Bank, Mobile money) + Σ
   (expected cash − opening float) of open shifts at the sites; note "safe, tills and bank". "Owed to suppliers" = Σ (total −
   paid) of unpaid `PurchaseBill`s; delta = the overdue part (due before today), bad, null when none; note "overdue". "Owed to
   you" = Σ owed on customer accounts (CUS-07 `RetailCustomerAccount` / charges); delta overdue part, bad; note "overdue".
   "Requisitions out" = Σ (approved amount, else asked) of requisitions SUBMITTED or APPROVED; delta = SUBMITTED count no tone;
   note "to approve".
2. Chart: columns side by side, last eight weeks, legend "In: sales and payments" `--s1`, "Out: suppliers and expenses" `--s4`.
   In = payments taken on posted sales (every tender except On account, Voucher, Lay-by redeemed) + customer account payments +
   lay-by payments − refunds paid back in money. Out = `PurchasePayment`s + requisition payouts (money-account transactions of
   payout kind) + the plan's paid bills (`SubscriptionPayment` of the company, when any).
3. Tabs: "Due in the next 14 days" — What (link: bill number → `/retail/buying/bills?sheet=bill-edit&id=<bill id>`; requisition
   number → `/retail/buying/requisitions/<id>`; "Plan" → `/preferences/organization/billing`), Who (supplier, pay-to, or
   "Tender"), Due ("Overdue" bad, else `dayMonth`), Amount; Σ "Σ {n}" · — · — · amount. Rows: unpaid bills due by today + 14
   (overdue first), requisitions SUBMITTED/APPROVED needed by today + 14 (Who = pay-to, else the order's supplier, else the asker),
   and the plan's next bill **only when it falls within 14 days** (from `CompanySubscription.currentPeriodEnd` and
   `effectiveMonthlyAmount`; no subscription or no amount → no row). "Where the cash is" (Defined here) — Where (each money account's
   name, then "In the tills now"), Kind ("Cash", "Bank", "Mobile money", "Tills"), Amount; Σ equals "Cash at hand". Empties
   "Nothing falls due in the next 14 days." · "No money accounts yet."
4. Headline notice = first fired of §5.8 ("More went out than came in during the week of 14 September: the Afdis spirits
   order.", "US$2,516 falls due in the next 14 days; cash at hand covers it.", "Mbare Sports Club owes US$212.40 overdue; chase it
   before paying Delta."). Actions: "Chase {Customer}" → `/retail/customers/<customer id>?sheet=account-payment&id=<account id>`
   (C-21; CUS-08); "Pay {Supplier}" (soonest due bill) → `/retail/buying/suppliers/<id>?sheet=payment-new&supplierId=<id>`
   (BUY-07; needs `retail.bills:create`: owner and bookkeeper both hold it); fallback "See the bills" → `/retail/buying/bills`.
5. Site filter applies to sales, tills and requisitions with a site; bills, customer accounts, money accounts and the plan stay
   the whole business's. Site chip shown.

## Boards
`InsightsMoney.png`: KPIs "Cash at hand US$4,812.40 safe, tills and bank", "Owed to suppliers US$1,031.20 US$216.00 overdue"
(bad), "Owed to you US$1,213.80 US$212.40 overdue" (bad), "Requisitions out US$2,964.80 2 to approve". "Where is the cash
going?" / "Money in and out each week", legend "In: sales and payments" (green), "Out: suppliers and expenses" (purple), eight
weeks "10 Aug"…"28 Sep" on US$10,000 / US$5,000 / 0. Tabs "Due in the next 14 days · Where the cash is" + Export; rows
"INV-88120 Delta Beverages Overdue US$216.00", "SZ-4471 Schweppes Zim… 6 October US$311.20", "REQ-0014 Afdis Distillers 6 October
US$1,940.00", "Plan Tender 1 November US$49.00"; "Σ 4 US$2,516.20". Actions "Chase Mbare Sports Club", "Pay Delta Beverages".

## Workflows
W-52 (Customers, Money step, owner and bookkeeper): read where the cash is going; follow a bill, a requisition, Plan, "Chase …"
(CUS-08 records the payment) or "Pay …" (BUY-07 records the supplier payment). Insights writes nothing.

## Roles
Owner `owner@bottlestore.test` and bookkeeper `bookkeeper@bottlestore.test` (`retail.money:view`). Manager
`tafara.manager@bottlestore.test`: no Money item; page shows "Your role cannot view the money page"; API 403. Cashier, stock
clerk: 403 "Your role cannot view insights".

## Data
Models: `BankAccount` + `BankTransaction` (BUY-05 money accounts and payouts), `PurchaseBill`, `PurchasePayment`, `Vendor`
(BUY-07), `CrmRequisition` (BUY-04), `RetailShift` (open: expected cash, float), `RetailSale` + `RetailSalePayment`,
`RetailCustomerAccount`, `RetailAccountCharge`, `RetailAccountPayment` (CUS-07/08), lay-by payments (CUS-09),
`CompanySubscription`, `SubscriptionPayment`. Base currency (USD). **No schema change.**

## Server
`money.ts#moneyInsight(companyId, window, siteId)`; `findings/money.ts#moneyFindings`. Same route and gates. Reads only.
Invariant tested: "Where the cash is" Σ = "Cash at hand" KPI to the cent.

## UI
Frame unchanged. "Overdue" cells `tone: "bad"`. Phone: cards (title What, figure Amount, meta Who · Due).

## Reuse
Packet 80's `figures.ts`, `words.ts`, `cells.ts`; BUY-05's balance function for money accounts (use it, do not re-sum
transactions); CUS-07's owed/overdue function; BUY-07's owed per bill.

## Remove
KPIs "Cash in open tills", "On order from suppliers", "Requisitions to pay", "Bottle deposits held"; tab "Still to pay or come";
actions "Decide the requisitions", "See the orders"; the order links in the money table.

## Seed
Nothing of its own: BUY-05 money accounts (Office safe, Front till float, CBZ current account, EcoCash merchant), BUY-07 bills
(INV-88120 overdue US$216.00, SZ-4471 due 6 October US$311.20), BUY-04 REQ-0014 needed 6 October US$1,940.00, CUS-07/08 Mbare
Sports Club owes US$212.40 overdue.

## Tests
- `findings/money.test.ts`: the three board sentences from fixtures.
- `money.test.ts` (test DB): an unpaid bill due yesterday is Overdue and in the overdue delta; a paid bill is not listed; a
  submitted requisition counts in "to approve"; a plan bill 29 days out is not listed, 10 days out is; Σ "Where the cash is" =
  Cash at hand; a requisition payout from "Front till float" reduces that money account, never an open shift's expected cash
  (C-33).

## Acceptance
1. Seeded, as owner and as bookkeeper, `/retail/insights/money` beside `InsightsMoney.png`: "Owed to suppliers US$1,031.20" with
   "US$216.00 overdue"; "Owed to you" with its overdue; "Due in the next 14 days" rows INV-88120 Delta Beverages "Overdue"
   US$216.00, SZ-4471 Schweppes Zimbabwe "6 October" US$311.20, REQ-0014 Afdis Distillers "6 October" US$1,940.00; Σ equals their
   sum (no Plan row unless the plan bill falls within 14 days).
2. Links open the bill sheet, the requisition record, and Management's Plan and billing (`/preferences/organization/billing`).
3. "Where the cash is" lists Office safe, Front till float, CBZ current account, EcoCash merchant, In the tills now; Σ = "Cash at
   hand".
4. "Chase Mbare Sports Club" opens the customer record with `account-payment` for that account.
5. Manager: no Money item; `/retail/insights/money` shows "Your role cannot view the money page"; `GET` → 403.
6. eslint clean; vitest on the files above; `pnpm typecheck`.

## Depends on
Packet 80. BUY-04 (requisitions), BUY-05 (money accounts, payouts), BUY-07 (bills, `bill-edit`, `payment-new`), CUS-07 (accounts),
CUS-08 (`account-payment` sheet), CUS-09 (lay-by payments; without it lay-bys count 0). SET-10 is **not** built (direction 8): the
plan row reads `CompanySubscription` directly. Lock **IN**.

## Risk
money (reads drawer, money accounts, payables and receivables; must agree with BUY-05 balances and CUS-07 owed to the cent).
Pitfalls: requisition payouts never touch a drawer (C-33); cash in tills = expected − float of open shifts only.

## Open questions
- Plan row: the board's "1 November" is 29 days out; shown only within 14 days (spec Deviation); link goes to Management's
  billing page, not `/retail/manage/billing` (direction 8).
- "Chase" uses CUS-08's `account-payment` on the customer record (C-21); `/retail/accounts/<id>` does not exist.


> Coordinator note: lay-by payments come from FLR-06 (packet 58), not CUS-09.
