# Core modules and Vane: handover

Where the core modules work stands on 12 Oct 2026, and the next steps in order. The designs are on the Huchu Core Modules canvas (claude.ai artifact `NuvB8NYPW21mFrK5twsVkT`, version 42). The design kit the canvas follows is the `corelith-core-modules` handover (its `spec/`, `html/` and `KICKOFF.md`); it is not in this repo yet, so copy it to `design/` before building screens from it.

## Where it stands

| Piece | State |
| --- | --- |
| Canvas: every module, 102 boards | Done. All boards use the reference markup. Not yet checked rendered, board by board. |
| Vane's connection to Claude (`lib/vane/claude.ts`, `pnpm vane:ping`) | Merged in #208. |
| Vane's tables, the `madeByVane` mark, the `vane_reader` and `vane_reader_private` roles | Merged in #210, migration `20261012120000_vane`. Not yet applied to production. |
| Vane's worker, tools, pages, button and Management → Vane | Not started. |
| Reports & Insights redesign | Designed, not built. |
| Explore | Designed, not built. |
| Books, People and payroll, Notifications, Management, Branding, Build | Designed, not built. |

`docs/vane.md` describes what Vane is, its tables, what it may read and how it is set up.

## 1. Get it running locally

```bash
git pull origin main
pnpm install
pnpm db:generate

# The app's database and the test database (both local)
npx prisma migrate deploy
set -a; . ./.env; set +a; DATABASE_URL="$DATABASE_URL_TEST" npx prisma migrate deploy

# Claude, server only
#   ANTHROPIC_API_KEY="..."
#   VANE_MODEL="claude-opus-5-5"
pnpm vane:ping                      # prints the model that answered and the tokens, or the error code

pnpm test -- lib/vane/              # 34 tests: the connection, the read rules and the migration witness
pnpm vane:reader-sql --summary      # what each reader role may read
```

The migration creates two roles, so the database user that runs it needs `CREATEROLE` (a local superuser has it; on Neon the owner role has it).

## 2. Put #210 on production

The Vercel build does not run migrations.

1. Against Neon: `npx prisma migrate deploy`.
2. Give each reader role a password by hand, so none is kept in git:

   ```sql
   ALTER ROLE vane_reader LOGIN PASSWORD '…';
   ALTER ROLE vane_reader_private LOGIN PASSWORD '…';
   ```

3. Keep two connection strings with the worker's secrets, for example `VANE_READER_DATABASE_URL` and `VANE_READER_PRIVATE_DATABASE_URL`. Nothing reads them yet; step 3.1 does.
4. Set `ANTHROPIC_API_KEY` and `VANE_MODEL` where the worker runs, never with a `NEXT_PUBLIC_` prefix.

## 3. Vane, next steps in order

### 3.1 The reader connection and `run_sql`

New file `lib/vane/reader.ts`. One function that runs one question for one workspace:

1. Open a connection as `vane_reader`, or as `vane_reader_private` when `VaneSettings.readsPeoplePrivate` is on. Use the reader's own login (step 2.3), **never** `SET ROLE` on the app's connection: from the app's connection `set_config('role', …)` switches straight back to the app's role (checked; see #210).
2. In one transaction on that connection: `SELECT pg_backend_pid()`; from the app's connection, upsert `VaneReaderScope (pid, companyId)`; then on the reader connection `SET TRANSACTION READ ONLY`, `SET LOCAL statement_timeout = '5s'`, run the question wrapped as `SELECT * FROM (<question>) q LIMIT 501`; then delete the scope row. Keep it all in one transaction: Neon's pooler moves a connection between backends between transactions, and the binding is by backend pid.
3. Accept one `SELECT` or `WITH` statement only (reuse `lib/reports/sql/guard.ts`) and refuse anything that calls `set_config`, `current_setting` or `pg_*` functions, or reads `pg_catalog` or `information_schema`. The roles already stop writes and cross-workspace reads; this keeps the error messages useful and the catalogue out of reach.
4. Return the rows (at most 500, with "more than 500" when the 501st came back) and the SQL, because every card keeps the SQL and what it read.

Test it the way `lib/vane/vane-migration.test.ts` does: two workspaces, the reader sees one.

### 3.2 The other tools

From `docs/vane.md` and the spec (`design/spec/vane.md`):

- `get_record(type, id)`: one record with its links, through the same reader.
- `draft(type, payload)`: writes a draft with `madeByVane = true`, `createdById` empty and status `DRAFT`. Only `SalesInvoice`, `SalesQuotation` and `RetailPurchaseOrder` carry the mark today. Write it through the app's normal service functions, never raw SQL, so totals and numbering stay right.
- `propose_item(kind, source, headline, body, action, read_from, sql)`: writes a `VaneItem`.
- `propose_plan(title, due, steps[])`: writes a `VanePlan` with its `VanePlanStep`s.

Vane never sends, pays, accepts, saves or publishes. Those stay behind the app's normal endpoints, called by a signed-in person.

### 3.3 The worker

`scripts/vane-worker.ts`, started with a `worker:vane` script, following `scripts/retail-worker.ts`.

- **Queue:** `VaneJob` rows. Pick `QUEUED` and `WAITING` jobs whose `runAfter` has passed, one workspace at a time so a busy one never slows another. `(companyId, key)` is unique, so a key of kind, subject and day runs once.
- **Triggers:** the schedule (every few minutes), the nightly run at 06:00 workspace time, Give Vane a job (`PERSON`), and record changes. There is no outbox for record changes yet; start with the schedule and add the outbox after.
- **Claude:** `askClaude` returns text only. Extend it, or add a sibling, for tool use: the tools above, a loop until Claude stops calling tools, the schema description and the workspace's lexicon in the cached system prompt. Describe only the columns `pnpm vane:reader-sql` grants, so Claude never writes `SELECT *` against a table with withheld columns.
- **Costs:** log the model, tokens (in, out, cache read, cache write), tools called, result or error on the job. Count jobs this month against `VaneSettings.monthlyAllowance` (5,000) and stop after the current job when it is used.
- **Failures:** `rate-limited` and `unavailable` are `retryable`; set `WAITING`, bump `attempts`, push `runAfter` back with backoff. Anything else is `FAILED` with its message.
- **Paused** stops new jobs. **Quiet hours** (20:00 to 06:00 by default) hold notifications, not work.
- **Live:** push working state, the current job's label and progress, and the open count over the existing stream (`app/api/notifications/stream/route.ts`).

### 3.4 The screens

On the canvas, Vane page; the boards name the routes.

1. The Vane button in every top bar: the mark, "Vane", the open count, the live dot. Pressed while the panel is open.
2. The Vane panel (400 px, right): working now, For you for this module first, plans, done while you were away, Give Vane a job (Ctrl J).
3. `/vane`: For you, Working on, Plans (`/vane/plans`), Done (`/vane/done`), Muted (`/vane/muted`, with the reason), what it watches.
4. A card and What I read: the template, the filters and the SQL behind it.
5. Management → Vane: what it watches (pay and personal details off), what it does ("Send, pay, save or change" is fixed at Always asks), when it works, this month against the allowance. The one place Claude is named: "Vane runs on Claude, made by Anthropic. Anthropic does not train its models on your data."
6. The four states: paused, over the allowance, could not work it out (what it tried, which records were missing, Show the rows), cannot reach the service (the last time Vane worked).
7. Inside modules: the "made by Vane" mark on draft invoices, quotations and purchase orders; a question in the report builder's shelf with Keep and Not now; changes drafted for a form from its answers; a quote checked and its message written.

Copy rules: never call Vane AI or an assistant, no sparkle. A card is a kind and source, one headline that states the fact, one or two sentences, and a closing "Let's …". The button names the act ("Send 3 reminders"), never "Do it" or "OK".

## 4. Reports & Insights

Designed on the canvas, Reports & Insights page, for every workspace. Shown for Floorcode, retail (in the Tender look), schools, gold and payroll.

- One destination: Overview, Insights, All reports, Yours, Shared with you, From Corelith (the app's "Built in"), then Folders and Build. Explore moves out to its own place on the rail.
- Insights for Sales and Site visits in one shape; they replace `/crm/reports` and `/crm/insights`.
- `/retail/reports/[ref]` is linked from every retail template row and 404s today: build it as the same report page.
- Schools: the Fees insight replaces the Collections and Arrears tabs of `/schools/reports`.
- Gold: the Production insight replaces `/dashboard`; `/gold/insights/allocations` moves to Gold → Allocations.
- Payroll: P2 and the NSSA schedule under Pay; the returns page's Export buttons are not wired yet.
- Send it (INS-05, INS-09) and editing a built report in the builder are new.
- The builder's outline, inspector and question shelf resize from their edges; keep each person's widths.

## 5. Explore

Designed on the canvas, Explore page: the studio for power users, with its own place on the rail between Reports and Documents.

- Questions run as an `explore_reader` role: `SELECT` and `WITH` only, only the tables the person's role reads in the app, only this workspace's rows, at most 5,000 rows, stopped at 10 s. A change is refused before it runs. Management → Explore sets who may use it.
- Build it on the same pieces as Vane's reader: generate its grants with `lib/vane/reader-access.ts` (or a sibling that filters by the person's role), bind the workspace through a scope table, and read through its own login.
- Every panel resizes: the tables list, the line between Steps and SQL, the editor's foot.

## 6. The other modules

All on the canvas, all following the kit's shell (rail, module panel, top bar; Management behind the gear, never on the panel's foot):

- **Books:** Money (with Vane open), Invoices, Bank (statement upload and Vane's proposed matches; bank reconciliation is parked in the app, so Bank is new work), Journals, VAT, the close.
- **People and payroll:** Everyone, a person (`/people/{id}` is linked from the schools staff list and missing), Time off (approving or rejecting leave is not in the leave API yet), Job grades, the pay run with Vane beside it, approving and paying, disbursements, returns, the phone payslip (payslips are a PDF today).
- **Notifications:** the bell, Activity, Management → Notifications.
- **Management:** Billing, Integrations, Marketplace, Vane, Pay and statutory, Job grades, Explore. Templates move out of Management into Build.
- **Branding:** the three tabs `/preferences/organization/branding` has today, plus a live quotation preview.
- **Build:** one builder (bar, outline with Add (/), page, inspector) for forms, documents, emails, reports and templates; the Build home and the template list.

`KICKOFF.md` in the design kit gives the order that still applies: tokens and kit components, the shell, fixture routes and visual tests, then Management, Books, Reports, Vane, and the builders on the shared base; shortcuts from `spec/shortcuts.md`; anything unmatched in `design/NOTES.md`.

## 7. Decisions still open

| Decision | Default until decided |
| --- | --- |
| Fitters' questions to Vane: only their own visits and quotes? (A rep can read the whole pipeline in the CRM today.) | Not built; fitters are not scoped in the reader yet. |
| Vane's monthly allowance | 5,000 jobs (`VaneSettings.monthlyAllowance`). |
| Report questions as drafts: a `CustomReport` block has no draft flag | Vane keeps the question on its card until someone presses Keep. |
| Mine work orders as drafts: `WorkOrder` has no `companyId` or `createdById` | Not marked. |
| Bank reconciliation | Parked in the app; the Bank design needs it. |

## 8. Things to know

- **New tables are invisible to Vane** until granted. In the migration that adds them, paste the matching lines from `pnpm vane:reader-sql` and check `--summary` puts anything private in the private role. `lib/vane/reader-access.test.ts` fails if a credential column would be granted.
- **Row security is on** for every table Vane reads. It changes nothing for the app: each table has a permissive `app_all` policy and the owner skips policies. `prisma migrate diff` ignores policies, so it shows no drift.
- **CI:** the Cloudflare "Workers Builds: huchu" check fails on `main` and on every PR; it stops before building anything. The Vercel preview is the build that counts.
- **Local quirks:** delete a stale `.next/types` folder if `pnpm typecheck` complains about routes that no longer exist. `pnpm typecheck:scripts` reports 4 errors in `scripts/seed-retail-demo.ts` that are already on `main`. `package-lock.json` is not kept in step with `pnpm-lock.yaml`.
