# Core modules and Vane: handover

Where the core modules work stands on 15 Oct 2026, on the branch `ccr-9ffc8595-wcnhkp` (PR #219), and the next steps in order. The designs are on the Huchu Core Modules canvas; every board is in `design/core-modules/boards/`, and the brief for building a screen is `design/core-modules/BUILD.md`. What the build decided differently from the boards, and why, is in `design/core-modules/NOTES.md`; the owner's corrections are in `design/core-modules/app/ledger.md`.

## Where it stands

Every module is built except People and payroll, which the owner skipped for now (15 Oct). Each built board was checked with `tools/check/designcheck.mjs` (95% or more of what can be built, clean at 1440 and 390).

| Piece | State |
| --- | --- |
| Kit, tokens and shell | Built: the kit in `components/core` (generated `kit.css`), Corelith's light and dark themes, the rail, module panels with Saved views and Reports from <module>, the 56px top bar, Management behind the gear. |
| Reports & Insights | Built: Overview, Insights (Sales, Site visits, and each vertical's: Fees, Production, Pay cost, the shop's), All reports with folders, a report with Save as a template, Export and Send it (`ReportSchedule`, sent on the cron tick), built and custom reports, the builder on the resizable grid, Arrange, Management → Reports. |
| Books | Built: Money, Invoices (and an invoice's page), Payments, Takings, Expenses, Bank (statement upload and matching), Journals, VAT, Periods, the close. |
| Build | Built: the home, Templates, and one builder grid for forms, documents, emails, printed layouts and reports. |
| Notifications | Built to the owner's redesign (14 Oct): quiet rows, the bell's Needs you and Everything, `/activity` with its drawer, Management → Notifications and My account → Notifications setting each kind on each channel (approved 15 Oct), honoured by every sender, with the actor kept and shown. |
| Branding | Built: Identity, Assets, Finance on one page with the live quotation, and Where it shows. |
| Management | Built: Billing, Integrations, Marketplace, Vane, Reports, Notifications, Explore, Job grades and the other registers on the kit. Pay and statutory belongs to People and payroll and is not built. |
| Explore | Built: the studio, templates, saved questions (custom reports with one block), the guard, Ask in plain words, Ctrl K's Open in Explore, Explore this list on Invoices, Management → Explore. With `explore_reader` set up (approved 15 Oct; its password and connection string are set by hand), questions run on the server over the real tables, are logged, show in History and in Management → Explore, and Schedule it sends; without it they run in the person's tab (PGlite). |
| Vane engine | Built: the reader (`lib/vane/reader.ts`, its own logins), the tools (`run_sql`, `get_record`, `propose_item`, `propose_plan`, `update_plan_step`, `draft`), jobs on the scheduled-jobs tick (`vane-jobs`, every minute, allowance and retries), the live channel, write jobs (a document's email, a report block, a form's changes). Draft-only, enforced on the server: every route that issues, sends or posts refuses a Vane draft no person has taken on (409). |
| Vane screens | Built: the rail's mark and the panel with its chat (Ctrl J), `/vane` (For you, Working on, Plans, Done, Muted), a card and what Vane read, the four states, Explain a figure on a report, and Vane inside the modules: the draft invoice, the retail reorders, fee reminders, changes to a form, a quote's message. The top-bar Vane button is gone (the owner, 14 Oct). |
| Shortcuts | Every row of `design/core-modules/spec/shortcuts.md` is bound and `components/core/shortcuts.test.ts` checks it, with every kit primary on the built routes showing its key. |
| People and payroll | Skipped for now (the owner, 15 Oct). Only the engine work for disciplinary penalties (off net pay) shipped. |

Migrations on this branch since main's `20261012120000_vane`: `20261013120000_reports_folders_insights`, `20261013130000_saved_views`, `20261013140000_report_schedules`, and main's Vane follow-ups (`vane_chat_actions`, `vane_gaps`, `vane_message_read`, and `20261015100000_vane_finish` from the merge of PR #228 on 15 Oct). Each has its witness test and Vane's reader lines.

The merge of `origin/main` (15 Oct) kept main's Vane engine and one page per job: the invoice page (`/books/invoices/[id]`) and fee reminders (`/schools/finance/reminders/[id]`; `/schools/fees/remind` redirects). NOTES.md (Vane) says what of ours went as duplicate.

`docs/vane.md` describes what Vane is, its tables, tools and actions, what it may read and how it is set up.

## Next steps, in order

1. **Two approvals, given 15 Oct and built.** Both are in `prisma/migrations/` and deploy with the build.
   - **Explore's login** (`20261015120000_explore_reader`: `explore_reader`, `ExploreReaderScope`, `ExploreSettings`, `ExploreQuestionRun`, witnessed by `lib/explore/explore-reader-migration.test.ts`). One step is by hand on production: the role's password and `EXPLORE_READER_DATABASE_URL` (section 2, step 4). Until then Explore runs questions in the browser as before. A later migration that adds tables Explore should read pastes their lines from `pnpm explore:reader-sql` (`lib/explore/explore.test.ts` fails until it does).
   - **Notification routing** (`20261015130000_notification_routing`, witnessed by `lib/inbox/notification-routing-migration.test.ts`): Management → Notifications and My account → Notifications set who hears about what by kind and channel, the senders honour it, Books, leave, reports and Vane raise their own types, and the actor is kept and shown. The morning message and grouping repeats are not built (NOTES.md, Notifications).
2. **People and payroll** (section 2 of `design/core-modules/spec/routes.md`): Everyone, a person (`/people/[id]`, linked from the schools staff list and missing), Time off (approve and reject need the leave API, **approval**), Incidents, the pay run and its approve-and-pay drawer, disbursements, returns, the phone payslip (a PDF only today), Management → Pay and statutory. Add its keys to `spec/shortcuts.md` and the shortcut test as each screen is built.
3. **Smaller waits**, each noted in NOTES.md: Vane's templates (Done's template names, Muted's kinds), counting every report's opens (a write on every open), `ReportSchedule` for built and custom reports (they run in the browser today), and a fitter's phone scoped to their own visits (an open decision).

## 1. Get it running locally

```bash
git fetch origin && git switch ccr-9ffc8595-wcnhkp
pnpm install
pnpm db:generate

# The app's database and the test database (both local)
npx prisma migrate deploy
set -a; . ./.env; set +a; DATABASE_URL="$DATABASE_URL_TEST" npx prisma migrate deploy

# Claude, server only
#   ANTHROPIC_API_KEY="..."
#   VANE_MODEL="claude-sonnet-5-5"
pnpm vane:ping                      # prints the model that answered and the tokens, or the error code

pnpm exec vitest run lib/vane      # the connection, the read rules and the migration witnesses (never `pnpm test -- …`: it runs the whole suite)
pnpm vane:reader-sql --summary      # what each reader role may read
```

Main's Vane migration creates two roles, so the database user that runs it needs `CREATEROLE` (a local superuser has it; on Neon the owner role has it).

## 2. Put it on production

A Vercel production build runs `prisma migrate deploy` (`scripts/migrate-deploy-production.mjs`), so merging a migration to `main` applies it; previews skip it because they share the production database.

1. Give each reader role a password by hand, so none is kept in git:

   ```sql
   ALTER ROLE vane_reader LOGIN PASSWORD '…';
   ALTER ROLE vane_reader_private LOGIN PASSWORD '…';
   ```

2. Keep the two connection strings with the worker's secrets, `VANE_READER_DATABASE_URL` and `VANE_READER_PRIVATE_DATABASE_URL`. `lib/vane/reader.ts` reads them.
3. Set `ANTHROPIC_API_KEY` and `VANE_MODEL` where the worker runs, never with a `NEXT_PUBLIC_` prefix.
4. Explore's login (`20261015120000_explore_reader`, approved 15 Oct), the same way. The migration deploys with the build and creates `explore_reader` without a login; the database user it runs as needs `CREATEROLE`, as for Vane's. Then, by hand on the server:

   ```sql
   ALTER ROLE explore_reader LOGIN PASSWORD '…';
   ```

   and add `EXPLORE_READER_DATABASE_URL` (`postgresql://explore_reader:…@<host>/<database>`, the host, database and `sslmode` of `DATABASE_URL`) in the deployment's environment settings, then redeploy. Until it is set Explore runs questions in the person's browser and Schedule it cannot send; once set, Explore reads the real tables, logs each question and sends scheduled ones (docs/vane.md, Setting it up, step 5).
5. Notification routing (`20261015130000_notification_routing`, approved 15 Oct) needs nothing by hand: it deploys with the build.

## 3. Decisions still open

| Decision | Default until decided |
| --- | --- |
| Fitters' questions to Vane: only their own visits and quotes? (A rep can read the whole pipeline in the CRM today.) | Not built; fitters are not scoped in the reader yet. |
| Vane's monthly allowance | 5,000 jobs (`VaneSettings.monthlyAllowance`). |
| Report questions as drafts: a `CustomReport` block has no draft flag | Vane's block is a suggestion in the person's draft until they press Keep; nothing reaches the report until they publish. |
| Mine work orders as drafts: `WorkOrder` has no `companyId` or `createdById` | Not marked (**approval** to add them). |
| People and payroll | Skipped for now (15 Oct); next after the two approvals. |
| Bank reconciliation | Books → Bank is built on statement upload, Books' matching rules and Accept; the app's older reconciliation stays parked. |

## 4. Things to know

- **New tables are invisible to Vane** until granted. In the migration that adds them, paste the matching lines from `pnpm vane:reader-sql` and check `--summary` puts anything private in the private role. `lib/vane/reader-access.test.ts` fails if a credential column would be granted.
- **Row security is on** for every table Vane reads. It changes nothing for the app: each table has a permissive `app_all` policy and the owner skips policies. `prisma migrate diff` ignores policies, so it shows no drift.
- **CI:** the Cloudflare "Workers Builds: huchu" check fails on `main` and on every PR; it stops before building anything. The Vercel preview is the build that counts.
- **Checks:** a screen is checked with `node design/core-modules/tools/check/designcheck.mjs <Board> <url> --state <state.json> --390` (BUILD.md); the fixture screens with `E2E_BROWSER_EXECUTABLE=/opt/pw-browsers/chromium BASE_URL=http://floorcode.apps.pagka.local:3100 npx playwright test -c design/core-modules/tests`; the saas-design lint as `design/core-modules/CLAUDE.md` says ("Building each screen"). Results and what each leaves out are in NOTES.md.
- **Known test failures** not from this work: the retail deliveries stock-movement count, laybys, and `lib/vane/vane-migration.test.ts` on a local database that has drifted from the migrations.
- **Local quirks:** delete a stale `.next/types` folder if `pnpm typecheck` complains about routes that no longer exist. `pnpm typecheck:scripts` reports 4 errors in `scripts/seed-retail-demo.ts` that are already on `main`. `package-lock.json` is not kept in step with `pnpm-lock.yaml`.
