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

- A won deal's next step is **Start the project** (`resolveNextStep` in
  `lib/crm/tones.ts`). The sheet asks for a name, an owner, a budget and two
  dates; `projectFromDeal` carries the deal's name, client, site and owner
  across. The deal's value is not copied — the project reads it from the deal
  as the reference its budget is set against ("Sold for").
- **One project per deal**, enforced by a unique on `(companyId, dealId)`.
  `projectFromDeal` hands back the existing project on a second request, and
  the route turns a concurrent double-tap's unique violation into the same
  answer.
- **The job holds the link** (`CrmWorkOrder.projectId`), so a project holds
  any number of jobs. A job raised with a `projectId` inherits the project's
  deal, client and site wherever the request left them blank
  (`jobLinksFromProject`); naming a different deal is refused.
- **A job can still exist with no project.** A callout is a real thing that
  happens. What is gone is raising a project *from* a job — the old
  `CrmProject.workOrderId` link, which let a project hold exactly one job.
  Migration `20260925090000_crm_project_spine` moved every existing link onto
  the job before dropping the column, and where two projects named the same
  deal it kept the deal on the oldest and left the others standing on their
  own.
- **The team** is `CrmProjectMember` (free-text role). `managerId` stays the one
  owner answerable for the budget; the owner or a manager changes the team,
  the budget and the status (`canEditRecord`).

Direct projects — work that never went through the pipeline — are raised from
the register's **New project**, with no deal behind them.

The project page (`components/crm/money/project-detail-content.tsx`) is the
standard record page: properties edited in place, sections in the rail with
the open one in the URL, and one primary action, **Raise a job**. Overview is
the cost strip and a timeline of the jobs by date between the start and the
target end; then Jobs, Requisitions, Spend & receipts, Team, Files and
History (field changes, written as names and days rather than ids).

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

### Permissions

`money.approve` and `money.disburse` are **separate capabilities**, because
saying yes and handing over cash should be two people wherever a business is
big enough for it to be. Both default to managers.

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

`/crm/my-day` is built for somebody standing at a fuel pump — four fields and
a button, the running balance at the top where a thumb-scroll starts, one
press to close the day. The date can be moved back and not forward: a log for
Friday written on Wednesday is a guess, and a guess in the cost figures is
worse than a gap.

Entries carry a device-generated `clientEntryId`, unique per tenant, so an
entry replayed on reconnect lands once instead of doubling the day's spend.

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

## Where to find it

| Route | For |
| --- | --- |
| `/crm/projects`, `/crm/projects/[id]` | The work and what it cost |
| `/crm/requisitions` | Asking for money, and answering |
| `/crm/my-day` | A rep's own day |
| `/crm/daily-reports` | Management's read |

Navigation groups them under **Money out**, distinct from Sales documents:
one is money the business asks for, the other is money it hands out.

| Module | Holds |
| --- | --- |
| `lib/crm/projects.ts` | Creation from a deal, a job's links, over-budget, cost rollup |
| `lib/crm/project-status.ts` | Status machine — shared by the route and the page |
| `lib/crm/project-timeline.ts` | Jobs laid out against a project's dates |
| `lib/crm/requisitions.ts` | Lifecycle, categories, money helpers |
| `lib/crm/daily-log.ts` | Day arithmetic, entry idempotency, submission |
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
