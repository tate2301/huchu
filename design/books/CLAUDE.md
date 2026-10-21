# Corelith Books: build brief

You are building **Books**, Corelith's money module, into the existing Corelith app (`<workspace>.apps.corelith.co.zw`), inside its shell. The design is signed off on a canvas: **Corelith Books** (https://claude.ai/artifact/7UwUCb2X1BU61dSv4wX49E). Make the app match it at 1440, at 390 and in dark mode, with real data and real states. Don't redesign, reword or add features. If something in the design looks wrong, write it in `design/NOTES.md` and build it as drawn.

Put this folder in the repository as `design/books/`. Paths below are relative to it.

## What Books is, in five lines

1. The **core** is free and always on in every workspace. It posts every sale, payment, payout and pay run from every module through one posting engine, whether or not the Books screens are bought.
2. The **Books screens** at `/books` cost $10 a month: Money, Sales, Bills & spending, Bank & cash, Settings.
3. **Accounting advanced** is on the $99 plan only: Tax, Close the month, Ledger.
4. Posted things never change in place. Void posts the mirror, revise voids and reissues, permanent delete is for the owner and the outside accountant, inside hard limits.
5. An **outside accountant** (the auditor) has the owner's rights. A **staff accountant** never voids, revises or deletes anything posted.

## What is in this folder

| Path | What it is | How to use it |
|---|---|---|
| `spec/books.md` | Tiers, roles, the lifecycle, void, revise and delete, the rules that hold everywhere, months and locks, density and edge to edge | Read first |
| `spec/posting.md` | Money events, posting rules, failure and retry, bank matching, revaluation | The engine |
| `spec/zimra.md` | Tax codes, VAT 7, withholding, IMTT, provisional tax, payroll taxes, fiscalisation | Rates and dates are settings |
| `spec/permissions.json` | Every role x action and role x level | Server tests are written from it |
| `spec/icons.md`, `icons/` | Corelith UI icons: the pack, its styles, and which icon goes where | Every icon comes from here; never another library |
| `spec/navigation.md` | The panel tree, levels, tiers, URL state | The shell for Books |
| `spec/integrations.md` | The Books pieces inside CRM, Retail, Payroll, Reports, Management and on the phone | Core, never plan-gated |
| `spec/screens.json` | Every screen: route, level, tier, phase, HTML, references, `worksheet` | Your screen list |
| `spec/world.json` | Floorcode on Tue 6 Oct 2026: people, customers, invoices, bills, accounts, totals | Fixture data; every figure adds up |
| `spec/shortcuts.md` | Every key on every screen | Wire them all |
| `spec/decisions.md` | Each decision with the owner's words | Read before arguing with the design |
| `spec/open.md` | What is waiting for the owner, what isn't drawn | Build the placeholder; don't invent |
| `spec/tokens.json`, `spec/rules.json`, `spec/lexicon.json` | Values, taste switches, one word per concept | Strings and components must pass them |
| `spec/design-ledger.md` | The design's working ledger: references, density reasoning, what changed when | Background |
| `html/bk-*.html` | The exact markup each reference came from, with `kit.css`, `tokens.css`, fonts and avatars. Each opens in a browser on its own | Source of truth for sizes, colours, gaps, words and data. Read these; don't measure the PNGs |
| `reference/*-1440.png`, `*-390.png`, `*-1440-dark.png` | Each screen rendered from its HTML | What it must look like |
| `source/` | `shell.mjs`, `bk0.mjs` to `bk8.mjs` and `ci.mjs` (the icon mapping), the generators of every HTML file (`build-bk.sh` runs them) | Ground truth when the HTML is unclear. `bk0.mjs` holds the world, the kit helpers and the panel |
| `tests/` | `worksheet.spec.ts`, `permissions.spec.ts`, `review.spec.ts` | Acceptance |

## Before the first edit

1. Read the repository: router, styling, component folder, theme, data layer, auth, background jobs, how it runs and tests. Follow its conventions over anything here. If the Corelith core-modules work (worksheet table, shell, kit, Vane) is already in the repo, reuse it. Don't fork a second table or button.
2. Read `spec/books.md`, `spec/posting.md`, `spec/decisions.md` and `spec/open.md`.
3. Run the app with a seeded workspace. Screenshot the CRM deals page, a Tender end of day and a Payroll run at 1440 and 390 into `design/books/before/`. Books must not break them.
4. Work on a branch. Commit when a step passes. Push only when asked.
5. Model, permission and plan changes (new tables, roles, plan flags) are proposed with their migration before they are made. Phase 1 is mostly this: write the proposal first and wait for a yes.

## Phases

One phase at a time, end to end, with empty, loading, error, offline and no-permission states. Each phase ends with its screens passing the tests below and a short summary with before and after screenshots.

### P1. The core: ledger, engine and rights (free, every workspace)

- Data model: chart of accounts, journals and lines, money accounts, parties, documents with lines, gapless number series, frozen rates and tax codes per document, approvals with snapshotted limits, periods and locks, the append-only audit trail. Propose the migration first.
- The posting engine: money events from Books, CRM, Retail, Payroll; posting rules as data; idempotent per event; failure with a reason; retries with back-off (`spec/posting.md`).
- Rights on the server: every role x action in `spec/permissions.json`, plus the plan gate (core, screens, advanced) on every route and API. Table-driven tests for all of it, allowed and refused.
- The outside accountant as a kind of user with firm and access end date. Superuser change mode carrying the session number.
- Void, revise and delete posted as server operations with every refusal in `spec/books.md`, and bulk runs row by row.
- Management setup, free: Money and tax, Money accounts, Approvals (`bk-mg-*` in `screens.json`, phase P1).
- Fixture routes: `/design/books/<slug>` (development only) rendering each screen from `spec/world.json`, with `?as=<role>&plan=core|screens|advanced&theme=dark`.

Done when: the server tests pass; a CRM invoice, a Tender day close and a Payroll run each post balanced journals that match the posting blocks in their HTML; a missing rule fails into Needs posting instead of vanishing.

### P2. The $10 screens: Money, Sales, Bills & spending, Settings

- The `Icon` component over `icons/dist/icons.json` (`spec/icons.md`), then the Books panel and levels (`spec/navigation.md`), the plan states (`bk-x-noscreens`, `bk-x-advanced`).
- Money first. Then Sales: invoices, a record, new invoice from a quote, quotes, payments received, credit notes, customers, a statement. Then Bills & spending: all spending, bills, a bill with its approval, payments made, paying a supplier with withholding and IMTT, orders, requisitions, a requisition being accounted for, claims and petty cash, suppliers.
- Void, revise and delete refused on the record pages (`bk-void`, `bk-revise`, `bk-delete-refused`).
- Settings: numbering, tax codes and rules, locks and periods.

Done when: every P2 screen in `screens.json` passes the tests at 1440, 390 and dark; Money shows the world's totals exactly.

### P3. Bank & cash, and Books inside the other modules

- Accounts, To match with Vane's proposals (accept one by one or the batch), reconciliations.
- The core pieces in CRM (a deal's money, requisitions, the cost tracker on the phone), Retail (end of day, goods in and the draft bill), Payroll (the run and what it leaves to pay), Reports (eight reports from Books), and the phone screens (owner's Money, approve a requisition, a petty cash voucher). They work without the Books screens (`spec/integrations.md`).

Done when: the CBZ fixture reconciles with the 55.20 difference explained by IMTT and the fee; each module piece renders and acts in a workspace without the Books screens.

### P4. Accounting advanced, on the $99 plan: Tax, Close the month, Ledger

- Tax: what's due, VAT 7 (prepare, review, finalise), withholding with certificates, provisional tax, the fiscal register with retry (`spec/zimra.md`).
- Close the month: the checklist (failures first, fix or acknowledge with a reason, close posts the period voucher), needs posting, rates and revaluation.
- Ledger: journals, trial balance, statements, general ledger, chart of accounts, posting rules, audit trail. These use the dense worksheet: 32px rows.

Done when: the September close blocks on the failed fuel claim and the unsigned INV-0142 and closes once both are cleared; the trial balance totals 405,861.51 on both sides; the VAT return ties to 1,184.60.

### P5. Mass actions, outside accountants and export

- Bulk void and its results (Done, Unchanged, Skipped, Refused) with retry for refusals.
- The owner's permanent delete of test data, with the typed confirmation and the refusals.
- People in Management: the outside accountant's page with the access end date; access ends on the date by itself.
- Accountant export in Management (free): trial balance, general ledger, debtors and creditors by age, VAT working schedule, audit trail, XLSX or CSV, kept 30 days.

Done when: a 200-row bulk void finishes with the counts in `bk-bulk-result`; an expired outside accountant is refused on the server; the export opens in a spreadsheet and ties to the trial balance.

## Acceptance

Run `BASE_URL=http://localhost:3000 npx playwright test design/books/tests` (`npm i -D @playwright/test sharp` if missing).

1. **Tables.** `worksheet.spec.ts` checks every `worksheet` screen: app bar 48, column head 34, rows 40 on the owner's path and 32 on the advanced levels, no infinite scroll, J and K move. Mark bands with `data-band="appbar|toolbar|head|group|row|totals|pager"`.
2. **Edge to edge, one line, no explaining.** The same file checks that nothing in the main region (`data-region="main"`) is inset or centred, that no table row is taller than its band, that every panel row and page title has an icon, and that every note on a screen is a warning or refusal (`data-note="warn|bad"`) with a button in it.
3. **One world.** Money's fixture shows the totals in `spec/world.json` exactly.
4. **Rights in the interface.** `permissions.spec.ts` checks void is offered only to the roles allowed (mark menu items with `data-action="void|revise|delete"`), the $10 plan shows the upgrade on advanced levels, and no screens shows the add-on. The server tests from `spec/permissions.json` are the real check.
5. **Review.** `review.spec.ts` saves each built screen beside its reference at every width and theme in `reference/` into `design/books/review/`. It fails on sideways scroll at 390 and on text overflowing its box. The owner looks at the folder.
6. **Lint.** If the saas-design plugin is installed: `app-review/scripts/lint.mjs --tokens design/books/spec/tokens.json --rules design/books/spec/rules.json --lexicon design/books/spec/lexicon.json`. Zero blocks. Allowed warnings: the danger fill on void and delete, EcoCash named without its mark.

## Working rules

- Tables come only from the worksheet component, colours only from roles, type only from the theme.
- Edge to edge: no inset cards, no gutters, nothing centred. Bands split by hairlines.
- One line per table row. A second fact goes inline, muted; long text truncates. Rows never grow.
- The UI never explains itself: no helper text, notes or descriptions on app screens. Only warnings and refusals, one line, with their action.
- Icons only from Corelith UI icons (`spec/icons.md`), through one `Icon` component with a `style` prop. Every panel row, page title, primary action and listed record has one.
- British English, sentence case, no uppercase except the codes in `tokens.json` (`uppercaseAllow`). Strings come from the HTML, word for word.
- Every primary button shows its key and the key works (`spec/shortcuts.md`).
- Amounts: cents muted, a true minus, the currency named once in the column head. Money is stored in minor units with its currency and frozen rate; never floats.
- The assistant is **Vane**. Vane proposes and says what it read; a person presses the button. Enforced on the server.
- Rights and plan are checked on the server for every route, API and bulk row. Hiding a control is never the check.
- Nothing money-bearing is ignored: a failed event waits in Needs posting with its reason.
- No new dependency without a reason in the commit message.
