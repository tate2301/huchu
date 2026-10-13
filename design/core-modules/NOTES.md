# Notes from the build

What the build could not match, decided differently from the boards, or built with a placeholder. Newest first within each section. The placeholders still waiting on the owner (`spec/open.md`) are at the end.

## How the screens are checked

- `tests/visual.spec.ts` compares each `/design/<slug>` fixture with the reference PNGs. The references were rendered on another machine: here, the kit's own HTML for a screen differs from its reference by 0.2% to 1.7% before any app code is involved (books-money at 390 is 1.67%), because text rasterises differently. So the 1% bar sits at this machine's noise floor.
- `tests/parity.spec.ts` (added) renders the kit's HTML and the fixture in the same browser and compares those, with the same 1% and 8px. It runs every screen whose fixture exists (`app/design/<slug>/page.tsx`).
- Run both: `BASE_URL=http://localhost:3000 npx playwright test -c design/core-modules/tests`.

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

- The top bar's sidebar toggle is gone; the panel's own Hide, the rail and Ctrl B hide and show the panel.
- The panel's search narrows the panel to matching items (/ focuses it). Search everything (Ctrl K) still opens the command palette.
- Management left the panel's foot; the gear is the way in.
- The Vane rail mark opens the Vane panel until `/vane` is built.

### Books

- Books is the accounting module, renamed: its rail item and panel say Books, and its home is Money (`/books`). Money, Invoices and Bank are new pages; Journals, VAT and the close stay on `/accounting/*` until they are restyled. The `/accounting` overview left the panel (Money replaced it) and is still there by its address.
- The panel lists Money, Invoices and Bank, then the accounting pages the module already had. The board's Payments, Takings, Expenses and VAT rows, Saved views and Reports from Books are not built yet.
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
- Vane's panel now sits under the top bar, beside the page, as the boards draw it. It used to run the full height of the window. A card can carry a second, quieter action ("Read them first").
- `--app-bar-h` is 56px, the kit's top bar, so pages that fill the screen subtract the right height.

### Management

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
