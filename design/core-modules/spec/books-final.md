# Books, final form

The plan that moves the whole Accounting master into Books, makes Books the engine for every money movement in every module, and sets one way of doing each thing. It is a plan, not a build: nothing here is in the code yet, and every schema change in §7 needs the owner's approval before it is made.

**Inputs.** The research behind it is in three notes written on 18 Oct 2026: the screen and model inventory (`inventory.md`), every money flow in every module (`money-flows.md`), and Zimbabwean practice and law (`zw-research.md`). Anything marked **FLAG** comes from that research and is uncertain; a tax adviser should confirm it before we rely on it.

**What the owner asked for (18 Oct).** "Migrate the entire Accounting Master to Books. Standardize the process based on how Zimbabwean business operate… wire up requisitions, expenses, cost tracker etc from the CRM, then things like mass CRUD, if user role allows… a books module that does not require an accounting degree to work with, but versatile enough to be given to an accountant… Include rollbacks, voiding, permanent delete from owners and superusers, same applies to editing… books must support all money handling across CRM, retail, stock, maintenance, HR, payroll… even when you don't have the module enabled, its core handles your money. You only pay extra to get access to its GUI."

**Words used here.**
- **Post**: write the ledger entry for a document.
- **Void**: cancel a posted document by posting its mirror. The original stays, marked void.
- **Revise**: the "edit" of a posted document. It voids the old one and issues a new one, linked.
- **Delete**: remove a record. Free for drafts. Owner only for anything posted, with limits (§2.4).
- **Core**: the engine and its data. Free and always on.
- **Screens**: the Books GUI at `/books/*`. Paid.

---

## 1. The principle: Books core and Books screens

### 1.1 Core (always on, every workspace, free)

The core is everything that makes money correct. It runs in every workspace, whatever the plan, whatever modules are on.

| Part | What it holds | Where it lives today |
|---|---|---|
| Ledger | `JournalEntry`, `JournalLine`, posted only through the core | `lib/accounting/posting.ts`, `ledger.ts` |
| Chart of accounts | Seeded on first use; an accountant can change it later | `lib/accounting/defaults.ts`, `bootstrap.ts` |
| Posting engine | Rules, conditions, tender and role mappings, the integration event log | `posting.ts`, `integration.ts`, `PostingRule*` |
| Documents and their states | Quote, invoice, credit note, receipt, write-off, PO, bill, debit note, supplier payment, requisition, expense claim, journal | `lib/accounting/*`, `lib/books/*`, `lib/crm/*`, `lib/retail/buying/*` |
| Numbering | One counter per document type, gapless, handed out at issue | `reserveIdentifier` (`lib/id-generator.ts`) |
| Undo | Void, revise, delete, with the audit trail | `lib/books/reverse-invoice.ts`, `void-receipt.ts`, `delete-invoice.ts` |
| Periods | Month periods, close and reopen with a voucher, the freeze date | `period-lock.ts`, `closing.ts` |
| Tax | VAT codes and rules, withholding, IMTT | `TaxCode`, `TaxRule`, `lib/accounting/tax-rules.ts` |
| Currency | Currencies, daily rates, the frozen rate on each document | `CurrencyRate`, `resolveExchangeRate`, `lib/retail/rbz-rate.ts` |
| Fiscalisation | The FDMS device, fiscal days, fiscal receipts | `lib/accounting/fiscalisation.ts`, `fiscal-day.ts` |
| Parties | Customers and suppliers, with tax numbers and ITF263 | `Customer`, `Vendor` |
| Money accounts | Bank, mobile wallet and cash accounts, their transactions | `BankAccount` (`kind` CASH, BANK, MOBILE), `BankTransaction` |
| Sub-ledger | Who owes us, whom we owe | `PaymentLedgerEntry` |
| Audit | Every void, revise and delete, with who, why and a snapshot | `PlatformAuditEvent` (hash-chained) |

**Who posts through it.** Every module that moves money: CRM, retail, stock, maintenance, HR and payroll, schools, gold. No module writes a `JournalEntry`, a `BankTransaction` or a `PaymentLedgerEntry` itself. It calls the core.

#### The one entry point (new): `lib/books/core`

A facade over what exists. Modules import only this.

| Function (new) | What it does | Built on |
|---|---|---|
| `postMoney(db, event)` | Posts one money event. `event` = company, `sourceType`, `sourceId`, optional `sourceSubtype`, date, currency, rate, amounts, optional party, cost centre, accounts and actor. Writes the integration event as `PENDING`, posts now (or defers for retail's day run), syncs the sub-ledger for every type with a party, and creates the `BankTransaction` when a money account is named | `createJournalEntryFromSource` |
| `voidMoney(db, { sourceType, sourceId, reason, date, actor })` | Posts the mirror under `void:<sourceId>`, dated in an open period; marks the sub-ledger line `VOIDED`; removes or reverses the bank transaction | `invertDirection` re-post, as in `reverse-invoice.ts` |
| `recordEvent(db, event)` | Records a status change that moves no money (a work order moved to In progress). It refuses an event that carries an amount | `captureAccountingEvent` |
| `rateFor(companyId, currency, date)` | The rate and its source, to freeze on a document | `resolveExchangeRate` |
| `nextNumber(db, companyId, type)` | The next number in that document's series, inside the issuing transaction | `reserveIdentifier` |
| `fiscalise(db, document)` | Sends an invoice, credit note or debit note to the device | `issueFiscalDocument` |
| `canDo(actor, action, document)` | The one permission check for §2 | `lib/books/owner.ts`, `isRouteAllowedForRole`, CRM capabilities |

`createJournalEntryFromSource` stays as the engine underneath. Its idempotency on `(companyId, sourceType, sourceId)` stays the guarantee that posting twice is safe.

#### The rule: nothing captures money as IGNORED

Today `lib/crm/money-posting.ts` calls `captureAccountingEvent` with no status, which defaults to `IGNORED` (`integration.ts:114,140`). Nothing reads `IGNORED`, so requisition payouts, top-ups, change returned and cost-tracker spends never reach the ledger.

From P1:
1. `captureAccountingEvent` defaults to `PENDING`.
2. `IGNORED` is allowed only through `recordEvent`, which refuses any amount. A test walks every caller and fails on a money event written as `IGNORED`.
3. A missing rule or account makes the event `FAILED` with the reason. It is never dropped.
4. One drain runs every 15 minutes for every source type, not only retail's (`lib/retail/posting-settings.ts:126` today). It uses the existing backoff (5 minutes doubling, up to 24 hours).
5. `PENDING` older than an hour and every `FAILED` event show in **Close the month → Needs posting**, and they block the month's close (`lib/books/close.ts` counts `FAILED` only today).
6. A one-off backfill re-queues every existing `IGNORED` event that carries an amount (§7, D14).

#### What a workspace without the screens still gets

- **Module screens show their own money.** CRM requisitions, the cost tracker, retail takings, the pay run and school fees all keep working. They show their documents, balances and statuses, and they read from the core.
- **The ledger stays correct.** Every sale, payment, payout and pay run posts, from the first day.
- **Undo works from the module.** A CRM invoice is reversed from the CRM's invoice screen, by the owner, through the same core function Books uses.
- **The accountant export works.** Management → Company → **Accountant export** (new, free) downloads the trial balance, general ledger, debtors and creditors by age (per currency), the VAT 7 working schedule and the audit trail, as CSV and XLSX, for any date range.
- **Setup is in Management, not Books.** Business and tax details, money accounts, rate source, numbering, approval limits and the fiscal device are in Management, so a workspace without the screens can still set them (§3.3).
- **Buying the screens later loses nothing.** The owner adds Books and every document, posting and balance is already there, back to the first day.

**This reverses one deliberate seam.** `lib/platform/gating/feature-dependencies.ts:28` and `postPayrollRun` keep a payroll-only workspace off the ledger ("the run was not posted to a ledger"). Under the owner's rule the ledger is always on, so that check goes. `postingSkippedReason` stays, but only for a real failure. Record this in `decisions.md` when it is built.

### 1.2 Screens (paid add-on)

The Books GUI. One new feature key, **`books.screens`** (new), is the thing that is paid for. `accounting.core` becomes the engine's key: on in every workspace, never billed, and not switchable (§7, D1). The existing sub-keys (`accounting.ar`, `.ap`, `.banking`, `.journals`, `.periods`, `.tax`, `.chart-of-accounts`, `.posting-rules`, `.trial-balance`, `.financial-statements`, `.cost-centers`, `.multi-currency`, `.zimra.fiscalisation`) stay as finer gates, each now depending on `books.screens`.

**What is gated by `books.screens`:**
- Every page under `/books/*`, except `/books/takings`, which keeps its retail gate (`retail.shifts`), because it is the floor's End of day.
- APIs that only Books pages call: `/api/books/*` (lists, nav counts, money summary, bank matching, CSV exports).

**What is never gated by `books.screens`:**
- Every `lib/books/core` call, from any module.
- Module APIs that create or change money documents: `/api/v2/crm/*`, `/api/v2/retail/*`, `/api/payroll/*`, `/api/v2/schools/fees/*`, gold and maintenance routes.
- Undo on a module's own documents. Books' void, revise and delete routes move under `/api/books/core/*` (new) and gate on the role, not the plan.
- Management pages for setup (§3.3) and the accountant export.

**What a workspace without the screens sees at a Books address.** The Books page shell, with one state in place of the page:
- A finding with real figures from the core: "Your books hold 1,204 entries since 1 Mar 2026. Money in this month: US$12,480.00 and ZWG 41,300.00."
- One line on what the screens add: invoices and bills in one place, bank matching, VAT returns, the month's close, and the ledger for your accountant.
- The owner sees **Add Books** with its price (a placeholder until set; see `open.md`), which opens Management → Apps → Billing. Everyone else sees "Ask your owner to add Books" and no button.
- A link to the accountant export, so the figures are never held back.

**The rail.** Without the screens, the Books module shows in the rail for the owner only, with an "Add" tag. Others don't see it. Pages in other modules that link into Books (an invoice's "Open in Books") are hidden when the screens are off; the module's own record opens instead.

---

## 2. Who does what

### 2.1 Roles

| Who | Role in the app | What they are in Books |
|---|---|---|
| Owner | `SUPERADMIN` (`WORKSPACE_OWNER_ROLE`, `lib/books/owner.ts`). A workspace may have more than one (`activeOwners`) | Everything, including permanent delete and revising posted documents |
| Superuser | Not a workspace role. A Corelith operator in **Sign in as**, mode `CHANGE` (`SignInAsSession`, `member.signInAsChange`), signed in as an owner | The owner's powers, for support. Every destructive act records the operator and the session number (`SA-214`) in the audit payload. The owner already gets an email with a link that ends the session. `LOOK` mode is read-only, as now. No new role is added |
| Manager | `MANAGER` | Runs the money day to day: approves, pays, closes the month. Can't delete posted documents or reopen a month |
| Accountant | `FINANCE_OFFICER` | Does the books: creates, issues, posts journals, reconciles, prepares VAT. Approves within a limit, never their own. Void and revise only if the owner grants it (§2.3) |
| Bursar | `BURSAR` | School fees: fee invoices, receipts, refunds within its module. Sees Books' Sales and Bank & cash. Same rights as a clerk elsewhere |
| Shop manager | `SHOP_MANAGER` | Retail: day close, banking, retail requisitions within the limit |
| Clerk or rep | `CLERK`, `SALES_REP`, `SALES_EXEC`, `CASHIER`, `STOCK_CLERK` | Drafts, receipts at the counter or in the CRM, requisitions and claims for themselves. No approvals, no voids |

### 2.2 The permission matrix

Y = may. L = may, within their approval limit. O = only on their own records. G = only if the owner granted "void and revise" (§2.3). – = may not.

| Action | Owner / superuser | Manager | Accountant | Bursar | Shop manager | Clerk / rep |
|---|---|---|---|---|---|---|
| See Books screens | Y | Y | Y | Sales, Bank & cash | Bank & cash, Takings | – |
| Create a draft (any document) | Y | Y | Y | fees | retail | O |
| Edit a draft | Y | Y | Y | fees | retail | O |
| Delete a draft | Y | Y | Y | fees | retail | O |
| Issue or post (invoice, bill, credit note, receipt) | Y | Y | Y | fees | retail | receipts and CRM invoices |
| Post a manual journal | Y | Y | Y (L, second person over the limit) | – | – | – |
| Approve (requisition, PO, bill, claim, payment, write-off) | Y | L | L | – | L (retail) | – |
| Pay (supplier payment, disburse, reimburse) | Y | L | L | – | L (retail) | – |
| Issue a credit note or debit note | Y | Y | Y | fees | – | – |
| Write off a debt | Y | L | L | – | – | – |
| Void or reverse a posted document | Y | G | G | – | – | – |
| Revise a posted document (= void + re-issue) | Y | G | G | – | – | – |
| Permanent delete of anything posted | Y | – | – | – | – | – |
| Bulk actions | the same rights, row by row (§5.13) | | | | | |
| Close a month | Y | Y | Y | – | – | – |
| Reopen a month | Y | – | – | – | – | – |
| Post into a closed month (lock policy `MANAGER_OVERRIDE`) | Y | Y, with a reason | – | – | – | – |
| Finalise and file a VAT return | Y | Y | Y (prepare and review) | – | – | – |
| Change chart, rules, tax codes, rates | Y | – | Y | – | – | – |

Changes from today, on purpose:
- **Reopen a month** becomes owner only. Today `period-reopen` allows `MANAGER`.
- **Most CRUD routes check only the session today** (invoices, bills, receipts, `periods` PATCH, `period-close`, `freeze`, journals). All of them go through `canDo` from P1.
- **A rep's CRM invoice** keeps working, but as a document the core issues (numbered, fiscalised, posted), not a bare `ISSUED` row.

### 2.3 Granting void and revise

The owner said voiding and editing posted documents are for owners and superusers. An accountant handed the books still has to fix mistakes. So:
- By default only the owner voids and revises.
- On a person's page in Management → Users, the owner can tick **May void and revise posted documents**. It is stored as a `UserPermissionOverride` (the CRM's existing mechanism, `lib/crm/permissions.ts`) with the capability `books.void` (new).
- It can be given to a manager or an accountant only. It never covers permanent delete of posted records, reopening a month, or changing a filed VAT return.

### 2.4 Maker-checker and limits

| Rule | Where it applies | Built on |
|---|---|---|
| Nobody approves their own request | Requisitions, POs, claims, bills, payments, write-offs, journals over the limit | `isTwoStepActionAllowed` (`lib/workflow/approvals.ts`), `decideRefusal` (`lib/retail/buying/requisitions.ts:88`) |
| Nobody pays their own request | Disbursements, reimbursements | new check in `canDo` |
| The approver should not also pay | Disbursements, supplier payments | Enforced when the workspace has two or more people with pay rights. A one-person shop may do both; the audit marks it "approved and paid by the same person" |
| Over the limit, the owner approves | Requisitions, POs, claims, write-offs: `requisitionOwnerOver`. Bills and supplier payments: `paymentOwnerOver` (new, D10) | `RetailApprovalSettings`, `getApprovalLimits` (`lib/retail/approvals/limits.ts`), with the snapshot of limit and approver taken at submit, as retail does now |
| Approvals are recorded once | Every Books approval writes an `ApprovalAction` | `createApprovalAction`, with new `ApprovalTargetType` values (D9) |

The CRM's requisition route reads no limit today. From P2 it reads the same limits as retail.

### 2.5 Permanent delete and edit after posting

Both are owner (or superuser) only, always with a reason (3 to 300 characters, `REASON_MIN`/`REASON_MAX`), and always written as a `PlatformAuditEvent` (`books.<document>.deleted`, `books.<document>.revised`) that keeps the whole record as JSON, who did it, why, and for a superuser the operator and session.

**Edit after posting is never an edit in place.** It is Revise: the old document is voided and a new one is issued, carrying `supersedesId` (D7). Both stay visible and linked.

**What permanent delete does to the ledger.** In one transaction it removes the document, its lines, every journal it posted (including its revisions and void mirrors), its sub-ledger lines and its integration events, as `delete-invoice.ts` does now. Payments are never deleted with it: they are taken off the document and stay as the party's money on account. The month's trial balance changes as if the document had never been posted. The number is never handed out again.

**When permanent delete is refused** (the app says which rule and offers Void instead):

| Refused when | Why |
|---|---|
| The document was fiscalised (signed into a fiscal day, or accepted by FDMS) | See below |
| Its date is in a closed month, or before the freeze date | A closed month's figures have been reported |
| It is counted in a VAT return that is finalised or filed | The return has been, or is about to be, declared to ZIMRA |
| A payment on it is matched to a bank statement line in a closed reconciliation | The bank side has been signed off |
| It is a payroll run or a school fee document | Their modules own deletion; Books never deletes them |

**Fiscalised documents: refuse, and offer a fiscal credit note.** ZIMRA holds fiscal memory read-only and allows one fiscal tax invoice per supply; a fiscalised document is corrected only with a fiscalised credit or debit note that states its reason (`zw-research.md` §3, §6). If we deleted the invoice locally, our books would show less output VAT than FDMS holds, and since 2026 the buyer's input tax fills in from FDMS, so ZIMRA would see a sale we no longer declare. So the app refuses, and Delete on a fiscalised invoice offers **Void with a credit note** instead. That changes `delete-invoice.ts`, which today deletes a fiscalised invoice once its fiscal day has closed.

The single exception: documents signed by a device registered against ZIMRA's test environment can be purged by the owner with the rest of the test data (§5.12). That needs a test flag on the device (D18).

---

## 3. The navigation tree

### 3.1 How the panel works

The sidebar opens a row's children in place (`components/layout/sidebar/`): a row with children opens its level, and the chevron before the title goes back up. Books moves from bands (`panelGroups`) to levels: each group below is a row on Books' first level that opens its own level. **Money** is a plain row at the top, the page Books opens on. **Saved views** and **Reports from Books** stay as bands at the foot of each level, as now.

Names are the owner's words. The accountant's tools are all inside **Ledger** and **Settings**, so they are one click away but never in the owner's path.

### 3.2 The tree

Badges in brackets are counts on the row.

```
Books
├── Money                         /books
├── Sales  ›
│   ├── Invoices                  /books/invoices           [overdue]
│   ├── Quotes                    /books/quotes
│   ├── Payments received         /books/payments           [on account]
│   ├── Credit notes              /books/credit-notes
│   └── Customers                 /books/customers
├── Bills & spending  ›
│   ├── All spending              /books/expenses
│   ├── Bills                     /books/bills              [due this week]
│   ├── Payments made             /books/payments-made
│   ├── Purchase orders           /books/orders
│   ├── Requisitions              /books/requisitions       [to approve]
│   ├── Claims & petty cash       /books/claims             [to approve]
│   └── Suppliers                 /books/suppliers
├── Bank & cash  ›
│   ├── Accounts                  /books/accounts
│   ├── To match                  /books/bank               [lines to match]
│   ├── Reconciliations           /books/reconciliations
│   └── Takings                   /books/takings            (retail only)
├── Tax  ›
│   ├── What's due                /books/tax
│   ├── VAT returns               /books/vat
│   ├── Withholding               /books/withholding
│   ├── Provisional tax           /books/provisional-tax
│   └── Fiscal register           /books/fiscal             [failed]
├── Close the month  ›
│   ├── Checklist                 /books/periods
│   ├── Needs posting             /books/needs-posting      [failed]
│   ├── Rates & revaluation       /books/rates
│   └── Year end                  /books/year-end
├── Ledger  ›                     (accountant)
│   ├── Journals                  /books/journals
│   ├── Trial balance             /books/trial-balance
│   ├── Financial statements      /books/financials
│   ├── General ledger            /books/ledger
│   ├── Chart of accounts         /books/chart
│   ├── Cost centres              /books/cost-centres
│   ├── Posting rules             /books/posting-rules
│   └── Audit trail               /books/audit
└── Settings  ›                   (owner, manager, accountant)
    ├── Tax codes & rules         /books/settings/tax
    ├── Numbering                 /books/settings/numbering
    ├── Locks & periods           /books/settings/locks
    ├── Opening balances          /books/settings/opening-balances
    ├── Set up the books          /books/settings/setup
    ├── Business & tax details    → Management › Company › Money and tax
    ├── Money accounts            → Management › Company › Money accounts
    ├── Approvals & limits        → Management › Company › Approvals
    └── Fiscal device             → Management › Shop › Fiscal device
```

Who sees which level: Settings and Ledger need owner, manager or accountant. A bursar sees Money, Sales and Bank & cash. A shop manager sees Bank & cash. The server refuses on its own; hiding a row is never the check.

### 3.3 Every page, its tabs and what lives on them

Every list follows the shell: finding, toolbar, table, footer with sums and the selection bar (`shell.md`). Every **New…** opens a Books form (`/books/<thing>/new`, or a drawer on the list for short forms). Nothing in Books links to `/accounting` once P1 ships.

**Money** `/books`
- Finding: in this month, owed to you, overdue, what you owe, VAT due by the 15th.
- Sections: where money came from (by module: showroom, invoices, takings, fees); where it went (bills, requisitions, payroll, claims); bank and cash by account and currency, side by side; Needs you (approvals, failed posting, statement lines to match, invoices not "Valid" in FDMS, suppliers missing an ITF263, the next tax date).
- Actions: New invoice (`N`), Record a payment received, Pay a bill, Record spending.

**Sales**

| Page | Tabs (views) | Record page | New |
|---|---|---|---|
| Invoices `/books/invoices` | All, Owed, Overdue, Paid, Drafts, Void | `/books/invoices/[id]`: lines, totals in currency and base, payments, credit notes, fiscal block (QR, verification code, status), posting, history. Actions by state (§4.2) | `/books/invoices/new`: customer, currency (rate shown and frozen at issue), lines with tax code, due date, cost centre, deposit tick |
| Quotes `/books/quotes` | Draft, Sent, Accepted, Expired, Void | `/books/quotes/[id]`: Send, Mark accepted, Make invoice, Revise, Void | `/books/quotes/new`. Same `SalesQuotation` table the CRM writes; the CRM's quote screen and this one show the same rows |
| Payments received `/books/payments` | All, On an invoice, On account, Void | `/books/payments/[id]`: what it paid, the bank line it matched, posting. Actions: Allocate, Refund, Void | `/books/payments/new`: customer (required), account, currency, amount, rate, invoices to allocate to |
| Credit notes `/books/credit-notes` | Credit notes, Write-offs | `/books/credit-notes/[id]`, `/books/write-offs/[id]` | From an invoice (Credit or Write off), or New credit note with the invoice chosen |
| Customers `/books/customers` | All, Owing, By age, On account | `/books/customers/[id]` with tabs Activity, Invoices, Payments, Statement (the full-activity statement: invoices, receipts, credits, write-offs), Details (VAT number, TIN, address, currency) | Drawer: name, contact, VAT number, TIN, address. Shared with the CRM's customers |

`/books/statements` stays as the print view for one or many customers, and prints the full-activity statement (one statement, not two; fix 14).

**Bills & spending**

| Page | Tabs | Record page | New |
|---|---|---|---|
| All spending `/books/expenses` | All, Bills, Requisitions, Claims & petty cash, Till payouts, Payroll, Other. Read-only roll-up of every money-out document from every module, from the core's money-out view (§6, fix 13) | Opens the source document's page | Record spending: a menu (Bill, Claim, Petty cash voucher, Requisition) |
| Bills `/books/bills` | To pay, Overdue, Paid, Drafts, Debit notes, Void | `/books/bills/[id]`: supplier FTI number and date, FDMS check (Valid / not checked / not valid), lines, withholding, payments, the PO and goods receipt it matches | `/books/bills/new` or from a goods receipt |
| Payments made `/books/payments-made` | All, To approve, Paid, Void | `/books/payments-made/[id]`: bills paid, withholding, IMTT, bank line | `/books/payments-made/new`: supplier, bills, account, currency, ITF263 check |
| Purchase orders `/books/orders` | Draft, To approve, Sent, Part received, Received, Closed, Cancelled | `/books/orders/[id]`: lines, receipts against it, bills against it | `/books/orders/new`. Same table as retail's purchase orders (D11) |
| Requisitions `/books/requisitions` | To approve, To pay, To account for, Done, All | `/books/requisitions/[id]`: request, approval, disbursement, receipts, change returned or top-up. One page for CRM and retail requisitions | `/books/requisitions/new` |
| Claims & petty cash `/books/claims` | Claims, Floats, Vouchers | `/books/claims/[id]`, `/books/floats/[id]` (balance, top-ups, vouchers) | New claim; New voucher (from a float) |
| Suppliers `/books/suppliers` | All, Owed, By age, Missing ITF263, Write-offs | `/books/suppliers/[id]` with Activity, Bills, Payments, Statement, Tax (ITF263 number, expiry, VAT number, withholding so far this year) | Drawer |

**Bank & cash**

| Page | Tabs | What lives there |
|---|---|---|
| Accounts `/books/accounts` | Bank, Mobile money, Cash | Every money account, its currency, book balance, last reconciled date. Record page `/books/accounts/[id]`: Transactions, Statement lines, Reconciliations. Actions: Transfer between accounts, Record a bank charge, Upload a statement |
| To match `/books/bank` | To match, Matched, Excluded, Everything | Statement lines and Vane's proposed matches (existing). Accept, Choose, Exclude with a reason, Create (receipt, payment, charge, transfer) from a line |
| Reconciliations `/books/reconciliations` | Open, Closed | One per account per statement period: opening, closing, matched, unmatched, difference. Close, Reopen (owner) |
| Takings `/books/takings` | (retail's End of day) | Unchanged |

**Tax**

| Page | What lives there |
|---|---|
| What's due `/books/tax` | The calendar: VAT 7 return due on the 10th and payment on the 15th; PAYE and 30% withholding return on the 5th and payment on the 10th; QPD dates; each with its amount where known, and the return or payment that settles it. FLAGged dates show the FLAG |
| VAT returns `/books/vat` | Returns by period (existing); the working schedule: output by rate, credit notes, till VAT, input matched to FDMS-valid bills, debit notes, VAT withheld by our customers. Tabs Draft, Reviewed, Finalised, Filed |
| Withholding `/books/withholding` | 30% withheld on suppliers without an ITF263, VAT withheld (when we are an agent), rent and non-resident withholding. Certificates issued and received. The month's return |
| Provisional tax `/books/provisional-tax` | The year's estimate (with the 50/50 currency split where it applies), the four instalments (10, 25, 30, 35%), paid and due |
| Fiscal register `/books/fiscal` | Fiscal days (open, closing, closed, failed), every fiscal tax invoice, credit and debit note with its FDMS status, and the failed ones to retry. Device setup is in Management → Fiscal device, not here (one UI for setup; fix 15) |

**Close the month**

| Page | Tabs | What lives there |
|---|---|---|
| Checklist `/books/periods` | This month, All months | The close checklist (`lib/books/close.ts`), extended in §5.11. Close, Freeze. Reopen (owner) |
| Needs posting `/books/needs-posting` | Failed, Waiting | Integration events that are `FAILED` or `PENDING` over an hour, each with the source document, the reason in plain words and Retry. Owner and accountant can map a missing account from here |
| Rates & revaluation `/books/rates` | Rates, Revaluation | Daily rates by currency and source (RBZ interbank or manual); the month-end revaluation of foreign-currency balances (§5.10) |
| Year end `/books/year-end` | | Year-end checklist, closing entry to retained earnings, the ITF12C reminder |

**Ledger** (accountant)

| Page | Tabs | What lives there |
|---|---|---|
| Journals `/books/journals` | All, Drafts, To approve, Posted, Reversed | Existing page. Reversed reads `reversedAt` (fix 10). New journal form (drawer) |
| Trial balance `/books/trial-balance` | | By month or range, base currency; each account opens its general ledger |
| Financial statements `/books/financials` | Profit and loss, Balance sheet, Cash flow | From `getFinancialStatements`, `getCashFlowReport`; by cost centre and site |
| General ledger `/books/ledger` | | One account's lines with running balance; each line opens its source document |
| Chart of accounts `/books/chart` | | Tree; create, edit, deactivate (never delete an account with lines) |
| Cost centres `/books/cost-centres` | | List, create, edit, deactivate. CRM projects create theirs |
| Posting rules `/books/posting-rules` | Rules, Tender mappings, Readiness | The existing rules editor, explainer and readiness |
| Audit trail `/books/audit` | | `PlatformAuditEvent` rows for Books: voids, revisions, deletes, reopenings, overrides, superuser sessions |

**Settings**: tax codes, categories, templates and rules (`TaxSetupWorkspace`, moved from `/accounting/tax/setup`); numbering (prefix and next number per series; read-only once a number has been issued, except the prefix for the next year); locks and periods (lock policy, freeze date); opening balances; set up the books (the seed pack and readiness). The four rows that point into Management open there.

**Management additions (core, free).** Company → **Money and tax** (new: legal name, VAT number, TIN, VAT category A/B/C/D, base currency, rate source, financial year end); Company → **Money accounts** (new home for bank, mobile and cash accounts and floats); Company → **Approvals** (today's retail approvals page, widened to all money); Company → **Accountant export** (new). Shop → **Fiscal device** stays where it is; it is the only device setup screen.

### 3.4 Migration map

Redirects use `redirect(movedTo(...))` from `lib/books/moved.ts`, keeping the query, as the three existing ones do. `?action=new-*` maps to the new form. `?view=` maps to the matching tab.

| Old address | New home | Behaviour |
|---|---|---|
| `/accounting` (overview) | `/books` | Redirect. The seed pack moves to Settings → Set up the books |
| `/accounting/sales` | `/books/invoices` | Redirect. `?view=customers` → `/books/customers`; `receipts` → `/books/payments`; `credit-notes` → `/books/credit-notes`; `write-offs` → `/books/credit-notes?view=write-offs`; `ar-aging` → `/books/customers?view=by-age`; `statements` → `/books/statements`. `?action=new-invoice` → `/books/invoices/new`; `new-receipt` → `/books/payments/new`; `new-customer`, `new-credit-note`, `new-write-off` → the matching drawer |
| `/accounting/purchases` | `/books/bills` | Redirect. `vendors` → `/books/suppliers`; `payments` → `/books/payments-made`; `debit-notes` → `/books/bills?view=debit-notes`; `write-offs` → `/books/suppliers?view=write-offs`; `ap-aging` → `/books/suppliers?view=by-age`; `statements` → supplier Statement tab. `?action=new-bill` → `/books/bills/new`; `new-payment` → `/books/payments-made/new`; `new-vendor` etc. → drawers |
| `/accounting/receivables` | `/books/customers?view=by-age` | Redirect. The hub's tiles are Money's |
| `/accounting/payables` | `/books/suppliers?view=by-age` | Redirect |
| `/accounting/chart-of-accounts` | `/books/chart` | Redirect. `?action=new-account` (a dead link today) opens the new-account drawer |
| `/accounting/posting-rules` | `/books/posting-rules` | Redirect |
| `/accounting/banking` | `/books/accounts` | Redirect. Manual transactions become Accounts → Record a transaction; reconciliations → `/books/reconciliations` |
| `/accounting/cost-centers` | `/books/cost-centres` | Redirect |
| `/accounting/currency` | `/books/rates` | Redirect |
| `/accounting/fiscalisation` | `/books/fiscal` (register) and Management → Fiscal device (setup) | Redirect to `/books/fiscal`. The config form is dropped: Management's Fiscal device already does it |
| `/accounting/tax/setup` | `/books/settings/tax` | Redirect |
| `/accounting/financial-reports` | `/books/financials` | Redirect. The hub is dropped: it only linked to statements, which now have one page. The reports stay in Reports from Books (`routes.md` §1) |
| `/accounting/financial-statements` | `/books/financials` | Redirect |
| `/accounting/trial-balance` | `/books/trial-balance` | Redirect |
| `/accounting/journals`, `/periods`, `/tax` | unchanged (already redirect) | Keep |
| Books' links out: Money ×3, Invoices, Payments, Expenses "New…", VAT "Tax setup", Periods checklist links | The Books forms and pages above | Replaced in P1 |

**APIs.** `/api/accounting/*` routes stay as the server behind the forms until each is replaced by its `lib/books/core` call, then become thin wrappers. Removed outright:
- `PATCH /api/accounting/sales/invoices/[id]` and `PATCH /api/accounting/purchases/bills/[id]` status changes (fix 4). The routes keep draft edits only.
- `PATCH /api/accounting/periods/[id]` status changes (fix 12).
- The call to `/api/accounting/currency-definitions` in `lib/api.ts:3571` (the route does not exist).

`GET /api/accounting/payment-ledger` gets its screen as the customer and supplier Activity tabs.

**Dropped pages, and why:** the Accounting overview (Money does its job), the Receivables and Payables hubs (their figures are Money's and the aging views'), Financial reports hub (a page of three links), and the fiscalisation config form (duplicate of Management's). Nothing that holds data is dropped.

---

## 4. State machines

### 4.1 The universal rules

Every money document follows one lifecycle:

```
Draft ──issue/post──▶ Issued/Posted ──(part paid)──▶ Part-paid ──▶ Paid
  │                        │
  │ delete (free)          ├── void (mirror entry) ──▶ Void
  ▼                        ├── revise = void + new document (linked) ──▶ Void, superseded
Gone                       └── delete (owner, §2.5) ──▶ Gone, kept in the audit trail
```

1. **Posted things are never edited in place.** No field that reached the ledger, the sub-ledger, the bank or the fiscal device changes after issue. Notes, attachments and the due date are the exceptions: they change freely and are logged.
2. **Edit on a posted document is Revise.** It voids the old one and issues a new one with a new number, `supersedesId` pointing back, and the old one shows "Replaced by INV-0057".
3. **A void posts the mirror** under `void:<id>` with every direction inverted (as `reverse-invoice.ts` and `void-receipt.ts` do), dated today, or the first open day if today's month is closed. The sub-ledger line becomes `VOIDED` in the same transaction. The document keeps `voidedAt`, `voidedById`, `voidReason`.
4. **Issued sales invoices are voided through a full credit note,** not a bare mirror. The credit note is fiscalised when the invoice was. This is what ZIMRA requires, and it puts every reduction of output VAT in one place for the VAT return. Invoices already voided with `void:<id>` keep those entries; the VAT return reads both.
5. **Deleting a draft is free** for anyone who may edit it. Drafts carry no number, so deleting one leaves no gap.
6. **Deleting anything posted is owner only,** within §2.5's limits.
7. **Part-paid and Paid are worked out,** from the balance (`recalcSalesInvoiceBalance`, `recalcPurchaseBillBalance`), never set by hand. No route sets `PAID`.
8. **Numbers are given at issue,** from one gapless series per type (`nextNumber`), never at draft and never random.
9. **Every action writes who and when;** void, revise, delete, reopen and override also write a `PlatformAuditEvent`.

Columns in the tables below: **Ledger** = journal posted; **Sub** = `PaymentLedgerEntry`; **Bank** = `BankTransaction`; **Fiscal** = FDMS; **Stock** = stock movement.

### 4.2 Quotation (`SalesQuotation`)

| From | Action | To | Who | Side effects | Undone by |
|---|---|---|---|---|---|
| – | Create | Draft | anyone with Sales | none | Delete |
| Draft | Send | Sent | same | number given; PDF and WhatsApp/email | Void |
| Sent | Revise | Sent (new revision) | same | old one Void, new number | – |
| Sent | Customer accepts (link) or Mark accepted | Accepted | same; discount over limit needs manager (existing CRM rule) | none | Void (if not yet invoiced) |
| Sent | Valid-until passes | Expired | a daily job (new; today manual only) | none | Re-send as a revision |
| Accepted | Make invoice | Accepted (linked to a draft invoice) | same | draft invoice with the quote's lines | Delete the draft |
| Draft, Sent, Accepted | Void | Void | creator or manager | none | – |

A quote never posts.

### 4.3 Sales invoice (`SalesInvoice`)

| From | Action | To | Who | Side effects | Undone by |
|---|---|---|---|---|---|
| – | Create | Draft | Sales rights | none | Delete (free) |
| Draft | Issue | Issued | Sales rights | number; rate frozen; Ledger `SALES_INVOICE` (Dr receivable, Cr sales, Cr VAT output); Sub receivable; Fiscal FTI; Stock issue for stock lines; CRM deal updated | Void |
| Issued | Payment allocated | Part-paid or Paid (worked out) | – | none on the invoice; the receipt posts | Void the receipt |
| Issued, Part-paid | Credit note issued | the same, balance lower | §4.4 | | Void the credit note |
| Issued, Part-paid | Write off | the same, balance lower; Paid if nothing left | §4.6 | | Void the write-off |
| Issued, Part-paid, Paid | Void | Void | owner or granted | full credit note issued and posted (fiscalised if the invoice was); payments taken off and left on account; Stock returned if the lines were stock; unpaid commission voided | – (re-issue a new invoice) |
| Issued, Part-paid, Paid | Revise | Void (old), Issued (new) | owner or granted | as Void, then a new invoice with `supersedesId`; payments re-allocated to the new one if the customer is the same | Void the new one |
| any | Delete | Gone | Draft: Sales rights. Posted: owner, §2.5 | removes journals, sub-ledger, events; payments stay on account | – |

Writers today that bypass this, and their fix: CRM `createInvoiceForLead` (issued at once, not fiscalised), gold `commodity-billing.ts` (issued or paid, `GOLD_*` posting, no sub-ledger), and the any-status PATCH. All three go through the core's Issue from P1 and P2 (§6).

### 4.4 Credit note (`CreditNote`)

| From | Action | To | Who | Side effects | Undone by |
|---|---|---|---|---|---|
| – | Create (from an invoice) | Draft | Sales rights | none | Delete |
| Draft | Issue | Issued | Sales rights; over `accountOwnerOver`, owner | number; Ledger `SALES_CREDIT_NOTE`; Sub; Fiscal credit note referencing the original FTI, same currency, with a reason (return, price correction, cancellation, discount, bad debt); invoice `creditTotal` up; any excess becomes customer credit | Void (if not fiscalised) |
| Issued | Void | Void | owner or granted; refused if fiscalised | `void:<id>` mirror; Sub voided; invoice balance back up | – |
| Issued (fiscalised) | Undo | – | – | Not voidable. Issue a new invoice (or a fiscal debit note) for the amount | – |

### 4.5 Receipt (payment received, `SalesReceipt`)

| From | Action | To | Who | Side effects | Undone by |
|---|---|---|---|---|---|
| – | Record | Recorded | Sales rights, cashiers, reps (CRM) | number; customer required (D2); currency and rate frozen (D2); Ledger `SALES_RECEIPT` debiting the chosen money account (not always 1010); Sub; Bank transaction | Void |
| Recorded (on account) | Allocate | Recorded (allocated) | Sales rights | invoice balances; Sub line linked to the invoice | Unallocate |
| Recorded | Refund (on-account part) | Recorded, refund linked | manager or accountant, L | a refund payment: Ledger Dr receivable, Cr money account; Bank | Void the refund |
| Recorded | Void | Void | owner or granted; refused while its invoice sits in an open fiscal day (existing) | `void:<id>`; Sub voided; Bank transaction removed and statement line reopened; invoice balance recalculated; CRM copy removed; unpaid commission voided | – |

### 4.6 Write-off (`SalesWriteOff`, `PurchaseWriteOff`)

| From | Action | To | Who | Side effects | Undone by |
|---|---|---|---|---|---|
| – | Write off | Posted | L (owner over `accountOwnerOver`) | Ledger `SALES_WRITE_OFF` (Dr bad debts, Cr receivable); Sub; invoice `writeOffTotal`. For a fiscalised invoice, a fiscal credit note with reason "bad debt" (FLAG: confirm the VAT treatment with an adviser) | Void |
| Posted | Void | Void | owner or granted | `void:<id>`; Sub voided. `WriteOffStatus.VOIDED` is finally written; the hard-delete route goes | – |

### 4.7 Purchase order (`RetailPurchaseOrder`, widened; D11)

| From | Action | To | Who | Side effects | Undone by |
|---|---|---|---|---|---|
| – | Create | Draft | anyone with buying rights | none | Delete |
| Draft | Submit | To approve (over the limit) or Sent | maker | approval snapshot | Withdraw → Draft |
| To approve | Approve | Sent | L, not the maker | `ApprovalAction`; PO sent to supplier | Cancel |
| Sent | Goods received (part) | Part received | buying rights | a goods receipt (below) | Reverse the goods receipt |
| Sent, Part received | Goods received (all) | Received | same | same | same |
| Received | Close | Closed | same | none | Reopen (manager) |
| Draft, To approve, Sent | Cancel | Cancelled | maker or manager | none | – |

A PO is a commitment and never posts.

**Goods receipt** (`RetailGoodsReceipt`): Counted → Post → Posted (Ledger: Dr stock or expense, Cr **goods received, not billed** (new account 2010); Stock in; a draft bill is created from it, D12) → Reverse → Reversed (mirror; stock out; the draft bill is deleted, or refused if the bill is already recorded).

### 4.8 Bill (supplier invoice, `PurchaseBill`)

| From | Action | To | Who | Side effects | Undone by |
|---|---|---|---|---|---|
| – | Create (by hand or from a goods receipt) | Draft | buying rights | none | Delete |
| Draft | Record | Recorded (`RECEIVED`) | buying rights; over `paymentOwnerOver`, owner approves first | supplier FTI number and date required when the supplier is VAT-registered; FDMS check status stored (D16); rate frozen; Ledger `PURCHASE_BILL` (Dr expense or goods-received-not-billed, Dr VAT input only if the FTI is valid, Cr payable); Sub payable | Void |
| Recorded | Payment | Part-paid or Paid (worked out) | – | | Void the payment |
| Recorded | Debit note | balance lower | §4.9 | | Void the debit note |
| Recorded, Part-paid, Paid | Void | Void | owner or granted | `void:<id>`; Sub voided (fixed: today the line stays `POSTED`, fix 3); payments taken off and left as supplier credit | – |
| Recorded, Part-paid, Paid | Revise | Void (old), Recorded (new) | owner or granted | as Void, then a new bill with `supersedesId`; payments re-allocated | Void the new one |
| any | Delete | Gone | Draft: buying rights. Posted: owner, §2.5 | | – |

### 4.9 Debit note (`DebitNote`)

Draft → Issue → Issued (Ledger `PURCHASE_DEBIT_NOTE`, Sub, bill balance lower; reference the supplier's credit note number, since TaRMS matches debit notes received) → Void → Void (`void:<id>`, Sub voided, fix 3). Who: buying rights to issue, owner or granted to void.

### 4.10 Supplier payment (payment made, `PurchasePayment`)

| From | Action | To | Who | Side effects | Undone by |
|---|---|---|---|---|---|
| – | Create | Draft (D5) | buying rights | ITF263 check: none on file and year-to-date payments to this supplier ≥ US$1,000 (FLAG on the threshold) → 30% withholding line proposed | Delete |
| Draft | Submit | To approve (over the limit) or Approved | maker | approval snapshot | Withdraw |
| To approve | Approve | Approved | L, not the maker | `ApprovalAction` | Reject → Draft |
| Approved | Pay | Paid | L; not the approver where §2.4 applies | number; Ledger `PURCHASE_PAYMENT` (Dr payable gross; Cr money account net; Cr withholding payable 2180 (new) for the 30%; Dr bank charges and IMTT 6xxx, Cr money account for the IMTT line); Sub; Bank transaction; withholding certificate drafted | Void |
| Paid | Void | Void | owner or granted | `void:<id>`; Sub voided; Bank transaction removed and statement line reopened; bill balance recalculated; certificate voided | – |

Retail's supplier payments (`RETAIL_SUPPLIER_PAYMENT`, written as paid by `lib/retail/buying/posting.ts`) become this document with status Paid, posted as `PURCHASE_PAYMENT` so they get a payables line (fix 1).

### 4.11 Requisition (`CrmRequisition`, CRM and retail as one)

| From | Action | To | Who | Side effects | Undone by |
|---|---|---|---|---|---|
| – | Create | Draft | anyone, for themselves | none | Delete |
| Draft | Submit | Submitted | requester | limit and approver snapshot (retail does this today; the CRM starts) | Cancel |
| Submitted | Approve | Approved | L, not the requester; over `requisitionOwnerOver`, owner | `ApprovalAction` (D9) | Cancel |
| Submitted | Reject | Rejected | same | reason kept | – |
| Approved | Disburse | Disbursed | L; not the requester; not the approver where §2.4 applies | Ledger: Dr cash advances 1150 (new account), Cr the chosen money account (not fixed 1010). Retail order requisitions keep their supplier-advance accounts (`EVENT_ACCOUNT`). Bank transaction | Reverse disbursement (owner or granted): `void:<id>` → Approved |
| Disbursed | Account for (acquit) | Acquitted | the requester or a disburser; waiving receipts needs approve rights | Ledger: Dr each receipt's expense category (5500–5590), Dr VAT input where a valid FTI is attached, Cr 1150 for the spend; change returned: Dr money account, Cr 1150; over-spend top-up: Dr 1150, Cr money account | Reopen (owner or granted): mirror of the acquittal → Disbursed |
| Draft, Submitted, Approved | Cancel | Cancelled | requester or approver | none | – |

Posting through the advance account is new: today's seeded rule debits the expense at disbursement. The advance account means a requisition's money shows as "with staff, not yet accounted for" until receipts come in, which is how an imprest works.

### 4.12 Expense claim and petty cash

**Claim** (`ExpenseClaim`, new, D13): what someone spent from their own pocket. The CRM cost tracker's spends with no requisition become the lines of a claim when the day's log is submitted.

| From | Action | To | Who | Side effects | Undone by |
|---|---|---|---|---|---|
| – | Create, or submit a cost-tracker day | Draft → Submitted | the spender | none | Withdraw |
| Submitted | Approve | Approved | L, not the spender | Ledger: Dr each line's expense category, Dr VAT input where a valid FTI is attached, Cr staff claims payable 2190 (new) | Reject (before approve); Void after (owner or granted) |
| Approved | Reimburse | Paid | L, not the spender | Ledger Dr 2190, Cr money account; Bank | Void the reimbursement |

**Float and voucher.** A float is a money account of kind `CASH` with an imprest amount (D13). A voucher spends from it: Draft → Approve (the float holder's manager; under a small limit the holder alone) → Posted (Dr expense, Cr the float account) → Void (mirror). **Top up** is a transfer from a bank account to the float for the amount spent since the last top-up, so the float returns to its imprest.

Retail's till payouts and petty cash (`RetailCashMovement`, `RETAIL_PETTY_CASH`) already post; they are listed under All spending and keep their retail screens.

### 4.13 Bank transaction, statement line and reconciliation

| Thing | From | Action | To | Who | Side effects |
|---|---|---|---|---|---|
| Bank transaction | – | Created by a receipt, payment, transfer, charge, takings banked or disbursement | Recorded | the source's rights | none of its own; the source posts |
| | Recorded | Included in a closed reconciliation | Reconciled | – | locked: its source can't be voided until the reconciliation is reopened |
| | Recorded | Its source is voided | Gone | – | – |
| Statement line | – | Upload or feed | To match | Bank rights | none |
| | To match | Accept match, or Create a document from it | Matched | Bank rights | links `matchedTransactionId`; a created document posts |
| | Matched | Unmatch | To match | Bank rights; refused in a closed reconciliation | link removed |
| | To match | Exclude, with a reason | Excluded (new, D15) | Bank rights | none |
| Reconciliation | – | Start (account, statement end date and balance) | Open | Bank rights | none |
| | Open | Close (difference 0.00, no lines to match up to the end date) | Closed | manager or accountant | locks its lines and transactions |
| | Closed | Reopen | Open | owner | unlocks |
| | Open | Void | Void | owner | unlinks; for a reconciliation started in error |

A manual bank transaction (the old `/accounting/banking` form) becomes a document of its own, **Bank entry** (charge, interest, transfer, other), which posts `BANK_TRANSACTION` and is voided like any other.

### 4.14 Manual journal (`JournalEntry`, `MANUAL`)

| From | Action | To | Who | Side effects | Undone by |
|---|---|---|---|---|---|
| – | Create | Draft | accountant, manager, owner | none | Delete |
| Draft | Post | Posted | same; over the journal limit (D10), To approve first | number; Ledger | Reverse |
| Draft | Submit | To approve | maker | | Withdraw |
| To approve | Approve and post | Posted | another person with journal rights | Ledger | Reverse |
| Posted | Reverse | Posted, reversed | accountant, manager, owner | mirror with `reversalOfEntryId`, original stamped `reversedAt` (existing `reverseJournalEntry`) | Post a new journal |

System journals (from documents) can't be reversed here; they are undone from their document. The Reversed tab reads `reversedAt` (fix 10).

### 4.15 Period (`AccountingPeriod`)

| From | Action | To | Who | Side effects |
|---|---|---|---|---|
| – | First posting in a month | Open | – | `ensurePeriodForDate` |
| Open | Close (checklist passes or each failure is acknowledged) | Closed | owner, manager, accountant | `PeriodCloseVoucher`; posting refused or allowed per lock policy |
| Closed | Reopen, with reason | Open | owner | voucher; audit |
| any | Freeze before a date | – | owner | hard lock before that date, also checked when the month is open (fix: `freezeBeforeDate` is only read for closed months today) |
| Year's last month closed | Year-end close | – | owner or accountant | closing entry to retained earnings |

### 4.16 VAT return (`VatReturn`)

| From | Action | To | Who | Side effects |
|---|---|---|---|---|
| – | Create for a period | Draft | accountant, manager, owner | lines gathered (§5.10) |
| Draft | Refresh | Draft | same | lines gathered again |
| Draft | Review | Reviewed | another person, where two exist | |
| Reviewed | Finalise | Finalised | manager or owner | figures locked; its documents can't be deleted |
| Finalised | File (TaRMS reference and date) | Filed | same | |
| Filed | Pay | Filed, paid | pay rights | a payment to ZIMRA clearing VAT payable; Bank |
| Draft, Reviewed, Finalised | Void | Void | owner | unlocks the documents (`VOIDED` is in the map; a route is added) |
| Filed | Amend | a new return for the same period, linked | owner | FLAG: how TaRMS takes amendments is not confirmed |

### 4.17 Fiscal day (`FiscalDay`)

| From | Action | To | Who | Side effects |
|---|---|---|---|---|
| – | Open | Opened | owner, manager, shop manager, accountant (existing) | device day open |
| Opened | Sign documents | Opened | – | each `FiscalReceipt` signed and chained |
| Opened | Close | Closing | same | `claimFiscalDayClosing` |
| Closing | Device accepts | Closed | – | Z report |
| Closing | Device fails | Closing, with the error | – | shows on Fiscal register and Money's Needs you; Retry |

**Fiscal receipt** (`FiscalReceipt`): Pending → Success, or Failed → Retry (`fiscal-drain.ts`). A failed one blocks the month's close. `VOIDED` is not used for fiscalised documents: they are only ever credited.

### 4.18 Payroll posting (consumer)

People and payroll own their screens. Their money posts through the core.

| Payroll event | Core action | Ledger |
|---|---|---|
| Run approved (`PayrollRun` → `POSTED`) | `postMoney(PAYROLL_RUN)` | Dr 5200/5210 wages and employer costs; Cr 2100 net pay, 2110 PAYE, 2130 AIDS levy, 2120 NSSA, 2140 ZIMDEF, 2160 SDF, 2150 NEC, 2170 other |
| Disbursement batch paid | `postMoney(PAYROLL_DISBURSEMENT)` | Dr 2100, Cr money account; Bank; IMTT line |
| Statutory paid (PAYE, NSSA, ZIMDEF, SDF) | a supplier payment to ZIMRA, NSSA or ZIMDEF as suppliers | Dr 2110/2120/2140/2160, Cr money account |
| Run reversed (in payroll) | `voidMoney(PAYROLL_RUN)` | mirror |

Books never edits or deletes a pay run. The gate `hasEnabledFeature(accounting.core)` in `postPayrollRun` goes (§1.1).

### 4.19 Retail takings and day close (consumer)

| Retail event | Core action |
|---|---|
| Sale, refund, void | `postMoney(RETAIL_SALE / REFUND / VOID)` at base amounts per tender (existing) |
| Shift open, variance, close, recovery | `postMoney(SHIFT_*)` (existing) |
| Day close banked | `postMoney(RETAIL_DAY_BANKED)` plus a Bank transaction, which Books → To match then matches to the statement |
| Petty cash, payouts, laybys, vouchers | existing postings; laybys and on-account sales gain sub-ledger lines (P4) |

Retail's own end-of-day screen is the place to correct takings; Books shows them.

---

## 5. Workflows

Each workflow names the screens, the states, what posts and how a mistake is undone.

### 5.1 Selling

**Quote → invoice → receipt → statement.**
1. Sales → Quotes → New quote. Draft, then Send (number, PDF, WhatsApp). Nothing posts.
2. The customer accepts by link, or someone marks it Accepted. Make invoice opens a draft invoice with the quote's lines.
3. Check the customer's VAT number and TIN (mandatory on FDMS invoices since 31 May 2025 when the buyer is registered). Issue. The invoice gets its number, the rate is frozen, it posts, and it is fiscalised. The fiscal block shows the QR and verification code. If the device is down, the invoice is issued and the fiscal status shows Pending; Retry is on the Fiscal register.
4. Money arrives. Either record it (Sales → Payments received → New, allocate to the invoice) or match the bank line (Bank & cash → To match → Create receipt). The invoice becomes Part-paid or Paid.
5. Overdue: Invoices → Overdue → select → Send reminders; or print statements.

Mistake: wrong quote → revise or void it (nothing posted). Wrong invoice → §5.12.

**Cash sale (not through a till).** Invoices → New, tick "Paid now", choose the account. One action issues the invoice and records the receipt. Two documents, both voidable.

**Deposit on a job.** Invoices → New with "Deposit" ticked (the CRM's `isDeposit`) for the agreed amount. It is a full fiscal tax invoice for that amount (FLAG: time of supply on deposits; confirm with an adviser). The final invoice is for the balance and names the deposit invoice. A deposit received with no invoice yet is recorded as a payment on account and allocated later.

**Credit note.** From the invoice → Credit → choose lines or an amount, and a reason. Issue (posted, fiscalised with a reference to the original). Undo: void if not fiscalised; otherwise a new invoice.

**Write-off.** From the invoice or Customers → By age → Write off the balance, with a reason. Over `accountOwnerOver`, the owner approves. Undo: void the write-off.

### 5.2 Buying

1. **Requisition** (Bills & spending → Requisitions → New), for goods or services, with the amount and supplier if known. Submit.
2. **Approval** by someone other than the requester; over `requisitionOwnerOver`, the owner. WhatsApp and the app ask, as retail does.
3. **Purchase order** from the approved requisition (or directly). Send to the supplier.
4. **Goods received.** Count against the PO. Post the goods receipt: stock in (where it is a stock item), Dr stock, Cr goods received not billed. A draft bill is created.
5. **Bill.** When the supplier's fiscal tax invoice arrives, open the draft bill, enter the FTI number and date, and check it on FDMS (the check status is stored; "not checked" is allowed but flagged, and VAT input is claimed only once it is Valid). Record. Over `paymentOwnerOver`, approve first.
6. **Payment.** Payments made → New, choose the bills. The app checks the supplier's ITF263: none on file, or expired, and payments this year at or over US$1,000 (FLAG) → a 30% withholding line is added, and the payment is net. Approve (not the maker), then Pay. Posts the payment, the withholding payable and the IMTT line. The withholding certificate is drafted; the month's withholding return is due by the 5th, payment by the 10th.
7. **VAT withholding agents.** If our customer is a VAT withholding agent, the receipt we get is short by a third of the VAT. Record the receipt with "VAT withheld by the customer" and the certificate number: Dr VAT withheld receivable (new account 1170), which the VAT return claims. If we are an agent ourselves (a setting in Money and tax), our payments to suppliers withhold a third of the VAT the same way, to VAT withheld payable.

Undo: a requisition or PO before money moves → cancel. A goods receipt → reverse. A bill → void or revise. A payment → void (the bank line reopens).

### 5.3 CRM money

All of this posts through the core from P2. The CRM's screens stay; Books lists the same rows.

**Requisitions.**
- *Disburse:* Approved → Disburse, choose the money account. Posts Dr cash advances, Cr that account.
- *Account for (acquit):* the requester attaches receipts from the cost tracker or a photo; each line has a category. Posts each line to its expense, clears the advance.
- *Change returned (refund):* the unspent amount comes back. Dr money account, Cr cash advances.
- *Top-up:* spent more than given. Dr cash advances, Cr money account, then cleared by the acquittal.
- The CRM's requisition list and actions filter by `siteId` (null for CRM) so they no longer act on retail's requisitions (fix in §6). Books' Requisitions shows both, with a Source column.

**Cost tracker.**
- *Spent, from a requisition:* a line of that requisition's acquittal. Posts with the acquittal.
- *Spent, own pocket:* becomes a claim line when the day is submitted (§4.12).
- *Spent, from a float:* a petty cash voucher.
- *Money received* (cash taken from a customer on site): must name the invoice or customer. It records a receipt (`SALES_RECEIPT`) into the person's cash float, so the cash is "with the rep" until banked. Today it has no rule on purpose; the gap the CRM finance page shows (`receiptGaps`) closes.
- *Deleting an entry* in a submitted day is refused; before submit it removes the draft. After posting, void the document it fed.

**Commission** (`CrmCommissionEntry`).

| From | Action | To | Who | Ledger |
|---|---|---|---|---|
| Pending | Approve | Approved | `commissions.manage`, not the earner | Dr commission expense, Cr commission payable 2195 (new) |
| Approved | Pay | Paid | pay rights, not the earner | Dr 2195, Cr money account; or added to the next pay run, where payroll clears it |
| Pending, Approved | Void | Void | `commissions.manage` | mirror of the approval, if posted |
| Paid | Void | – | refused; pay it back as a deduction or a receipt | |

The any-to-any status change and REOPEN go.

**Project cost.** A CRM project's cost comes from the ledger: journal lines carrying its cost centre (`CrmProject.costCenterId`). Every CRM posting (invoice, receipt, requisition, claim, commission) passes the project's cost centre when the document names a project or a deal on one. `projectCostSummary` reads lines, not requisitions and cost entries. Committed (approved, not disbursed) requisitions show separately as "committed".

### 5.4 Petty cash and expenses

1. The owner sets up a float in Management → Money accounts: name, holder, currency, imprest (for example US$200).
2. The holder spends and records a voucher with the slip (photo). Under the small limit it posts at once; over it, the manager approves.
3. When the float runs low, Top up: the app works out the amount spent since the last top-up and proposes a transfer from the bank to the float. Approve and post.
4. Month end: count the float. A difference posts as a variance, with a reason, approved by the manager.

Claims (own pocket): submit → approve → reimburse, §4.12. Undo: void the voucher or the claim; a reimbursement is voided like a payment.

### 5.5 Retail into Books

| Retail does | Books shows | Gap closed |
|---|---|---|
| Sales, refunds, shifts (post today) | Money, All spending (payouts), Takings | none |
| Day close banked (posts, with a bank transaction) | Bank & cash → To match pairs it with the statement | none |
| Supplier payments | Payments made, with a payables line | today they post with no sub-ledger line (fix 1) |
| Goods receipts | a draft bill per receipt, under Bills | today no bill (fix 1) |
| Requisition payouts | Requisitions (Source: Retail) | today only a bank transaction in Books |
| On-account sales, laybys, vouchers | customer balances in the sub-ledger | today their own balances only (P4) |

### 5.6 Stock and maintenance

- **Stock valuation.** Movements already post (`STOCK_RECEIPT`, `ISSUE`, `ADJUSTMENT`, `TRANSFER`, `RETAIL_STOCK_ADJUSTMENT`, `OPENING_STOCK`). Inventory adjustments that are captured `PENDING` today post through the drain. An adjustment over `adjustmentPinOver` or a count difference over `countOwnerOver` needs approval first (existing limits).
- **Work order completion.** On Completed, `MAINTENANCE_COMPLETION` posts parts and labour: Dr maintenance expense (by asset's cost centre), Cr stock (parts issued) and Cr accrued labour or the supplier bill. Status changes move no money and use `recordEvent`. Reopening a completed work order voids its completion posting.
- **Gold.** Purchases and buyer receipts post now. Dispatches, shift allocations and corrections post through the drain (today `PENDING` until replay). Settlement payments get a posting (`PAYROLL_DISBURSEMENT` as the schema intends). Gold's commodity billing creates its invoices and bills through the core's Issue (§6).
- **Schools.** Fee documents keep posting with `SCHOOL_FEE_*` and gain sub-ledger lines so a guardian's balance and Books' aging agree. Fees are VAT exempt.

### 5.7 Payroll into Books (consumer)

1. Payroll approves a run. The core posts `PAYROLL_RUN` in base currency (existing).
2. Books → Money shows wages in Where it went; Tax → What's due shows PAYE and the 30% withholding on the 5th/10th, NSSA, ZIMDEF, SDF with their amounts from the run.
3. Disbursement batch paid: clears net pay. Each employee leg on a bank or wallet carries IMTT, posted as a bank charge.
4. Statutory payments: Bills & spending → Payments made to ZIMRA, NSSA or ZIMDEF (suppliers seeded on setup), clearing the payables.
5. A wrong run is reversed in Payroll; the core posts the mirror. Books has no edit on pay runs. FLAG: the PAYE table in the statutory pack is 2025's.

### 5.8 Bank and cash

1. **Statements in.** Upload a CSV per account (CBZ weekly, per `reports-and-books.md`; no feeds yet). Lines land in To match.
2. **Match.** Vane proposes matches (existing). Accept one, many, or "Accept Vane's 3"; or Choose; or Create a receipt, payment, bank charge or transfer from the line; or Exclude with a reason.
3. **IMTT.** Lines the matcher recognises as IMTT (`lib/books/matching.ts:100`) or bank charges are proposed as a **Bank entry** (charge) to the IMTT account. Rates for the record: 2% on USD, 1.5% on ZWG from 1 Jan 2026, flat US$10,150 over US$500,000. The app records what the bank charged; it does not compute IMTT on our side, except as the proposed line on a payment.
4. **Reconcile.** Bank & cash → Reconciliations → Start, enter the statement's closing date and balance. The page shows book balance, matched, unmatched, difference. Close when the difference is 0.00. One per account per statement; reopening is owner only.
5. Every receipt and payment that names a money account creates its bank transaction (fix 6), so the book balance equals opening + transactions, and equals the ledger.

### 5.9 A multi-currency day

1. Morning: the rate for today is fetched from the RBZ interbank feed (`RBZ_RATE_URL`) or entered by hand; Rates shows source and time. With no rate for today, the latest earlier one applies and Money says so.
2. A ZWG invoice is issued: the document keeps ZWG amounts, the rate and its source, and posts in base currency (USD) at that rate (D3). The invoice shows both.
3. A USD receipt pays a ZWG invoice: the receipt keeps USD and its rate; the allocation converts at the receipt's rate; the difference posts as realised exchange gain or loss.
4. Reports are in base currency; aging and statements also show each currency on its own.
5. Month end: Close the month → Rates & revaluation revalues open foreign-currency receivables, payables and money accounts at the month-end rate, posting unrealised gain or loss, reversed on the first day of the next month.
6. Taxes are paid in the currency of trade, except income tax (PN 34/2026). The VAT return shows output and input by currency (today it sums all currencies together).
7. FLAG: functional currency is an IAS 21 judgement; base currency is a setting, defaulting to USD, and changing it after the first posting is refused.

### 5.10 VAT

1. Tax → What's due shows the next VAT return (Category A odd months, B even months, C monthly, D as set) with the return due on the **10th** and payment on the **15th** of the following month (SI 81 of 2025; FLAG: ZIMRA's web pages still say the 25th).
2. VAT returns → New for the period. The return gathers:
   - output VAT from issued sales invoices, **less credit notes**;
   - output VAT from **till sales** (retail) and any other source posting to 2200;
   - input VAT from recorded bills **whose FTI is Valid on FDMS**, less debit notes;
   - input VAT from claims, requisition receipts and petty cash with a valid FTI;
   - VAT withheld by customers (a credit) and by us as an agent;
   - school fees as exempt.
3. A tie-out line compares the return with the 2200 and 2210 balances for the period. A difference blocks Finalise until explained.
4. Review (a second person where there is one), Finalise, File with the TaRMS reference, Pay (the payment clears VAT payable).
5. Rate change: documents keep the rate at their time of supply (15% before 2026, 15.5% from 1 Jan 2026), from `TaxCode` effective dates.

Undo: refresh a draft; void a draft, reviewed or finalised return (owner); filed → amend (FLAG).

### 5.11 Month end, year end, QPDs

**Close the month checklist** (each item green, or acknowledged with a reason by the owner):
1. Nothing in Needs posting (no `FAILED`, no `PENDING` over an hour).
2. No fiscal receipt failed; no fiscal day stuck in Closing.
3. Every money account reconciled to a statement dated on or after the month end.
4. Floats counted.
5. Requisitions disbursed more than 30 days ago and not accounted for: listed.
6. Bills with an FTI not yet checked on FDMS: listed.
7. Draft invoices and bills older than the month: listed.
8. Rates for the month end present; revaluation posted.
9. Payroll for the month posted.
10. VAT return for the period (if one ends this month) in Draft or later, tied out.
11. Trial balance balances.

Close posts the voucher. The owner reopens with a reason.

**Year end:** the December close plus the closing entry to retained earnings, the year's export for the accountant, and the ITF12C reminder (due 30 Apr the next year).

**QPDs:** Tax → Provisional tax holds the estimate and the four instalments (10%, 25%, 30%, 35%). Reminders go two weeks and two days before each date. FLAG: payment dates differ between notices (25 Mar / 25 Jun / 25 Sep / 20 Dec in one calendar, 20 Jun in another table); the setting holds the dates so they can be corrected without a release.

### 5.12 Fixing mistakes

| Mistake | What the person does | What happens |
|---|---|---|
| Wrong amount on an issued invoice | Invoice → Revise (owner or granted), with a reason | A full credit note voids the old one (fiscalised if it was), a new invoice is issued with the right amount and `supersedesId`; payments move to the new one. If only part was overcharged, Credit for the difference instead |
| Wrong customer on an issued invoice | Invoice → Revise, choose the right customer | Same as above. Payments stay with the customer who paid, on account; the app asks whether to move them |
| Duplicate receipt | Payments received → the duplicate → Void, reason "duplicate" | Mirror posted; bank transaction removed; statement line reopened; invoice balance back |
| Payment to the wrong supplier | Payments made → Void, then pay the right supplier. If the money really went to the wrong supplier, keep it and record it as a supplier credit to recover | Mirror posted; bill balance back; bank line reopened |
| Wrong account on a manual journal | Journal → Reverse, then a new journal | Mirror with `reversalOfEntryId`; both visible |
| Wrong account on a document's posting | Fix the rule or mapping in Posting rules; then Revise the document (or, for an accountant, a correcting journal with a note) | Old posting mirrored; new posting with the right account |
| Posted in the wrong month (month still open) | Revise with the right date | Old one voided in its month, new one in the right month |
| Posted in the wrong month (month closed) | The owner reopens the month, revises, closes again; or posts a correcting entry in the current month with a note | Voucher and audit for the reopen |
| A whole batch wrong (an import, a day's receipts) | Select the batch on its list → Void (bulk), one reason for all | Each row voided on its own; results list voided and skipped, with why |
| Test data to purge | Owner: select rows → Delete permanently (bulk), type "delete" and the count | Each row deleted under §2.5. Fiscalised rows are refused unless the device is in test mode. Snapshot kept in the audit trail |
| Wrong rate on a document | Revise with the right rate | Old voided, new posted at the right rate |
| Bill recorded twice | Void the second | Mirror; payable down |

### 5.13 Mass actions

**One pattern.** The list's row selection (`components/ui/data-table.tsx`, `rowSelection.bulkActions` → `DataTableFloatingActions`) shows the actions this person may take. The server does each row on its own and answers with **done, unchanged, skipped (with why), not found**, as `applyRecordBulk` (`lib/crm/registers/server/bulk.ts`) and retail's bulk routes (`app/api/v2/retail/buying/requisitions/bulk/*`) do. Up to 500 rows. A void or delete takes one reason for all. The result stays on screen with each skipped row and its reason, and links to retry.

| List | Bulk actions | Who |
|---|---|---|
| Invoices | Issue drafts, Send, Send reminders, Print statements, Export, Void, Delete drafts, Delete (posted) | Issue, send, delete drafts: Sales rights. Void: owner or granted. Delete posted: owner |
| Quotes | Send, Void, Delete drafts, Export | Sales rights |
| Payments received | Allocate to oldest invoices, Export, Void | Allocate: Sales rights. Void: owner or granted |
| Credit notes | Issue drafts, Export, Void | Sales rights; void owner or granted |
| Customers | Print statements, Send statements, Reassign (rep), Export, Archive | Sales rights; archive manager |
| Bills | Record drafts, Approve, Pay (makes one payment per supplier), Export, Void, Delete drafts | Approve, pay: L. Void: owner or granted |
| Payments made | Approve, Pay, Export, Void | L; void owner or granted |
| Purchase orders | Approve, Send, Cancel, Export | L for approve |
| Requisitions | Approve, Reject, Disburse, Export | L; never one's own (skipped with why) |
| Claims & vouchers | Approve, Reimburse, Export | L; never one's own |
| To match (bank) | Accept, Exclude | Bank rights |
| Journals | Post drafts, Reverse, Export | accountant, manager, owner |
| Needs posting | Retry | owner, accountant |
| Any list | Delete permanently (test data) | owner |

New bulk endpoints are `POST /api/books/core/<document>/bulk/<action>` (new), one per action, each calling the same single-row core function in a loop inside its own transaction per row.

---

## 6. One standard: the fixes

### 6.1 The top 15 inconsistencies (`inventory.md`)

| # | Today | Fix | Phase |
|---|---|---|---|
| 1 | Retail buying creates no bill or payables line | Goods receipts create draft bills (Dr goods received not billed); supplier payments post as `PURCHASE_PAYMENT` with a payables line; requisition payouts show in Requisitions | P2 |
| 2 | Sub-ledger syncs only on a successful post; aging mixes sources | `postMoney` syncs the sub-ledger in the same transaction as the post; a backfill writes missing lines; aging and balances read the sub-ledger only, and a nightly check compares it with document balances and lists differences in Needs posting | P1 |
| 3 | Accounting-side voids leave ledger rows `POSTED` | All voids go through `voidMoney`, which marks the sub-ledger line `VOIDED`; `buildLedgerSeed` handles `void:` ids; a backfill fixes existing rows | P1 |
| 4 | Invoice and bill PATCH allow any status jump | Status changes only through core actions; PATCH keeps draft edits | P1 |
| 5 | `SalesReceipt` has no customer | Add `customerId` (D2); the receipt form requires it; backfill from `PaymentLedgerEntry.partyId` and audit events | P1 |
| 6 | Receipts and payments create no bank transaction | `postMoney` creates the bank transaction when a money account is named; backfill for past rows | P1 |
| 7 | Every Books "New…" opens `/accounting` | Books forms for invoice, receipt, bill, payment, customer, supplier, credit note, write-off; the rest in P2–P5; then redirects | P1 |
| 8 | VAT return ignores credit/debit notes, till VAT, fees | The return reads credit and debit notes, retail VAT and every 2200/2210 source, with the tie-out line | P3 |
| 9 | Several invoice writers with different side effects | CRM, gold and Books all call the core's Issue (numbered, posted, fiscalised, sub-ledger) | P1 (CRM), P2 (gold) |
| 10 | Journals' Reversed/Voided tabs read an unused status | Tabs read `reversedAt`; Voided tab dropped | P1 |
| 11 | Three undo styles; supplier payments can't be voided | One style: mirror for void, Revise for edit, owner delete under §2.5. Write-off DELETE and the delete-of-fiscalised path go. Supplier payment void added | P1 (sales), P2 (purchases) |
| 12 | Ungated period PATCH | Status change removed from the PATCH | P1 |
| 13 | Money's in/out disagree with Payments and Expenses | One core read for money in (all receipts, linked or not, plus takings and fees) and money out (all payments and payouts), used by Money, Payments received, Payments made and All spending | P1 |
| 14 | Two statements, two agings | One statement (full activity) and one aging (sub-ledger), used by Books, the CRM and reports | P3 |
| 15 | Two reconciliation models; reconciliations never close; two fiscal UIs | One model: statement lines + bank transactions + reconciliations that close (§4.13). Fiscal setup only in Management; Books shows the register | P3 |

### 6.2 The bypasses (`money-flows.md`)

| # | Bypass | Fix | Phase |
|---|---|---|---|
| 1 | CRM requisitions captured `IGNORED` | `postMoney` with the advance-account rules; backfill re-queues | P1 (stop IGNORED), P2 (rules) |
| 2 | Cost-tracker spends `IGNORED`; received cash has no rule; delete undoes nothing | Claims and acquittal lines post; received cash records a receipt into the rep's float; delete after submit refused | P2 |
| 3 | Commission is status flips | Approve and pay post (§5.3); guarded transitions | P2 |
| 4 | Project cost from requisitions and cost entries | Read from cost-centre journal lines | P2 |
| 5 | CRM collections, daily reports, finance page are side records | Kept as read-only views; the finance page reads the core's money in/out | P2 |
| 6 | CRM invoices not fiscalised, no cost centre; receipts always debit 1010 | Core Issue fiscalises; cost centre from the project; receipt debits the chosen account | P1 |
| 7 | Gold settlement payments don't post | Post as `PAYROLL_DISBURSEMENT` | P2 |
| 8 | `PENDING` events wait for a manual replay | One drain for every source type, every 15 minutes | P1 |
| 9 | Gold pours and maintenance status changes have no money | `recordEvent` (no amount); completion posts | P2 |
| 10 | Retail on-account sales, laybys and vouchers keep their own balances | Sub-ledger lines for on-account sales and laybys; vouchers as a liability account, listed | P4 |
| 11 | School fees have no sub-ledger lines and no Books screen | Sub-ledger lines; fees listed under Sales with Source: Schools | P4 |
| 12 | No currency conversion for sales, purchases, CRM; no IMTT; no withholding | Frozen rate and base amounts (D3, D4); IMTT bank entries; supplier withholding | P3 |
| 13 | Two paths hard-delete posted journals | Only owner delete under §2.5; write-off DELETE removed | P1 |
| – | CRM requisition routes act on retail requisitions | Filter `siteId: null` in the CRM routes | P1 |
| – | CRM requisitions read no limit; approver can disburse | Same limits and maker-checker as retail (§2.4) | P2 |
| – | Random invoice and receipt numbers (`INV-yyyymmdd-hhmm-rnd`, `REC-…`, `PAY-…`) | `nextNumber` gapless series per type, given at issue; existing numbers kept | P1 |

---

## 7. Data changes to propose

All of these **need owner approval** before they are built, each with its migration, a witness test and, for new tables, the lines from `pnpm vane:reader-sql`.

| # | Change | Why | Risk | Backfill |
|---|---|---|---|---|
| D1 | Feature keys: `books.screens` (new, paid); `accounting.core` made default-on, unbillable and not switchable; sub-keys depend on `books.screens` | The core/screens split (§1) | Gates move; a workspace with `accounting.core` today must get `books.screens` so nothing disappears | Grant `books.screens` to every workspace that has `accounting.core` enabled now |
| D2 | `SalesReceipt.customerId`, `currency`, `exchangeRate`, `baseAmount` | Receipts have no owner and no currency (fix 5) | Nullable at first; required in forms | `customerId` from `PaymentLedgerEntry.partyId`, then the invoice's customer, then the audit event; currency from the invoice or the bank account; rate from `CurrencyRate` on the date |
| D3 | `exchangeRate`, `rateSource`, `baseTotal` on `SalesInvoice`, `SalesQuotation`, `CreditNote`, `PurchaseBill`, `DebitNote`, `PurchasePayment`, `CrmRequisition`, `CrmDailyCostEntry`, `ExpenseClaim` | Freeze the rate on every document; post in base | Posting changes for non-base documents | Rate on the document date; base documents get 1 |
| D4 | `JournalLine.currency`, `amountInCurrency`, `exchangeRate` (nullable) | Keep the original currency next to the base amount, for revaluation and per-currency reports | Larger lines; reports must keep using base debit/credit | Null for past lines, or filled from the source document where it has one |
| D5 | `PurchasePayment.status` (DRAFT, TO_APPROVE, APPROVED, PAID, VOIDED), `voidedAt`, `voidedById`, `voidReason`, `approvedById` | Supplier payments need approval and void (§4.10) | Retail writes payments directly; default `PAID` keeps it working | All existing rows `PAID` |
| D6 | `PurchaseBill.voidedAt`, `voidedById`, `voidReason`; same on `CreditNote`, `DebitNote`, `SalesWriteOff`, `PurchaseWriteOff` | One void convention with who and why | None | From audit events where they exist |
| D7 | `supersedesId` on `SalesInvoice`, `SalesQuotation`, `PurchaseBill`, `CreditNote` (self-relation); the CRM's in-place `revision` becomes a new document | Revise = void + new document, linked (§4.1) | The CRM edit flow changes; `salesInvoicePostingKey` revisions stay readable for history | None; past revisions stay as they are |
| D8 | Numbering: invoice, receipt, bill, payment, credit note, debit note, write-off, requisition, claim, voucher, journal in `ReservableIdEntity`; drafts carry no number (`invoiceNumber` nullable while Draft) | Gapless serial numbers given at issue | Unique constraints must allow null drafts | Existing numbers kept; counters start after the highest |
| D9 | `ApprovalTargetType`: `REQUISITION`, `PURCHASE_ORDER`, `PURCHASE_BILL`, `SUPPLIER_PAYMENT`, `EXPENSE_CLAIM`, `PETTY_CASH_VOUCHER`, `WRITE_OFF`, `CREDIT_NOTE`, `MANUAL_JOURNAL`, `COMMISSION`, `VAT_RETURN` | One approvals table for "what did this person approve" | Enum additions go through a script (`prisma db push` cannot reach this database, per the schema note) | None |
| D10 | `RetailApprovalSettings.paymentOwnerOver`, `journalSecondOver`, `voucherHolderUnder` | Limits for bills and payments, journals and floats | The table name says retail; it becomes the company's money limits | Defaults (US$500, US$1,000, US$20 as placeholders) |
| D11 | `RetailPurchaseOrder` (and lines): `siteId` optional, service lines without a stock item | One PO table for retail and everyone else | Retail code assumes a site | None |
| D12 | `PurchaseBill.goodsReceiptId`, `purchaseOrderId`; account 2010 Goods received, not billed | The three-way match; retail goods receipts create draft bills | Retail's goods-receipt posting changes its credit account | For posted goods receipts with no bill: create draft bills, flagged for review; no ledger change to past months |
| D13 | `ExpenseClaim` and `ExpenseClaimLine` (new); `BankAccount.isFloat`, `imprestAmount`, `holderId`; `PettyCashVoucher` (new) | Claims and floats (§4.12) | New tables | Cost-tracker spends with no requisition since the last close become submitted claims, flagged for review |
| D14 | `AccountingIntegrationEvent`: re-queue money events written `IGNORED` | They never posted (§1.1) | Old months: posting into closed periods | Re-queue as `PENDING` dated on their source date; those in closed months go to Needs posting for the owner to post in the current month or reopen |
| D15 | `BankStatementLine.excludedAt`, `excludedById`, `excludeReason`; `BankReconciliation.statementEndDate`, `statementBalance`, `closedAt`, `closedById` | Exclude lines; close reconciliations | None | Existing OPEN reconciliations stay open |
| D16 | `PurchaseBill.supplierFtiNumber`, `fdmsStatus` (NOT_CHECKED, VALID, NOT_VALID), `fdmsCheckedAt` | Input VAT only from valid FTIs | Manual check until ZIMRA offers a lookup API (FLAG) | `NOT_CHECKED` |
| D17 | `Vendor.itf263Number`, `itf263ExpiresAt`, `isVatWithholdingAgent`; `Customer.isVatWithholdingAgent`; `PurchasePayment.withholdingAmount`, `withholdingType`, `certificateNo`; accounts 2180 Withholding payable, 1170 VAT withheld receivable, 2185 VAT withheld payable, 1150 Cash advances, 2190 Staff claims payable, 2195 Commission payable, an IMTT expense account | Withholding, IMTT, advances, claims, commission | New accounts must not clash with tenants' own codes; seed only where free | Seed into every chart through `ensureAccountingDefaults` |
| D18 | `FiscalisationProviderConfig.isTestDevice` | Test-data purge of documents signed on ZIMRA's test environment | Must never be on for a live device | Off |
| D19 | `CrmCommissionEntry` transitions guarded; `approvedById`, `paidById`, `journalEntryId` | Commission posts | Existing PAID rows have no posting | Post approved-unpaid ones in the current month; leave paid history as is, listed |
| D20 | `JournalEntry.approvedById`, status `TO_APPROVE` used for manual journals over the limit | Journal maker-checker | None | None |

Not proposed: a new workspace role for "superuser" (Sign in as covers it), and moving money columns from `Float` to `Decimal` (worth doing, but a separate migration with its own risk).

---

## 8. Phases

Each phase ships behind the existing pages until its exit test passes; redirects land in the phase that builds the destination.

**P1. The core and the sales side.**
- `lib/books/core` facade (`postMoney`, `voidMoney`, `recordEvent`, `rateFor`, `nextNumber`, `fiscalise`, `canDo`).
- Stop `IGNORED` for money; the 15-minute drain for every source type; Needs posting page; D14 backfill.
- Sub-ledger synced in the post's transaction; bank transaction on every receipt and payment; backfills (fixes 2, 3, 5, 6).
- Books forms: invoice, receipt, credit note, write-off, customer; bill, supplier payment and supplier as forms over today's logic (approval comes in P2).
- Status PATCH removed for invoices, bills, periods; CRM invoices issued through the core (fiscalised, cost centre, chosen bank account).
- Gapless numbering (D8); Journals tabs on `reversedAt`; Money's in/out from one read.
- `canDo` on every Books and Accounting write route; reopen owner only.
- Delete refuses fiscalised documents; write-off DELETE replaced by void.
- Redirects: `/accounting/sales`, `/accounting/receivables`.
- **Exit test:** in a fresh workspace, a CRM requisition disbursed, a CRM invoice issued, a receipt recorded with a bank account, and a retail sale each produce a posted journal, a sub-ledger line where there is a party, and a bank transaction where money moved; no money event is `IGNORED`; Money, Payments received and the trial balance agree to the cent; no Books button opens `/accounting`.

**P2. Buying and CRM money.**
- Requisitions unified (CRM and retail), limits and maker-checker, advance-account posting, acquittal, refund, top-up.
- Purchase orders (D11), goods receipt → draft bill (D12), bill FTI fields (D16), supplier payment approval and void (D5).
- Claims and petty cash (D13); cost tracker wired; commission posting (D19); project cost from the ledger.
- Gold invoices and bills through the core; gold settlement payments posted.
- Approvals in `ApprovalAction` (D9, D10).
- Redirects: `/accounting/purchases`, `/accounting/payables`.
- **Exit test:** a CRM requisition goes Draft → Acquitted with change returned, and the trial balance shows the expense by category and zero in cash advances; a retail goods receipt produces a draft bill, the bill and its payment show in Bills, Payments made and supplier aging, and supplier aging equals the payables control account; an approver cannot approve their own requisition, and a request over the limit waits for the owner.

**P3. Bank, currency and tax.**
- Accounts page, statement lines with Exclude, reconciliations that close (D15); bank entries; IMTT.
- Frozen rates and base posting (D3, D4); rates page; month-end revaluation; realised gain and loss.
- VAT return reads every source with the tie-out; What's due calendar; withholding (D17); provisional tax.
- Fiscal credit notes and debit notes (the issuer `fiscalisation.ts` lacks today); Fiscal register; fiscal setup only in Management.
- One statement and one aging.
- Redirects: `/accounting/banking`, `/accounting/currency`, `/accounting/fiscalisation`, `/accounting/tax/setup`.
- **Exit test:** a month with USD and ZWG invoices, a USD receipt against a ZWG invoice, an IMTT charge and a supplier paid with 30% withheld closes with every account reconciled, the VAT return equal to the movement on 2200 and 2210, and the revaluation posted and reversed on the 1st; voiding a fiscalised invoice sends a fiscal credit note referencing the original.

**P4. Mass actions and undo everywhere.**
- Bulk endpoints per §5.13 and selection on every list; results with skipped-and-why.
- Revise on invoices, bills, quotes, credit notes (D7); void on every posted document; owner permanent delete with the §2.5 rules; test-device purge (D18).
- The "May void and revise" grant (§2.3).
- Retail on-account, layby and school-fee sub-ledger lines.
- **Exit test:** 200 invoices selected, mixed drafts, issued and fiscalised: Void as a granted accountant voids the issued ones through credit notes and skips drafts and refused rows with reasons; Delete permanently as owner removes drafts and non-fiscalised posted rows in open months and refuses the rest; the audit trail holds one event per row; the trial balance stays balanced throughout.

**P5. Accountant tools and the last redirects.**
- Ledger level: trial balance, financial statements, general ledger, chart of accounts, cost centres, posting rules, audit trail, all at `/books/*`.
- Settings level; Management's Money and tax, Money accounts, Approvals and Accountant export.
- The screens gate (`books.screens`, D1) and the upsell state; the payroll-only seam removed.
- Remaining redirects; the `/accounting` shell and tab config retired.
- **Exit test:** no page under `/accounting` renders (every address redirects); a workspace without `books.screens` posts a pay run and a CRM requisition, sees the upsell state at `/books`, and downloads an accountant export whose trial balance equals the one a workspace with the screens shows for the same data.

---

## 9. Open questions for the owner

1. **The price and boundary of the screens.** Is `books.screens` one add-on, or split (for example Sales and Bank in a lower tier, Ledger and Tax in a higher one)? What does it cost? (`open.md` has CRM, Tender, Payroll and Stock prices only.)
2. **Granting void and revise.** Is the per-person grant in §2.3 acceptable, or must void and revise stay with owners and superusers only, with no exceptions?
3. **Permanent delete of posted, non-fiscalised documents.** We allow it in open months only, keeping a snapshot in the audit trail. ZIMRA asks for six years of records. Are you comfortable with that, or should posted documents only ever be voided, with delete limited to drafts and test data?
4. **Where the ledger starts for workspaces that never had Books.** Post their history back to their first day (from the re-queued events, some into closed months), or start the ledger at a cut-over date with opening balances?
5. **ZIMRA items still FLAGged:** the US$1,000 threshold for 30% withholding in 2026; QPD payment dates; how a filed VAT return is amended in TaRMS; VAT on bad-debt write-offs; time of supply on deposits; whether a voided fiscal invoice must always be a credit note (we assume yes). Who is the tax adviser who confirms these?
6. **Base currency.** USD for everyone by default, with ZWG-functional workspaces choosing ZWG at setup. Do any current customers report in ZWG?
7. **Reopening a month.** Today managers can; this plan makes it owner only. Agree?
