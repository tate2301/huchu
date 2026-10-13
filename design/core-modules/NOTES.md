# Notes from the build

What the build could not match, decided differently from the boards, or built with a placeholder. Newest first within each section. The placeholders still waiting on the owner (`spec/open.md`) are at the end.

## How the screens are checked

- `tests/visual.spec.ts` compares each `/design/<slug>` fixture with the reference PNGs. The references were rendered on another machine: here, the kit's own HTML for a screen differs from its reference by 0.2% to 1.7% before any app code is involved (books-money at 390 is 1.67%), because text rasterises differently. So the 1% bar sits at this machine's noise floor.
- `tests/parity.spec.ts` (added) renders the kit's HTML and the fixture in the same browser and compares those, with the same 1% and 8px. It runs every screen whose fixture exists (`app/design/<slug>/page.tsx`).
- Run both: `BASE_URL=http://localhost:3000 npx playwright test -c design/core-modules/tests`.

| Screen | Parity 1440 | Parity 390 | Parity dark | Against the reference (1440 / 390 / dark) |
|---|---|---|---|---|
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
| Bank reconciliation | (Books not built yet) |
