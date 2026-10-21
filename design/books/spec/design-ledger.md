# Corelith Books, full design: ledger

Started 18 Oct 2026. Spec: "Books, final form" (the owner's plan, pasted). His words: "Move it into its own artifact and we will design it fully. Including its integrated components that show up in other modules like CRM, Retail, Payroll, Reports etc." "The direction you are going is good. I need you to optimize on density."

## Density: what the talk says, and what Books does with it

Talk: "Dense by design", Matthew Ström-Awn (mu.design), Config 2026. Built on his essay "UI density". Density is value delivered per unit of time and space, not things per screen. Five kinds: visual, information (Tufte's data-ink), design (gestalt decisions that carry meaning), temporal (how much a person gets done per minute; speed and perceived speed), value (outcome per time and space).

| Kind | Rule in Books |
|---|---|
| Value | Money answers "am I all right, and what needs me" inside 1440 x 900 without a scroll. Every region answers one question. |
| Information | No icon that repeats the column. Status is a dot and a word. Cents drop to muted weight in long columns (Mercury). Currency named once in the header, not on every cell. Account codes as mono, 12px. |
| Design | Group by proximity and alignment, not boxes. One tray per region, never a card per item. Rows with counts, not rows with paragraphs (Rillet's Needs action). |
| Temporal | Everything opens beside the list (peek) before it opens a page. Every primary action has a key; J/K moves; selection works on any list. Waits follow the thresholds: under 1s nothing, 1 to 10s a spinner, over 10s a count ("38 of 61 lines"), over a minute let them leave and notify. |
| Audience | Two densities. Owner's path (Money, Sales, Bills & spending, Bank & cash): 40px rows, sentences. Accountant's path (Ledger, Tax, Close): 32px rows, codes, more columns. Same kit, a `.dense` scope. |
| Chrome | Finding becomes one line at 20px (was two at 28px). Section heads 16px top, not 32. Tool row 48px. Saves about 120px a screen for rows. |

## References (saaslandingpage Finance tag pages 1 to 3, plus four accounting products)

| Ref | Take | Leave |
|---|---|---|
| Rillet | Home of three columns under a figure strip: Needs action as label + count rows, Close checklist with % and steps, Pinned reports. "As of" time on every figure. Close tasks with an assignee face. | Purple AI glow, landscape photos. |
| Campfire | Close checklist with progress; approval chain drawn as steps (Senior accountant → Controller → CFO). | Dark green marketing, 3D monitor. |
| Digits | Sidebar for the owner (Home, Checklist, Banks & cards, Bills, Financials, Ledger, Reconciliations). A summary column beside a list (Insights: Total, New customers). Lists grouped by party with a subtotal. | Glossy laptop frame. |
| Puzzle | The agent's result as a short table with a flag per row ("No usage in 60 days", "Duplicate seats"), then Review and approve / Send to my accountant, and "Nothing changes in your books until you approve it." | Purple grounds. |
| Ramp | One-line ticker of what the agents did today. Accounting automation rows: merchant, then the GL code chosen. Approval rule as a sentence ("If amount ≥ $5,000, require Department owner"). | Celebrity hero. |
| Mercury | Cents set smaller; accounts as name + balance rows; "3 auto transfer rules affect your accounts" as one footer line. | Dark ground. |
| Stripe Invoicing (earlier) | State tabs with counts; collections age bar. | Purple. |
| Operate (earlier) | Briefing, next decision, Done when. | Binder frame. |

Captured, nothing taken: Qonto, Routable, Finta, Osome, Increase, Monarch (marketing photography or consumer).

## Decisions

- One world: Floorcode (flooring, Harare), running CRM, Tender at the showroom, Payroll for fitters, Reports. The same names, codes and totals as the core canvas, extended.
- Worksheet tables everywhere (standing rule). Books' earlier `.table` screens are replaced.
- The tree in spec §3.2 is the panel, drilled level by level. Money is the first row.
- Vane stays: matches, reminders, posting fixes. Its work always says what it read.

## Built, 19 Oct 2026
- Canvas: https://claude.ai/artifact/7UwUCb2X1BU61dSv4wX49E, 68 boards over 9 pages. Generator: app/bk0.mjs to bk8.mjs, built with app/build-bk.sh (shell.mjs + bk*). Lexicon for Books: app/books-lexicon.json ("input" allowed: VAT input).
- Lint clean at 1440, 390 and dark, apart from: danger fill on the void and delete buttons (on purpose), and an EcoCash name without its mark in Tender's end of day.
- World ties out: owed 5,724.22, overdue 2,480.00, in 10,228.40, out 2,088.50 (= All spending), VAT 1,184.60 (= 2,670.21 − 1,485.61, USD 1,057.27 + ZWG 3,412.44), trial balance 405,861.51 both sides, P&L year to date = trial balance income and expense, CBZ statement 10,777.60 vs books 10,832.80 = the two charges, 55.20.
- Choices made for him: Money's first screen is three columns (Needs you as counted rows, Bank and cash, Coming up), no stat tiles. Old Books calendar strip dropped for a dated list (denser). Owner's path at 40px rows, accountant's at 32px. Invoices keep tabs with counts; the earlier status tiles are gone from the full design.
- Placeholders shown in-app: Books price (Add Books opens Billing), provisional tax 4th date marked "Date to confirm", withholding threshold held as a setting.
- Open for the owner (spec §9): screens price and tiers, per-person void grant, delete of posted documents, ledger start date, flagged ZIMRA items, ZWG base currency, reopen owner-only.

## Pricing and accountants, 19 Oct 2026 (his words: "screens is $10 per month and Accounting advanced is only available on the $99 plan. an accountant is given the same rights as owner if they are an outside user. we need this fo auditors. however internal accountants cannot void.")
- Tiers: core free; Books screens $10 a month (Money, Sales, Bills & spending, Bank & cash, Settings); Accounting advanced on the $99 plan (Tax, Close the month, Ledger). My reading of "advanced": the accountant's three levels; confirm.
- Outside accountant (auditor, from a firm, with an access end date) = owner's rights in Books, every act marked as theirs. Staff accountants never void, revise or delete posted documents; the per-person grant is gone.
- Changed boards: brief, model (three tiers, roles table with an Outside accountant column), nav (a $10 panel with the advanced levels locked), Management user page (Chipo Marange, Marange & Associates), audit trail, bulk void (done by Chipo), close and locks wording, no-screens ($10), new: an advanced level on the $10 screens.
- He moved four boards on the canvas; positions kept.

## Edge to edge, 19 Oct 2026 (his comments: "ui must be always edge to edge", "dont leave this gaps", "why is the main content centred?")
- Standing rule: app screens run edge to edge. No inset cards, no gutters. Rail blocks, facts, totals, trays and notes are full-width bands with hairlines between them.
- Causes: .ws had 8px padding and gap, plus align-items: center. The EDGE block in bk0.mjs removes all three. Close, Posting rules, Fiscal register and Bulk void were re-rendered (Version 8).
- Management pages (bk-mg-*) had the same fault: max-width 1040 and inset trays. Now edge to edge (Version 10).

## Handover, 19 Oct 2026 (his word: "handover.")
- Package: workbench/handover/corelith-books (CLAUDE.md, spec/, html/, reference/ at 1440, 390 and dark, source/, tests/). Phases rebuilt from the design because the pasted "Books, final form" text no longer exists in the session: P1 core, engine and rights; P2 the $10 screens; P3 Bank & cash and Books in other modules; P4 advanced ($99); P5 mass actions, outside accountants, export. His spec wins on scope if he drops it in as spec/books-final-form.md.

## Icons and comments, 19 to 20 Oct 2026
- His words: "your designs lack icons... create an icon pack, similar to nucleo icons... for every sidebar item, every primary actions and anything that is a noun". Built Corelith UI icons v1: 188 icons, 18px grid, 1.5 stroke, four styles (outline, outline duo, fill, fill duo), from a DSL with shared parts and badges (workbench/icons). Browser artifact: Corelith Icons. Books build swaps MingCute for the pack (app/ci.mjs, build-bk.sh); every panel row, page title, needs-you row and account row has its icon; the active row is filled.
- Then: "I prefer filled icons, or duotone ones... over 500 icons... efficient... reduce information density". v2 is a separate run from PROMPT.md (icons-pack), default fill duo.
- Canvas comments: tables broke when a cell had two lines → second lines now sit inline, muted, truncating; rows keep 40/32. "Why are you explaining all of this... the UI must speak for itself" → every neutral note stripped from app screens in the build (noNotes in BP); only warnings and refusals with their action stay. Money's bank table shows base-currency balances.
