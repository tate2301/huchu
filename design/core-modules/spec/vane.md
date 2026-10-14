# Vane

Vane is Corelith's assistant. It is always working: it watches every product a workspace runs, raises issues, suggests the next action, breaks larger jobs into plans and drafts the work. People send, pay, save and change. Vane never does those itself.

Screens: `vane`, `books-vane`, `books-bank`, `reports-insights`, `report-build-vane`, `management-vane`.

## How it shows up

| Place | What it shows |
|---|---|
| Rail | Vane's own module, above Settings, with its mark |
| Every top bar | The Vane button: mark, "Vane", the count of open items, and a pulsing dot while it is working. Pressed state when the panel is open |
| The Vane panel (right, 400 px) | Header with "Working" and Pause and Close; what it is doing now; For you cards for this module first; plans broken down; Done while you were away; "Give Vane a job" at the foot |
| `/vane` | Everything across products: For you, Working on, Plans, Done, Muted, and what it watches |
| Inside modules | Bank lines it matched (each with its reason and Accept), insights it wrote, a question it wrote in the report shelf with Keep or Not now |

## How Vane speaks

- First person, plain, specific: names, amounts with currency and both decimals, dates.
- A card is a kind (Issue or Suggestion) and its source, one headline that states the fact, one or two sentences of reason, and a closing "Let's …" proposal.
- The button names the act: "Send 3 reminders", "Show the sales", "Open the invoice". Never "Let's go", "Do it", "OK".
- Issues use the warning colour on their icon only. Nothing else in Vane uses colour except the accent on the live dot and plan progress.
- Every card can be dismissed (Not now). Dismissed items go to Muted, with the reason if given.

## What it does on its own, and what waits

| On its own | Waits for a person |
|---|---|
| Read (through the read-only role below) | Send a message, reminder or quote |
| Work out figures, compare with habits | Accept a bank match |
| Draft invoices, reminders, questions, insights | Pay or record a payment |
| Propose bank matches | Save or publish a report or form |
| Break a job into a plan and do its read-only steps | Change any record |
| Write For you items and plans | File a return |

Enforce this on the server. Vane's tools can only write to its own tables and to draft rows (`status = 'draft'`, `created_by = 'vane'`). Sending, paying, accepting and publishing go through the app's normal endpoints, called by a signed-in person.

## Architecture

```
record changes (outbox / LISTEN-NOTIFY) ─┐
schedule: every few minutes               ├─> vane worker (per workspace queue) ─> Claude API (Messages, tool use)
nightly run at 06:00 workspace time       ─┘          │                                   │
                                                     ├─ tools ─> read-only SQL, records, drafts
                                                     └─ writes vane_* rows ─> live channel (SSE) ─> top bar, panel, /vane
```

- One queue per workspace, so one busy workspace never slows another. Jobs are idempotent: a job keyed by (workspace, kind, subject, day) runs once.
- Triggers: a new or changed record in a watched module; the schedule; the nightly run (insights, overnight matching, plan steps); a person's "Give Vane a job".
- Quiet hours (default 20:00 to 06:00) hold notifications, not work.
- The live channel pushes: working state, the current job's label and progress ("38 of 61 lines"), counts for the top bar, new items.

## Claude API

- Call the Anthropic Messages API from the worker only. The key lives in the server's secrets; it never reaches the browser.
- The model is set in config (`VANE_MODEL`). Don't hard-code a model name.
- Use tool use. Tools:
  - `run_sql(sql, purpose)`: runs as the `vane_reader` role (below), read only, statement timeout 5 s, 500-row cap. Returns rows and the SQL.
  - `get_record(type, id)`: one record with its links, through the same role.
  - `draft(type, payload)`: creates a draft invoice, reminder, quote message, report question or insight. Returns the draft's id.
  - `propose_item(kind, source, headline, body, action, read_from, sql)`: writes a For you item.
  - `propose_plan(title, due, steps[])`: writes a plan; each step is owned by Vane or by a person.
- Cache the schema description and the workspace's lexicon with prompt caching; they change rarely.
- Every item keeps the SQL it ran and what it read (`read_from`), so a person can check it. This follows the Reports rule: only SQL and rows are stored.
- Log every call in `vane_jobs`: input and output tokens, duration, tools called, result. Count jobs against the workspace's monthly allowance.

## Read-only role

- `vane_reader`: SELECT only, row-level security by workspace, no access to tables or columns marked private (pay, national ID, bank details of people, personal phone numbers). The Management switch "People's pay and personal details" maps to these grants and is off by default.
- Fitters' questions to Vane run with their own scope: their site visits and quotes only.

## Tables (propose with the migration before creating)

| Table | Columns |
|---|---|
| `vane_items` | id, workspace_id, kind (`issue` \| `suggestion`), source_module, subject_type, subject_id, headline, body, action (jsonb: type, label, shortcut, target), read_from (jsonb), sql, status (`open` \| `done` \| `muted`), muted_reason, audience (role or user), created_at, resolved_at, resolved_by |
| `vane_plans` | id, workspace_id, title, due_on, status, created_at |
| `vane_plan_steps` | id, plan_id, position, label, owner (`vane` \| `person`), status (`todo` \| `now` \| `done`), progress_label, done_at |
| `vane_jobs` | id, workspace_id, kind, label, trigger, started_at, finished_at, progress_done, progress_total, tokens_in, tokens_out, tools (jsonb), result, error |
| `vane_settings` | workspace_id, watches (jsonb by module), raise_issues, plans, drafts, quiet_from, quiet_to, routing (jsonb: issue kind → roles), monthly_allowance |

Drafts live in their own tables (invoices, messages, report questions) with `status = 'draft'` and `created_by = 'vane'`, so the normal screens show them.

## States still to draw (build with a plain version, flag in NOTES.md)

- Paused: the dot stops, "Paused" replaces "Working", items stay readable.
- Over the monthly allowance: work stops after the current job; Management shows the allowance as full.
- Could not work it out: the item says what it tried and which records were missing, with "Show the rows".
- The Claude API is unreachable: jobs wait and retry with backoff; the top bar shows the last time Vane worked.

## Examples drawn (fixture data)

- Overdue: $2,480.00 across INV-0131 Chisipite Dental ($1,240.00, 12 days), INV-0135 Highlands Guest Lodge ($860.00), INV-0137 Msasa Motors ($380.00). Three WhatsApp reminders drafted at 06:02.
- Cash-up: Till 1 short $12.00 on Mon 5 Oct, $8.50 on 14 Sep, $20.00 on 24 Aug, each on the morning shift.
- Won with no invoice: Borrowdale Brooke Clinic, $6,400.00.
- Quote waiting: Pomona Offices, 212.40 m², $8,930.00, drafted Tuesday.
- Bank: 4 CBZ lines since Friday, 3 matched (EcoCash settlement $1,412.50 to Thursday's EcoCash sales; $500.00 to INV-0142; −$312.40 to the Halsted Builders bill), 1 unmatched (−$18.00 service fee, suggested as bank charges).
- Plan: VAT for September, due 25 Oct: match CBZ lines (Vane, done), find VAT numbers on 2 receipts (Vane, now), check the return (you), file it on ZIMRA's portal (you).
- Reports: Monday board narrowed by fitter every week, so Vane wrote "by fitter": Kuda 29 visits, 14 accepted, $13,205.40; Farai 26, 13, $12,869.60; Tinashe 31, 15, $12,840.00.
