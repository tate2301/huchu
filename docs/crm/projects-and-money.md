# Projects, requisitions and the daily log

Money the business hands out, and the work it is handed out for.

Shipped 22 Sep 2026 (PR #173), from James's email of the same day. These live
in the CRM and **post into** accounting; they are not a second set of books.

---

## Why projects exist

The pipeline ran lead → qualified → … → raise job, and stopped. A job
(`CrmWorkOrder`) is a crew, a date and a checklist — the right shape for a
morning's work and the wrong shape for a six-week floor, because cost attached
to nothing.

`CrmProject` is what a won deal turns into, and what its jobs belong to. The
chain is **deal → project → jobs**:

- **Every project belongs to a deal.** `CrmProject.dealId` is required
  (migration `20260926090000_crm_project_requires_deal`, which stops and names
  any project without one rather than inventing a deal for it), and deleting
  a deal that has a project is refused (`RESTRICT`). The deal is the first of
  a project's properties.
- A won deal's next step is **Start the project** (`resolveNextStep` in
  `lib/crm/tones.ts`). The dialog asks for a name, an owner, a budget and two
  dates; `projectFromDeal` carries the deal's name, client, site and owner
  across. The deal's value is not copied — the project reads it from the deal
  as the reference its budget is set against ("Sold for").
- **One project per deal**, enforced by a unique on `(companyId, dealId)`.
  A second start is answered with the project the deal already has
  (`created: false`), including a concurrent double-tap's unique violation,
  and the dialog says so and goes there.
- **The job holds the link** (`CrmWorkOrder.projectId`), so a project holds
  any number of jobs. A job raised with a `projectId` inherits the project's
  deal, client and site wherever the request left them blank
  (`jobLinksFromProject`); naming a different deal is refused.
- **Every new job names its deal** — the deal is what the job is invoiced
  against. The route refuses one without a deal or a project, and a job
  raised against a deal that has a project goes into that project, taking
  the deal's customer and site (`projectOfDeal`). The raise-a-job dialog asks
  for the deal first and says which project the job will land in; the
  project is never a second question. A job's deal can be changed but not
  cleared. Jobs raised before this rule may still have no deal: the Deal
  property is first on the job's page, in red, until one is picked.
- A job whose deal has no project stands alone. What is gone is raising a
  project *from* a job — the old `CrmProject.workOrderId` link, which let a
  project hold exactly one job.
- **The team** is `CrmProjectMember` (free-text role). `managerId` stays the one
  owner answerable for the budget; the owner or a manager changes the team,
  the budget and the status (`canEditRecord`).

The register's **New project** asks which deal first, offering the open and
won deals that have no project yet, won ones first.

The project page (`components/crm/money/project-detail-content.tsx`) is the
standard record page: properties edited in place, sections in the rail with
the open one in the URL, and one primary action, **Raise a job**. Overview is
the costs and a schedule of the jobs by date between the start and the target
end; then Jobs, Requisitions, Spend, Team, Files and History (field changes,
written as names and days rather than ids). Each section's own verb — *Ask
for money*, *Add spend*, *Add someone* — sits on that section's heading and
opens a dialog (`RecordDialog`); *Raise a job* is the page's, so the Jobs
section does not draw it a second time.

### Statuses

`PLANNING` → `ACTIVE` → `COMPLETED`, with `ON_HOLD` alongside and `CANCELLED`
terminal. A completed project **can** be reopened — unlike a completed job,
which carries a signature against a particular day's work. A project is a
container, and a snag list arriving a fortnight later is the same project.

### The cost rollup

Four numbers, and they are **never summed for the reader**:

| | What it answers |
| --- | --- |
| `approved` | Approved and not yet paid — the claim on this week's bank balance |
| `outstanding` | Paid out and not yet accounted for — somebody is holding this |
| `spent` | Accounted for against the work, from the daily logs |
| `remaining` | Budget minus spent. Null when nobody has set a budget |

Commit 200 to somebody and then have them spend it and the project has cost
**one** 200. A page showing 400 would have people cancelling work that is
inside its budget. `lib/crm/project-accounting.test.ts` pins exactly that case.

`budgetOverrun` returns null when there is no budget, rather than pretending
zero — a project nobody has budgeted is not over budget by its whole cost.

Requisitions are read row by row rather than with `aggregate`, because a cut
approval means the payable figure is `approvedAmount ?? amount`. A rule
expressed once in TypeScript and again in SQL is a rule that will drift.

## Requisitions

> "requisition can be for fuel or airtime and it cannot be for a specific
> project - so we can build around that" — James

`projectId` is **nullable** on `CrmRequisition` and `CrmDailyCostEntry`, and
that is the whole design. `NOT NULL` would either block those requests or
invent a fictional attribution, and a fictional attribution makes every
project's cost figure wrong.

`UNPROJECTED_CATEGORIES` (`FUEL`, `AIRTIME`) exists only to stop the form
asking — never to forbid a project. A tank of diesel burned entirely on one
site is legitimately that site's cost, and somebody who says so should be
believed.

### Three checkpoints, kept apart

| | |
| --- | --- |
| `APPROVED` | Somebody with authority said yes |
| `DISBURSED` | The money actually left. A different day, usually a different person |
| `ACQUITTED` | Somebody accounted for what it went on |

Collapse the first two and you cannot answer *"what is approved but not yet
paid"*, which decides whether there is enough in the account this week.
Collapse the last two and outstanding floats become invisible.

```
DRAFT ──→ SUBMITTED ──→ APPROVED ──→ DISBURSED ──→ ACQUITTED
  │           │  └──→ REJECTED           (terminal)  (terminal)
  └───────────┴──→ CANCELLED (terminal)
```

Cancellation is available up to the moment of payment and not after: the way
back from a disbursement is an acquittal.

`outstandingFloat` goes negative when somebody spent their own money. That is
real and worth saying out loud rather than rounding away.

### Reporting and accounting for it

The requisition's own page (`/crm/requisitions/[id]`, which the approval and
payment notifications link to) names its four steps with the one it is
waiting on marked, and offers **one** move — the one this viewer may make next: *Send for approval*,
*Approve or decline*, *Mark paid*, or *Account for it*.

Once the money is approved or paid out, the requester **reports what they
spent**, a line at a time, each with a photo of its receipt. The lines go
through the same door as every other line of field money (see *One ledger*
below), carrying the requisition and its project. Reporting opens at
`APPROVED` as well as `DISBURSED`, because cash handed over on the spot is
spent before anybody presses *Mark paid*; accounting for it still waits for the
payment to be recorded.

**The acquittal is the report.** *Account for it* sets `acquittedAmount` to
the sum of the spend lines (`decideAcquittal` in `lib/crm/requisitions.ts`);
there is no typed figure. It is **refused while any line has no receipt**. A
manager — someone with `money.approve`, and never the requester — can accept
them anyway, and must say why; `receiptsWaivedById` and `receiptWaiverNote`
keep who and why. The page shows what was issued, what has been accounted for,
and the balance to return (or owed to them).

### Permissions

`money.approve` and `money.disburse` are **separate capabilities**, because
saying yes and handing over cash should be two people wherever a business is
big enough for it to be. Both default to managers.

`money.view_all` is reading everybody's money without deciding on any of it —
every requisition, every line in the cost tracker. It defaults on for
managers and for the finance officer role, who reads the books and approves
nothing.

Nobody approves their own request. That is refused in
`app/api/v2/crm/requisitions/[id]/route.ts`, not by hiding a button.

Every move goes through **one `PATCH` with a named action**, so the state
machine is checked in one place against the row as it is now. A separate
`/disburse` route that forgot to re-read the status is exactly the bug that
pays the same requisition twice.

## The daily cost log

> "each employee will input money received per day and what they spent"

The unit is the **day**, not the entry. A stream of entries nobody closes
cannot be checked against anything; a day somebody submits can.

`CrmDailyLog` is keyed `(companyId, userId, logDate)`, which makes "open
today's log" an upsert rather than a find-or-create race. `logDate` is a
`DATE`, not a timestamp: a rep writes Tuesday up on Wednesday morning, and the
entry belongs to Tuesday whatever time zone the phone was in.

`/crm/cost-tracker` is built for somebody standing at a fuel pump. The page
shows state and the dialogs change it. The top of the page is the day: what
is in hand, what it is made of, and **Close the day**, which opens a dialog
carrying the day's note — the note travels with the report, and an empty day
cannot close without one. **New entry** in the app bar opens the line itself
(expense or income, the amount, the category, the project, and then the
requisition an expense was paid from or the invoice income was paying, with
its receipt — a photo straight from the camera on a phone, or a file), on
whichever day is on screen. A closed day is not offered the verb.
The day can be moved back and not forward: a log for Friday written on
Wednesday is a guess, and a guess in the cost figures is worse than a gap.

Under it is the register of every line, filtered from the toolbar and kept in
the URL — day range, person (for somebody with `money.view_all`), project,
requisition, expense or income, and the two things a manager scans it for:
**no receipt photo**, and **not receipted**.

### Not receipted

Cash a rep collects on site is logged in their tracker against the invoice
(`CrmDailyCostEntry.invoiceDocumentId`), and the office records the receipt
that settles it. Until the second happens the first is cash in somebody's hand
that the business holds no receipt for. `lib/crm/finance.ts` compares, per
invoice, what the field logged with the invoice's `amountPaid`; every income
line on an invoice with a gap is flagged, because which of three collections
is the unreceipted one is a question for the people who logged them. The rule
only reads accounting — nothing is matched or written.

Entries carry a device-generated `clientEntryId`, unique per tenant, so an
entry replayed on reconnect lands once instead of doubling the day's spend.

### One ledger

`addCostEntry(tx, { companyId, userId, date, direction, … })` in
`lib/crm/daily-log.ts` is **the only way a line of money is written**, and
`POST /api/v2/crm/cost-entries` is the only route that calls it. The day
tracker, a requisition's report and a project's *Add spend* all post there, so
a line lands on its author's log for the day it names whichever screen it was
typed on. It opens the day's log on the first line, refuses a day in the
future, and refuses a day already submitted.

Receipts upload through `/api/v2/crm/uploads` with `context=crm-receipt`
(images and PDF, 10 MB), into a folder of their own: the evidence behind the
money figures should be findable as such.

**Submitting an empty log is refused unless there is a note.** "No movement
today" is a real answer, but a quiet day and a day the person forgot about
look identical otherwise, and only they can tell management which it was.

## The daily report

> "a daily report from each employee of the work done and monies which is
> automatically sent to management"

**Assembled, not typed.** The visits, jobs, tasks and money are already in the
system because the work was done in the system. Asking for them to be retyped
at six o'clock yields a report that is late, thin and quietly different from
the records it claims to summarise. The one free-text field is the log's own
note.

**Stored, not recomputed.** `CrmDailyReport.summary` is JSON, so management
asking about the 14th three weeks later gets the 14th as it was — not the 14th
recomputed against records since edited, reassigned or deleted.

**Closing the day is what sends it.** No second "send report" step to forget,
and no nightly cron mailing management a day its author had not finished
writing up. The notification is best-effort: a failed notice must not leave
the day un-submitted, or the person retries and is told it is already closed.

The manager's page leads with the **flags** — a spend with no receipt, a float
still out, overdue tasks, nothing recorded at all — because the question being
asked of fifteen of these is *"is there anything here I need to deal with"*,
not *"what did everybody do"*.

## The finance overview

> "a finance dashboard for non-accountants, requisitions split by project and
> by person"

`/crm/finance` is read-only and needs `money.view_all`. Its figures come from
`financeOverview` in `lib/crm/finance.ts`, which reads the requisitions, the
cost tracker and the CRM's invoices and receipts, and writes nothing.

Two kinds of figure:

- **Flows, for the period.** *Money in* is customer payments receipted on the
  CRM's invoices. *Money out* is requisitions paid out plus spend that came out
  of nobody's float. Spend out of a float is inside the requisition's payment
  already, so it is never added a second time — that is the whole reason the
  cost tracker records which requisition a line came out of.
- **Positions, as they stand now.** *Owed to us* (open invoices), *floats not
  accounted for* (paid out, not yet acquitted) and *approved, not yet paid*. The period does not move them: "the floats we
  had out last March" is not a question anybody asks.

The filters head the page, above every figure they move, and a phone keeps
the period on screen. The project and person filters narrow both kinds. A
person's money is what they asked for and spent; money in belongs to whoever
owns the deal it came from. Cash not receipted on an invoice two people
collected against is shared between them in proportion to what each logged
(`shareOfGap`), so the people add back up to the invoice.

Money is added up one currency at a time — a total of dollars and ZiG is not a
figure — defaulting to the currency most of the money is in, with a Currency
filter when there is more than one.

The *Needs action* strip holds at most four things — requisitions waiting for
approval (not counting the viewer's own, which are waiting on somebody else),
cash not receipted, spend without a receipt photo, projects over budget — each
linking to the list that holds them. *By project* is each project's standing to
date (`projectCostSummary`); *By person* is the period's asking and spending
beside what each person holds now. Rows open onto their requisitions.

## A team member's page

`/crm/reps/[id]` — "Team" in the navigation, and "My overview" for whoever is
signed in (`/crm/reps/me` redirects to their own). A member opens their own
page; a manager, or anybody with `money.view_all`, opens anybody's
(`mayOpenMember`). The team list stays visible to everybody — you cannot hand a
lead to somebody you cannot see — but only the rows a viewer may open are links.

One period, chosen at the top, governs every section:

- **Overview** — deals won and their value, jobs completed, visits done, and
  the money spent and received, then what they are carrying.
- **Outstanding** — overdue tasks and follow-ups, requisitions waiting, floats
  not accounted for, spend without a receipt photo, cash not receipted, and days
  not closed. Late things come first, oldest first; a float counts as late after
  a week out; a requisition waiting on an approver is waiting, not late.
- **Activity** — their days, newest first, each the daily report's own card: the
  report management got for a closed day, built fresh for an open one.
- **Money** — their cost tracker lines for the period.
- **Files** and **Settings**, as before.

The figures are `lib/crm/member-overview.ts`, which reuses the daily report's
builder, `receiptGaps`/`shareOfGap` and `payableAmount` rather than restating
any of them.

## Quotes, invoices and receipts

Each document has a page of its own — `/crm/quotes/[id]`, `/crm/invoices/[id]`,
`/crm/receipts/[id]`, one `DocumentRecordContent` behind all three — read from
`GET /api/v2/crm/documents/[id]`. The accounting row is the source of truth for
the number, the status and the money; the CRM row carries the version chain
and the record the document was raised against.

- **A quote** is its lines and what the client did with it: sent, opened,
  accepted or declined, and what they wrote. An old version says what replaced
  it before anything else.
- **An invoice** is its lines and what is still owed, the payments and credit
  notes against it, and the chasing.
- **A receipt** is what it paid and what that left owing on the invoice.

The chain is linked both ways: the invoice a quote became, the quote an invoice
was raised from (`SalesInvoice.quotationId`, set when a quote is converted),
the invoice a receipt paid, and the versions either side.

The verbs are the deal's verbs, from one hook (`useDocumentActions`): the
deal's document list draws them as a menu, the page as its one button and its
menu. The button is the move that matters for where the document stands —
email a quote that is still out, convert an accepted one, record a payment on
an invoice that is owed, open a receipt's PDF. Every document route hangs off
its deal or lead (`basePath`), so a document raised against neither is read
only.

### Collections

`/crm/collections` is every invoice with money still owed, ordered by how
urgently it needs a call — a promise that came and went first, then age and
size (`orderChaseList` in `lib/crm/collections.ts`). The ageing bands are its
tabs, each with its count, and the band is in the URL (`?age=D61_90`). The
total owed is the foot of the column it adds up, a line per currency.

A chase is logged with `ChaseDialog` from the list or from the invoice's own
page. A promise to pay needs its date, and books a task for that day.

## How the pages are drawn

The money pages are drawn with the management surface's own layer
(`components/management/ui`) — outside its full-screen dialog, inside the CRM's
app bar, record rails and properties pane — so they follow the contract that
surface was rebuilt to:

- **No sentence explaining a control or a figure.** No lede under a page's
  name, no helper line under a field, no paragraph over a table. A label that
  needed one was renamed: the cost tracker asks *Amount*, *Category*,
  *Description*, *Paid from*, *Project*, not "How much" and "Out of which
  requisition".
- **A section's verb is on its heading**, beside its count (`SectionHeading`,
  `SectionAction`), never under the list and never twice.
- **Every list names its columns once** (`ColumnList`): the reference and the
  name, one line under it, then the figures mono against the right edge. Money
  in and money out are two columns, not one column of signs. Facts about a
  record are 44px rows (`FactList`).
- **A state is a dot and a word in a list** (`StatusDot`); a chip in a record's
  band only for the exception — a project on hold or cancelled, a requisition
  declined or withdrawn. The inks are `PROJECT_TONE`, `JOB_TONE` and
  `REQUISITION_TONE` in `lib/crm/tones.ts`: green live, amber somebody's move,
  red refused or late, grey nothing to do.
- **Dates are written one way**, day first — "25 Sept 2026" — and in UTC, the
  terms a log day is keyed in (`formatDate` in `components/crm/money/money.ts`).
- **What cannot be done is not offered.** "Close the day" appears once the day
  can be closed; a requisition's project is said, not asked, once the
  requisition decides it.

## Where to find it

| Route | For |
| --- | --- |
| `/crm/projects`, `/crm/projects/[id]` | The work and what it cost |
| `/crm/requisitions` | Asking for money, and answering |
| `/crm/cost-tracker` | A day's money written up, and every line read back |
| `/crm/finance` | Money in and out, and where it stands — for `money.view_all` |
| `/crm/reps/[id]` | One team member: done, outstanding, their days, their money |
| `/crm/daily-reports` | Management's read |
| `/crm/quotes/[id]`, `/crm/invoices/[id]`, `/crm/receipts/[id]` | One document: its lines, payments, chases and chain |
| `/crm/collections` | Every invoice still owed, by how late, and the chasing |

Navigation groups the money pages under **Finance**, distinct from Sales
documents: one is the money moving through people's hands, the other is the
paperwork the business sends its customers.

| Module | Holds |
| --- | --- |
| `lib/crm/projects.ts` | Creation from a deal, a job's links, over-budget, cost rollup |
| `lib/crm/project-status.ts` | Status machine — shared by the route and the page |
| `lib/crm/project-timeline.ts` | Jobs laid out against a project's dates |
| `lib/crm/requisitions.ts` | Lifecycle, categories, money helpers |
| `lib/crm/daily-log.ts` | Day arithmetic, entry idempotency, submission |
| `lib/crm/finance.ts` | The not-receipted rule and the finance overview — reads, never writes |
| `lib/crm/member-overview.ts` | One member's achievements, outstanding items and days |
| `lib/crm/daily-report.ts` | Assembly and storage |

## Conventions worth not breaking

- **Money is `Decimal @db.Decimal(14, 2)`.** Never a float. A witness test
  (`lib/crm/project-accounting-schema.test.ts`) reads `information_schema` and
  fails if that changes.
- **Deleting a project or a bank account nulls the link, it does not delete
  the requisition.** The record that money was asked for and handed over
  outlives the thing it was for. The requester is `RESTRICT`: a requisition
  with no requester is not a record of anything.
- **A day's entries cascade with the day.** The one place `CASCADE` is right —
  an entry has no meaning without its log.
