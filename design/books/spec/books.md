# Books: the model

Books handles every dollar in a Corelith workspace. The core runs in every workspace from the first day, free, and posts every sale, payment, payout and pay run from every module. The screens at `/books` are what customers pay for. An owner can run Books without an accounting degree, and it can be handed to an accountant.

## Tiers

| Tier | Price | What it holds |
|---|---|---|
| Core | Free, every workspace, always on | Ledger and posting engine; documents, their states and numbers; void, revise and delete with the audit trail; money accounts and who owes whom; the Books pieces inside CRM, Retail, Payroll and Reports; the accountant export and setup in Management |
| Books screens | $10 a month | Money, Sales, Bills & spending, Bank & cash, Settings |
| Accounting advanced | The $99 plan only | Tax, Close the month, Ledger |

- With no Books screens, `/books` shows `bk-x-noscreens` ("Add Books, $10 a month"). The core keeps posting.
- On the $10 screens, the advanced levels show in the panel with "$99" and open `bk-x-advanced` ("Move to the $99 plan").
- The server checks the plan on every advanced route and API, the same way it checks roles. The panel showing a lock is not the check.

## Roles

Who may do what is in `permissions.json`. In short:

| Role | Person in the fixtures | Rights |
|---|---|---|
| Owner | James Nyabadza | Everything, including permanent delete, revise and reopening a month |
| Outside accountant | Chipo Marange, Marange & Associates (auditors) | The owner's rights in Books until the access end date (31 Mar 2027 in the fixture). Every act is marked as hers |
| Manager | Tonde Chuma | Approves, pays and closes within limits ($500). Can't void, revise, delete posted documents or reopen a month |
| Accountant (staff) | Tsitsi Ndoro | Issues, posts journals, reconciles, prepares VAT. Approves within a limit, never her own. Never voids, revises or deletes anything posted |
| Shop manager | Rudo Mapfumo | Day close, banking, retail requisitions within the limit |
| Rep or fitter | Kuda Maposa, Farai Dube, Tinashe Moyo | Drafts, receipts on site, requisitions and claims for themselves |
| Superuser | Sekai Mutema at Corelith | Signed in as the owner in change mode. Every destructive act carries the session number (SA-214) |

The outside accountant is a kind of user (Management, People: Staff or Outside accountant, with firm and access end date), not a grant per person. The old per-person void grant is gone.

## The lifecycle

Every money document: **Draft, Issued (or Posted), Part paid, Paid**. Part paid and Paid are worked out from the balance, never set by hand. Numbers come from a gapless series at issue, never at draft.

Approval documents (requisitions, POs, bills over a limit, claims, payments): **Draft, Submitted, To approve, Approved, Disbursed, Acquitted**.

Posted things never change in place:

| Act | Who | What happens |
|---|---|---|
| Delete a draft | Anyone who may edit it | Gone. No number was given, so no gap |
| Void | Owner, outside accountant, superuser | Posts the mirror, dated in an open month. A sales invoice voids through a full credit note (`bk-void`) |
| Revise | Same | Void plus a new document with a new number. The old one reads "Replaced by INV-0143" (`bk-revise`) |
| Delete posted | Same, with a typed confirmation and a reason | Removes the document, its lines, every entry it posted and its sub-ledger lines, as if never posted. A full copy stays in the audit trail. The number is never reused (`bk-delete-permanent`) |

Delete posted is refused, with the reason and the way forward on screen (`bk-delete-refused`), when the document is fiscalised, sits in a closed month, sits in a filed return, or is in a closed reconciliation. Bulk acts run row by row with the same checks and report Done, Unchanged, Skipped and Refused (`bk-bulk-result`).

## Rules that hold everywhere

Built into the core, so no module can skip them:

1. **Nobody approves their own request.** Requisitions, POs, bills, claims, payments, write-offs, journals over the limit.
2. **The approver doesn't also pay**, where two or more people have pay rights. A one-person shop may; the audit says so.
3. **Over the limit, the owner approves.** Limits and the approver are snapshotted when it's submitted.
4. **Nothing money-bearing is ignored.** An event with no posting rule fails with a reason and lands in Needs posting. Failed events block the close.
5. **Rates freeze on the document.** ZWG documents keep ZWG and post in USD at the frozen rate.
6. **Fiscalised means credit, never delete.** ZIMRA holds the fiscal record. Corrections are fiscal credit or debit notes with a reason.
7. **A document keeps the tax rate in force on its date of supply** (15% to 31 Dec 2025, 15.5% from 1 Jan 2026).

## Months and locks

- Closing a month posts the period voucher (`PCV-2026-08`) and stops posting into it. The checklist (`bk-close`) shows failures first; each blocker is fixed or acknowledged by the owner with a reason.
- Setting in `bk-set-locks`: after a month is closed, managers may post into it with a reason, or nobody may. Posts after closing are counted on the month.
- A freeze date (1 Jan 2026 in the fixture) stops every change before it, open month or not. Set by the owner or the outside accountant.
- Reopening a month: owner or outside accountant, with a reason (see `open.md`).

## Density

From the owner's brief, after Matthew Ström-Awn's talk "Dense by design" (Config 2026): density is what a person gets done per minute and per pixel.

- Money answers "am I all right, and what needs me" inside 1440 x 900 without a scroll.
- The finding is one 20px line. Cents are muted (`.amt i`). Currency is named once in the column head. A state is a dot and a word.
- Owner's path (Money, Sales, Bills & spending, Bank & cash): 40px rows. Accountant's path (Tax, Close the month, Ledger): `.wt.dense`, 32px rows with codes.
- Needs-you rows are 36px: a label, a count, a way in.
- Records open beside the list first. Every primary action has a key; J and K move; selection works on every list.
- Waits: under 1s nothing; 1 to 10s a spinner; over 10s a count ("38 of 61 lines"); over a minute, let them leave and notify.
- **One line per row.** A cell's second fact (a role under a name, a base amount under a ZWG one) sits on the same line, muted, after the first; long text truncates. Rows never grow to two lines.
- **The UI never explains itself.** No helper lines, notes, descriptions or reassurance on app screens. Only warnings and refusals appear, one line each, with their action at the end. Name things correctly and use the right icon instead.
- **Icons on everything a person scans for**: every panel row, page title, primary action, Needs you row and account (`icons.md`).
- **Edge to edge.** No inset cards, no gutters, nothing centred. Rail blocks, facts, totals, trays and notes are full-width bands split by hairlines. The worksheet container has no padding and no gap and stretches its children.
