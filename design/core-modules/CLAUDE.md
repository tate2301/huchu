# Corelith core modules: build brief

You are building the core modules every Corelith workspace gets, whatever vertical it runs: **Reports & Insights**, **Explore**, **Books**, **People and payroll**, **Notifications**, **Build** (one builder for forms, documents, emails, reports and templates), **Branding**, the redesigned **Management**, and **Vane** (Corelith's helper). They go into the existing app in this repository, inside its shell. The design is on the Huchu Core Modules canvas, version 42, and every board of it is in `design/core-modules/boards/`. Make the app match it at desktop and phone width, with real data and real states. Don't redesign, reword or add features. If something in the design looks wrong, write it in `design/core-modules/NOTES.md` and build it as drawn.

Already on `main`: Vane's connection to Claude (`lib/vane/claude.ts`, `pnpm vane:ping`) and Vane's tables, the `madeByVane` mark and the reader roles (`20261012120000_vane`, `lib/vane/reader-access.ts`, `pnpm vane:reader-sql`). Where the build stands and what comes next: `docs/handover-core-modules.md`.

## What is in `design/core-modules/`

| Path | What it is | How to use it |
|---|---|---|
| `boards/index.html`, `boards/view/*.html` | Every canvas board, page by page, each opening on its own | What done looks like for every screen beyond the kit's 18 |
| `spec/boards.json` | Every board by page with the notes beside it | Your screen list beyond `screens.json`, and what the app has today |
| `boards/assets/core.css` | The kit, the shell and every page's styles the boards use | Read for sizes and gaps; port into components once |
| `boards/canvas/` | The canvas source (`canvas.json`, `.dc.html`) | Only to re-import into a canvas |
| `tools/boards/` | The generators that wrote the boards | Ground truth when a board leaves something unclear |
| `app/` | The saas-design project: brief, audit, world, tokens, rules, lexicon, ledger | Strings, states and components must pass them; the ledger holds the owner's corrections |
| `docs/handover-core-modules.md`, `docs/vane.md` (repo root) | Where it stands, the next steps, Vane's data and read rules | Read first |
| `spec/screens.json` | Every screen: its app route, module, HTML file, and references at 1440, 390 and 1440 dark | Your screen list and your test list |
| `reference/*-1440.png`, `*-390.png`, `*-1440-dark.png` | Each screen rendered at 2x | What done looks like |
| `html/*.html` | The exact markup each reference came from, with `kit.css`, `tokens.css` and the marks beside it. Each opens in a browser on its own | The source of truth for every size, colour, gap and radius. Read these; don't measure the PNGs |
| `html/kit.css` | The component kit: buttons, rows, tables, footers, segmented controls, switches, meters, status | Port it into the app's components once. Don't copy it per screen |
| `spec/tokens.json`, `spec/tokens.css` | Colours, type, spacing, radii, shadows, motion, light and dark | Map into the app's theme as CSS variables |
| `spec/rules.json`, `spec/lexicon.json` | Taste switches and the one word per concept | Strings and components must pass them |
| `spec/world.json` | Roles, records and states the mocks were drawn against | The model behind the screens |
| `spec/shell.md` | The rail, module panel, top bar, toolbar, footer, the builder's grid and Management | Build first |
| `spec/vane.md` | Vane's behaviour, data model, the Claude API integration and its limits | The one new engine in this work |
| `spec/reports-and-books.md` | Reports, the builder's shelf, insights, Books, bank matching | Module rules |
| `spec/management.md` | The Management tree, billing, integrations, marketplace, Vane settings | Module rules |
| `spec/shortcuts.md` | Every keyboard shortcut. Every primary action has one | Wire them all |
| `spec/decisions.md` | Each decision with the owner's words that caused it | Read before arguing with the design |
| `spec/open.md` | What is still a placeholder or not yet drawn | Build with the placeholder; don't invent the rest |
| `source/shell.mjs`, `source/build2.mjs`, `source/_lib.mjs` | The scripts that generated every HTML file | Ground truth when the HTML leaves something unclear |
| `tests/visual.spec.ts` | Playwright test against the references | Acceptance (below) |

## Before the first edit

1. Read the repo: router, styling, component folder, theme, data fetching, auth, how it runs and tests. Follow its conventions over anything here.
2. Read `spec/shell.md`, `spec/vane.md` and `spec/decisions.md`.
3. Run the app with a seeded workspace and screenshot the current CRM deals page and `/management/master-data/hr/job-grades` at 1440 and 390 into `design/core-modules/before/`. These are the pages the new shell must not break.
4. Work on a branch. Commit when a step passes. Push only when asked.

## Order of work

1. **Tokens and kit.** Wire `tokens.css` into the theme, light and dark. Port `kit.css` and `boards/assets/core.css` into components: Button (with the `kbd` slot), ButtonGroup, Segmented, Input with icon and kbd, Select, Switch, Meter, Status, Pill, Row, List, Table with the footer and selection bar, Finding (the two-tone lede sentence), GroupHead, FormSection, Tabs, figure tiles, the drawer.
2. **The shell.** Rail (with Explore and People), module panel, top bar with the Vane button and the bell, toolbar. Then Management's full-page sidebar. Management is reached from the gear, never from the panel's foot. Check CRM deals still renders.
3. **Management.** Job grades first (it has data), then Billing, Integrations, Marketplace, Vane, Pay and statutory, Notifications, Explore.
4. **Books.** Money, Invoices (selection footer works), Bank, Journals, VAT, the close.
5. **Reports & Insights.** One destination: Overview, Insights, All reports, the board, the builder with resizable outline, inspector and shelf; then each vertical's reports and insights from the Reports & Insights page.
6. **People and payroll, Notifications, Branding.**
7. **Build.** One builder for forms, documents, emails, reports and templates on the builder grid from step 5; the Build home and templates.
8. **Explore.** Guarded SQL for power users, built on the same reader pattern as Vane.
9. **Vane.** The reader connection and tools, the worker, the live channel, the panel, `/vane`, and Vane inside each module (`docs/handover-core-modules.md` §3).

One module end to end before the next, with its empty, loading, error and offline states.

## Fixture routes for the visual test

Add `/design/<slug>` routes (development only) that render each screen with the fixed Floorcode data in the HTML: the same customers, invoices, totals and times. Real routes use real data; the fixture routes exist so the test can compare like with like. Every figure in the fixtures adds up across screens (for example $2,480.00 overdue = 1,240 + 860 + 380). Keep them exact.

## Acceptance

`tests/visual.spec.ts` loads each `/design/<slug>` at 1440 and 390 (2x) and 1440 dark, takes a full-page screenshot and compares it with the reference.

- At most 1% of pixels may differ (pixelmatch threshold 0.1). Page height within 8 px.
- Run: `BASE_URL=http://localhost:3000 npx playwright test design/tests`.
- When a screen fails, open its `html/` file beside your page and fix the difference. Don't change the test or the references.
- Also run the saas-design lint on the built pages if the plugin is installed (`app-review/scripts/lint.mjs --tokens design/app/tokens.json --rules design/app/rules.json --lexicon design/app/lexicon.json --world design/app/world.json`). Zero blocks.

## Working rules

- British English, sentence case, no uppercase anywhere except the codes allowed in `tokens.json` (`uppercaseAllow`).
- Every primary button shows its shortcut and the shortcut works (`spec/shortcuts.md`).
- Corelith's helper is called **Vane** in the interface. Never "AI", "Claude", "assistant" or a sparkle icon. Claude is named once, on Management → Vane, as what Vane runs on.
- Vane never sends, pays, saves or changes anything by itself. A person presses the button. This is enforced on the server, not only in the interface (`spec/vane.md`).
- Reports store only SQL and rows. Steps, the builder, insights and Vane's answers are views over them.
- No new dependency without a reason in the commit message.
- Model or permission changes (new tables, new roles) are proposed with their migration before they are made.
- Every panel in a builder resizes from its edge; keep each person's widths.
- New tables are unreadable to Vane until granted: paste the lines from `pnpm vane:reader-sql` into the migration that adds them.
- Vane reads through its own database login, never `SET ROLE` on the app's connection.
