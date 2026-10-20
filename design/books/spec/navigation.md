# Navigation

Books lives in the workspace shell: the rail, then the module panel. The panel drills down a level at a time (`bk-nav`). Money is the page Books opens on. Each group opens its own level; the chevron before the level title goes back. Counts on a row are things waiting for someone.

| Level | Rows | Tier |
|---|---|---|
| Money | (the page) | Screens |
| Sales | Invoices, Quotes, Payments received, Credit notes, Customers | Screens |
| Bills & spending | All spending, Bills, Payments made, Purchase orders, Requisitions, Claims & petty cash, Suppliers | Screens |
| Bank & cash | Accounts, To match, Reconciliations, Takings | Screens |
| Tax | What's due, VAT returns, Withholding, Provisional tax, Fiscal register | Advanced |
| Close the month | Checklist, Needs posting, Rates & revaluation, Year end | Advanced |
| Ledger | Journals, Trial balance, Financial statements, General ledger, Chart of accounts, Cost centres, Posting rules, Audit trail | Advanced |
| Settings | Numbering, Tax codes & rules, Locks & periods; four rows open Management (Money and tax, Money accounts, Approvals, Accountant export) | Screens |

Below the levels on every page: Saved views (shared and personal) and Reports from Books.

Who sees which level is in `permissions.json` (`levels`). Hiding a row is never the check; the server refuses on its own.

Routes are in `screens.json`. Every list keeps its tab, filters, sort and page in the URL. Records open beside the list first (peek), then full page.

`source/bk0.mjs` holds the tree as `BK_TREE` and the panel as `bkNav(level, on)`; the `plan10` variant draws the $10 plan with the advanced levels locked.
