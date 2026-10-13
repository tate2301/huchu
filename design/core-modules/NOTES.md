# Notes from the build

What the build could not match, decided differently from the boards, or built with a placeholder. Newest first within each section. The placeholders still waiting on the owner (`spec/open.md`) are at the end.

## How the screens are checked

- `tests/visual.spec.ts` compares each `/design/<slug>` fixture with the reference PNGs. The references were rendered on another machine: here, the kit's own HTML for a screen differs from its reference by 0.2% to 1.7% before any app code is involved (books-money at 390 is 1.67%), because text rasterises differently. So the 1% bar sits at this machine's noise floor.
- `tests/parity.spec.ts` (added) renders the kit's HTML and the fixture in the same browser and compares those, with the same 1% and 8px. It runs every screen whose fixture exists (`app/design/<slug>/page.tsx`).
- Run both: `E2E_BROWSER_EXECUTABLE=/opt/pw-browsers/chromium BASE_URL=http://floorcode.apps.pagka.local:3100 npx playwright test -c design/core-modules/tests`.

| Screen | Parity 1440 | Parity 390 | Parity dark | Against the reference (1440 / 390 / dark) |
|---|---|---|---|---|
| books-money | passes | passes | passes | not run |
| books-vane | passes | passes | passes | not run |
| books-invoices | passes | passes | passes | not run |
| books-bank | passes | passes | passes | not run |
| management-vane | passes | passes | passes | 1.59% / 2.67% / 1.51% |
| management-billing | passes | 84px shorter (see Billing) | passes | not run |
| management-integrations | 1.74% | 333px shorter | 1.95% | not run: lists only what the app connects (see Integrations) |
| management-marketplace | 1.70% | 227px shorter | fails | not run: no partner apps (see Marketplace) |

## Decisions

### The kit and the theme

- Corelith's theme roles now hold the kit's warm palette (`app/themes/roles.css`), and Corelith gets the kit's dark theme as `corelith-dark`. Retail keeps Tender's colours: the kit's colours are all roles.
- Corelith reads in Inter, from the file the references were rendered with. Tender keeps Atkinson Hyperlegible Next.
- The frappe theme sets `font-variation-settings: 'opsz' 24` on html, body, button, p, span and div. With Inter that pins the optical size; Corelith releases it so headings and notes take their own cut, as in the kit.
- The canvas boards set Inter's slashed zero; the kit's 18 screens, which the references come from, do not. The screens win. If the owner wants the slashed zero, it is one declaration in `build/build-kit-css.mjs`.
- The kit's stylesheet is generated (`build/build-kit-css.mjs` → `components/core/kit.css`) and scoped under `.ck`, the way the till scopes its kit. Bare-element rules go in the `base` layer and parts in `components`, so a page not yet built from the kit keeps working inside a `.ck` region. Each kit screen's own styles are scoped to `.sc-<slug>`.
- The app's nav icons stay Phosphor (filled). The kit's icon set is in `components/core/icons.ts` for kit pages; replacing every module's nav icons is not done.

### The shell

- The module panel draws the boards' groups (`PanelGroup`): a module's rows, its headed groups, then Saved views and Reports from <module> for the module the page is in. Saved views are kept per page address (`SavedView`, approved 13 Oct); in the CRM its lists keep their own saved views instead. The chevron on a group's head folds it.
- Reports from <module> lists the registry's reports (keyed by the page each is about) and the built-in custom reports (keyed by the reports they read) whose page is one of the module's rows. A module with none has no group. Books' two, "Money this month" and "Owed to you, by age", are built-in reports now (see Reports), so Books lists them. Financial reports stays in Books' More group: Reports from Books lists reports, and it is a page of its own; it is listed under From Corelith in All reports.
- The top bar's sidebar toggle is gone; the panel's own Hide, the rail and Ctrl B hide and show the panel.
- The panel's search narrows the panel to matching items (/ focuses it). Search everything (Ctrl K) still opens the command palette.
- Management left the panel's foot; the gear is the way in.
- The Vane rail mark opens the Vane panel until `/vane` is built.

### Books

- Journals' memo is the fill column, cut with an ellipsis; at phone width the table scrolls inside itself, Export keeps only its icon, and the view tabs go under the search. The `.table td.fill` rule is in `components/core/parts.css`: `kit.css` predates it in `core.css`, and regenerating `kit.css` now would also rename `.ws` to `.wt` under every Books page.
- Books is the accounting module, renamed: its rail item and panel say Books, and its home is Money (`/books`). Money, Invoices and Bank are new pages; Journals, VAT returns and Periods are rebuilt from the kit (now at `/books/journals`, `/books/vat`, `/books/periods`). The panel's Tax row reads VAT. The `/accounting` overview left the panel (Money replaced it) and is still there by its address.
- Books' panel is the boards': Money, Invoices, Payments, Takings, Expenses, Bank, VAT, then Ledger (Journals, Periods, Chart of accounts, as PageBooksJournals draws it; routes.md put Chart of accounts under More, the board wins), Saved views, and More, folded, with Receivables, Payables, Financial reports, Trial balance, the two summaries and Posting rules and Fiscalisation. The boards draw Ledger only on the ledger pages; it is shown on every Books page so Journals is reachable.
- The summaries' rows read "Receivables report" and "Payables report": "AR" and "AP" are not in the words allowed in capitals.
- Counts beside Books' rows: Invoices counts the invoices sent and not yet paid (the board's 3 is its overdue ones), Bank the statement lines still to match, Takings the tills closed on a day not yet closed and banked (`GET /api/books/nav`). Journals' count on the board is not drawn.
- Payments and Expenses are Receivables' receipts and Payables' bills on the kit (`/books/payments`, `/books/expenses`). Add a receipt and New bill open the existing forms. Receiving a draft bill stays on Payables. Takings is the retail End of day page (`/retail/end-of-day`), which is on Tender's kit already, and shows only where the tills are on.
- Journals, VAT returns and Periods moved to `/books/journals`, `/books/vat` and `/books/periods`; `/accounting/journals`, `/accounting/tax` and `/accounting/periods` forward there with their query. Tax setup stays at `/accounting/tax/setup`.
- Money's two sources are the tills (named after the site when there is one: "Showroom sales") and payments on invoices. The board's "3 payments on quoted jobs" reads "3 payments on invoices": Books does not know which invoices came from quotes.
- Money's cash-up line reads "Till 1 counted $420.60 against $432.60 expected." The board says "in cash sales", but what a till expects includes its float.
- In the bank: an account's balance is its opening balance plus what was recorded in and out. Other currencies are added to the total at the latest rate in Currency; with no rate, the total is left out and the accounts are listed.
- The app records banked till takings as DEBIT and every other deposit as CREDIT. Books reads the till's DEBIT as money in (`isMoneyIn`). The day close is not changed.
- New invoice, Add a receipt and Record a payment open the existing forms in Receivables and Payables.
- Invoices: "All invoices ▾" chooses All, Owed to you, Overdue, Paid or Drafts. Filter chooses when it was written (any time, this month, last month, this year). "Any customer ▾" chooses one customer. Columns hides When and Total. Export downloads the filtered list as CSV. The filters live in the address.
- Selected rows are tinted, as the kit's table does; the board draws them ticked but not tinted.
- Send reminders sends one WhatsApp to each selected invoice's customer when a person presses it, as the approved UTILITY template "invoice-reminder" ({{1}} the business, {{2}} the reminder), the way the till's messages go. The template has to be approved in WhatsApp Manager before reminders reach anyone. Rows with nothing owing or no phone number are skipped, and the toast lists each one and why.
- Print statements opens a printable page (`/books/statements`) with each chosen customer's invoices that still have money owing.
- Bank: Upload a statement (U) takes the CSV that online banking exports (a date, a description, and an amount or credit and debit columns). Lines already uploaded are left out. The lines join the account's open reconciliation.
- Bank: the matches are Books' matching rules (`lib/books/matching.ts`), worked out each time the page is read, so a match never points at an invoice that was paid since. They are not stored as Vane cards and are not made by the model. The finding says "Vane matched 3 of them"; the board's "overnight" waits for Vane's worker to do it on a schedule.
- Bank: Accept records the receipt or bill payment the way Receivables and Payables do (`lib/accounting/payments.ts`, which their routes now use too), then the bank transaction, then links the line. An EcoCash settlement and bank charges are recorded as bank transactions. Each match is checked again on the server when it is accepted. "Accept Vane's 3" accepts each match the same way. Choose lists open invoices or bills nearest the amount, recorded transactions for the same amount, and bank charges.
- Journals: a journal opens beside the list with its lines; a draft has Post this journal (Ctrl ↵), which asks why when its month is closed, and a posted one has Reverse, which asks why (optional). The board's Edit is not built: the app has no way to change a draft journal. New journal (N) opens a drawer with the lines, which must balance, and saves a draft or posts.
- VAT returns: the board's Prepare a return is a plain button, so the page has no top primary; each return's next step (Mark reviewed, Finalise, Mark filed) is the primary, with Ctrl ↵. Tax codes, categories, templates, rules and the VAT summary moved to Tax setup (`/accounting/tax/setup`), linked from the top bar there; the board has no place for them. The box table lists the return's lines by tax code, as the app computes them.
- Periods: the checks are about the oldest open month that has ended; with none, the finding says nothing is due to close. "Before the freeze" sets the period lock policy the app already enforces (nobody / managers with a reason / anyone with a reason); Save controls also saves the retained earnings account. Open a period keeps the optional opening balances the old page took, as JSON lines. A closed period has Reopen, which asks why.
- Vane's panel now sits under the top bar, beside the page, as the boards draw it. It used to run the full height of the window. A card can carry a second, quieter action ("Read them first").
- `--app-bar-h` is 56px, the kit's top bar, so pages that fill the screen subtract the right height.

### Reports

- A report (`/reports/[key]`, PageReport) is on the kit: the source line, the date and quick chips (Any <state>, Every owner), Search, Filters, Group by, Columns and As of; the key figures, the charts two to a row, then the table and its footer. Selecting rows raises the selection into the footer with the money total and Export. Deals now groups by stage when it opens, as drawn. The table keeps what it did: sort from the headers, fold a group, choose each column's total from its foot (the board draws no foot row, so it is quiet until hovered). On a phone the rows stay the one-line list.
- The figures strip shows how many rows and each total the view keeps (Deals, Value). The board's Won, Open and Lost are value by outcome, which no figures block computes; group or filter by Outcome to read them. The chart is titled from what it measures ("Value, by stage"); the board's "Open value" names a chart filtered to open deals.
- The panel this board draws (Overview, Insights, Areas with counts) is not the one ReportsAll draws, which the app has. The report boards' panel items are left out of their checks until Insights and Overview are built.
- More (⋯) beside Send it keeps what the old page had: Change the template, Reset the view, Build a report from this one, Arrange the page, and everyone's starting view.
- Save as a template, Export and Send it are kit drawers. Export: As (PDF, Excel workbook, CSV), Layout for a PDF, and Rows when rows are selected. Paper (the letterhead from Build) is not drawn: a report's PDF uses its document template, chosen in Templates, and the drawer has no list of them yet.
- Send it schedules into `ReportSchedule` (approved 13 Oct): how often, the day, the time on the workspace's clock (Africa/Harare), who it goes to (people in the workspace who can open the report, checked again at each send), PDF summary, PDF report or CSV, and the report's choices and view; never its dates, so each send reads the report's own period. Only a person starts one or starts it again; the drawer lists the report's schedules with Stop sending. The board's "Only when something changed" switch is not built: the approved fields have no place for it.
- The sender (`lib/reports/schedule-sender.ts`) renders each send the way Export does, for each recipient under their own role, and emails it with the app's mailer. The app has no HTTP cron (no `vercel.json`, no `app/api/cron`): the retail worker is the only scheduler, so it runs the sender every five minutes, and `GET /api/cron/report-schedules` (with `CRON_SECRET`) serves a scheduler that calls over HTTP. Each slot is claimed before it is sent, so a second caller sends nothing twice. Built and custom reports run their SQL in the browser, so they cannot be sent yet; only Corelith's reports have Send it.
- A built report (`/reports/built/[key]`, PageBuiltReport) is on the kit in the same frame: From Corelith, what it reads, the dates (named when they are the report's own: "Last 180 days, …"), its blocks, then Export and Make it yours (M). Export downloads each table on the page as CSV; a table's selected rows download from its footer. A custom report (`/reports/custom/[id]`) is drawn the same way, with Edit (E), Export and ⋯.
- All reports (`/reports`) is the board's: the view menu (All reports, Yours, Shared with you, From Corelith; the same four rows head the panel, with counts), Filter (which area), Anyone (who made it), Newest first, Columns and Export (the list as shown, as CSV). The view, folder, search and filters live in the address.
- "Yours and shared" holds the custom reports and the templates saved from Corelith's reports, which the old catalogue listed as "Made by your team" and "Just yours". A template reads as a Table and cannot be filed in a folder (only custom reports have a folder). "From Corelith" holds the registry's reports and the built-in custom reports; Make it yours copies one into the builder, as the report's own page did.
- The old catalogue's New template is not on the page: the board has no place for it, and Save as a template on any report does the same. Build a report became the board's New report (N), which starts the builder; in a folder, the new report is filed there.
- Folders: Add to Folders names one; each folder's menu renames or deletes it (its maker or a manager). Deleting puts its reports back in no folder. A report moves with the folder button on its row (whoever can change the report). The server checks every folder id against the session's company.
- The panel's Overview and Insights are not drawn: Insights (ReportsInsights) is its own piece of work and Overview has no board. Both are counted as missing in the check until they exist.
- Build in Reports' panel opens Templates at its forms and its document layouts, for the managers who can open Templates. The board's counts beside Forms and Documents are not drawn: the panel does not load the templates.
- Books' reports: "Money this month" is what came in this month by source (the tills, payments on invoices), as Money reads it, and the bills paid as money out, so its Amount total is the month's net. "Owed to you, by age" is every invoice with money owing, grouped Not yet due, 1 to 30, 31 to 60, 61 to 90 and over 90 days late. Both are in the registry, about `/books` and `/books/invoices`.
- Management → Reports moved to `/management/reports`; `/preferences/organization/reports` forwards there. Go back to its own and Clear the starting view are always drawn, greyed out when there is nothing to undo. "Reads" names the report's source key. On a phone the list and the chosen report take turns, and the Page column is left out.
- The check of Management → Reports still misses "Back to Floorcode" (the rail's back link is a plain link, which the check does not read as a button) and the rail's Pay and statutory and Explore (not built yet).

### Sample data the checks leave out (`tools/check/known.json`)

- PageReport, PageReportSend: the panel's Overview, Insights (Sales, Site visits, Team) and Areas with counts, which this board draws and ReportsAll does not; the charts' "Open value" and "$ thousands", the board's naming for its sample.
- PageBuiltReport: the same panel items; the board's "Reading it" text block, its table's Quotes, Jobs won and Share won, its m² totals and "sum of Area measured": the board's sample of the report, whose query has rep, visits, measured, quoted and won.
- ReportsAll: the folders Monday meeting, Fitters and Money are the board's; this workspace has none until someone makes one.
- PageReportsSettings: Tills, Till rules, Posting and Fiscal device are Shop rows of Management's rail (this workspace has no shop); the Activity lines (James, Rudo) and an Off report are the board's sample: nothing has been switched off or arranged here.
- BooksMoney, PageBooksJournals: the board's saved views (Overdue, Pomona Offices, Paid this month) now carry "shared" and "you"; still sample data. PageBooksJournals: the board draws JE-0419 open beside the list (Close, Post this journal, its Code, Account, Debit, Credit and Totals): a state mid-action.

### Management

- Management's back link names the workspace: "Back to Floorcode".
- Management is a page, not a dialog over the app. Below 1100px its sidebar hides and the page flows, as the kit draws it: on a phone there is no way to another Management page except Back. Built as drawn.
- Every register keeps its components; they take the kit's measures through the shared CSS module, so the record's mark tile, the section icons and the uppercase event chip are gone everywhere, not only on job grades.
- Job grades: no fixture route. The page is the register the other twenty share, restyled; a fixture would only copy the kit's HTML.
- Billing: Statements, Change (payment method) and Download (a payment's document) are not drawn: there are no invoice documents for the workspace's own subscription and no payment-method record. Add opens the plan and its prices, as Change plan did, since an add-on is arranged with Corelith.
- Billing shows the catalogue's prices (`lib/platform/feature-catalog.ts`), not the board's placeholders.
- Integrations lists only what the app can connect: WhatsApp Business (the platform's sending number), EcoCash (the till's payment settings), the ZIMRA fiscal device, bank statements (uploaded by hand; due after a week) and Facebook lead ads. The board's Gmail, Google Drive, Google Calendar, Xero and Microsoft Teams have no connection in the app, so they are not drawn. Manage and Connect go to each service's existing setup page.
- Marketplace lists Corelith's report templates (Add opens the report, where "Make it yours" is), its system document templates (Add opens Templates) and the add-ons the workspace does not have (Add opens Billing). There are no partner apps and no form templates in the product, so "Apps from partners" and Forms are empty. Adding into the one builder waits for Build.
- Vane → "Who hears about what": the board's line describes one routing ("Money issues to directors and accounts…"); the page describes how routing works and the drawer sets it per module and role.

## Placeholders still waiting (from `spec/open.md`)

| Item | Built with |
|---|---|
| Prices | The catalogue's prices, which Corelith operates |
| Vane's monthly allowance | 5,000 jobs, `VaneSettings.monthlyAllowance` |
| Fitters' questions limited to their own visits and quotes | Not scoped |
| The real list of reports Corelith ships | (Reports not built yet) |
| Builder states: empty report, failed SQL, publishing | (Builders not built yet) |
| Report questions as drafts | (Reports not built yet) |
| Bank reconciliation | Books → Bank: statement upload, matching rules, Accept |
