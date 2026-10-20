# Money and Sales: build against the boards

Branch `books-polish-money-and-sales`. Each section: what the build had, what the board says, what this branch does.

## General

- The old design/core-modules Books fixtures (`app/design/books-money`, `books-invoices`, `books-vane`, `components/books/money-view.tsx`, `invoices-view.tsx`, their fixture data) are gone: design/books supersedes them.
- Rams `quick_review` could not run: the workspace has used its review credits.

## bk-money → `/books`

- **Build**: the core-modules board (month in two sentences, a tax strip, Needs you as rows with buttons, "Where it came from / went", a bank table with a column per currency, a right rail "Owed to you / You owe").
- **Board**: the finding on one 20px line; three columns (Needs you as 36px counted rows; Bank and cash with icon, Reconciled, Balance in the base currency and the rate foot; Coming up as dated lines to a date with its foot); Came in and Went out with share bars; Owed to you by age (age bar and legend) and You owe. Inside 1440 x 900 without a scroll.
- **Done**: rebuilt to the board (`lib/books/money-board.ts`, `money-board-view.ts`, `components/books/bk-money-view.tsx`). The tax strip is dropped (the board has none; tax dates appear in Coming up). App bar: Payment received (R), Pay a bill (P), Record spending (E, a menu: bill, claim, petty cash voucher, requisition), New invoice (N).
- Needs you rows and their Books addresses: Overdue invoices `/books/invoices?view=overdue`; Requisitions to approve `/books/requisitions?view=to-approve` (was `/crm/requisitions`); Bill over your limit `/books/bills?view=drafts` (draft bills over the owner's payment limit); Bank lines to match `/books/bank`; Failed to post `/books/needs-posting`; Not signed by FDMS `/books/fiscal?tab=failed`; Supplier without an ITF263 `/books/suppliers?view=missing-itf263`; Cash with reps, not banked `/books/accounts`; Claim to reimburse `/books/claims`. A row shows only when something waits; the head counts rows, as the board does.
- "A won deal has no invoice" (`lib/books/money.ts`, still read by the world seed) now opens `/books/invoices/new?deal=<id>`.
- Went out splits the core's one "payouts" flow into Requisitions, Claims, Petty cash and Commission with the same `MONEY_OUT_WHERE` rules, so the total is the core's.
- **Model readings to note** (no model change made):
  - "Cash with reps, not banked" is read as cash accounts that are not a float and were never reconciled. There is no "held by a rep" flag on a money account other than a float's holder. Proposal: mark a money account as a rep's site cash (`holderId` without `isFloat`) so this row is exact.
  - You owe's "NSSA and ZIMDEF" row is not built: the tax calendar (`whatsDue`) carries ZIMRA dates only. "ZIMRA, VAT and PAYE" shows only when What's due knows an amount. Staff claims approved and unpaid are added as their own row.
- **Phone (bk-p-money)**: at under 760px `/books` draws the owner's phone board: the month in one line, the five Needs you rows the board keeps, Bank and cash with each non-cash account in its own currency and "Cash, N floats", This week (the coming week's first four lines), New invoice at the foot.

## bk-invoices → `/books/invoices`

- **Build**: a finding, tabs, Customer and Currency chips, an issued-period filter, six columns (Invoice, Customer, State, When, Total, Balance), the kit's table and foot; Statements in the app bar.
- **Board**: no finding; tabs; Customer, Due and Source filters; Number, Customer, Issued, Due, State, FDMS, Total USD, Balance, Note; totals ("10 of 142", total, balance); pager; selection: Send reminders (S), Print statements, Export, Void.
- **Done**: rebuilt on Worksheet. `InvoiceRow` gains issued, due, fdms and note; the query drops currency and the issued period for `due` (any, this week, this month, next month) and `source` (Books, CRM: an invoice with a CRM document). The Overdue tab is `view=overdue` (what the lead's `/crm/collections` forward uses). Selection only with the Books screens (`useBooksPlan().bulk`). Issue drafts, Delete drafts and Delete permanently stay in More beside the board's four.
- **Left**: the board's Import button (no invoice import exists; it would be a new feature) and the Filters, Group and Columns tools (no function behind them yet). Statements are reached from a selection and from the customer.
