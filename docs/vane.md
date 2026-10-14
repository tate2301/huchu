# Vane

Vane is the product's helper that reads what a person could read, notices what needs doing, and drafts the work. It runs on Claude, made by Anthropic. In the product it is only ever called Vane; Claude is named once, on Management → Vane.

Vane never sends, pays, saves, approves or changes anything on its own. It may propose actions; each waits until a person approves it (and may change its inputs first), and then it runs through the module's own code as that person. Denying keeps it, denied.

## What is built so far

The connection to Claude (`lib/vane/claude.ts`), Vane's tables, the two roles it reads the workspace through (`20261012120000_vane`), and the reader that runs a question through them (`lib/vane/reader.ts`).

| Piece | What it does |
| --- | --- |
| `askClaude({ system, messages, maxTokens })` | One request, one text answer, and the tokens it cost (input, output, cache read, cache write). The system prompt is sent with `cache_control`, so a stable prompt is billed at the cache rate after the first call. |
| `vaneModel()` | The model, from `VANE_MODEL`. Unset is a configuration error raised before any request. |
| `vaneClient()` | One SDK client per server process. The SDK reads `ANTHROPIC_API_KEY` itself. |
| `VaneError` | Every way a request can fall short, with `code` and `retryable`: `misconfigured` (no model; key or model refused), `rate-limited`, `unavailable` (no connection or a server error), `refused` (Claude declined), `cut-off` (ran past `maxTokens`). |

`lib/vane/claude.test.ts` covers each of these with a stand-in for the SDK client; no test calls Claude.

| Piece | What it does |
| --- | --- |
| `readWorkspace(companyId, question)` | Runs one question, as SQL, for one company: as `vane_reader`, or as `vane_reader_private` when the workspace's `readsPeoplePrivate` is on. Returns at most 500 rows, whether there were more, the SQL as it ran and the tables it read, which every card keeps. |
| `ReaderError` | Why a question did not run, with `code`: `refused` (not one SELECT, a table the role is not granted, or a function off the report list in `lib/reports/sql/guard.ts`, which keeps out `pg_*`, `set_config` and `current_setting`), `timeout` (past five seconds), `failed` (Postgres turned it down: a column that does not exist or one the role may not read), `misconfigured` (its connection string is not set). The message is a sentence Vane can act on. |

`lib/vane/reader.test.ts` signs in as members of the two roles and checks that a question sees one workspace (two at once stay apart), reads personal details only where the workspace allows, runs nothing but one SELECT, stops at 500 rows and at the time limit, and leaves no binding behind.

### Its tools (`lib/vane/tools.ts`)

| Tool | What it does |
| --- | --- |
| `describe_table` | A table's readable columns with their types, and the tables its columns point at. |
| `run_sql` | One SELECT through the reader (`readWorkspace`). |
| `get_record` | One record by id, in the columns the role may read, with each record it points at (one level of foreign keys), through the same bound reader. |
| `propose_item` | A card on For you (`VaneItem`): kind, source module, headline, body, the button's action, the SQL and what it read. An open card with the same headline is not raised twice. |
| `propose_plan` | A plan (`VanePlan`) with its steps in order, each owned by Vane or a person. |

`toolDefinitions()` is what Claude is shown: each tool's name, a sentence on what it does, and its input as JSON Schema from the same zod schema the call is checked against. `callTool(context, name, input)` runs one call: an input that does not fit, or a question the reader refused or Postgres turned down, comes back as an error result for Claude to correct; anything else is thrown for the job. `lib/vane/tools.test.ts` covers each tool and those errors.

### Its actions (`lib/vane/actions/`)

What Vane proposes on a card or in a chat answer is a `VaneAction`: a kind from the registry, its inputs, and a line saying what it does. Nothing runs until a person approves it (`POST /api/vane/actions/[id]`); then the engine (`engine.ts`) checks the inputs again, takes only the changes the kind lets a person make (a due date, a note), checks the approver's role and the workspace's features for the route the app would use (`gate.ts`: an action calls module code directly, so it would otherwise skip both), and runs it as them. Done keeps what happened; a failure keeps why and can be approved again; denied stays denied. When a card's actions are all done, the card is taken further by that person.

| Kind | Runs | As the app's |
| --- | --- | --- |
| `books.invoice.due_date` | `setInvoiceDueDate` (`lib/books/due-dates.ts`): a draft or issued invoice, not before its own date | `PATCH /api/accounting/sales/invoices` |
| `books.invoice.reminders` | `sendInvoiceReminders` (`lib/books/reminders.ts`) | `POST /api/books/invoices/reminders` |
| `books.bank.accept` | `acceptProposals` (`lib/books/bank.ts`) | `POST /api/books/bank/accept` |
| `books.invoice.from_quote` | `draftInvoiceFromQuote` (`lib/books/quotations.ts`) over `createSalesInvoice` (`lib/books/create-invoice.ts`, now also the route's): an accepted quotation, once, as a draft | `POST /api/accounting/sales/invoices` |
| `crm.task.create` | `createCrmTask` (`lib/crm/create-task.ts`, now also the route's) | `POST /api/v2/crm/tasks` |
| `crm.deal.stage` | `moveDealStage` (`lib/crm/deal-stage.ts`, now also the route's): only a deal the person may edit, stopped by the stage's gates with what is missing | `POST /api/v2/crm/deals/[id]/stage` |
| `crm.lead.stage` | `applyRecordBulk` with `LEAD_BULK` (`lib/crm/registers/server/`), as the leads list's bulk move | `POST /api/v2/crm/leads/bulk` |
| `crm.owner.assign` | `applyRecordBulk` with `DEAL_BULK` or `LEAD_BULK`: records the person may not edit are left, with why | `POST /api/v2/crm/{deals,leads}/bulk` |
| `crm.note.log` | `logCrmActivity` (`lib/crm/log-activity.ts`, now also the route's) | `POST /api/v2/crm/activities` |
| `retail.shift.look_into` | `signOffShift` (`lib/retail/floor/sign-off.ts`), which checks cash control itself | `/api/v2/retail/shifts` |
| `retail.order.draft` | `raiseOrder` (`lib/retail/buying/orders.ts`) as a draft, after the retail role check | `POST /api/v2/retail/buying/orders` |
| `retail.order.send` | `sendOrder`, the way the supplier takes orders | `POST /api/v2/retail/buying/orders/[id]/send` |
| `retail.order.chase` | `chaseOrder`: the reminder, and the promised day becomes the expected date | `POST /api/v2/retail/buying/orders/[id]/chase` |
| `vane.plan.tick_step` | `tickPlanStep` (`lib/vane/lists.ts`) | Vane's own |

Each runs as the approving person: drafts carry their name, not `madeByVane`. `lib/vane/actions/modules.test.ts` runs each module's actions against the test database. A new action is a `VaneActionKind` in its module's file, listed in `registry.ts`. Claude is shown each kind's description and inputs, and the pages it may link to with their filters (`lib/vane/pages.ts`), so its links open filtered to the records it means.

### Its chat (`lib/vane/chat.ts`)

A person asks Vane in the panel; the turn runs while they wait (`POST /api/vane/chat`, up to 90 s), streaming what Vane is doing as JSON lines, and the panel is held until it finishes. Vane answers in words, with any actions it proposes hung on the answer. Each turn is a `VaneJob` of kind `chat` (counted against the allowance, with its cost); the conversation is `VaneMessage`, one per person, which neither reader role can read (`CONVERSATION_TABLE` in `lib/vane/reader-access.ts`). Refused while Vane is paused, past the allowance, or still answering the person's last turn. The nightly job and chat share one conversation loop (`lib/vane/conversation.ts`) and one set of rules (`lib/vane/prompt.ts`).

### Its jobs (`lib/vane/jobs.ts`)

Vane works in `VaneJob`s, run on the scheduled-jobs tick (`docs/scheduled-jobs.md`):

- **vane-nightly**, daily at 06:00: queues the day's look over the workspace (`nightly:<day>`, once a day) for every workspace with Vane on.
- **vane-jobs**, every minute: runs the oldest due job, one a tick. Claude (`VANE_MODEL`, effort medium) is given Vane's instructions, the tables it may read and its tools, and works turn by turn (at most 12 turns, within a minute) until it stops calling tools. The job keeps the model, tokens in and out, cache reads and writes, each tool call (name, time, whether it worked) and Claude's closing sentence.
- Claude busy or unreachable: the job waits (2, 4, 8 … up to 60 minutes) and is tried again, up to five tries. Anything else (no `VANE_MODEL`, a refused key, a refusal) fails it with the reason.
- A paused workspace's jobs wait; so do a workspace's jobs once it has started `monthlyAllowance` jobs this month. A job left running by a tick that died is taken back after ten minutes.

`lib/vane/jobs.test.ts` covers each of these with a stand-in for Claude.

**Turning Vane on for a workspace.** Until Management → Vane exists, a workspace has Vane on when it has a `VaneSettings` row that is not paused:

```sql
INSERT INTO "VaneSettings" ("companyId", "updatedAt") SELECT id, now() FROM "Company" WHERE slug = 'hurudza-creative';
```

Its cards land in `VaneItem` and its plans in `VanePlan`; the pages that show them are next.

## Setting it up

1. Put the key in `ANTHROPIC_API_KEY` and the model in `VANE_MODEL` (see `.env.example`). Server only: never prefix either with `NEXT_PUBLIC_`.
2. Run `pnpm vane:ping`. It sends one short request and prints which model answered and what it cost, or the `VaneError` code and message.

## Its tables

| Table | What it holds |
| --- | --- |
| `VaneItem` | A For you card: Issue or Suggestion, its source module and subject, the headline, the reason, the action its button takes, the SQL it ran and what it read (`readFrom`). Open, Done or Muted (with the reason). |
| `VanePlan`, `VanePlanStep` | A larger job broken into steps, each owned by Vane or by a person: To do, Now, Done, with a progress label ("38 of 61 lines"). |
| `VaneJob` | Every piece of work, with what it cost: tokens in and out, cache reads and writes, the tools it called, the result or the error. A job's `key` (kind, subject, day) runs once per workspace. Waiting jobs retry from `runAfter` when Claude cannot be reached. |
| `VaneSettings` | Management → Vane: paused, what it watches, raise issues, plans, drafts, "People's pay and personal details" (off), quiet hours (20:00 to 06:00), who hears about what, the monthly allowance (5,000 jobs). No row means the defaults. |
| `VaneReaderScope` | Which workspace a reader connection is bound to, by backend pid. |

Drafts Vane writes go in the normal tables with `madeByVane = true` and no `createdById`: `SalesInvoice`, `SalesQuotation` and `RetailPurchaseOrder`, always as drafts. A person issues, sends or receives them through the normal screens.

## What Vane may read

Vane never reads as the app. It reads as one of two database roles:

- `vane_reader`: SELECT on the workspace's records, without people's pay and personal details.
- `vane_reader_private`: the same, plus pay and personal details. Only when the workspace has turned on "People's pay and personal details".

Neither role can write anything, Vane's own tables included. `lib/vane/reader-access.ts` holds the rules and `pnpm vane:reader-sql --summary` prints what they give:

- **Rows.** Every readable table has a restrictive `vane_workspace` policy: a reader sees only the workspace its connection is bound to in `VaneReaderScope`. A table without `companyId` is scoped through its links to tables that have one (any link that reaches a visible row). A connection bound to nothing sees nothing. A reader can see only its own binding and cannot change it.
- **Columns.** Grants are per column, so a column added later stays unreadable until it is granted.
- **Pay and personal details** (private role only): the payroll, compensation, disbursement, PAYE and statutory tables, gold worker shares, and on staff, pupils and guardians: phones, addresses, identity and tax numbers, bank and mobile money details, dates of birth, disability, next of kin and pay rates. A customer's phone stays readable, so Vane can draft a reminder.
- **Never, for either role:** passwords, tokens, hashes, keys, secrets and PINs on any table, and the tables of sign-in sessions, accounts, API keys, invitations, pairing codes, till PINs and webhooks.

Row security changes nothing for the app. Every table that has it also has a permissive `app_all` policy, and the table owner skips policies in any case.

### When a migration adds tables

New tables and columns are unreadable to Vane until granted. Run `pnpm vane:reader-sql`, copy the lines for the new tables into the same migration, and check `pnpm vane:reader-sql --summary` puts anything private in the private role.

## Setting it up

1. Put the key in `ANTHROPIC_API_KEY` and the model in `VANE_MODEL` (see `.env.example`). Server only: never prefix either with `NEXT_PUBLIC_`.
2. Run `pnpm vane:ping`. It sends one short request and prints which model answered and what it cost, or the `VaneError` code and message.
3. Apply `20261012120000_vane` with `npx prisma migrate deploy`. The role that runs it needs `CREATEROLE`; on Neon the owner role has it.
4. Give each reader role a password by hand on the server, so none is kept in git, and set the two connection strings, `VANE_READER_DATABASE_URL` and `VANE_READER_PRIVATE_DATABASE_URL`, wherever Vane runs (see `.env.example`):

   ```sql
   ALTER ROLE vane_reader LOGIN PASSWORD '…';
   ALTER ROLE vane_reader_private LOGIN PASSWORD '…';
   ```

   Vane reads through its own connection as one of these roles, never by `SET ROLE` on the app's connection: from the app's connection a statement could switch the role back. The worker binds the connection inside the reading transaction (the app writes the `VaneReaderScope` row for that connection's `pg_backend_pid()`), runs the question read-only with a 5 s statement timeout and a 500-row cap, and deletes the binding.

## Not built yet

The pages: `/vane` (For you, Plans, Done, Muted), a card's What I read, the four states, Give Vane a job with Ctrl J, the live updates, the `draft` tool and Vane inside each module. The button, the panel and Management → Vane are built. The boards, what each is, and the order to build the rest are in `docs/handover-vane.md`.
