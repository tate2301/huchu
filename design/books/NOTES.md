# Books polish: notes

Branch `books/money-and-sales`. Money and Sales, built against the handover designs. Findings first, then what changed, then what waits for a yes.

## Where the build differed from the design

- Money: the build had a tax strip, two share lists, a bank table with a footer and a right rail. The data had no age buckets and no Coming up. The layout is now: finding, Needs you and Coming up on the left, Bank and cash and You owe in an aside on the right, Owed to you by age across, Came in and Went out as a pair. The tax strip is gone (its date is a Needs you row). No table footers; ZWG balances show in the base currency with the rate in the head.
- Invoices list: seven columns became the design's ten (Number, Customer, Issued, Due, State, FDMS, Total, Balance, Note). The page's app bar carries the title and New invoice only, as `ListFrame` does; Statements moved to the toolbar.
- Invoice record: Details duplicated the header and is gone. An overdue invoice gets The chase, and Send a reminder (S) becomes the primary.
- New invoice: no right sidebar, no section captions, no "on file" reassurance. Totals sit under the lines. Only the missing VAT or TIN warning stays.
- Quotes, Payments received, Credit notes, Customers: columns, tabs and toolbars follow the design. Payments received Record a payment is now on R, as drawn.
- Customers: Delete (owner and outside accountant, as for anything posted) and Archive (anyone who may write invoices). A customer with invoices, payments, quotes, CRM records, shop sales, vouchers, laybys or points entries cannot be deleted; the refusal says what holds them and Archive is the way forward.

## Model proposals waiting for a yes

1. Reminder log. No log of reminders is kept, so The chase can only say what the invoice itself knows (issued, fell due, how late) and what is next. A log (invoice, channel, sent at, sent by, delivered, read) would let it show "Sent on WhatsApp, 10 Sep" and "Opened, 11 Sep".
2. Allocate an on-account payment to an invoice. The design's Allocate button needs an operation with an audit event. Not built.
3. A sales rep on Customer (`repId`). Rep is read today from the linked CRM client's owner; a customer without one shows "—".
4. A link from SalesReceipt to its BankTransaction, instead of finding it through sourceType and sourceId.
5. Server totals per age column on Customers, so the totals row is right across pages.
6. Stored "how" detail on a payment ("Cash, on site").

## Not done, on purpose

- Import on Invoices: the design draws none, so none is built.
- Draft quote Next ("Kuda measured 212.40 m² on Tuesday") and the Deposit marker on an invoice: no data behind them.

## What was checked

Typecheck passes for the whole project. Vitest, eslint and a production build were not run: the sandbox cannot run them against this checkout (macOS-only native modules; eslint over the whole tree times out). No screen has been looked at in a browser yet.

## Customer record and lists (21 Oct)

- Customer record bar: Print statement, Record a payment (R), and Send statement (S) as the primary. Print statement downloads a PDF made on the server (`/api/books/customers/[id]/statement`, `lib/books/statement-pdf.ts`, the same renderer as invoices); it never prints the open page. New invoice, Their payments, Archive and Delete are in the menu.
- Customers export now carries the table's columns (code, rep, the four age columns, on account, owes, last paid).
- Group and Columns on Invoices, Quotes, Payments received, Customers and every Bills & spending list, from one `useBkLayout` hook in `bk-list.tsx`. Hidden columns are remembered per person in the browser; groups work on the page shown.

## Bills & spending (21 Oct): where the build differed

- Columns, tabs, chips and toolbars on All spending, Bills, Payments made, Purchase orders, Requisitions, Claims & petty cash and Suppliers followed an older board; they now follow the handover.
- Posting: one heading, "Posting", with its entries or nothing. A record that should have posted and has not shows one warning, "Not posted yet.", with Needs posting. Earlier builds put a heading over a block heading over a state, and a paragraph explaining Needs posting. Design `bk-bill` carried "When it's recorded / Posting / Not posted yet" and is changed the same way.
- Pay bills is key P (was "Pay suppliers" on N). New voucher is key V. Record spending is key E.
- Payments made had no record page: built (`/books/payments-made/[id]`) with the approval chain, withholding and IMTT lines, and the rights from `decideApproval` and `decidePayment`.
- Bill record: the over-the-limit warning, the four facts, Lines with sums, one Posting section.
- Requisition record: Receipts replace Slips; Account for it is the primary once paid out.

### Gating to check

`/books/payments-made` and `/api/books/payments-made` sit behind `accounting.ap` in `route-registry.ts`. Paying a bill is free in every workspace, so this looks wrong. Not changed.

### Model proposals waiting for a yes (Bills & spending)

7. An awaiting-approval status on bills. A bill over the limit waiting for the owner is a Draft today, so it lists under Drafts, not To pay.
8. An account on bill lines (the design's Account column shows an em dash).
9. A document number on till payouts.
10. Store IMTT and withholding on the payment when it is submitted, so paid rows stop being recomputed from today's settings. The design posts IMTT to 6930; the build uses 5465.
11. A supplier and a fiscal tax invoice status on requisition receipts; receipt VAT is not stored.
12. A float type and a "cash not banked" concept (Kuda's band and Bank it in Claims & petty cash).
13. Orders lost bulk send, approve, cancel and close from the list with the select column (the design has none); they remain on the order.
14. Bulk approve on claims was removed with the claims selection bar (the design draws none). Say if you want it back.

### Not done

- The CRM requisitions list (`bk-x-crm-reqs`) is on a different register component; matching it needs bulk approve in the CRM API.
- GRN record screen (`bk-x-retail-grn`) does not exist: Retail deliveries is a list only.
- Floats tab does not show the vouchers table beneath the bands; the voucher form lacks the float-holds subtitle and the under-$20 banner.
- Posting previews on unposted bills and payments need account data the build does not hold.
- Phone screens `bk-p-approve` and `bk-p-voucher` only had small fixes.

### What was checked

Typechecked file by file (a whole-project `tsc` runs out of memory in this VM, and the Prisma client inside it is older than `schema.prisma`, so enum and field errors on `lib/` and some status lookups in `components/` are false). Nothing in `components/` or `app/` fails beyond those. vitest, eslint and a production build were not run. No screen has been looked at in a browser. Tests for the changed row shapes were updated by reading, not by running.

## Close the month and Ledger (21 Oct)

Both are Accounting advanced ($99). Rows are 32px. Addresses were left where the build has them (`/books/periods`, `/books/rates`, `/books/journals`, `/books/trial-balance`, `/books/financials`, `/books/ledger`, `/books/chart`, `/books/posting-rules`, `/books/audit`); the design's are under `/books/close/...` and `/books/ledger/...`.

### Where the build differed, now changed
- Close: "Close September 2026" with the primary on Ctrl Enter, failed checks first as full-width bands each with its action, a closed month showing its period voucher and Reopen, All months as a dense table. Needs posting lost its toolbar, panel and footer; the fix sits on the row (map and post, post in the next month, retry), Retry all on R. Rates opens on Revaluation with Revalue (V) as the primary.
- Journals, trial balance, statements, general ledger, chart, posting rules, audit trail: columns, tabs, chips and toolbars follow the handover; journals carry `can` from the server so staff accountants never see Reverse; undo screens (void, revise, delete refused, bulk delete and result) use the design's words, keys and refusals with the way forward.

### Gating and rights to check
- `period.reopen` and `period.freeze` messages in `can-do.ts` say "only the owner"; the spec lets the outside accountant reopen too.
- `/api/books/close` has no `guardBooks`; `POST` and `DELETE` on `/api/books/journals/[id]` ignore the refusal from `guardBooks("view")`.
- `/books/audit` and `/api/books/audit` fall under `accounting.core`, not advanced; `/books/ledger` uses `accounting.financial-statements`.

### Model proposals waiting for a yes
15. An acknowledgement record per close blocker (reason, who, when); Acknowledge is not built without it.
16. A float count record (the design's "Floats counted" check).
17. A "last weekday's rate" source on weekend rates; a fiscal failure reason (for example device offline).
18. A site or branch on journal lines (Statements Site chip); a recurring flag on journals; journal numbers as JNL- (the build writes JE-).
19. A persisted bulk job with Done, Unchanged, Skipped and Refused outcomes; `undoChoices` returning total, entry number, next number, fiscal-pending state and per-rule delete checks.

### Not done
- Trial balance Compare chip, general ledger cost centre chip: no data.
- Revise stays a dialog and reads "Void and revise".
- Close checks Fix it and Retry link to Needs posting and Fiscal instead of acting in place.

### What was checked
Typecheck of the changed screens only, filtered for the stale Prisma client; the undo and chart screens passed against shimmed lib types. vitest, eslint, build and a browser look were not done. `undo-ui.test.ts`, `close.test.ts` and `needs-posting.test.ts` were written or changed by reading, not run.
