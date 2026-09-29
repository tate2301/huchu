# Retail, stores and till copy — the audit

**Date:** 2026-09-29 · **Base:** `main` @ `bf10edb` · Companion to
`retail-management-alignment-2026-09-29.md`, whose §3 (names) and §4 (writing)
this audit is the evidence for.

Read against `docs/ux/crm-polish-standard.md` Part 10 (COPY-1 to COPY-7) and
the management contract in `docs/crm/projects-and-money.md` ("How the pages are
drawn"). Line numbers are as of the base commit. Counts are approximate: string
literals and JSX text, counted by script and checked by hand.

Paths: `R/` = `app/retail/`, `S/` = `app/stores/`, `P/` =
`components/retail/portal/`, `CS/` = `components/stores/`, `nav` =
`lib/navigation.ts`, `WS` = `lib/workspaces.ts`, `WP` =
`lib/workspace-products.ts`.

---

## 1. One thing, many names

| Thing | What it is called, and where | Count |
|---|---|---|
| What the shop sells | "Products" (sidebar `nav:656`) · "Catalog" (rail, page title `R/catalog/page.tsx:400`) · "Catalogue item" (`R/catalog/[id]/page.tsx:81`) · "New item"/"Create item" (`R/catalog/page.tsx:356,620`) · "New catalog item" (`:495`) · "Sellable lines" (`:424`) · "Sellable retail items" (`:444`) · "Priced lines" (pricing `:229`) · column "Item" · "The range" (`[id]:87`) · "Stock line" (`[id]:196`) · "SKUs" (`R/reports/page.tsx:588`) | item ~177, line ~48, catalog 20, catalogue 12, product 10 |
| catalog / catalogue | US in 21 places, UK in 12, both in one file (`R/catalog/page.tsx`: the title says Catalog, the error and empty state say catalogue). `/stores/catalogue` is a different thing — the core item master. | |
| The stock record behind a product | "Stock item" · "Quick-create stock item" · "Inventory item" (`R/stock/count/page.tsx:59`, `S/inventory/page.tsx`) · "Stock line" · "Item" | |
| Prices | "Prices" (sidebar) · "Pricing" (rail, title, toasts "Pricing updated") · "Shelf prices" · "Sell price" · "Shelf price" · "Price lists" (stores) · "Was price" (`[id]:133`) vs "Compare at" (`catalog:589`, `pricing:97`) | |
| Counting stock | "Counts" (sidebar) · "Count" (rail) · "Stock Count" (title) · "Stock count" (buttons) · "Count a line" · "Post count adjustment" | |
| Asking a supplier | "Orders" (sidebar) · "Purchase orders" (rail, title) · "Purchase Orders" (`R/purchasing/receipts/page.tsx:303`) · "Buy" (`R/page.tsx:285`) · "PO" · "New order" · "On order" | orders 36, purchase order 11 |
| "Receipt" | means a **goods receipt** (sidebar "Receipts", rail "Goods receipts", "New receipt", "Receipt posted"), a **sale receipt** (`R/sales/[id]`, till history, "Receipt & branding"), and a **stock movement in** (fuel "Receipt"/"Issue", "Receive stock") | receipt 57 |
| The machine | "POS" · "Point of Sale" · "POS Terminal" · "Till" · "Register" (50) · "Terminal" (11) · "Drawer" (19) · "Checkout" (a till rail row, and a reports tab whose id is `pos-policy`) | till 59, register 50 |
| A cashier's session | "Shifts" · "Shifts & Cash-up" (title) · "Shift Management" · "cash-up" vs "cash up" · "Closeout" · "session" · "trading period" · "End-of-day report" vs "Z-report" vs "End of day" | |
| Where the shop trades | "Site" (~58) · "Branch" (30) · "Store" (19, including "Pick a store" over a list of sites) · "Shop" (18) · "Location" (~50, a stock bay — except the till settings row "Location", which is the branch's address) | |
| Mobile money | "MOBILE MONEY" · "Mobile" · "Mobile money" · "Mobile Money" · "EcoCash / OneMoney" · "mobile" | six spellings |
| A sale | "Sales" · "Transaction" (column) · "Transaction detail" · "Tickets" · "Average ticket" · "Txns" · "Avg. basket" · "Sales history" · "Transaction workspace" | |
| A parked cart | "Held" · "Held Carts" · "Held carts" · "Parked sales" · "Hold current sale" · "Park this cart" · "Recall a parked sale" | |
| Setup screens | sidebar "Operations", "Branding", "POS Policy", "Accounting Setup"; rail "Operations", "Branding", "POS policy", "Accounting"; titles "Operations setup", "Receipt & branding", "POS policy", "Accounting setup" | |
| Overviews | sidebar "Overview" vs title "Business overview"; stock rail "Overview" vs title "Stock"; till rail "Today" vs "Operational snapshot" | |
| Till rail vs its titles | "Price" vs "Price check" · "History" vs "Sales History" · "Offline" vs "Offline queue" · "Help & shortcuts" vs "Help" · "Log out" vs "Exit" | |

## 2. The rules, broken

**Title case (COPY-1)**, about 45: "POS Policy", "Accounting Setup" (`nav:668-669`);
"Shifts & Cash-up"; "Stock Count"; "Stock Transfers"; "Purchase Orders";
"Stock Movements"; "Receipt #"; "Open Chart of Accounts"; "Fix in Posting
Studio"; the whole of `S/inventory/page.tsx` ("Stock on Hand", "Add Item", "All
Categories", "Item Name", "Current Stock", "QR Label Preview", "Save Changes",
"Add Location", …); `S/fuel/page.tsx` ("Fuel Ledger", "Current Fuel Stock",
"Authorized By"); the sidebar bands "Run the Floor", "Range & Stock", "Controls
& Growth" (`WS:589,610`); the till's "Point of Sale", "Held Carts", "Sales
History", "Shift Management", "POS Terminal", "Amount Due".

**US spelling (COPY-2):** "catalog" (21), "Authorized".

**Failure copy (COPY-4):** 49 "Unable to …" titles; "Create failed", "Update
failed", "Remove failed" (promotions, orders); "Error" as a title
(`R/setup/accounting/page.tsx:98`); "There was a problem fetching your sales
data. Please try again later." Success toasts that name nothing: "Created",
"Updated", "Removed". The right shape is already in the module: "Could not save
that photo", "Could not reserve a promo code".

**Ledes and helpers (contract rule 1):** under fields ("Shown on the till's
item grid. PNG, JPEG or WebP, up to 2MB…", "Generated automatically.", "Leave
this blank if you are choosing one of the existing registers above.", four
checkbox descriptions on the till rules); under dialog and card titles ("Link a
sellable retail item to shared stock.", "Protect the takings without making
every tender feel like a compliance exercise."); under every till page name
("Your sales at a glance", "Scan-first, glanceable…", and two that read as
internal design notes: "This stays a fast lookup surface for leads and
exceptions…", "Show the essentials only…").

**Capitals:** raw enum values on screen — `ACTIVE`, `POSTED`, `MOBILE MONEY`,
`DROP TO SAFE`, loyalty tiers, order and shift statuses — in 20 files; "OK"
pills; CSS `uppercase` on labels in the till and stock overview.

**Emoji (COPY-7):** `⚠` in the held-cart age (`P/pos-held-view.tsx:154`).

**"Actions" headers (COPY-6):** `S/inventory/page.tsx:848,1353`.

**Buttons that name nothing (COPY-3):** "Save" on every price row; "New",
"Save", "Remove" on orders; "Close" on a shift row; "POS", "Sell", "Buy",
"More"; "Retry"; "Manage tax codes"; "QR", "Edit", "Delete", "Close" on stock;
"Receive"/"Issue" opening dialogs titled "Receive stock"/"Issue stock"; "Clear"
for three different things on the till; "Done", "Adjust", "Refresh", "Drop".

**Absence as a symbol (COPY-5):** "-" and "—" where the reader might act — a
product with no stock line, an order with no site or expected date, a shift's
branch and till.

**Badges on the healthy case:** status on every product card; "Configured";
"Set"/"Missing" on every branding row; "Default"; "OK"/"Low" on every stock
row; a green stock chip on every till tile; "In stock", "Top match", "Best".

**Dates:** none day-first. Browser locale in eleven places; "Sep 25" month-first
in five; ISO in one.

**Also:** two error alerts for one failure on the stock count page; "use Stores
& Inventory" for a module the sidebar calls Stock; a Site field labelled twice
on the order dialog; "..." and "->" in ASCII; "Txns", "Prev net profit",
"Disc", "Est. Value"; every non-issue movement labelled "Received", transfers
and adjustments included; an inactive location called "Closed".
