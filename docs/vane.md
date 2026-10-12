# Vane

Vane is the product's helper that reads what a person could read, notices what needs doing, and drafts the work. It runs on Claude, made by Anthropic. In the product it is only ever called Vane; Claude is named once, on Management → Vane.

Vane never sends, pays, saves, approves or changes anything on its own. A person presses the button each time.

## What is built so far

The connection to Claude (`lib/vane/claude.ts`), Vane's tables, and the two roles it reads the workspace through (`20261012120000_vane`).

| Piece | What it does |
| --- | --- |
| `askClaude({ system, messages, maxTokens })` | One request, one text answer, and the tokens it cost (input, output, cache read, cache write). The system prompt is sent with `cache_control`, so a stable prompt is billed at the cache rate after the first call. |
| `vaneModel()` | The model, from `VANE_MODEL`. Unset is a configuration error raised before any request. |
| `vaneClient()` | One SDK client per server process. The SDK reads `ANTHROPIC_API_KEY` itself. |
| `VaneError` | Every way a request can fall short, with `code` and `retryable`: `misconfigured` (no model; key or model refused), `rate-limited`, `unavailable` (no connection or a server error), `refused` (Claude declined), `cut-off` (ran past `maxTokens`). |

`lib/vane/claude.test.ts` covers each of these with a stand-in for the SDK client; no test calls Claude.

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
4. Give each reader role a password by hand on the server, so none is kept in git, and keep the two connection strings with the worker's secrets:

   ```sql
   ALTER ROLE vane_reader LOGIN PASSWORD '…';
   ALTER ROLE vane_reader_private LOGIN PASSWORD '…';
   ```

   Vane reads through its own connection as one of these roles, never by `SET ROLE` on the app's connection: from the app's connection a statement could switch the role back. The worker binds the connection inside the reading transaction (the app writes the `VaneReaderScope` row for that connection's `pg_backend_pid()`), runs the question read-only with a 5 s statement timeout and a 500-row cap, and deletes the binding.

## Not built yet

The worker that runs Vane's jobs and binds its reader connections, the tools it reads and drafts with, its pages and the Vane button. The designs are on the Core modules canvas, Vane page.
