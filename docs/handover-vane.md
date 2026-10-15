# Vane: handover, with the boards and the plan for building /vane

Where Vane stands on `main` (13 October), every board it was designed on, and the order to build the rest in. Read `docs/vane.md` for its tables, its tools and what it may read. Read `design/core-modules/BUILD.md` for how a screen is built and checked.

## Where it stands

### The engine (PRs #208, #210, #214–#218)

| Piece | Where |
|---|---|
| The connection to Claude. The model comes from `VANE_MODEL` (Sonnet 5.5 in production); the key stays on the server | `lib/vane/claude.ts` |
| Vane's tables, the made-by-Vane mark on draft invoices, quotations and purchase orders, and the two reader roles | `20261012120000_vane`, `lib/vane/reader-access.ts` |
| **The reader.** One question for one workspace, through Vane's own login, never `SET ROLE` | `lib/vane/reader.ts` |
| **The tools.** `describe_table`, `run_sql`, `get_record`, `propose_item`, `propose_plan` | `lib/vane/tools.ts` |
| **The jobs.** The nightly look at 06:00, and one job a tick on the scheduled-jobs tick. They hold back when the workspace is paused or the allowance is used, and retry with backoff | `lib/vane/jobs.ts`, `app/api/cron/tick` |

### The interface (PR #213)

| Piece | Where |
|---|---|
| The Vane button in every top bar: the mark, "Vane", the open count, the live dot | `components/vane/vane-button*.tsx` |
| **The Vane panel**, docked beside the page under the top bar. It shows For you (this module first), working on, plans, done and Give Vane a job, with Mute and a second, quieter action on a card | `components/vane/vane-panel*.tsx`, `lib/vane/panel.ts` |
| **Management → Vane.** What it watches (pay and personal details off unless turned on), what it does ("Send, pay, save or change" is fixed at Always asks), when it works (working, waiting, paused, quiet hours, who hears about what), and this month against the allowance. It is the one place Claude is named | `app/management/vane`, `lib/vane/settings.ts` |
| **The APIs** | `GET /api/vane/status`, `GET /api/vane/panel`, `POST /api/vane/jobs` (Give Vane a job: a `PERSON` job the tick runs), `POST /api/vane/items/[id]/mute`, `GET` and `PATCH /api/vane/settings` |
| **Insights** are `VaneItem`s of kind `INSIGHT`, left out of For you and the button's count. Reports' Send it is a person's action only; Vane has no route to it | `lib/vane/status.ts`, `/reports/insights` |
| The design fixtures for Books with Vane open and Management → Vane | `/design/books-vane`, `/design/management-vane` |

## The boards

All 25 are on the Core modules canvas, Vane page. Each opens on its own as `design/core-modules/boards/view/<Board>.html`. Read one cheaply with `python3 -I design/core-modules/tools/check/outline.py <Board>`. The same boards as 2x images are in `vane-boards.zip`, numbered in the canvas's order.

| # | Board | What it is | Route | State |
|---|---|---|---|---|
| 1 | Main | How Vane works | reference | |
| 2 | VaneTouch | Where people meet Vane | reference | |
| 3 | VaneComponents | Components and states | reference: the parts list for this work | |
| 4 | VaneRules | The rules | reference | |
| 5 | VaneForYou | For you | `/vane` | built: designcheck 98%, clean at 1440 and 390 |
| 6 | VnTree | The tree | reference | |
| 7 | VnUseCases | Use cases | reference | |
| 8 | VnTemplates | Vane's templates, with reports and forms | reference | |
| 9 | PageVaneCard | A card, and what Vane read | a card's "What I read" | built (`/vane?card=<id>`): 92.9%; What it drafted waits for the `draft` tool |
| 10 | PageVanePlan | Plans | `/vane/plans` | built: 94.4% (⌘ for Ctrl on a Mac) |
| 11 | PageVaneJob | Give Vane a job (Ctrl J) | the panel's chat | replaced on 14 October by the panel's chat: Ctrl J opens the panel at its box, from any page |
| 12 | PageVaneDone | Done | `/vane/done` | built: 97.7% |
| 13 | PageVaneMuted | Muted | `/vane/muted` | built: 97.9%, with "Stop it for me" (a card's `topic`, `VaneTopicStop`) and Show it again |
| 14 | PageVaneStates | Paused, over the allowance, could not work it out, cannot reach the service | the four states, on `/vane` and in the panel | built (`VaneStateNote`), with "Paused by James" and Show the rows |
| 15 | PageVaneReport | Explain a figure, on Deals | on a report page | built: the panel on a report asks about it; answers carry a table and What I read; Keep this view (`reports.template.save`) |
| 16 | PageVaneBlock | A block in the builder, waiting to be kept | in the report builder | built: "Give Vane a change to make" in a custom report's builder; Vane's block is checked, shown as not kept, saved once kept |
| 17 | VnRequirements | Requirements and the migration | reference | |
| 18 | VnInteractions | Interactions | reference | |
| 19 | PageVaneForm | Changes to a form, from its answers | in Build | built: "Read the answers for changes" in a site-visit form's settings; require, add an option, a quote line's waste; Keep joins the draft |
| 20 | PageVaneDocument | A quote checked, and the message written | on a quotation | built: the quote's rail checks its lines against the price list; Write it with Vane in its email |
| 21 | PageVaneDraft | Vane's draft invoice, in Books | `/books/invoices/[id]` | built: the `draft` tool drafts an accepted quote's invoice as Vane's ("Vane's draft" in the list). The invoice's page shows Vane's note, the lines, and what changed since the quote; Issue and Delete the draft there or as approvable actions |
| 22 | PageVaneRetail | Retail: orders drafted from Stock to reorder | in Retail → Buying | built: the `draft` tool drafts a reorder as Vane's ("Vane's draft" in Orders); retail.order.send sends it |
| 23 | PageVaneSchool | Schools: fee reminders drafted | `/schools/finance/reminders/[id]` | built: `schools.fees.remind` lists every family who owes, unticked where Vane left them out with why; its page ticks families, changes the words for all, says who has nobody on the portal, and sends or discards |
| 24 | PageVaneMine | Gold mine: a work order drafted from Downtime | `/maintenance/work-orders/[id]` | built: the `draft` tool drafts a work order from the equipment's history (migration `20261015100000_vane_finish` gave work orders a workspace, maker, priority and Vane's mark); its page shows the history and parts against stores; Raise the work order or Delete the draft. Downtime events have no equipment, so the history is the equipment's earlier work orders |
| 25 | PageVanePhone | A fitter's phone, only his own visits | the panel at 390 | built: a rep's Vane reads as `vane_reader_rep`, their own visits and quotes only; their panel shows only cards addressed to them |

Already built from other pages' boards: BooksVane (Books → Money with Vane open) and MgmtVane (Management → Vane, scores 100%).

## Changed on 14 October: Vane acts, with approval

The owner moved Vane to the rail only (its mark opens the panel; no top bar button, no Give Vane a job dialog), gave the panel a chat that holds while Vane works and always offers suggestions, and let Vane carry out what it recommends once a person approves: quick actions on cards (a due date set in place), several at once from one answer, each approved or denied. Built in `lib/vane/actions/` (fourteen kinds across Books, CRM, Retail and Vane's plans, see `docs/vane.md`), `lib/vane/chat.ts`, migration `20261014090000_vane_chat_actions`. The module code each runs was taken out of its route first (deal stage, CRM activity, the lists' bulk changes, sales invoice and quotation), so the route and Vane share it.

The panel's look follows Claude's chat inside the kit: Vane's answers in plain reading text beside its mark, the person's words in a soft bubble, a shimmering line while it works, one rounded composer with the send button inside. Each product has its hue from the kit's categorical hues (Books `--hue-3`, CRM `--hue-1`, Tender `--hue-2`; `components/core/parts.css`): a card's strip, its product pill, an action's square and a suggestion's icon take it. Tone stays for state: an issue amber, done green, failed red, denied struck through.

## The plan for building /vane

Build one workflow at a time, end to end with its states.

**Checks for each screen:**
- `designcheck.mjs <Board> <url> --390 --shot` scores 95% or more.
- The page is clean at 1440 and 390.
- Typecheck and the touched tests pass.

**Words:**
- Vane is never called AI, assistant or Claude, and never shown with a sparkle.
- A card is a kind and source, one headline that states the fact, one or two sentences, and a closing "Let's …".
- The button names the act ("Send 3 reminders").
- Every primary button shows its shortcut.

### 1. `/vane`: For you (VaneForYou), then the states (PageVaneStates)

- **The page frame:**
  - The panel: For you, Working on, Plans, Done ("12 today") and Muted, each with its count, then Watching (the modules from `VaneSettings`).
  - The top bar: Search everything, the bell, the Vane button and Pause Vane.
- **The middle column:**
  - The finding: "Vane has 5 things for you and is working on 2."
  - The For you cards. The data is `vanePanel()` in `lib/vane/panel.ts`, extended across every module rather than this module first.
- **The right column:** Working on, with each job's label and progress; Broken down, the open plan and its steps (who owns each); Done today.
- **Pause Vane and Resume:** they write `VaneSettings.paused` through `PATCH /api/vane/settings`, which already checks the role.
- **The four states:**
  - Paused.
  - Over the allowance: this month's jobs against `monthlyAllowance`, and when it starts again.
  - Could not work it out: the job's error, what it tried (the job's `tools`), and Show the rows.
  - Cannot reach the service: the last time a job finished.
  - Each reads from `VaneJob` and `VaneSettings` and shows on `/vane` and in the panel.
- **Done when:** a person can see everything Vane has for them, pause it and resume it, and every state shows when it should.
- **Built.** `app/vane/page.tsx`, `components/vane/for-you-view.tsx` (fixture `/design/vane`), `components/vane/vane-state-note.tsx`, `components/vane/vane-module-panel.tsx`. `vaneStatus()` now carries the counts beside Vane's pages, when it was paused, over the allowance and could not work it out (`lib/vane/status.test.ts`). The rail's Vane mark opens `/vane`; the top bar's button opens the panel. To see it locally, `npx tsx scripts/seed-vane-demo.ts --slug <workspace>` writes the boards' cards, plan and jobs.

### 2. A card and what Vane read (PageVaneCard)

- **Opening a card:** it opens beside the list with its headline, body and action.
- **What I read:** the template or report it came from, the filters, the SQL and the rows, from `VaneItem.sql` and `readFrom`.
- **Actions:** the card's action button calls the module's own endpoint, which is the person's action. Not useful and Mute ask the reason, and Mute writes it.
- **Done when:** every card can be traced to the SQL and rows behind it.
- **Built.** `components/vane/vane-card-drawer.tsx`, `not-now-menu.tsx`; pressing a card's act records who took it further (`POST /api/vane/items/[id]/act`).

### 3. Plans, Done, Muted (PageVanePlan, PageVaneDone, PageVaneMuted)

- **`/vane/plans`:** each plan and its steps in order, who owns each, due dates and progress.
  - A person ticks their own steps.
  - Vane's steps tick as its jobs finish.
- **`/vane/done`:** finished jobs and kept cards by day, with what each read and cost.
- **`/vane/muted`:** muted cards with their reason, and Unmute.
- **Done when:** the three lists match their boards and the counts in the panel agree with them.
- **Built.** `lib/vane/lists.ts` (tested), `/api/vane/plans`, `/api/vane/plans/[id]/steps/[stepId]`, `/api/vane/done`, `/api/vane/muted`, `/api/vane/items/[id]/unmute`, and `/vane/working` (no board; drawn like Done). Vane moves its own steps with the `update_plan_step` tool (Now with its progress, then Done).

### 4. Give Vane a job, with Ctrl J (PageVaneJob): replaced by the panel's chat

- **The dialog:** it opens from anywhere with Ctrl J. It shows the box, examples from this module, and Give it to Vane (Ctrl ↵).
- **The data:**
  - It posts to `POST /api/vane/jobs`.
  - Keep the person's whole request. Today `giveVaneJob` writes it into the job's `label`, cut at 120 characters, and the tick reads the label as the instruction. Store the whole text and keep the label short.
- **After it posts:** the job appears in Working on at once.
- **Done when:** a long request reaches Claude whole, and the shortcut works from every module.
- **Replaced** on 14 October: the dialog and `POST /api/vane/jobs` are gone. Ctrl J opens the panel at its chat box from any page, and a request is a chat turn (`lib/vane/chat.ts`), answered while the person waits.

### 5. Live

- The button's dot, the count and Working on update without a reload.
- Use the existing stream (`app/api/notifications/stream/route.ts`). Until then, react-query polls `GET /api/vane/status` every 30 seconds.
- **Built.** The stream is now the workspace's one live channel, `GET /api/live`: `notifications` with the notification centre, `vane` when Vane's cards, jobs, plan steps or pause change (`lib/vane/live.ts`, tested). `components/layout/live-stream.tsx` in the shell refreshes the queries; the Vane polls are a 60-second fallback.

### 6. Vane inside the modules

In this order, each on the module's own page, each a person's action to keep:

1. **Explain a figure on a report (PageVaneReport).** A question to `run_sql` about the figure, answered in a card beside the report, with the SQL.
2. **The suggestion block in the report builder (PageVaneBlock).** Keep and Not now. In progress in PR #213's follow-up.
3. **A quote checked, and the message written (PageVaneDocument).**
4. **The `draft` tool.** It writes a draft invoice, quotation or retail purchase order through the module's own create functions, with `madeByVane = true` and no `createdById`. It never uses raw SQL, and it never sends. With it come:
   - Vane's draft invoice in Books (PageVaneDraft).
   - Retail orders drafted from Stock to reorder (PageVaneRetail).
5. **Schools: fee reminders drafted (PageVaneSchool).** Drafts that a person sends.
6. **Changes to a form, from its answers (PageVaneForm).** After Build.

## Decisions still open

| Decision | Until it is made |
|---|---|
| Vane's monthly allowance | 5,000 jobs (`VaneSettings.monthlyAllowance`); Management → Vane shows it against the month, and nobody can change it there |
| Report questions as drafts (a `CustomReport` block has no draft flag) | Vane keeps the question on its card until someone presses Keep |

## Rules that never bend

- Vane reads through its own login, never `SET ROLE` on the app's connection. (A rep's reading switches the reader's own connection to `vane_reader_rep`, which narrows it further.)
- New tables are unreadable to Vane until granted: paste the lines from `pnpm vane:reader-sql` into the migration that adds them.
- Vane never sends, pays, saves or changes anything by itself. A person presses the button, and the server enforces it.
- Claude is named once, on Management → Vane.
