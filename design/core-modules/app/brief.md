# App brief

Assumptions made without asking:

- The product is Corelith; the repository is `tate2301/huchu` (the Huchu codebase). The canvas is "Huchu Core Modules".
- The core modules are the same in every workspace; only the theme (Corelith, Tender in retail, Campus in schools) and the starters change by vertical.
- Floorcode (CRM) is the workspace the boards are drawn with, unless a board names another.

## The idea

Every workspace gets the same core modules (Reports & Insights, Explore, Books, People and payroll, Notifications, Management, Build) and Vane, which reads what a person could read, notices what needs doing and drafts the work, while a person always presses the button.

## People

| Role | Buys or uses | Device and conditions | Opens the app to |
|---|---|---|---|
| Owner | Buys | Laptop, end of day | See what needs doing, approve, read insights |
| Office (accounts, admin) | Uses | Laptop, all day | Invoices, bank, VAT, the close, reports |
| Fitter | Uses | Phone, on site | Run a visit, send the drafted quote |
| Payroll officer | Uses | Laptop, month end | Run pay, submit, file returns |
| Bursar (schools) | Uses | Laptop | Fees, reminders |
| Power user | Uses | Laptop | Explore: SQL against the workspace, guarded |

## Jobs, most frequent first

1. See what Vane raised and act on it (send the reminders, issue the invoice, accept the match).
2. Read a report or an insight, narrow it, send it.
3. Raise and chase invoices; match the bank; file VAT; close the month.
4. Run pay: draft, submit, approve, pay, file P2 and NSSA.
5. Build a form, a document, an email or a report in the one builder.
6. Ask the data a question in Explore.
7. Set the workspace up in Management.

## Scope

- Kind of work: redesign of the core modules plus new work (Vane, Explore, Bank).
- In: everything on the canvas (`spec/boards.json`, 102 boards on 10 pages).
- Out: vertical-specific screens (the till, site visit capture, gold allocations), except where a core module shows them.
- Already shipping (merged): Vane's connection to Claude (#208); Vane's tables, the `madeByVane` mark and the reader roles (#210); the reports engine, templates and the form builder layers built earlier.

## Stack

| | |
|---|---|
| Framework | Next.js (App Router; read `node_modules/next/dist/docs/` first: this version differs from older ones) |
| Styling | Tailwind with CSS variables; the kit's `tokens.css` and `kit.css` |
| Component library | The repo's own components; port `html/kit.css` and `boards/assets/core.css` into them |
| Icons | The filled kit icons (`tools/boards/icons.json`, mapped in `tools/boards/glyphs.py`) |
| Data layer | Prisma on Postgres (Neon in production); workers in `scripts/*-worker.ts` |
| Deploys to | Vercel (the build does not run migrations) |

## Constraints

- Connection: patchy on site; fitters' screens must survive offline.
- Regulation: ZIMRA (VAT, fiscalisation), NSSA, PAYE; people's pay and personal details are private by default.
- Languages and currencies: British English; USD first, ZiG and others beside it; two decimals always.
- Hardware: phones on site, laptops in the office, tills in retail.
- Dates: Africa/Harare.

## Where the work happens

Both. The canvas (claude.ai artifact `NuvB8NYPW21mFrK5twsVkT`, version 42) holds the design; this folder carries all of it. The repository is the truth once a screen is built. Run with `pnpm dev:up`; tests with `pnpm test`.

## From the brand

- Accent, typeface, mark: blue `#2563eb`, Inter, the Corelith mark; Vane's mark is an ink tile with a white vane arrow.
- Rules carried over: sentence case, no uppercase, every primary button shows its shortcut, Management behind the gear and never on the panel's foot.
