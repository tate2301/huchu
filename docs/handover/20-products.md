# 20 · Products and prices — build spec

Area: **02 Products and prices** (canvas page `products`, 29 boards). Workflows W-09 to W-20.
Canvas: "Corelith data tables", version 32. Board images: `scratchpad/shots-v32/<Board>.png` (1440 wide).
Unit ids: PRD-01 … PRD-10. Migration slot: `2026100413MMSS`, this area uses `20261004132200` to `20261004132800`
(the setup spec already took `…132000` and `…132100`, so this area starts at `…132200`; see open question 1).

The handover brief's rules apply (scratchpad `handover-brief.md`): the canvas chooses the direction; every value is real
data from Postgres; every button works on the server; roles are enforced on the server; no backward compatibility.

Foundations this area builds on, written in `00-foundations.md` and **not** re-specified here:

| Alias | Foundation units | What this area uses from it |
|---|---|---|
| FND-THEME | FND-01, FND-02 | Tender role tokens, tones `ok warn bad info neutral hollow pending gold`, mono figures, G1 selected state. |
| FND-SHELL | FND-03 | Rail, Products module panel (Products, Price lists, Promotions "3 on", Bundles and packs, Vouchers, Categories), 48px page header with back / title / sub / sub link / actions / primary, nav `requires`, nav badges (`lib/retail/nav-badges.ts`). FND-03 also `git mv`s `app/retail/catalog/**` → `app/retail/products/**`, `merchandising/pricing` → `products/price-lists`, `merchandising/promotions` → `products/promotions`. |
| FND-LIST | FND-04, FND-05 | List sources (`ReportDefinition.list`), `GET /api/v2/reports/[key]` list mode, tabs with counts, toolbar, filters popover, sort/group/columns, Export (W-55), selection bar and bulk actions, cells (5.4.7), totals band, pager, `edit-money` cells and the save bar (5.4.10), loading/empty/no-match/error states, phone cards, empty-list guide (5.12.2). |
| FND-RECORD | FND-06 | RecordFrame (header with action group and ⋯, bin banner, strip, KPI strip, chart panel, tabs with Export and "all" link, details rail edited in place W-62, Activity W-60), ConfirmDialog (5.8), bin move/restore (W-63, `lib/retail/bin.ts` registry), `RETAIL_RECORD.EDITED`. |
| FND-SHEET | FND-07 | SheetForm (520/760px, sections, folds, field types, `auto` with inline add through `GET/POST /api/v2/retail/lookup/[noun]`), sheet host `?sheet=<kind>&id=&ids=`, toast (5.9). |
| FND-DASH, FND-SETTINGS | — | Not used by this area. |

Cross-area units referenced (their specs are written in parallel; reconcile the ids before build, open question 2):
`SET-02` sites and `Site.priceListId`, the `site` lookup noun; `SET-03`/`SET-04` tills, `RetailRegister.hasPrinter`, the device
context the till reads; `SET-07` the message outbox (`RetailMessage`, WhatsApp); `SET-09` `RetailAccountRole` and role-mapped
posting lines; `SET-11` import (calls this area's create and price-change services); `BUY:suppliers` the buying area's supplier
record and `supplier` lookup noun; `BUY:orders` the order sheet (`order-new`) and `BUY:deliveries` the Receive a delivery page;
`STK:movements` the stock area's movements source, `stock-adjust` sheet and W-26 Break a case; `FLR:till` the floor area's till
(POS) screens; `CUS:customers` the customers area's customer record, loyalty membership and staff flag.

Roles map to `UserRole` as the Roles board says: **Owner** `SUPERADMIN`; **Manager** `MANAGER`, `SHOP_MANAGER`; **Cashier**
`CASHIER`, `POS_CASHIER`; **Stock clerk** `STOCK_CLERK`; **Bookkeeper** `FINANCE_OFFICER`.

Copy rule: every quoted string is the board's own wording unless marked **Defined here** (the board shows the control but not
its contents, or the state is not drawn). Sentence case, British English, no exclamation marks, money as "US$18.25".

---

## 1. Boards

Canvas reading order of page `products` (rows top to bottom, left to right). "Code today" was checked against the source at
`c78d01f` and screenshots of the running app as `owner@bottlestore.test`, saved in `scratchpad/smoke/prd20/`
(`catalog.png`, `product.png`, `pricing.png`, `promotions.png`, `categories.png`). Every page today uses the old chrome
(Corelith blue, app bar with Search/bell, panel search) which FND-SHELL replaces; that difference is not repeated per row.

| # | Board file | Canvas title | What it is | Target route, or where it opens | Code today | Notes |
|---|---|---|---|---|---|---|
| 1 | `StockFlow.dc.html` | Stock to sellable: four steps become one | explainer (W-09) | none; the rules it states are built by PRD-03 | **Partly.** One form already makes the product, its stock line at the shop's site and its shelf price (`createWithOwnStockLine` in `app/api/v2/retail/catalog/route.ts`). It is a centred dialog (`components/retail/product-dialogs.tsx`), not a sheet; there is no supplier or opening stock; the site is asked even with one site. | "On sale when saved", "No site or location to choose", "Your categories", "The same form everywhere" are acceptance rules for PRD-03. |
| 2 | `ProductsList.dc.html` | Products | list | `/retail/products` | **Exists but differs.** `/retail/catalog` (`catalog.png`): `RecordListShell` + `ColumnList`; name with code and barcode stacked; columns Category, Status, On hand, Price, VAT; filters Status and Category; client-side search; "16 of 16". No tabs, no Code/Cover/Sold columns, no totals, no selection or bulk actions, no sort/group/columns/export, no pager. | Source `retail-products` (PRD-01). |
| 3 | `ProductNew.dc.html` | 1  New product: name, category, price | sheet (W-09) | `?sheet=product-new` over `/retail/products` | **Exists but differs.** "New product" dialog: Name, Category (autocomplete with inline add, from C3), Price, VAT %, then "More": Barcode, Code, Cost, Reorder at, Sold by the, Site, Was, Deposit, Case of, Singles in it, Description. No Supplier, no Opening stock, no "Add, then another", VAT typed by hand instead of coming from the category. | PRD-03. |
| 4 | `ProductNewStock.dc.html` | The same form from On hand | sheet (W-09) | `?sheet=product-new` over `/retail/stock` (On hand's primary "Add a product") | **Missing.** On hand's primary is "Count stock". | Same kind, same fields, opened by the stock area's list. PRD-03 ships the kind; the stock spec wires the primary. |
| 5 | `Product.dc.html` | 2  Product record: click a detail to change it | record | `/retail/products/[id]` | **Exists but differs.** `/retail/catalog/[id]` (`product.png`): a field list (Price, Was, VAT, Priced from, Changed; Stock: On hand, Reorder at, Site; Details: Name, Code, Barcode, Category, Check ID, Description) with some values edited in place (C7), a "No photo" box, header "Change price" and ⋯ (Edit product, Open cases into singles, Remove). No strip, KPIs, chart, tabs, Activity; no "Adjust stock", "Print label", "Receive stock". FND-06 moves the rail onto RecordFrame; PRD-04 builds the rest. | Hand-built board (not the Record template). |
| 6 | `ProductEdit.dc.html` | W-11  Edit everything, or archive | sheet (W-11) | `?sheet=product-edit&id=<id>`, opened from the record's "Edit" (board draws it over the list) | **Exists but differs.** The same "New product" dialog titled with the product's name; "Remove" lives in the record's ⋯ and bins the product; no Archive. | PRD-03. |
| 7 | `Labels.dc.html` | W-20  Print shelf labels | sheet (W-20) | `?sheet=labels&ids=<product ids>` over `/retail/products` (bulk "Print shelf labels"), the product record ("Print label"), bundles and promotions ("Print shelf labels") | **Missing.** No labels anywhere. | PRD-06. |
| 8 | `PriceLists.dc.html` | Price lists | list | `/retail/products/price-lists` | **Missing.** Only one list exists ("Shelf prices", kind RETAIL) and no screen lists lists. | Source `retail-price-lists` (PRD-05). |
| 9 | `PricesList.dc.html` | Retail: type a price, the margin follows | list (worksheet, editable) | `/retail/products/price-lists/[id]` | **Exists but differs.** `/retail/merchandising/pricing` "Prices" (`pricing.png`): read-only `ColumnList` (Product, Changed, Was, Price, VAT) with a "Change price" button per row opening a dialog. No Cost, Margin, inline price inputs, save bar, filters, bulk, totals. "Was" is the hand-typed `compareAtPrice`, "Changed" is the price row's `updatedAt`. | Source `retail-prices` (PRD-07). |
| 10 | `BulkPrice.dc.html` | W-15  Raise, set a margin, round | sheet, wide (W-15) | `?sheet=bulk-price&list=<id>&ids=<…>&how=<…>` over the price worksheet or over Products | **Missing.** | PRD-07. |
| 11 | `PriceListNew.dc.html` | W-16  New list: who, when, where | sheet (W-16) | `?sheet=price-list-new` over `/retail/products/price-lists` | **Missing.** | PRD-05. |
| 12 | `PriceListEdit.dc.html` | A list's rules | sheet (W-16) | `?sheet=price-list-rules&id=<id>` over the worksheet (sub link "Edit the rules") | **Missing.** | PRD-05. |
| 13 | `AddToList.dc.html` | Add products to a list | sheet (W-16) | `?sheet=price-list-add&id=<list id>` over the worksheet (primary "Add products to this list"); `?sheet=price-list-add&ids=<product ids>` over Products (bulk "Add to a price list") | **Missing.** | PRD-07. |
| 14 | `BundlesList.dc.html` | Bundles and packs | list | `/retail/products/bundles` | **Missing.** A case exists only as a product with `packOfId`/`packSize`; there are no bundles or buy-more deals. | Source `retail-bundles` (PRD-08). |
| 15 | `PackNew.dc.html` | W-12  Sell by the case | sheet (W-12) | `?sheet=pack-new` over Bundles and packs; `?sheet=pack-new&single=<id>` from the product record's ⋯ "Sell it by the case too" | **Exists but differs.** "Case of" and "Singles in it" fields inside the product dialog; no case name, saving, break-at-till switch or crate deposit. | PRD-08. |
| 16 | `BundleNew.dc.html` | W-13  New bundle | sheet, wide (W-13) | `?sheet=bundle-new` over Bundles and packs | **Missing.** | PRD-08. |
| 17 | `BundleEdit.dc.html` | A bundle: change or stop it | sheet, wide (W-13) | `?sheet=bundle-edit&id=<id>` over the bundle record ("Change the bundle") | **Missing.** | PRD-08. |
| 18 | `BundleRecord.dc.html` | A bundle: what is in it, how many it can make, how it sells | record | `/retail/products/bundles/[id]` | **Missing.** | Record kind `bundle` (PRD-08). |
| 19 | `PromotionsList.dc.html` | Promotions | list | `/retail/products/promotions` | **Exists but differs.** `/retail/merchandising/promotions` (`promotions.png`): two rows (PROMO-CASE, PROMO-FESTIVE), columns Promotion, Status, Type, Starts, Ends, Value; Status filter; no tabs, Applies to, Sold, Given away, totals, bulk. Promotions are whole-basket and picked by the cashier; they have no products or categories. | Source `retail-promotions` (PRD-09). |
| 20 | `PromotionNew.dc.html` | 1  New promotion | sheet (W-17) | `?sheet=promotion-new` over Promotions | **Exists but differs.** Centred dialog: Name, Type, Value, Starts, Ends, Status, Notes. | PRD-09. |
| 21 | `PromotionRecord.dc.html` | 2  Did it pay? | record | `/retail/products/promotions/[id]` | **Missing.** Rows open the edit dialog. | Record kind `promotion` (PRD-09). |
| 22 | `PromotionEdit.dc.html` | Change or end it | sheet (W-17) | `?sheet=promotion-edit&id=<id>` over the promotion record ("Edit rules") | **Exists but differs.** The same dialog. | PRD-09. |
| 23 | `VouchersList.dc.html` | W-18  Vouchers | list | `/retail/products/vouchers` | **Missing.** `VOUCHER` is a tender type with no voucher, balance or code behind it. | Source `retail-vouchers` (PRD-10). |
| 24 | `VoucherNew.dc.html` | Issue vouchers | sheet (W-18) | `?sheet=voucher-new` over Vouchers | **Missing.** | PRD-10. |
| 25 | `VoucherEdit.dc.html` | A voucher: extend or void | sheet (W-18) | `?sheet=voucher-edit&id=<id>` over the voucher record ("Extend") | **Missing.** | PRD-10. |
| 26 | `VoucherRecord.dc.html` | A voucher: what is left and where it was spent | record | `/retail/products/vouchers/[id]` | **Missing.** | Record kind `voucher` (PRD-10). |
| 27 | `CategoriesList.dc.html` | Categories, seeded by the shop type | list | `/retail/products/categories` | **Exists but differs.** `/retail/catalog/categories` (`categories.png`): Category (with "ID check" under it), Status, Products, VAT, Target margin; Status filter "In use"; "7 of 8". No Age check badge, Margin now, Sold 30 days, totals, Shop type filter, bulk. | Source `retail-categories` (PRD-02). Rows open the edit sheet; there is no category record. |
| 28 | `CategoryNew.dc.html` | New category: VAT, 18+, margin | sheet | `?sheet=category-new` over Categories | **Exists but differs.** Centred dialog (`components/retail/category-dialog.tsx`): Name, VAT %, ID check, Returnable + deposit, Target margin. No "Inside", no Zero-rated/Exempt. | PRD-02. |
| 29 | `CategoryEdit.dc.html` | A category: change or delete | sheet | `?sheet=category-edit&id=<id>` over Categories (row link) | **Exists but differs.** Same dialog; "Archive" refuses while products are filed under it; no "move its products to". | PRD-02. |

Boards reachable from these that another area owns (built there, linked from here):

| Board | Reached from | Owner | What this area relies on |
|---|---|---|---|
| `StockAdjust.dc.html` (W-23) | Product record "Adjust stock" | stock spec (`stock-adjust` sheet) | Opens `?sheet=stock-adjust&id=<product id>` over the record. |
| `BreakCase.dc.html` (W-26) | Product record ⋯ of a case; Bundles and packs | stock spec (`break-case` sheet) | Uses this area's pack fields (`Product.packOfId`, `packSize`, `breakAtTill`). |
| `Receive.dc.html` | Product record primary "Receive stock" | buying spec | `/retail/buying/deliveries/new?productId=<id>` (or the buying spec's route). |
| `OrderNew.dc.html` | Products bulk "Add to an order", record chart "Add to an order" | buying spec (`order-new` sheet) | `?sheet=order-new&productIds=<…>`. |
| `StockList.dc.html` | under ProductNewStock | stock spec | Its primary "Add a product" opens `product-new`. |
| `OnbProducts.dc.html` (W-10) | Products empty guide / Export menu "Add from the catalogue" | setup spec (SET-12) | Opens `/retail/setup/products?return=/retail/products`. |
| `Import.dc.html` (W-08) | Products empty guide / Export menu "Import a spreadsheet" | setup spec (SET-11) | Route moves to `/retail/products/import` with this area's routes. |
| `WfProducts.dc.html` | Workflows page | — | The W-09…W-20 definitions below. |

### Module navigation (from the List template `M.products`)

Panel title "Products"; items in order: Products (`Rows`), Price lists (`Tag`), Promotions (`Megaphone`, badge "3 on"),
Bundles and packs (`Package`), Vouchers (`Ticket`), Categories (`Folder`). Visibility per role (FND-SHELL table 5.3.4):
Owner, Manager, Bookkeeper see all six; Cashier sees all but Categories; Stock clerk sees Products only.
The "3 on" badge provider is this area's (PRD-09): running promotions, label `"<n> on"`, requires `retail.promotions:view`.

---

## 2. Workflows

Exact definitions from `WorkflowMap.dc.html` (`A.products`): `[id, name, who, starts from, steps, guided, screens]`.
Lede: "One form adds a product, and a product is ready to sell the moment it is saved: it is stock at the default site and has a
price on the default price list. Everything else is optional and can come later."

Common server rules for every step below (FND conventions): session through `requireRetailSession`; permission through
`requireRetailPermission(session, resource, action)` with the resources in §3.1; every id from the client re-checked against
`session.user.companyId`; every write that changes a price, stock, money or a record's state writes its audit event in the same
transaction (`writeRetailAuditEvent`, events in §3.4); sheets close and refetch the list and record keys they name; errors as
FND 4 (400 with `fieldErrors`, 403 "Your role cannot …", 404, 409 sentence).

### W-09 Add a product — Manager — "Anywhere: Products, On hand, an order line, a price list" — guided

Steps: Name · Category · Price · Save, it sells now. Screens: productnew, productnewstock, stockflow.

**Code today: partly** (the dialog creates product + stock line + shelf price; no opening stock, supplier, sheet, history).

| Step | Who sees | What the server does |
|---|---|---|
| Open | Owner, Manager (`retail.catalog:create`). Products primary "+ New product"; On hand primary "Add a product"; the `auto` product field's "Add ‘…’ as a new product" in an order line, a delivery, a bundle, a price list (quick add: Name, Price). | `GET /api/v2/retail/products/new-context` → `{ sites: [{id,name,isDefault}], defaultSiteId, oneSite, businessType, emptiesAndDeposits, defaultDeposit, currency }` so the sheet knows whether to show "At" and "Returnable bottle". |
| Name, Category, Price | Sheet `product-new`. Category options from `GET /api/v2/retail/lookup/category` (VAT and 18+ in the sub); "Add ‘Mixers’ as a new category" quick-adds through the `category` noun (PRD-02). | — |
| More details (optional) | Barcode, Cost, Supplier, Opening stock, At (only with two or more open sites), Reorder at, Sold as, Returnable bottle (liquor store with Empties and deposits on). | Supplier lookups `GET /lookup/supplier` (BUY:suppliers). |
| Save, it sells now | "Add product" or "Add, then another". | `POST /api/v2/retail/products` (§4.2). In one transaction: (1) validate (name 1–200, unique among live products case-insensitive → 409 field error "There is already a product called Savanna Dry 330ml."; category live; price ≥ 0.00; barcode 8–14 digits, spaces allowed and stripped, unique among live products → field error "Castle Lager 340ml already has this barcode."; cost ≥ 0; opening stock ≥ 0 integer for Single, ≥ 0 to 3 dp for By weight; reorder at ≥ 0). (2) Code: `normalizeSku(name)` shortened to ≤ 20 chars, suffixed `-2`, `-3` on clash. (3) `Product` (`categoryId`, `defaultTaxRate` from the category (15 or 0), `ageRestricted` false — the category carries the check, `returnable`/`depositAmount`, `unit` EACH or KILOGRAM, `costPrice`, `supplierId`, `isActive` true, `createdById`). (4) `InventoryItem` at the chosen site (default site when one), in the site's first place, `itemCode` = code, unit word "bottle" when the category has the 18+ check, "each" otherwise, "kg" when sold by weight (the seed sets "carton", "bag", "case", "pack", "crate", "can" where the boards show them), `minStock` = Reorder at, `unitCost` = cost. (5) `ProductPrice` on the **default** list at min quantity 1 and `Product.standardPrice` = price; one `ProductPriceChange` (source ADDED, from null to price, applied now). (6) Opening stock > 0: `recordOpeningStock` → `StockMovement` RECEIPT, `sourceType RETAIL_OPENING_STOCK`, `sourceId` = product id, and when a cost is given a journal through `createJournalEntryFromSource` (rule `RETAIL_OPENING_STOCK`: Dr role STOCK / Cr role OPENING_BALANCES, amount = quantity × cost). No cost → movement only, no posting. (7) Audit `RETAIL_PRODUCT.CREATED { code, name, price, category, openingStock, siteName }`. Returns the product view. |
| It sells now | Toast "Savanna Dry 330ml is on sale at US$2.10 on every till." with "Open". | Nothing more: the till's pricing snapshot (`GET /api/v2/retail/pos/pricing`, PRD-05) changes version on the next poll (≤ 60 s). |

Other screens that change: Products list (Selling tab +1), On hand (+1 row at the site), the Retail price worksheet (+1 row),
Movements (an "Opening stock" row), Activity, the ledger (when costed), Overview checklist item "products" ticks.

### W-10 Start from the shop-type catalogue — Manager — "Onboarding, or Products" — guided

Steps: Tick the products you stock · Set your prices · Add. Screen: onbproducts.

**Code today: missing.** The picker, its dataset and `POST /api/v2/retail/setup/products` are the setup spec's (SET-12).
This area supplies the entry from Products and the service the picker calls:

1. Products list: the empty guide's secondary "Start from the catalogue" (liquor store) and the Export menu's extra item
   "Add from the catalogue" (Owner, Manager; **Defined here**, see §5.1) open `/retail/setup/products?return=/retail/products`.
2. "Add {n} products" calls this area's `createProduct` service per line inside SET-12's transaction (no opening stock, so no
   movement and no posting), with `ProductPriceChange` source IMPORT; a case row links to its single (`packOfId`, `packSize`).
3. With `return`, the page goes back to `/retail/products` with the toast "{n} products added. They are on every till."
   (**Defined here**).

### W-11 Edit or archive a product — Manager — "Product record" — not guided

Steps: Open · Change · Save, or archive. Screens: product, productedit.

**Code today: partly** (edit dialog; inline edit on some rail rows; "Remove" bins it; no archive distinct from the bin).

| Step | UI | Server |
|---|---|---|
| Open | Products row → `/retail/products/[id]`. | `GET /api/v2/retail/products/[id]` (§4.2, the record view). Read: `retail.catalog:view` (all five roles); cost, margin and supplier figures only with `retail.catalog:view-cost` (Owner, Manager, Bookkeeper) — "Cashiers and stock clerks never see cost." |
| Change one value | Click a rail value (W-62). | `PATCH /api/v2/retail/products/[id]` `{ <field>: value }` (`retail.catalog:update`; Price also `retail.prices:update`). Price goes through the price-change service (§2 W-14). Writes `RETAIL_RECORD.EDITED`. |
| Change everything | "Edit" → `product-edit` sheet; "Save". | `PATCH /api/v2/retail/products/[id]` with every changed field in one transaction; one `RETAIL_RECORD.EDITED` per changed field. Opening stock and At are shown only while the product has no stock movement at all (a product created without stock); otherwise the section omits them (**Defined here**, the board draws them on an existing product). Toast "Amarula Cream 750ml saved." |
| Archive | ⋯ "Stop selling it (archive)" on the record, or the sheet's danger "Archive", or Products bulk "Archive". ConfirmDialog `archive` (§5.10). | `POST /api/v2/retail/products/archive` `{ ids }` (`retail.catalog:update`): `isActive = false` per product (not the bin: `archivedAt` stays null); price list rows and stock stay; bundles containing it can no longer be sold (their "Can make" reads 0); audit `RETAIL_PRODUCT.ARCHIVED { names }` per product. The record shows the banner "**Archived.** Not on the till or in reorder suggestions. Its 13 bottles in stock still count." with "Sell it again". |
| Sell it again | Banner button, or row menu "Sell it again" on the Archived tab. | `POST /api/v2/retail/products/unarchive` `{ ids }`: `isActive = true`, audit `RETAIL_PRODUCT.UNARCHIVED`. Toast "Amarula Cream 750ml is on sale again." (**Defined here**). |
| Move to the bin | ⋯ "Move to the bin" (Managers and owners only; FND-RECORD). | `POST /api/v2/retail/bin { kind: "product", id }` (FND). This area changes the product bin service: binning sets `archivedAt` and `isActive = false` and **keeps** the price list rows; restore clears `archivedAt` and leaves it archived (`isActive = false`). `archiveShelfListing`/`restoreShelfListing` go (§6). |

### W-12 Sell by the case and by the single — Manager — "Product record or Bundles and packs" — guided

Steps: Pick the single · How many in a case · Case price. Screens: packnew, bundles.

**Code today: partly** (a case is a product with `packOfId`/`packSize`; `POST /api/v2/retail/catalog/[id]/break-case` opens
cases into singles; no sheet).

Model decision (open question 3): a case is its own product with its own stock line and price, linked to its single. Cases and
singles are counted apart; opening a case moves stock from one to the other (W-26, stock spec, and the till when "Break cases at
the till" is on). This is what the Products board ("22 cases"), the Break a case board ("Cases 4 → 3, singles 2 → 26") and this
sheet's own switch say.

| Step | UI | Server |
|---|---|---|
| Pick the single | `pack-new` sheet: "The single" (`auto`, noun `product`, singles only; options sub "Beer · 6001108", category and the first 7 digits of the barcode). From the record's ⋯ "Sell it by the case too" it is prefilled. | `GET /api/v2/retail/lookup/product?q=&context={"singles":true}`. |
| How many in a case | "Singles in a case" (whole number 2–1,000). "The case is called" reads "Castle Lager 340ml, case of 24" as you type. | — |
| Case price | "Case price"; hint "24 singles at US$1.20 come to US$28.80. The case saves US$2.80." (live); "Case barcode" optional; "Break cases at the till" toggle; "Deposit on the crate" (liquor store with Empties and deposits on). | `POST /api/v2/retail/packs` (§4.6), `retail.catalog:create`: refuses a single that is itself a case (400 field "single": "Castle Lager case of 24 is a case. Choose the single."); refuses a second pack of the same size for that single (409 "Castle Lager 340ml already has a case of 24."). Creates the case `Product` through `createProduct` (name "Castle Lager 340ml, case of 24" unless edited later, category and VAT from the single, `packOfId`, `packSize`, `breakAtTill`, `returnable` = deposit > 0, `depositAmount`, cost = single cost × size when the single has a cost), its `InventoryItem` at the single's site(s) with stock 0 and unit "case", its default-list price; audit `RETAIL_PRODUCT.CREATED` with `{ packOf, packSize }`. Toast "Castle Lager 340ml, case of 24, is on sale at US$26.00." |

At the till (FLR:till, server rules here): selling a case decrements the case's stock; when a single is rung and the single's
stock at the till's site is 0 and the single has a case with `breakAtTill` and case stock ≥ 1, `pos/sales` breaks one case first
inside the sale transaction (`breakCase` with `reason: "TILL"`), then sells the single. No ledger posting for a break (same
stock account).

### W-13 Make a bundle or a buy-more deal — Manager — "Bundles and packs" — guided

Steps: Pick the products · Set the price · Choose the days. Screens: bundles, bundlerec, bundlenew, bundleedit.

**Code today: missing.**

| Step | UI | Server |
|---|---|---|
| Open | Bundles and packs primary "+ New bundle or pack" → menu (**Defined here**): "A pack, like a case or a six-pack" (→ `pack-new`), "A bundle of different products" (→ `bundle-new`, Kind "A fixed set"), "Buy more, pay less" (→ `bundle-new`, Kind "Buy more, pay less"). | `retail.promotions:create` (Owner, Manager). |
| Pick the products | "What is in it" lines (product, How many, Each, Value); "Bought apart: US$10.50." under it. For "Buy more, pay less" the lines are the products any of which count, and "How many" becomes one field "Any" (see §5.6). | Lookups `product` (selling products only). |
| Set the price | "Bundle price"; hint "Saves US$1.00. Margin 18.4%." (live; margin only with `view-cost`). | — |
| Choose the days | "On sale": Every day / Weekends / Choose days (then seven day chips **Defined here**); "Until" ("No end date" or a date); "Barcode" optional. | `POST /api/v2/retail/bundles` (§4.7): validates ≥ 2 units in a fixed set (400 "A bundle needs at least two items."), price > 0 and below the bought-apart value (400 field "price": "That is not a saving: bought apart they come to US$10.50."), barcode unique against products and bundles; creates `RetailBundle` (code `BND-<n>` via `reserveIdentifier(…, "RETAIL_BUNDLE")`) and `RetailBundleItem`s; audit `RETAIL_BUNDLE.CREATED`. Toast "Braai pack is on sale at US$9.50." |
| At the till | A fixed set is a till button (under its category) and a barcode; "The till offers the bundle when all its items are in a sale." Buy-more deals apply on their own. | Pricing engine (§2 W-16 "At the till"); `pos/sales` writes one line per component with `bundleId` and a shared `bundleRef`, prices allocated pro rata to "On their own" so the components sum to the bundle price; stock comes off each component; COGS per component. |
| Change or stop | Record "Change the bundle" → `bundle-edit`; "Pause"; ⋯ "Stop selling it" (ConfirmDialog `bundlestop`). | `PATCH /api/v2/retail/bundles/[id]`, `POST /api/v2/retail/bundles/pause|resume { ids }`, `POST /api/v2/retail/bundles/[id]/stop`. Audit `RETAIL_BUNDLE.CHANGED|PAUSED|RESUMED|STOPPED`. |

### W-14 Change prices — Manager — "A price list, or the product record" — not guided

Steps: Type new prices · Watch the margins · Save, or schedule for a date. Screens: prices, productrec.

**Code today: partly** (one price at a time through a dialog; no margins, no save bar, no history beyond `updatedAt`).

| Step | UI | Server |
|---|---|---|
| Type new prices | Price worksheet `/retail/products/price-lists/[id]`: each Price cell is an input; the changed pill turns warn and "Changed" reads "Not saved". | — |
| Watch the margins | Margin recomputes as you type: `(price − cost) ÷ price`, one decimal; warn pill under the category's target margin, bad pill more than 5 points under it (or under cost). Totals: cost, "24.4% average", prices. | — |
| Save | Save bar "3 prices changed · The till picks them up the moment you save. Margins update as you type. · Discard · Save prices". | `PATCH /api/v2/retail/price-lists/[id]/prices` `{ changes: [{ productId, price }] }` (§4.5) through `changePrices` (`lib/retail/prices/change.ts`): `retail.prices:update` (Owner, Manager). In one transaction: each price ≥ 0.00; **below cost needs the owner**: a new price under the product's cost from a caller without `retail.prices:approve` (Manager) is refused for that row (400 `fieldErrors["<productId>"]`: "Below cost needs the owner. It costs US$13.03."); upsert `ProductPrice` (min quantity 1), `followsBase = false` (a typed price stops following its base list); on the default list also `Product.standardPrice`; `ProductPriceChange` (source TYPED, from, to, applied now); followers updated (below); audit `RETAIL_PRICE.CHANGED { list, from, to }` per product (entity `Product`). Partial success is not allowed: any refused row fails the whole save, the bar stays, each refused row keeps its pill with the message as `title`, toast "{n} prices were not saved." Success toast "3 prices saved. The till has them now." (**Defined here**). |
| From the record | Rail "Price" (W-62). | `PATCH /api/v2/retail/products/[id] { price }` → `changePrices` on the default list, same rules. |
| Schedule for a date | W-15's "When" (Now / Tonight, after closing / On a date). | `ProductPriceChange` rows with `effectiveAt` in the future and `appliedAt` null; applied by `applyDuePriceChanges` (§2 W-15). |

Followers: when a price changes on list L, every `ProductPrice` for that product on a list whose `basisListId = L` and
`basis = LIST` and `followsBase = true` is recomputed `round2(price × (1 + adjustPercent/100))` in the same transaction with its
own `ProductPriceChange` (source FOLLOWED). When a product's cost changes (by hand here, or by a delivery in the buying area,
which must call `repriceCostFollowers`), rows on `basis = COST` lists with `followsBase = true` are recomputed the same way.

Other screens that change: the till (next snapshot), the product record (Selling at, Price history, Price lists row), Products
list Price column, labels ("Was price, when it dropped").

### W-15 Raise or round many prices at once — Manager — "A price list, tick rows" — not guided

Steps: Tick · Raise by % or set margin · Review · Save. Screens: prices, bulkprice.

**Code today: missing.**

| Step | UI | Server |
|---|---|---|
| Tick | Worksheet rows; selection bar "Raise by a percentage", "Set a margin", "Round to 5 cents", "Remove from this list". Products list bulk "Change prices" opens the same sheet over Products for the default list. | — |
| Raise by % or set margin | `bulk-price` sheet: How (Raise by a percentage / Set a margin / Set one price), By, Then round (No / Up to 5 cents / Up to 10 cents). "Round to 5 cents" opens with How "Raise by a percentage", By "0%", Then round "Up to 5 cents". | — |
| Review | "What changes" lines: each product with "US$1.20 now, margin 28%" under its name (warn and "Below cost" when the new price is under cost), Labels count, New price; add or remove products. | `POST /api/v2/retail/price-changes/preview` `{ listId, productIds, how, by, round }` → `{ lines: [{ productId, name, now, margin, next, nextMargin, belowCost }] }`. Rules: raise `next = now × (1 + by/100)`; set a margin `next = cost ÷ (1 − by/100)` (products with no cost are left out with a line note "No cost yet, left as it is"); set one price `next = by`; round up to the next 0.05 / 0.10. |
| Save | "When": Now / Tonight, after closing / On a date (+ a date field **Defined here**); "Print new shelf labels". Primary "Change 4 prices". | `POST /api/v2/retail/price-changes` `{ listId, lines: [{ productId, price, labels }], when, date?, printLabels }` (`retail.prices:update`; below cost rule as W-14). `when = NOW` → `changePrices(source BULK, batchId)`; `TONIGHT` → `effectiveAt` = today's closing time at the list's site (weekday or Sunday closing from `RetailShopProfile`, 22:00 default) in Africa/Harare; `DATE` → that date 00:00. Future rows wait in `ProductPriceChange`; audit `RETAIL_PRICE.SCHEDULED { list, count, effectiveAt }` (entity `PriceList`). Labels: a `RetailPrintJob` (PRD-06) for the default till printer with the products' prices as they will be after the change. Done "4 prices change tonight at 22:00. Labels are queued." |
| Applied | — | `applyDuePriceChanges(companyId)` applies every row with `effectiveAt ≤ now` and `appliedAt` null in one transaction per list (upsert `ProductPrice`, `standardPrice` on the default list, followers, `appliedAt = now`, audit `RETAIL_PRICE.CHANGED`). It runs from the retail worker every minute (`scripts/retail-worker.ts`, SET-01's worker, new job "price changes") **and** at the start of `GET /api/v2/retail/pos/pricing` and the price worksheet's loader, so a till never sells at a price that should have changed. Idempotent: rows are claimed with `UPDATE … SET appliedAt = now() WHERE id = … AND appliedAt IS NULL`. |

### W-16 Add a price list (wholesale, happy hour, staff) — Owner — "Price lists" — guided

Steps: Start from a list · Rule: who, when, where · Adjust prices · Switch on. Screens: pricelists, pricelistnew, pricelistedit, addtolist.

**Code today: missing.** Roles board: Owner C R U D, Manager C R U; Cashier and Bookkeeper read.

| Step | UI | Server |
|---|---|---|
| Start from a list | `price-list-new`: Name; "Start from" (`auto`, noun `price list`, sub "214 products"; the lists plus "Cost" sub "What each product costs" **Defined here**); Prices: The same / % off / % on; By. | — |
| Rule: who, when, where | Who gets it (Everyone / Customers on account / Loyalty members / Staff); When (Always / Days and hours / Between dates); "Days and hours" text ("Fridays, 17:00 to 19:00") or "Between" text ("1 December to 26 December", **Defined here**); Where (`auto` site, "All sites"); Only these categories (tags; "Empty means everything on the list."). | — |
| Adjust prices | — | `POST /api/v2/retail/price-lists` (§4.4), `retail.prices:create`. Validates name unique (409 field "There is already a price list called Happy hour."), parses days and hours (400 field "hours": "Write it as Fridays, 17:00 to 19:00."), dates (400 "Write it as 1 December to 26 December."), By 0–90%. Creates `PriceList` (`state` ON or DRAFT, `audience`, `whenKind`, `daysOfWeek`, `fromTime`, `toTime`, `startsOn`, `endsOn`, `siteId`, `basis`, `basisListId`, `adjustPercent`, `currency` and `taxInclusive` copied from the base, `isDefault` false), `PriceListCategory` rows, and one `ProductPrice` per product on the base list (filtered to the categories when given; for COST, per live product with a cost) at `round2(base × (1 ± by))`, `followsBase = true`, each with `ProductPriceChange` source ADDED. Audit `RETAIL_PRICE_LIST.CREATED { name, products, rule }`. |
| Switch on | "Switch it on now" (Tills pick it up within a minute.). | `state = ON` (or DRAFT when off). Done "Happy hour is on: 10% off beer and ciders, Fridays 17:00 to 19:00." (built from the rule); draft: "Happy hour saved. Switch it on when it is ready." (**Defined here**). |
| Its rules later | Worksheet sub link "Edit the rules" → `price-list-rules`. | `PATCH /api/v2/retail/price-lists/[id]` (§4.4). Default switch: turning it on for another list moves the default (the old one keeps its prices and state ON); turning it off on the default list → 400 "One list has to be the default. Make another the default first."; currency change on a list with prices → 409 "Prices on Retail are in US$. Start a new ZiG list instead." Audit `RETAIL_PRICE_LIST.CHANGED { changes }`. |
| Pause, duplicate, print | Price lists bulk "Duplicate", "Pause", "Print price sheet". | `POST /api/v2/retail/price-lists/duplicate|pause|resume { ids }`; `POST /api/v2/retail/price-lists/price-sheet { ids }` → PDF. The default list cannot be paused (409 "Retail is the default list. Make another the default first."). |
| Delete | `price-list-rules` danger "Delete this list" (disabled on the default with the note "The default list cannot be deleted. Make another the default first."). ConfirmDialog `pricelistdelete`. | `POST /api/v2/retail/bin { kind: "price-list", id }` (`retail.prices:delete`, Owner; bin kind registered by PRD-05): `archivedAt = now`, `state = PAUSED`; the default list → 409 "Retail is the default list. Make another the default first."; restore brings it back paused. Sites and tills that sold from it (SET-02/03 `priceListId`) fall back to the default list automatically, which the confirm body says. Audit FND's `RETAIL_RECORD.BINNED`. |

**At the till (the price-list engine; FLR:till consumes it).** `lib/retail/pricing/engine.ts` is a pure function used by the
server and by the till's offline runtime:
`priceBasket(snapshot, basket, context) → { lines: [{ key, productId, quantity, unitPrice, priceListId, discounts: [{ kind, id, amount }], total }], subtotal, discount, total }`.
For each product line: candidate lists = the default list plus every list with `state = ON`, not binned, in the sale's currency,
whose audience matches the context (EVERYONE; ACCOUNT_CUSTOMERS when the sale's customer has an account using this list — CUS;
LOYALTY_MEMBERS when the customer is a loyalty member — CUS; STAFF when the customer is flagged staff — CUS), whose time rule
matches the sale time in Africa/Harare (ALWAYS; DAYS_AND_HOURS day in `daysOfWeek` and `fromTime ≤ time < toTime`; BETWEEN_DATES
inclusive), whose site matches (null or the till's site; a site's or till's own `priceListId` (SET-02/03) replaces the default
for that site/till), whose categories include the product's category (or none set), and which has a `ProductPrice` with
`minQuantity ≤` the line quantity (highest qualifying break). "When two lists apply, the till charges the lower price." The line
records `priceListId`. Promotions and deals then apply on top (W-13, W-17); vouchers last (W-18).

`GET /api/v2/retail/pos/pricing?siteId=` (§4.9) ships the snapshot (lists, rules, rows for products sold at that site, deals,
promotions, voucher rules) with a `version`; the till polls every 60 s with `If-None-Match` (304 when unchanged). `pos/sales`
re-prices every basket server-side with the same function and the snapshot as it stood at `ringAt` (offline replays use the
existing `replay-price-review` path); a submitted unit price that differs by more than US$0.01 from the engine's is refused
online (409 "Prices changed while you were selling. The till has the new prices; ring it again.") and flagged for review when
replayed offline (existing behaviour).

### W-17 Run a promotion and judge it — Manager — "Promotions" — guided

Steps: Pick products · Discount and dates · Runs on its own · Read the result. Screens: promos, promonew, promo, promoedit.

**Code today: partly** (promotions exist as whole-basket PERCENT/AMOUNT the cashier picks; no products, no record, no result).

| Step | UI | Server |
|---|---|---|
| Pick products | `promotion-new`: Name; Kind (% off / Amount off / Buy X, pay less / Bundle price) with its value fields; "What it applies to": Everything / Some categories / Some products, then the tags. | Lookups `product`, `category`. |
| Discount and dates | "When and who": Starts, Ends, Who (Everyone / Loyalty members / Staff — "Staff" **Defined here** for the seeded staff promotion), "Works with other promotions", Code. | `POST /api/v2/retail/promotions` (§4.8), `retail.promotions:create`: name required; value > 0 (percent ≤ 90; amount and fixed price > 0); Buy ≥ 2; dates parsed in Africa/Harare ("25 October, 00:00"; year = the next occurrence), ends after starts (400 "It ends before it starts."); scope non-empty for Some…; code unique, 3–30 of A–Z 0–9 and "-", default from the name (400 field "There is already a promotion called MONTHEND-CIDER."); a fixed price at or above a product's own price is allowed but the line notes it in the record. Creates `RetailPromotion` + `RetailPromotionProduct`/`RetailPromotionCategory` rows, `createdById`. Audit `RETAIL_PROMOTION.CREATED`. Done "Month-end two for US$5 ciders starts 25 October." (or "… is running now." when it starts at or before now, **Defined here**). |
| Runs on its own | Nothing to press. State moves Scheduled → Running → Ended by the clock. | State is computed (§3.2) — no job needed; the till snapshot carries scheduled promotions with their windows. The engine applies a running promotion to each qualifying line: % off the unit price; amount off each unit (not below zero); "Buy X, pay less": every X qualifying units (mixed within the scope, priced highest first) cost the "For" amount; "Bundle price": each qualifying unit sells at the fixed price when lower. Basket minimum: only when the basket before promotions reaches it. Audience: as price lists. Non-stacking promotions: the line takes the single biggest saving among them; stacking ones add together; the engine chooses whichever of the two saves more. A unit used in a buy-more deal (W-13) takes the better of the deal and the promotion. Each discounted sale line stores `promotionId` and `promotionDiscount`. |
| Read the result | Promotion record: KPIs, chart, Products and Sales tabs. | `GET /api/v2/retail/promotions/[id]` (§4.8): sold under it, given away, extra takings against the same days before it started, per-product rows (§5.7). |
| Change, pause, end | "Edit rules" → `promotion-edit` ("Changes apply to sales from now on."); "Pause"; ⋯ "End now" (ConfirmDialog `promoend`); danger "End now" in the sheet. | `PATCH /api/v2/retail/promotions/[id]` (a running promotion cannot change its Starts: 409 "It has already started. Change when it ends instead."); `POST /api/v2/retail/promotions/pause|resume|end|duplicate { ids }`. End sets `endedAt = now`. Audit `RETAIL_PROMOTION.CHANGED|PAUSED|RESUMED|ENDED`. |

### W-18 Issue and redeem vouchers — Manager, cashier — "Vouchers, or the till" — not guided

Steps: Value and holder · Print or send · Redeem at the till. Screens: vouchers, voucherrec, vouchernew, voucheredit.

**Code today: missing.**

| Step | Who | What the server does |
|---|---|---|
| Value and holder | Owner, Manager (`retail.promotions:create`): `voucher-new` — Kind (Gift voucher / Credit note / Promotion), Value, How many, For (optional customer), Expires, Smallest sale it works on, Send by. | `POST /api/v2/retail/vouchers` (§4.10). Gift voucher and credit note: `n` vouchers, each its own code (`GV-<n>` / `CN-<n>` through `reserveIdentifier`) and a 6-character secret, `value = balance`, `funding = GIVEN` (issued in the back office: a gift from the shop or a goodwill credit). Promotion: **one** discount voucher `DV-<n>` with `percentOff` or `amountOff` (the Value field accepts "10%" or "5.00" for this kind, **Defined here**) and `usesLeft = n` ("20 printed"). Validates value > 0 (≤ US$1,000.00 each), n 1–200, expiry after today (≤ 3 years), customer live. Ledger for GIVEN money vouchers: `RETAIL_VOUCHER_ISSUE` Dr role PROMOTIONS_GIVEN / Cr role VOUCHERS_OWED, amount = value × n. Audit `RETAIL_VOUCHER.ISSUED { codes, kind, value }`. |
| Print or send | "Send by": Print / WhatsApp / Both. | Print → the response carries `printUrl` (`GET /api/v2/retail/vouchers/print?ids=` → PDF, one voucher per A6 card: shop name, kind, value, code, secret, barcode, expiry, "Smallest sale US$…"); the sheet opens it in a new tab. WhatsApp → one `RetailMessage` (SET-07 outbox) per voucher to the customer's phone: "Hurudza Creative: a US$50.00 gift voucher for you, GV-0022, code 7K4P2Q. Use it at Harare Bottle Store until 3 October 2027." (**Defined here**); 400 field "send": "Tapiwa Marange has no WhatsApp number." when missing. Done "GV-0022 for US$50.00 sent to Tapiwa Marange on WhatsApp." |
| Sold at the till | Cashier (FLR:till "Sell a gift voucher", floor spec) | `pos/sales` accepts `vouchersSold: [{ value, customerId? }]`: in the sale transaction `issueVoucher(funding SOLD, soldSaleId)`; the sale's `vouchersSoldAmount` (outside `totalAmount`, like deposits: not revenue, not VAT, not fiscalised as goods); `RETAIL_SALE` posting gains the line Cr role VOUCHERS_OWED with `valuePath: "vouchersSoldAmount"`. Credit notes from refunds: the floor's refund calls `issueVoucher(kind CREDIT_NOTE, funding REFUND, sourceSaleId)` and pays the refund with tender VOUCHER (credits VOUCHERS_OWED through the tender mapping). |
| Redeem at the till | Cashier (`retail.sell:create`) | `GET /api/v2/retail/pos/vouchers/check?code=&secret=` → `{ code, kind, left, percentOff, amountOff, usesLeft, minSale, expiresOn, usable, reason }` (`reason`: "It expired on 9 October 2026.", "Nothing is left on it.", "It works on sales of US$20.00 or more.", "It was voided.", "That code and secret do not match." — 5 wrong secrets in 10 minutes from a till lock that code for 15 minutes). In `pos/sales`: money vouchers are a tender `{ tenderType: "VOUCHER", amount, voucherCode, voucherSecret }` (amount ≤ left; the sale's site allowed); discount vouchers are `discountVoucher: { code, secret }` applied by the engine after promotions. In the sale transaction: re-check, decrement `balance` or `usesLeft` with a guarded update (`WHERE balance >= amount`), write `RetailVoucherUse`, set `RetailSalePayment.voucherId` / `RetailSale.discountVoucherId`, audit `RETAIL_VOUCHER.REDEEMED`. Posting: tender VOUCHER is mapped to role VOUCHERS_OWED (Dr), so redemption reduces the liability. Vouchers need the till online: offline the till refuses VOUCHER with "Vouchers need the till online." (floor). Refund of a sale paid by voucher puts the amount back on the voucher (floor's refund calls `restoreVoucherUse`). |
| Extend, void, resend | Owner, Manager: record "Extend" → `voucher-edit`; "Send to the holder"; ⋯ "Void it" (ConfirmDialog `voidvoucher` with a reason; "Voiding needs a reason and shows in Activity."). | `PATCH /api/v2/retail/vouchers/[id] { expiresOn?, customerId?, siteId? }`; `POST /api/v2/retail/vouchers/[id]/send`; `POST /api/v2/retail/vouchers/void { ids, reason }` (reason 3–300 chars) writes off what is left: `RETAIL_VOUCHER_VOID` Dr VOUCHERS_OWED / Cr (SOLD, REFUND → role OTHER_INCOME; GIVEN → role PROMOTIONS_GIVEN). Bulk "Extend" `{ ids, expiresOn }`, "Void", "Print". Audit `RETAIL_VOUCHER.CHANGED|VOIDED|SENT`. |
| Expiry | — | Retail worker daily 00:10 Africa/Harare: vouchers with `expiresOn < today`, money left and not yet expired → `expiredAt = now`, `RETAIL_VOUCHER_EXPIRY` posting with the same accounts as void, audit `RETAIL_VOUCHER.EXPIRED`. |

### W-19 Set categories — Owner — "Products › Categories" — not guided

Steps: Seeded by shop type · Add or rename · VAT, age check, target margin. Screens: cats, catnew, catedit.

**Code today: partly** (categories seeded by business type, list, create/edit dialog, archive when empty).

| Step | UI | Server |
|---|---|---|
| Seeded by shop type | The list's "Shop type" filter defaults to the company's type. | Existing `ensureRetailCategories` (seeds on business type change, SET-01/SET-12); it now also stamps `seededFor`. |
| Add | `category-new`: Name, Inside (optional parent), VAT (15% / Zero-rated / Exempt), Target margin, "Check ID, 18 and over", "Bottles are returnable". | `POST /api/v2/retail/categories` (§4.11), `retail.categories:create` (Owner, Manager): name unique among live categories (409 field "There is already a category called Mixers."), one level of nesting (400 "Liqueur is already inside Spirits. Choose a top-level category."), target margin 0–99.9. Audit `RETAIL_CATEGORY.CREATED`. Done "Mixers added. It is in every category field now." |
| Rename, VAT, age check, margin | Row → `category-edit`. "Changes apply to all 61 products." | `PATCH /api/v2/retail/categories/[id]` (`retail.categories:update`). VAT change rewrites `Product.defaultTaxRate` for every product in it in the same transaction (the till snapshot changes); age check and returnable are read through the category at sale time. Audit `RETAIL_CATEGORY.CHANGED { changes, products }`. |
| Delete | Danger "Delete category" (Owner only, `retail.categories:delete`); "If deleted, move its products to" required when it has products. ConfirmDialog `categorydelete`. | `POST /api/v2/retail/categories/[id]/delete { moveTo }`: moves products (and child categories) to `moveTo`, rewrites their VAT to the target's, bins the category (`archivedAt`), audit `RETAIL_CATEGORY.DELETED { moved, into }`. Restore (FND bin) brings the category back empty. |
| Bulk | "Change VAT", "Set target margin", "Merge". | `POST /api/v2/retail/categories/vat { ids, vat }`, `/target-margin { ids, targetMargin }`, `/merge { ids, into }` (merge = delete each into `into`). |

### W-20 Print shelf labels and barcodes — Manager — "Any product list, tick rows" — not guided

Steps: Tick · Pick the label size · Print. Screens: products, labels.

**Code today: missing.**

| Step | UI | Server |
|---|---|---|
| Tick | Products bulk "Print shelf labels"; record "Print label"; bundle record "Print shelf labels"; promotion ⋯ "Print shelf labels" (its products, "Was price" on). | — |
| Pick the label size | `labels` sheet: Shelf strip (38 × 21 mm, on the till printer) / Price tag (50 × 30 mm, label printer) / A4 sheet (24 a page, any printer); Price, Was price, Barcode toggles; Copies of each; Printer. | Printer options `GET /api/v2/retail/lookup/printer`: each till with a printer (SET-03 `hasPrinter`) as "<till name> printer" sub site name, plus "Print here" sub "This computer, any printer" (**Defined here**, replaces the board's "Back office laser"). |
| Print | "Print 4 labels". | `POST /api/v2/retail/labels` (§4.12), `retail.catalog:update` or `retail.stock:create` (Owner, Manager, Stock clerk). Builds label data: name, price (the default list's, or the one due before the next opening: "Prices changing tonight print with tomorrow’s price."), was price (the last applied change's `fromPrice` when it was higher, within 60 days), barcode (EAN-13 when the barcode is 13 digits, else Code 128 of the product code). Till printer → `RetailPrintJob` (status QUEUED) the till pulls (`GET /api/v2/retail/devices/me/print-jobs`, SET-04's device auth) and acknowledges (`POST …/print-jobs/[id]/done`); "Print here" → returns `{ pdfUrl }` (HTML → PDF through `lib/documents/pdf-renderer.ts`, barcodes as SVG from `bwip-js`). Audit `RETAIL_LABELS.PRINTED { count, size, printer }`. Done "4 labels sent to the front till printer." / "4 labels ready to print." (**Defined here** for Print here). |

### Frame workflows used here (foundations): W-55 Export (every list and record), W-60 Activity (records' "Changes" tab), W-62 inline edit (every rail), W-63 bin (products, bundles, promotions, price lists, categories).

---

## 3. Data

### 3.1 Permissions (`lib/retail/permissions.ts`)

`retail.catalog` stays the Products resource. Three resources are added for the other Roles-board rows, and `FINANCE_OFFICER`
(Bookkeeper) gets read on all four (the setup spec adds Bookkeeper to the matrix for its own resources; this area adds these).
`approve` on `retail.prices` is "below cost" ("Below cost needs the owner.").

| Resource | Covers | Owner | Manager | Cashier | Stock clerk | Bookkeeper |
|---|---|---|---|---|---|---|
| `retail.catalog` | Products, packs (a pack is a product), labels | view, view-cost, create, update, delete | view, view-cost, create, update, delete | view | view | view, view-cost |
| `retail.prices` (new) | Price lists, prices, price changes | view, create, update, delete, approve | view, create, update | view | – | view |
| `retail.promotions` (new) | Promotions, bundles and buy-more deals, vouchers | view, create, update, delete | view, create, update, delete | view | – | view |
| `retail.categories` (new) | Categories | view, create, update, delete | view, create, update | – | – | view |

Notes: labels also accept `retail.stock:create` (the stock clerk prints shelf labels). Redeeming a voucher at the till is
`retail.sell:create` (cashier), not `retail.promotions`. Reading categories as options inside product fields is
`retail.catalog:view` (the lookup), not `retail.categories:view`. `RESOURCE_LABELS`: "price lists", "promotions, bundles and
vouchers", "categories". `lib/retail/permissions.test.ts` asserts the table above cell by cell.

### 3.2 Models used, and what each figure is

| Model | Used for |
|---|---|
| `Product` (existing) | Products and packs. `isActive` false = **archived** ("Stop selling it"); `archivedAt` set = **in the bin**. `packOfId`/`packSize` make a case. |
| `InventoryItem` (existing) | Stock per site: `currentStock`, `minStock` ("Reorder at"), `reorderQuantity` (new, "Reorder"), `unitCost`, `unit`. |
| `StockMovement` (existing) | Opening stock (new source `RETAIL_OPENING_STOCK`); the record's Stock movements tab (stock spec's source). |
| `RetailCategory` (existing, extended) | Categories, VAT, 18+, returnable, target margin, parent. |
| `PriceList`, `ProductPrice` (existing, extended) | Price lists, their rules, the prices on each. |
| `ProductPriceChange` (new) | Price history, "Was", "Changed", scheduled changes. |
| `RetailPromotion` (+ `RetailPromotionProduct`, `RetailPromotionCategory`) | Promotions. |
| `RetailBundle`, `RetailBundleItem` (new) | Bundles and buy-more deals. |
| `RetailVoucher`, `RetailVoucherUse` (new) | Vouchers, their balance and where they were spent. |
| `RetailPrintJob` (new) | Labels sent to a till printer. |
| `RetailSale`, `RetailSaleLine`, `RetailSalePayment` (existing, extended) | Sold, takings, margin, given away, voucher use. |
| `Vendor` (existing) | "Supplier" on a product (the buying spec may extend it; open question 4). |
| `PlatformAuditEvent` | Activity ("Changes" tabs), events in §3.4. |

Derived figures (one function each in `lib/retail/products/figures.ts`, unit-tested; "30 days" = the 30 days ending now in
Africa/Harare):

| Figure | Rule |
|---|---|
| On hand | Σ `InventoryItem.currentStock` for the product (all sites unless the list is filtered to one), with the unit word pluralised ("13 bottles", "22 cases", "210 cartons", "40 bags"). |
| Sold, 30 days | Σ `RetailSaleLine.quantity` of POSTED SALE lines minus REFUND lines for the product in 30 days (bundle components included). |
| Cover | `daysOfCover(onHand, sold30, 30)` (existing in `lib/retail/insights.ts`, moved to `figures.ts`): on hand ÷ (sold ÷ 30), whole days; "—" when nothing sold. Bar fill = min(100, days ÷ 20 × 100) %, `--warn-dot` under 35 %. |
| Low | Out (on hand ≤ 0), or on hand ≤ reorder at, or cover < 7 days. The stock spec's "5 low" badge must use this same function (open question 5). |
| Margin | (price − cost) ÷ price on the VAT-inclusive price, one decimal. Warn under the category's target margin; bad more than 5 points under it or when price < cost. Target default 25 % when the category has none. |
| Takings | Σ `lineTotal` of the lines (VAT inclusive, after discounts), refunds subtracted. |
| Promotion state | `endedAt` set or `endsAt < now` → Ended; `pausedAt` set → Paused; `startsAt > now` → Scheduled; else Running; Running and `endsAt` before the end of tomorrow → badge "Ends tomorrow" (before the end of today → "Ends today"). A promotion saved without a start date does not exist: Starts is required. Steps: Draft (always done once saved) · Scheduled · Running · Ended. |
| Voucher state | `voidedAt` → Void; nothing left (`balance = 0` or `usesLeft = 0`) → Used up; `expiresOn < today` → Expired; else Live (In use once any `RetailVoucherUse` exists, for the record's steps). |
| Can make | Fixed set: min over items of ⌊on hand at the site ÷ quantity⌋ (0 when an item is archived); pack: the case's own on hand; buy-more deal: "—". |
| Saves | Σ(items' default-list price × quantity) − bundle price. |

### 3.3 Schema changes, by migration

Every migration ships with its witness test in the same commit (pattern `lib/retail/sale-line-deposit-migration.test.ts`,
asserting `information_schema` columns, `pg_indexes`, enum values and the data backfill). Apply with
`npx prisma migrate deploy`, then `set -a; . ./.env; set +a; DATABASE_URL="$DATABASE_URL_TEST" npx prisma migrate deploy`.
Never `db push`.

#### `20261004132200_retail_category_tree` (PRD-02) · witness `lib/retail/category-tree-migration.test.ts`

```prisma
model RetailCategory {
  // … existing fields unchanged (name, vatRate, ageRestricted, returnable, depositAmount, targetMarginPercent, sortOrder, archivedAt) …
  /// "Inside": one level only. Null for a top-level category.
  parentId  String?
  /// VAT "Exempt" as opposed to "Zero-rated". Both have vatRate 0; the fiscal device needs the difference.
  vatExempt Boolean             @default(false)
  /// The shop type whose seed made it ("Shop type" filter). Null when added by hand.
  seededFor RetailBusinessType?

  parent   RetailCategory?  @relation("RetailCategoryParent", fields: [parentId], references: [id], onDelete: SetNull)
  children RetailCategory[] @relation("RetailCategoryParent")

  @@index([parentId])
}
```

SQL: add the three columns and the FK and index; backfill `seededFor` = `'LIQUOR'` for categories named Beer, Spirits, Wine,
Ciders and coolers, Soft drinks, Snacks, Ice and mixers in companies whose `RetailShopProfile.businessType = 'LIQUOR'`, and
`'GENERAL'` for Groceries, Drinks, Snacks, Household, Personal care, Other in GENERAL companies. Code: `CATEGORY_SEEDS` target
margins become Beer 22, Spirits 25, Wine 30, Ciders and coolers 25, Soft drinks 28, Snacks 30, Ice and mixers 30 (the board's);
`ensureRetailCategories` writes `seededFor`. Witness: columns, FK `RetailCategory_parentId_fkey`, index, backfill on a fixture.

#### `20261004132300_retail_product_fields` (PRD-03) · witness `lib/retail/product-fields-migration.test.ts`

```prisma
enum RetailPriceChangeSource {
  ADDED     // put on a list (new product, new list, added to a list)
  TYPED     // typed on the worksheet or the record
  BULK      // Change many prices
  FOLLOWED  // followed its base list or the cost
  IMPORT    // import or the starter catalogue
  REMOVED   // taken off a list
}

model Product {
  // … existing …
  // REMOVED: compareAtPrice — "Was" is now the price history.
  /// "Supplier" on the product form: who it is usually bought from.
  supplierId  String?
  /// A case: "Break cases at the till". The till opens one when the singles run out.
  breakAtTill Boolean @default(true)

  supplier     Vendor?              @relation("ProductSupplier", fields: [supplierId], references: [id], onDelete: SetNull)
  priceChanges ProductPriceChange[]

  @@index([supplierId])
}

model Vendor {
  // … existing …
  products Product[] @relation("ProductSupplier")
}

model InventoryItem {
  // … existing …
  /// "Reorder": how many to order when it reaches minStock. Null = not set.
  reorderQuantity Decimal? @db.Decimal(12, 4)
}

/// One price on one list changing, now or later. The price history, "Was" and "Changed", and scheduled changes.
model ProductPriceChange {
  id          String                  @id @default(uuid())
  companyId   String
  priceListId String
  productId   String
  minQuantity Decimal                 @default(1) @db.Decimal(12, 4)
  /// Null when the product was put on the list.
  fromPrice   Decimal?                @db.Decimal(14, 2)
  /// Null when it was taken off the list.
  toPrice     Decimal?                @db.Decimal(14, 2)
  source      RetailPriceChangeSource
  /// Rows saved together (one save bar, one Change many prices).
  batchId     String?
  /// When it takes effect. Equal to createdAt for "Now".
  effectiveAt DateTime
  /// Null while scheduled. Set once by applyDuePriceChanges.
  appliedAt   DateTime?
  cancelledAt DateTime?
  createdById String?
  createdAt   DateTime                @default(now())

  company   Company   @relation(fields: [companyId], references: [id], onDelete: Cascade)
  priceList PriceList @relation(fields: [priceListId], references: [id], onDelete: Cascade)
  product   Product   @relation(fields: [productId], references: [id], onDelete: Cascade)
  createdBy User?     @relation("ProductPriceChangeCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)

  @@index([companyId, productId, appliedAt])
  @@index([priceListId, productId, appliedAt])
  @@index([appliedAt, effectiveAt])
  @@index([batchId])
}

enum AccountingSourceType {
  // … existing …
  RETAIL_OPENING_STOCK
}

enum RetailAccountRole {   // created by SET-09
  // … SALES, VAT_OUTPUT, COST_OF_SALES, STOCK, BREAKAGE, DEPOSITS_HELD …
  OPENING_BALANCES
}
```

SQL: `ALTER TYPE … ADD VALUE` (outside a transaction block, first statements of the file); create the table and indexes; add
the columns; backfill one `ProductPriceChange` per existing `ProductPrice` (`source = 'ADDED'`, `fromPrice NULL`,
`toPrice = unitPrice`, `effectiveAt = appliedAt = "updatedAt"`); then `ALTER TABLE "Product" DROP COLUMN "compareAtPrice"`.
Code: `lib/accounting/defaults.ts` gains account `3100 Opening Balances` (EQUITY), the role mapping default OPENING_BALANCES →
3100 in the seed pack, and the rule `RETAIL_OPENING_STOCK` ("Retail opening stock", lines: Dr ROLE_MAPPING STOCK
`valuePath: "amount"`, Cr ROLE_MAPPING OPENING_BALANCES `valuePath: "amount"`); `createJournalEntryFromSource` already runs
`ensureAccountingDefaults`, so existing companies get both on first use. `lib/accounting/source-types.ts` gains the label
"Retail opening stock". Depends on SET-09's migration (`RetailAccountRole`). Witness: enum values, table, columns, the dropped
column, backfill count = `ProductPrice` count.

#### `20261004132400_retail_price_list_rules` (PRD-05) · witness `lib/retail/price-list-rules-migration.test.ts`

```prisma
enum PriceListState {
  DRAFT
  ON
  PAUSED
}

enum PriceListAudience {
  EVERYONE
  ACCOUNT_CUSTOMERS
  LOYALTY_MEMBERS
  STAFF
}

enum PriceListWhen {
  ALWAYS
  DAYS_AND_HOURS
  BETWEEN_DATES
}

enum PriceListBasis {
  OWN   // "Set for each product"
  LIST  // "<base list> less/plus n%" or "Same as <base list>"
  COST  // "Cost plus n%"
}

model PriceList {
  id            String            @id @default(uuid())
  companyId     String
  name          String
  kind          PriceListKind     @default(STANDARD)
  /// The list every till uses unless another applies. Exactly one per company (partial unique index).
  isDefault     Boolean           @default(false)
  region        String?
  currency      String            @default("USD")
  taxInclusive  Boolean           @default(false)
  // REMOVED: isActive — replaced by state.
  state         PriceListState    @default(ON)
  audience      PriceListAudience @default(EVERYONE)
  whenKind      PriceListWhen     @default(ALWAYS)
  /// ISO weekdays 1 (Monday) … 7 (Sunday), for DAYS_AND_HOURS.
  daysOfWeek    Int[]             @default([])
  /// "17:00" and "19:00", 24-hour, Africa/Harare, for DAYS_AND_HOURS.
  fromTime      String?
  toTime        String?
  startsOn      DateTime?         @db.Date
  endsOn        DateTime?         @db.Date
  /// "Where": null = all sites.
  siteId        String?
  /// "From quantity": the minimum quantity new rows on this list start from.
  minQuantity   Int               @default(1)
  basis         PriceListBasis    @default(OWN)
  basisListId   String?
  /// −8 = "less 8%", +5 = "plus 5%", 0 = "The same".
  adjustPercent Decimal?          @db.Decimal(6, 2)
  archivedAt    DateTime?
  updatedById   String?
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt

  company    Company              @relation(fields: [companyId], references: [id], onDelete: Cascade)
  site       Site?                @relation("PriceListSite", fields: [siteId], references: [id], onDelete: SetNull)
  basisList  PriceList?           @relation("PriceListBasis", fields: [basisListId], references: [id], onDelete: SetNull)
  followers  PriceList[]          @relation("PriceListBasis")
  updatedBy  User?                @relation("PriceListUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)
  entries    ProductPrice[]
  categories PriceListCategory[]
  changes    ProductPriceChange[]
  // + SET-02/SET-03 back-relations (sites, registers that sell from it)

  @@unique([companyId, name])
  @@index([companyId, state, kind])
}

/// "Only these categories". None = everything on the list.
model PriceListCategory {
  priceListId String
  categoryId  String

  priceList PriceList      @relation(fields: [priceListId], references: [id], onDelete: Cascade)
  category  RetailCategory @relation(fields: [categoryId], references: [id], onDelete: Cascade)

  @@id([priceListId, categoryId])
}

model ProductPrice {
  // … existing …
  /// True while the row follows its list's basis (base list or cost). A typed price sets it false.
  followsBase Boolean @default(false)
}
```

SQL: create the enums; add the columns; `UPDATE "PriceList" SET state = CASE WHEN "isActive" THEN 'ON' ELSE 'PAUSED' END`;
drop `isActive` (and its index, recreated as `(companyId, state, kind)`); rename the shelf list:
`UPDATE "PriceList" SET name = 'Retail', "isDefault" = true WHERE kind = 'RETAIL' AND name = 'Shelf prices'` (and
`isDefault = false` on every other list of those companies); then
`CREATE UNIQUE INDEX "PriceList_one_default" ON "PriceList"("companyId") WHERE "isDefault" AND "archivedAt" IS NULL`.
Code: `choosePriceList` (`lib/inventory/catalogue.ts`), `catalogue-service.ts`, `app/api/v2/inventory/price-lists/**` read
`state === "ON"` instead of `isActive`; `SHELF_PRICE_LIST_NAME` and `activeRetailPriceList` go — retail finds the default list
by `isDefault`. Witness: enums, columns, dropped `isActive`, the partial unique index, the rename on a fixture.

#### `20261004132500_retail_print_jobs` (PRD-06) · witness `lib/retail/print-jobs-migration.test.ts`

```prisma
enum RetailPrintJobKind {
  LABELS
}

enum RetailPrintJobStatus {
  QUEUED
  PRINTED
  FAILED
}

/// Something for a till's printer to print when it next asks. The till pulls; nothing is pushed.
model RetailPrintJob {
  id          String               @id @default(uuid())
  companyId   String
  registerId  String
  kind        RetailPrintJobKind
  /// { size, show: { price, was, barcode }, labels: [{ name, price, was, barcode, symbology, copies }] }
  payload     Json
  status      RetailPrintJobStatus @default(QUEUED)
  error       String?
  createdById String?
  createdAt   DateTime             @default(now())
  printedAt   DateTime?

  company   Company        @relation(fields: [companyId], references: [id], onDelete: Cascade)
  register  RetailRegister @relation(fields: [registerId], references: [id], onDelete: Cascade)
  createdBy User?          @relation("RetailPrintJobCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)

  @@index([registerId, status, createdAt])
}
```

#### `20261004132600_retail_bundles` (PRD-08) · witness `lib/retail/bundles-migration.test.ts`

```prisma
enum RetailBundleKind {
  FIXED_SET  // "Bundle"
  BUY_MORE   // "Buy more, pay less"
}

enum RetailOnSaleDays {
  EVERY_DAY
  WEEKENDS
  CHOOSE
}

model RetailBundle {
  id          String           @id @default(uuid())
  companyId   String
  /// "BND-0004", reserveIdentifier(…, "RETAIL_BUNDLE").
  code        String
  kind        RetailBundleKind
  name        String
  barcode     String?
  /// The till button sits under this category ("Till button: Yes, under Beer").
  categoryId  String?
  /// Fixed set: the bundle's price. Buy more: what `buyQuantity` of them cost together.
  price       Decimal          @db.Decimal(14, 2)
  /// Buy more: how many from the set ("Any 3"). Null for a fixed set.
  buyQuantity Int?
  days        RetailOnSaleDays @default(EVERY_DAY)
  /// ISO weekdays when days = CHOOSE; [6, 7] is stored for WEEKENDS.
  daysOfWeek  Int[]            @default([])
  /// "Until": null = "No end date".
  endsOn      DateTime?        @db.Date
  /// "Sites": null = all sites.
  siteId      String?
  tillButton  Boolean          @default(true)
  pausedAt    DateTime?
  stoppedAt   DateTime?
  archivedAt  DateTime?
  createdById String?
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt

  company   Company            @relation(fields: [companyId], references: [id], onDelete: Cascade)
  category  RetailCategory?    @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  site      Site?              @relation("RetailBundleSite", fields: [siteId], references: [id], onDelete: SetNull)
  createdBy User?              @relation("RetailBundleCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
  items     RetailBundleItem[]
  saleLines RetailSaleLine[]

  @@unique([companyId, code])
  @@index([companyId, barcode])
  @@index([companyId, archivedAt, stoppedAt])
}

model RetailBundleItem {
  id        String  @id @default(uuid())
  bundleId  String
  productId String
  /// Fixed set: how many of it. Buy more: 1 (the product counts towards buyQuantity).
  quantity  Int     @default(1)
  sortOrder Int     @default(0)

  bundle  RetailBundle @relation(fields: [bundleId], references: [id], onDelete: Cascade)
  product Product      @relation(fields: [productId], references: [id], onDelete: Restrict)

  @@unique([bundleId, productId])
  @@index([productId])
}

model RetailSaleLine {
  // … existing …
  /// The bundle or buy-more deal this line was sold under.
  bundleId  String?
  /// Lines sold as one bundle share this ("<saleId>:<n>"), so the receipt and the record can group them.
  bundleRef String?

  bundle RetailBundle? @relation(fields: [bundleId], references: [id], onDelete: SetNull)

  @@index([companyId, bundleId])
}
```

Code: `ReservableIdEntity` gains `RETAIL_BUNDLE` (prefix "BND", four digits, not per site).

#### `20261004132700_retail_promotion_rules` (PRD-09) · witness `lib/retail/promotion-rules-migration.test.ts`

```prisma
enum RetailPromotionType {
  PERCENT      // "% off" / "Percent off"
  AMOUNT       // "Amount off"
  BUY_X_PAY    // "Buy X, pay less"   (was BUY_X_GET_Y)
  FIXED_PRICE  // "Bundle price" on the form, "Fixed price" in the list (was BUNDLE)
}

enum RetailPromotionScope {
  EVERYTHING
  CATEGORIES
  PRODUCTS
}

enum RetailPromotionAudience {
  EVERYONE
  LOYALTY_MEMBERS
  STAFF
}

model RetailPromotion {
  id          String                  @id @default(uuid())
  companyId   String
  /// "Code": shows on receipts and in Insights. PROMO-FESTIVE, MONTHEND-CIDER.
  promoCode   String
  name        String
  type        RetailPromotionType
  /// PERCENT: the percent. AMOUNT: off each unit. BUY_X_PAY: what X cost together. FIXED_PRICE: the unit price.
  value       Decimal                 @default(0) @db.Decimal(14, 2)
  /// BUY_X_PAY: X ("Buy 2").
  buyQuantity Int?
  scope       RetailPromotionScope    @default(EVERYTHING)
  /// "Basket over US$20". Null = "Any size".
  minBasket   Decimal?                @db.Decimal(14, 2)
  /// "Days": [] = every day.
  daysOfWeek  Int[]                   @default([])
  /// With both null: "all day".
  fromTime    String?
  toTime      String?
  audience    RetailPromotionAudience @default(EVERYONE)
  /// "Works with other promotions".
  stacks      Boolean                 @default(false)
  /// "Sites": null = all sites.
  siteId      String?
  startsAt    DateTime
  endsAt      DateTime?
  pausedAt    DateTime?
  endedAt     DateTime?
  // REMOVED: status (+ enum RetailPromotionStatus) — state is computed (§3.2). notes removed (no field on the boards).
  archivedAt  DateTime?
  createdById String?
  createdAt   DateTime                @default(now())
  updatedAt   DateTime                @updatedAt

  company    Company                   @relation(fields: [companyId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  site       Site?                     @relation("RetailPromotionSite", fields: [siteId], references: [id], onDelete: SetNull)
  createdBy  User?                     @relation("RetailPromotionCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
  products   RetailPromotionProduct[]
  categories RetailPromotionCategory[]
  saleLines  RetailSaleLine[]

  @@unique([companyId, promoCode])
  @@index([companyId, startsAt])
}

model RetailPromotionProduct {
  promotionId String
  productId   String

  promotion RetailPromotion @relation(fields: [promotionId], references: [id], onDelete: Cascade)
  product   Product         @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@id([promotionId, productId])
  @@index([productId])
}

model RetailPromotionCategory {
  promotionId String
  categoryId  String

  promotion RetailPromotion @relation(fields: [promotionId], references: [id], onDelete: Cascade)
  category  RetailCategory  @relation(fields: [categoryId], references: [id], onDelete: Cascade)

  @@id([promotionId, categoryId])
}

model RetailSaleLine {
  // … existing …
  promotionId       String?
  /// The promotion's part of discountAmount. discountAmount stays the line's whole discount.
  promotionDiscount Decimal  @default(0) @db.Decimal(14, 2)

  promotion RetailPromotion? @relation(fields: [promotionId], references: [id], onDelete: SetNull)

  @@index([companyId, promotionId])
}

model RetailSale {
  // … existing …
  // REMOVED: promotionCode — the lines carry the promotion.
}
```

SQL: rename the enum values (`ALTER TYPE "RetailPromotionType" RENAME VALUE 'BUY_X_GET_Y' TO 'BUY_X_PAY'`, `'BUNDLE'` →
`'FIXED_PRICE'`); add the new enums, columns and tables; `startsAt` backfilled with `"createdAt"` where null, then `SET NOT NULL`;
`endedAt = "updatedAt"` where `status = 'INACTIVE'`; existing whole-basket promotions become `scope = 'EVERYTHING'`; backfill
`RetailSaleLine.promotionId` from `RetailSale.promotionCode` (lines of a sale with a code get that promotion, and their
`discountAmount` becomes `promotionDiscount`); drop `RetailPromotion.status`, `RetailPromotion.notes`, the enum
`RetailPromotionStatus`, `RetailSale.promotionCode`. Witness: renamed values, columns, tables, NOT NULL, the backfill on a fixture.

#### `20261004132800_retail_vouchers` (PRD-10) · witness `lib/retail/vouchers-migration.test.ts`

```prisma
enum RetailVoucherKind {
  GIFT         // "Gift voucher" (GV-)
  CREDIT_NOTE  // "Credit note" (CN-)
  DISCOUNT     // "Promotion" on the form, "Discount voucher" in the list (DV-)
}

enum RetailVoucherFunding {
  SOLD    // paid for at the till: money owed to the holder
  GIVEN   // issued in the back office: a cost to the shop
  REFUND  // a refund paid as a credit note
}

enum RetailVoucherSendBy {
  PRINT
  WHATSAPP
  BOTH
}

model RetailVoucher {
  id           String               @id @default(uuid())
  companyId    String
  code         String
  /// Printed and sent with the code; asked at the till when the code is typed rather than scanned.
  secret       String
  kind         RetailVoucherKind
  funding      RetailVoucherFunding
  /// Money vouchers: the value when issued. Null for a percent discount voucher.
  value        Decimal?             @db.Decimal(14, 2)
  /// Money vouchers: what is left.
  balance      Decimal              @default(0) @db.Decimal(14, 2)
  /// Discount vouchers: "10% off" or an amount off.
  percentOff   Decimal?             @db.Decimal(5, 2)
  amountOff    Decimal?             @db.Decimal(14, 2)
  /// Discount vouchers: copies printed and uses left ("20 printed", "12 left").
  copies       Int                  @default(1)
  usesLeft     Int?
  customerId   String?
  /// "Smallest sale it works on".
  minSale      Decimal?             @db.Decimal(14, 2)
  expiresOn    DateTime             @db.Date
  /// "Sites": null = all sites.
  siteId       String?
  sendBy       RetailVoucherSendBy  @default(PRINT)
  sentAt       DateTime?
  /// The sale it was bought in (SOLD) or refunded from (REFUND).
  soldSaleId   String?
  issuedById   String?
  issuedAt     DateTime             @default(now())
  expiredAt    DateTime?
  voidedAt     DateTime?
  voidedById   String?
  voidReason   String?
  createdAt    DateTime             @default(now())
  updatedAt    DateTime             @updatedAt

  company  Company            @relation(fields: [companyId], references: [id], onDelete: Cascade)
  customer Customer?          @relation("RetailVoucherCustomer", fields: [customerId], references: [id], onDelete: SetNull)
  site     Site?              @relation("RetailVoucherSite", fields: [siteId], references: [id], onDelete: SetNull)
  soldSale RetailSale?        @relation("RetailVoucherSoldSale", fields: [soldSaleId], references: [id], onDelete: SetNull)
  issuedBy User?              @relation("RetailVoucherIssuedBy", fields: [issuedById], references: [id], onDelete: SetNull)
  voidedBy User?              @relation("RetailVoucherVoidedBy", fields: [voidedById], references: [id], onDelete: SetNull)
  uses     RetailVoucherUse[]

  @@unique([companyId, code])
  @@index([companyId, kind, expiresOn])
  @@index([customerId])
}

model RetailVoucherUse {
  id           String   @id @default(uuid())
  companyId    String
  voucherId    String
  saleId       String
  /// Money taken off the voucher, or the discount it gave.
  amount       Decimal  @db.Decimal(14, 2)
  balanceAfter Decimal  @db.Decimal(14, 2)
  /// Negative when a refund put money back on it.
  createdAt    DateTime @default(now())

  company Company       @relation(fields: [companyId], references: [id], onDelete: Cascade)
  voucher RetailVoucher @relation(fields: [voucherId], references: [id], onDelete: Restrict)
  sale    RetailSale    @relation("RetailVoucherUseSale", fields: [saleId], references: [id], onDelete: Restrict)

  @@index([voucherId, createdAt])
  @@index([saleId])
}

model RetailSale {
  // … existing …
  /// Gift vouchers bought in this sale. Outside totalAmount (like depositAmount): owed to the holder, not revenue.
  vouchersSoldAmount Decimal  @default(0) @db.Decimal(14, 2)
  discountVoucherId  String?
}

model RetailSalePayment {
  // … existing …
  /// Tender VOUCHER: which voucher paid.
  voucherId String?
}

enum AccountingSourceType {
  // … existing …
  RETAIL_VOUCHER_ISSUE
  RETAIL_VOUCHER_EXPIRY
  RETAIL_VOUCHER_VOID
}

enum RetailAccountRole {
  // … existing …
  VOUCHERS_OWED
  PROMOTIONS_GIVEN
  OTHER_INCOME
}
```

Code: accounts `2250 Vouchers Owed` (LIABILITY) and `5450 Promotions and Gifts` (EXPENSE) in the default chart; role defaults
VOUCHERS_OWED → 2250, PROMOTIONS_GIVEN → 5450, OTHER_INCOME → 4200; the default `TenderAccountMapping` for VOUCHER moves from
1018 Voucher Clearing to 2250 (data update in the migration for companies whose VOUCHER mapping points at 1018); rules
`RETAIL_VOUCHER_ISSUE` (Dr PROMOTIONS_GIVEN / Cr VOUCHERS_OWED, `amount`), `RETAIL_VOUCHER_EXPIRY` and `RETAIL_VOUCHER_VOID`
(Dr VOUCHERS_OWED `amount`; Cr OTHER_INCOME when `funding` is SOLD or REFUND, Cr PROMOTIONS_GIVEN when GIVEN, by line
conditions on `funding`); the `RETAIL_SALE` rule gains Cr VOUCHERS_OWED `valuePath: "vouchersSoldAmount"` and
`buildRetailPostingPayload` carries it. `ReservableIdEntity` gains `RETAIL_GIFT_VOUCHER` ("GV"), `RETAIL_CREDIT_NOTE` ("CN"),
`RETAIL_DISCOUNT_VOUCHER` ("DV"), four digits. Witness: enums, tables, columns, the tender mapping update on a fixture.

### 3.4 Audit events (`RETAIL_AUDIT_EVENTS`, `lib/retail/audit.ts`) and their Activity sentences

`lib/retail/audit.test.ts` asserts the list. Sentences go into `lib/retail/activity-words.ts` (FND 5.6.9).

| Event | Entity | Payload | Sentence | Tone |
|---|---|---|---|---|
| `RETAIL_PRODUCT.CREATED` | Product | `{ code, name, price, category, openingStock, site, packOf?, packSize? }` | "Added at US$2.10, 48 in stock at Harare Main Branch" | ok |
| `RETAIL_PRODUCT.ARCHIVED` / `UNARCHIVED` | Product | `{ name }` | "Stopped selling it" / "Put it on sale again" | hollow / ok |
| `RETAIL_PRICE.CHANGED` | Product | `{ list, from, to, how }` | "Changed the Retail price from US$17.50 to US$18.25" | info |
| `RETAIL_PRICE.SCHEDULED` | PriceList | `{ list, count, effectiveAt, batchId }` | "Scheduled 4 prices for 3 Oct 22:00" | info |
| `RETAIL_PRICE_LIST.CREATED` / `CHANGED` / `PAUSED` / `RESUMED` | PriceList | `{ name, rule }` / `{ changes }` | "Made the list: 10% off beer and ciders, Fridays 17:00 to 19:00" / "Changed <labels>" / "Paused it" / "Switched it on" | ok / info / hollow / ok |
| `RETAIL_PRICE_LIST.PRODUCTS_ADDED` / `PRODUCTS_REMOVED` | PriceList | `{ count, names }` | "Added 3 products" / "Removed 2 products" | info |
| `RETAIL_CATEGORY.CREATED` (setup adds the constant) / `CHANGED` / `DELETED` | RetailCategory | `{ name }` / `{ changes, products }` / `{ moved, into }` | "Added it" / "Changed VAT to Zero-rated for 6 products" / "Deleted it and moved 61 products to Spirits and liqueurs" | ok / info / bad |
| `RETAIL_LABELS.PRINTED` | Product (one per product) | `{ size, copies, printer }` | "Printed 1 shelf strip on the front till printer" | hollow |
| `RETAIL_BUNDLE.CREATED` / `CHANGED` / `PAUSED` / `RESUMED` / `STOPPED` | RetailBundle | `{ name, price }` / `{ changes }` | "Made it at US$9.50" / "Changed <labels>" / "Paused it" / "Put it on sale again" / "Stopped selling it" | ok / info / hollow / ok / bad |
| `RETAIL_PROMOTION.CREATED` / `CHANGED` / `PAUSED` / `RESUMED` / `ENDED` | RetailPromotion | `{ code, name }` / `{ changes }` | "Scheduled it from 25 Oct 00:00" / "Changed <labels>" / "Paused it" / "Resumed it" / "Ended it" | ok / info / hollow / ok / hollow |
| `RETAIL_VOUCHER.ISSUED` / `CHANGED` / `SENT` / `REDEEMED` / `VOIDED` / `EXPIRED` | RetailVoucher | `{ code, kind, value }` / `{ changes }` / `{ via }` / `{ saleNo, amount, left }` / `{ reason, left }` / `{ left }` | "Issued for US$50.00" / "Changed Expires from 28 Sep 2027 to 28 Mar 2028" / "Sent on WhatsApp" / "US$8.40 spent on SALE-29811, US$11.60 left" / "Voided: <reason>" / "Expired with US$4.20 left" | ok / info / hollow / ok / bad / hollow |

### 3.5 Seed and demo data — extend `scripts/seed-retail-demo.ts`

Run: `pnpm tsx scripts/seed-retail-demo.ts --slug hurudza-creative --days 160 --reset`. The script stays idempotent (upserts by
code/name). Foundations already moves the main site to "Harare Main Branch" and adds "Borrowdale"; this area adds:

**Products** (`CATALOGUE`, costs and prices from `PricesList.png`; on hand set **after** the history is generated; the last 30
days of history are generated per product to hit "Sold, 30 days" exactly; units and reorder levels as listed):

| Code | Name | Category | Price | Cost | On hand | Sold 30 d | Reorder at | Reorder | State |
|---|---|---|---|---|---|---|---|---|---|
| AMARULA-750 | Amarula Cream 750ml | Spirits | 18.25 | 13.03 | 13 bottles | 64 | 12 | 24 | selling (low: 6 days) |
| BERNINI-275 | Bernini Blush 275ml | Ciders and coolers | 1.75 | 1.20 | 48 bottles | 40 | 24 | 48 | selling |
| BOHLINGER-330 | Bohlinger’s 330ml | Beer | 1.55 | 1.08 | 96 bottles | 70 | 36 | 48 | selling |
| CASTLE-340 | Castle Lager 340ml | Beer | 1.20 | 0.86 | 26 bottles | 88 | 96 | 96 | selling (low) |
| CASTLE-CASE | Castle Lager case of 24 | Beer | 26.50 | 20.10 | 22 cases | 55 | 8 | 10 | selling; case of 24 × CASTLE-340, break at till on, crate deposit 3.00 |
| CHARCOAL-4KG | Charcoal 4kg | Snacks | 3.90 | 2.40 | 11 bags | 20 | 6 | 12 | selling |
| CHIBUKU-1L | Chibuku Scud 1L | Beer | 1.10 | 0.82 | 210 cartons | 350 | 60 | 120 | selling |
| CHIBUKU-12 | Chibuku crate of 12 | Beer | 12.50 | 9.84 | 17 crates | 21 | 4 | 6 | selling; case of 12 × CHIBUKU-1L |
| COKE-500 | Coca-Cola 500ml | Soft drinks | 0.75 | 0.52 | 180 bottles | 216 | 48 | 96 | selling |
| COKE-6PK | Coke 500ml six-pack | Soft drinks | 4.20 | 3.12 | 30 packs | 36 | 6 | 12 | selling; case of 6 × COKE-500 |
| GORDONS-750 | Gordon’s Gin 750ml | Spirits | 16.40 | 12.40 | 18 bottles | 67 | 6 | 12 | selling |
| HUNTERS-330 | Hunter’s Gold 330ml | Ciders and coolers | 1.85 | 1.31 | 60 bottles | 50 | 24 | 48 | selling |
| ICE-2KG | Ice 2kg bag | Ice and mixers | 1.50 | 1.00 | 40 bags | 86 | 20 | 40 | selling |
| JAMESON-750 | Jameson Irish Whiskey 750ml | Spirits | 27.90 | 22.15 | 9 bottles | 121 | 12 | 12 | selling (low) |
| BLKLABEL-750 | Johnnie Walker Black 750ml | Spirits | 42.00 | 33.60 | 6 bottles | 58 | 12 | 12 | selling (low) |
| NEDERBURG-750 | Nederburg Cabernet 750ml | Wine | 12.60 | 9.40 | 24 bottles | 20 | 8 | 12 | selling |
| SAVANNA-330 | Savanna Dry 330ml | Ciders and coolers | 1.85 | 1.38 | 72 bottles | 45 | 24 | 48 | selling |
| TONIC-200 | Schweppes Tonic 200ml | Ice and mixers | 0.60 | 0.38 | 96 cans | 40 | 24 | 48 | selling |
| TWOKEYS-750 | Two Keys Whisky 750ml | Spirits | 9.75 | 7.10 | 28 bottles | 30 | 12 | 12 | selling |
| ZAMBEZI-375 | Zambezi Lager 375ml | Beer | 1.35 | 0.95 | 144 bottles | 0 | 48 | 48 | **archived** |
| BOLS-750 | Bols Brandy 750ml | Spirits | 14.20 | 11.22 | 6 bottles | 0 | 6 | 6 | **archived** |

Bohlinger’s stock sits at Borrowdale (as on `StockList.png`); everything else at Harare Main Branch. Low stock is exactly
Amarula (cover 6 days), Castle Lager 340ml (26 ≤ 96), Jameson (9 ≤ 12) and Johnnie Walker (6 ≤ 12). Expected tabs: Selling 19 ·
Low stock 4 · Archived 2 · All 21 (the board's 15 · 4 · 2 · 17 is sample data; the extra rows exist because the bundles, packs
and promotion boards need them). The nine `ProductsList.png` rows show the board's On hand, Cover, Price and Sold figures.
All products carry `supplierId`: Delta Beverages (beers, ciders, Coke, ice), Afdis Distillers (spirits, wine), Schweppes Zimbabwe
(tonic), Natbrew (Chibuku), Charcoal: none — as `Vendor` rows (or the buying spec's supplier rows) created by the buying seed;
this script looks them up by name and leaves the field null when absent.

**Price history** (`ProductPriceChange`, default list "Retail"): every product ADDED on 1 August 2026 at its "was" price
(Amarula 17.50, Castle 340ml 1.10, Castle case 25.90, Coca-Cola 0.70, Hunter’s 1.80, Ice 1.40, Jameson 26.50, Nederburg 12.00,
Two Keys 9.50; all others at today's price), then on 3 October 2026 10:00 a TYPED change by Tendai Mhlanga to today's price for
those nine. Amarula also has two earlier changes so its Price history tab reads 4: 1 Aug ADDED 16.90, 20 Aug TYPED 16.90 → 17.25,
1 Sep TYPED 17.25 → 17.50, 3 Oct TYPED 17.50 → 18.25.

**Price lists** (Retail renamed from "Shelf prices" by the migration):

| Name | State | Audience · when · where | Basis | Rows | Changed |
|---|---|---|---|---|---|
| Retail | ON, default | Everyone · Always · all sites | OWN | every product | 3 October 2026 |
| Wholesale | ON | Customers on account · Always · all sites · min quantity 6 | LIST Retail −8 % | every product at Retail × 0.92 (followsBase), Amarula 16.90 (typed) | 28 September 2026 |
| Happy hour | ON | Everyone · Fridays 17:00–19:00 · all sites · categories: Beer | LIST Retail −10 % | the six beer products | 19 September 2026 |
| Staff | ON | Staff · Always · all sites | COST +5 % | every product with a cost | 1 August 2026 |
| Avondale branch | DRAFT | Everyone · Always · Borrowdale | LIST Retail +5 % | every product; Ice 0.95 and Coca-Cola 0.50 typed (2 below cost) | 2 October 2026 |

**Categories:** the liquor seven with the board's target margins (§3.3), `seededFor = LIQUOR`; Spirits, Beer, Wine and Ciders
and coolers 18+.

**Bundles and packs:** packs are the three case products above. Bundles (`RetailBundle`, created by Tendai Mhlanga):
BND-0004 "Braai pack" FIXED_SET 11.00, barcode 6001234500044, category Beer, items 6 × Castle Lager 340ml, 1 × Ice 2kg bag,
1 × Charcoal 4kg, made 2 August 2026; BND-0005 "Gin and tonic" FIXED_SET 18.90, Gordon’s Gin 750ml × 1, Schweppes Tonic 200ml × 4;
BND-0006 "Any 3 ciders" BUY_MORE 3 for 5.00, Savanna, Hunter’s, Bernini; BND-0007 "Second Amarula half price" BUY_MORE 2 for
27.38, Amarula. History, as bundle-tagged component lines that count inside each product's "Sold, 30 days" (so the Products
figures above are totals including them): Braai pack 10 in the last 30 days and 4 in the 30 before (its 60 Castle Lager 340ml
are part of Castle's 88 — the board's 18 cannot hold together with Castle's 88), Gin and tonic 9, Any 3 ciders 44 groups,
Second Amarula half price 6 groups.

**Promotions** (absolute dates as on the board unless noted; "today" = the seed date):

| Code | Name | Type, value | Applies to | Starts | Ends | State |
|---|---|---|---|---|---|---|
| PROMO-FESTIVE | Festive season US$2 off spirits | AMOUNT 2.00 | Spirits (category) | 2 September 2026 00:00 | — | Running; every Spirits unit sold since then carries it (2.00 each) |
| PROMO-STAFF | Staff discount US$2 | AMOUNT 2.00, audience Staff | Everything | 15 August 2026 | — | Running |
| PROMO-CASE24 | Castle case at US$24.00 | FIXED_PRICE 24.00 | Castle Lager case of 24 | today − 14 days | tomorrow 23:59 | Running, "Ends tomorrow" |
| PROMO-XMAS | Christmas hampers 10% off | PERCENT 10 | 4 products (Amarula, Gordon’s, Jameson, Two Keys) | 1 December 2026 | 26 December 2026 | Scheduled |
| PROMO-WINTER | Winter basket 5% off | PERCENT 5, basket 20.00 | Everything | 5 August 2026 | 2 September 2026 | Ended |
| PROMO-CASE | Case of Castle 5% off | PERCENT 5 | Castle Lager case of 24 | 14 July 2026 | 12 September 2026 | Ended |
| PROMO-HERITAGE | Heritage day ciders 10% off | PERCENT 10 | Ciders and coolers | 20 September 2026 | 25 September 2026 | Ended |
| PROMO-COKE2 | Two Cokes for US$1.40 | BUY_X_PAY 2 for 1.40 | Coca-Cola 500ml | 1 July 2026 | 31 July 2026 | Ended |
| PROMO-SAVANNA | Savanna two for US$3.50 | BUY_X_PAY 2 for 3.50 | Savanna Dry 330ml | 1 June 2026 | 30 June 2026 | Ended |

Tabs then read Running 3 · Scheduled 1 · Ended 5 · All 9, as on the board. Existing seed rows PROMO-CASE and PROMO-FESTIVE are
updated in place.

**Vouchers:** the five board rows — GV-0021 gift, Tapiwa Marange, US$50.00 left 50.00, issued 28 September 2026, expires
28 September 2027, SOLD in a seeded sale; CN-0033 credit note, Nyasha Gwenzi, 12.60/12.60, 2 October 2026 → 2 January 2027,
REFUND; GV-0019 gift, no holder, 20.00 left 7.40, 14 August 2026 → 14 August 2027, SOLD in SALE-29410 (cash, Chipo Dube), used on
SALE-29811 (20 August 2026, Front till, 8.40, left 11.60) and SALE-30442 (3 September 2026, Back till, 4.20, left 7.40);
DV-0007 discount 10% off, no holder, 20 copies, 12 left, 1 October 2026 → 31 October 2026, GIVEN; CN-0031 credit note, Kudzai
Zhou, 4.20/4.20, 9 July 2026 → 9 October 2026, REFUND — plus 9 more live, 31 used up and 6 expired generated vouchers (gift and
credit notes, holders from the seeded customers) so the tabs read Live 14 · Used up 31 · Expired 6 · All 51. Each seeded
voucher's money posts through the same service so the ledger's 2250 balance equals the live balances.

**Print jobs:** none.

---

## 4. API

Conventions are FND 4 (session, `requireRetailPermission`, `successResponse`, `errorResponse`, 400 `{ error, fieldErrors }`, 403
"Your role cannot …", 404 "<Noun> not found", 409 sentences shown as they are, company scoping, audit in the same transaction).
All paths below are under `/api/v2/retail` unless they start with `/api/v2/reports`. Money is sent as strings with two
decimals ("18.25") and returned as numbers; dates as ISO strings; day-only dates as `YYYY-MM-DD`.

### 4.1 Lists (list sources, FND-LIST)

Every list page reads `GET /api/v2/reports/[key]?page=&size=&tab=&q=&<filters>&sort=&group=` and exports through
`POST /api/v2/reports/[key]/export`. Definitions in `lib/reports/definitions/retail/products.ts`, loaders in
`lib/reports/loaders/retail/products.ts` (in-memory `load()`; all of these stay well under 5,000 rows).

| Key | Page | Read | Filters (key: options) | Tabs |
|---|---|---|---|---|
| `retail-products` | Products | `retail.catalog:view` | `category`: Any + live categories (options from the loader); `stock`: Any, In stock, Low, Out of stock; `site` (inside Filters, only with two or more sites): All sites + sites | `selling`, `low`, `archived`, `all` |
| `retail-price-lists` | Price lists | `retail.prices:view` | `audience`: Anyone, Everyone, Customers on account, Loyalty members, Staff; `site`: All sites + sites | — |
| `retail-prices` | One price list (worksheet) | `retail.prices:view` | `list` (required, the list id, not shown as a filter); `category`; `supplier`: Any + suppliers; `margin`: Any, Under target, Under cost | — |
| `retail-bundles` | Bundles and packs | `retail.promotions:view` | `kind`: Any, Pack, Bundle, Buy more, pay less; `category` | `all`, `packs`, `bundles`, `buymore` |
| `retail-promotions` | Promotions | `retail.promotions:view` | `type`: Any, Percent off, Amount off, Buy X, pay less, Fixed price; `appliesTo`: Anything, Everything, Categories, Products, Basket | `running` (Running and Paused), `scheduled`, `ended`, `all` |
| `retail-vouchers` | Vouchers | `retail.promotions:view` | `kind`: Any, Gift voucher, Credit note, Discount voucher; `expires` (period-like): Any time, This week, This month, Next 3 months, Already expired | `live`, `usedup`, `expired`, `all` (Void vouchers only under All) |
| `retail-categories` | Categories | `retail.categories:view` | `shopType`: Any, Liquor store, General retail (default: the company's business type; a category matches its `seededFor` or a hand-added one) | — |
| `retail-product-sales` | Product record › Sales | `retail.catalog:view` | `product` (where) | — |
| `retail-product-price-history` | Product record › Price history | `retail.prices:view` | `product` | — |
| `retail-product-suppliers` | Product record › Suppliers | `retail.catalog:view-cost` | `product` | — |
| `retail-promotion-products` | Promotion record › Products | `retail.promotions:view` | `promotion` | — |
| `retail-promotion-sales` | Promotion record › Sales | `retail.promotions:view` | `promotion` | — |
| `retail-bundle-items` | Bundle record › What is in it | `retail.promotions:view` | `bundle` | — |
| `retail-bundle-sales` | Bundle record › Sales | `retail.promotions:view` | `bundle` | — |
| `retail-voucher-uses` | Voucher record › Uses | `retail.promotions:view` | `voucher` | — |

Columns, sorts, totals and bulk actions per source are in §5. Cost columns carry `requires: "view-cost"`. The record's Stock
movements tab uses the stock spec's movements source with `where: { product: id }`.

### 4.2 Products (PRD-01, PRD-03, PRD-04)

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| GET | `/products/new-context` | `retail.catalog:create` | — | `{ sites: {id,name,isDefault}[], oneSite: boolean, defaultSiteId, businessType, depositsOn: boolean, defaultDeposit: "0.10", currency: "USD" }` |
| POST | `/products` | `retail.catalog:create` | `ProductInput` | 201 `{ data: ProductView }` |
| GET | `/products/[id]` | `retail.catalog:view` | — | `{ data: ProductView }` (cost fields null without `view-cost`) |
| PATCH | `/products/[id]` | `retail.catalog:update` (+ `retail.prices:update` for `price`, + `retail.prices:approve` for a price below cost) | `Partial<ProductInput & { reorderQuantity, ageCheck }>` | `{ data: ProductView, changed: {field,from,to}[] }` (FND 4.9) |
| POST | `/products/archive` | `retail.catalog:update` | `{ ids: uuid[] }` (≤ 500) | `{ archived: number }` |
| POST | `/products/unarchive` | `retail.catalog:update` | `{ ids }` | `{ unarchived: number }` |
| GET | `/products/[id]/stock-chart?days=30` | `retail.catalog:view` | — | `{ days: {date, onHand, sold, received}[], projection: {date, onHand}[], reorderAt, perDay, runsOutOn, received: {date, quantity}[], advice: { sentence, orderQuantity } \| null }` |
| GET | `/products/[id]/pdf` | `retail.catalog:view` | — | `application/pdf`, `attachment; filename="AMARULA-750.pdf"` (FND W-55 record export) |
| POST | `/products/image` | `retail.catalog:update` | multipart `file` (png/jpg/webp ≤ 2 MB) | `{ url }` (moved from `/catalog/image`) |
| POST | `/products/[id]/break-case` | `retail.stock:create` | `{ cases, siteId? }` | stock spec (moved from `/catalog/[id]/break-case`) |

```ts
type ProductInput = {
  name: string;                       // 1–200
  categoryId: string;                 // required in the sheet; optional through lookup quick add
  price: string;                      // "2.10", ≥ 0
  barcode?: string | null;            // digits and spaces, 8–14 digits once spaces are removed
  cost?: string | null;
  supplierId?: string | null;
  openingStock?: string | null;       // create only (and edit while the product has no movements)
  siteId?: string | null;             // "At"; default site when absent
  reorderAt?: string | null;
  soldAs?: "SINGLE" | "BY_WEIGHT";
  returnable?: boolean;               // liquor store with deposits on
  depositAmount?: string | null;      // default the category's, else "0.10"
  imageUrl?: string | null;
  andAnother?: boolean;               // "Add, then another": same request, the response carries the defaults to keep
};

type ProductView = {
  id: string; code: string; name: string; barcode: string | null; imageUrl: string | null;
  isActive: boolean; archivedAt: string | null; binnedBy: string | null;
  category: { id: string; name: string; path: string; vatLabel: string; ageCheck: boolean } | null;
  ageCheck: boolean;                  // product or category
  price: number; listName: string;    // default list
  cost: number | null; margin: number | null; marginPerUnit: number | null;   // view-cost only
  otherLists: { id: string; name: string; price: number }[];                  // "Price lists" row
  supplier: { id: string; name: string } | null;
  soldAs: string;                     // "Single; case of 24", "By weight"
  packOf: { id: string; name: string } | null; packSize: number | null; breakAtTill: boolean;
  returnable: boolean; depositAmount: number | null;
  unit: string;                       // "bottle"
  stock: { onHand: number; onHandLabel: string; reorderAt: number | null; reorderQuantity: number | null;
           sites: { id: string; name: string; onHand: number }[] };
  figures: { sold30: number; soldPrev30: number; takings30: number; takingsPrev30: number;
             perDay: number; coverDays: number | null; soldToday: number;
             lastSale: { at: string; till: string } | null };
  low: boolean; out: boolean;
  tabCounts: { movements: number; sales: number; priceHistory: number; suppliers: number; activity: number };
  canEdit: Record<"name"|"code"|"barcode"|"category"|"price"|"cost"|"reorderAt"|"reorderQuantity"|"supplier"|"ageCheck"|"deposit", boolean>;
};
```

Errors: 400 `fieldErrors` (`name`: "There is already a product called Savanna Dry 330ml." — 409 is not used for field clashes so
the sheet can place the message; `barcode`: "Castle Lager 340ml already has this barcode." / "A barcode has 8 to 14 digits.";
`price`: "Below cost needs the owner. It costs US$1.38."; `categoryId`: "That category is not one of this shop's.";
`openingStock`: "Opening stock is a whole number."); 403; 404 "Product not found"; 409 "Restore it to change it" (binned).

### 4.3 Lookups added to `lib/retail/lookups.ts` (FND 4.4)

| Noun | Read | Search | Sub | Quick add (create permission → service) |
|---|---|---|---|---|
| `product` | `retail.catalog:view` | live, selling products by name, code, barcode (exact barcode first); `context.singles` excludes cases; `context.listId` excludes products already on that list | "Beer · 6001108" (category · first 7 barcode digits; "Beer" alone without a barcode) | `[["Name",""],["Price",""]]` (`retail.catalog:create` → `createProduct`, default site, no category: VAT 15 %) |
| `pack` | `retail.catalog:view` | cases (`packOfId` not null) | "4 cases" (on hand at the user's site) | `[["Single",""],["How many in it",""]]` (→ `createPack` at the single's price × size) |
| `price list` | `retail.prices:view` | lists not binned | "214 products" (`Default, 214 products` for the default) | `[["Name",""]]` (`retail.prices:create` → empty OWN list, DRAFT) |
| `printer` | `retail.catalog:view` | tills with `hasPrinter` (SET-03) + "Print here" | site name / "This computer, any printer" | none |
| `category` (FND, changed) | `retail.catalog:view` | live categories; children shown as "Spirits · Liqueur" | "VAT 15%, age check" | quick fields unchanged; create permission becomes `retail.categories:create` |

### 4.4 Price lists (PRD-05)

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| POST | `/price-lists` | `retail.prices:create` | `PriceListInput` | 201 `{ data: PriceListView }` |
| GET | `/price-lists/[id]` | `retail.prices:view` | — | `{ data: PriceListView }` |
| PATCH | `/price-lists/[id]` | `retail.prices:update` | `Partial<PriceListRulesInput>` | `{ data: PriceListView, changed }` |
| POST | `/price-lists/duplicate` | `retail.prices:create` | `{ ids }` | `{ created: {id,name}[] }` ("Wholesale (copy)", DRAFT, same rows with `followsBase` kept) |
| POST | `/price-lists/pause` / `/price-lists/resume` | `retail.prices:update` | `{ ids }` | `{ changed: number }`; 409 for the default list |
| POST | `/price-lists/price-sheet` | `retail.prices:view` | `{ ids }` | `application/pdf`: one A4 section per list, products by category with price (and min quantity) |
| GET | `/pos/pricing?siteId=&registerId=` | `retail.sell:view` | `If-None-Match: <version>` | 200 `PricingSnapshot` with `ETag`, or 304 |

```ts
type PriceListInput = {
  name: string;
  startFrom: { listId: string } | { cost: true };      // "Start from"
  prices: "SAME" | "OFF" | "ON"; by?: string;            // "10%" → 10
  audience: "EVERYONE" | "ACCOUNT_CUSTOMERS" | "LOYALTY_MEMBERS" | "STAFF";
  when: "ALWAYS" | "DAYS_AND_HOURS" | "BETWEEN_DATES";
  hours?: string;                                       // "Fridays, 17:00 to 19:00" | "Monday to Friday, 08:00 to 12:00"
  between?: string;                                     // "1 December to 26 December"
  siteId: string | null;                                // "All sites" = null
  categoryIds: string[];
  switchOn: boolean;
};
type PriceListRulesInput = { name: string; isDefault: boolean; taxInclusive: boolean; currency: "USD" | "ZWG";
  audience: PriceListInput["audience"]; siteId: string | null };

type PriceListView = {
  id: string; name: string; state: "DRAFT" | "ON" | "PAUSED"; isDefault: boolean;
  usedWhen: string;      // "Always, at every till" | "Customer on a wholesale account, 6 or more" | "Fridays 17:00 to 19:00" | "Staff accounts" | "At Borrowdale, once it is switched on"
  pricesRule: string;    // "Set for each product" | "Retail less 8%" | "Retail less 10% on beer" | "Cost plus 5%" | "Same as Retail"
  sub: string;           // "Default price list · all tills · all sites" | "Wholesale price list · 96 products"
  products: number; belowCost: number; changedAt: string | null;
  taxInclusive: boolean; currency: "USD" | "ZWG"; audience: string; siteId: string | null; categoryIds: string[];
};

type PricingSnapshot = {
  version: string; pricedAt: string; currency: "USD" | "ZWG";
  lists: Array<{ id; name; isDefault; audience; whenKind; daysOfWeek; fromTime; toTime; startsOn; endsOn; siteId; categoryIds; taxInclusive; currency }>;
  prices: Array<{ listId; productId; minQuantity: number; price: number }>;   // only products stocked at the site
  products: Array<{ id; categoryId; barcode; ageCheck; packOfId; packSize; breakAtTill; wasPrice: number | null }>;
  bundles: Array<{ id; code; kind; name; barcode; categoryId; price; buyQuantity; days; daysOfWeek; endsOn; siteId; tillButton;
                   items: { productId; quantity }[] }>;                       // PRD-08
  promotions: Array<{ id; code; name; type; value; buyQuantity; scope; productIds; categoryIds; minBasket; daysOfWeek; fromTime;
                      toTime; audience; stacks; siteId; startsAt; endsAt; pausedAt }>;   // PRD-09 (running and scheduled)
};
```

`version` = hash of the max `updatedAt` of the rows it reads plus the max applied `ProductPriceChange.appliedAt`; computing it
first runs `applyDuePriceChanges(companyId)`. `pos/catalog` keeps shipping the till's product grid; its `unitPrice` becomes the
default-list price at that site and `compareAtPrice` is replaced by `wasPrice`.

Hours parser (`lib/retail/price-lists/hours.ts`, unit-tested): accepts "Fridays, 17:00 to 19:00", "Friday 17:00 to 19:00",
"Fridays and Saturdays, 17:00 to 19:00", "Monday to Friday, 08:00 to 12:00", "Every day, 17:00 to 19:00"; rejects anything else
with "Write it as Fridays, 17:00 to 19:00."; times 24-hour, from before to. Dates: "1 December to 26 December" (year: this year,
or next when already past), "1 December 2026 to 26 December 2026".

### 4.5 Prices and price changes (PRD-07)

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| PATCH | `/price-lists/[id]/prices` | `retail.prices:update` (+ `approve` below cost) | `{ changes: { productId: string; price: string }[] }` (≤ 500) | `{ saved: number, batchId }`; 400 `{ error: "3 prices were not saved.", fieldErrors: { [productId]: sentence } }` |
| POST | `/price-lists/[id]/products` | `retail.prices:update` | `{ productIds: string[]; pricedAt: "BASE" \| "BASE_LESS" \| "EACH"; less?: string; fromQuantity?: number }` | `{ added: number, skipped: number }` (already on the list: skipped) |
| POST | `/price-lists/[id]/products/remove` | `retail.prices:update` | `{ productIds }` | `{ removed: number }`; 409 on the default list "Products cannot leave Retail. Archive the product instead." |
| POST | `/price-changes/preview` | `retail.prices:update` | `{ listId, productIds, how: "RAISE" \| "MARGIN" \| "ONE_PRICE", by: string, round: "NO" \| "UP_5" \| "UP_10" }` | `{ lines: { productId, name, now, margin, next, nextMargin, belowCost, note }[] }` |
| POST | `/price-changes` | `retail.prices:update` (+ `approve` below cost) | `{ listId, lines: { productId, price, labels: number }[], when: "NOW" \| "TONIGHT" \| "DATE", date?: "YYYY-MM-DD", printLabels: boolean }` | `{ batchId, effectiveAt, applied: boolean, labelsJobId: string \| null }` |
| POST | `/price-changes/[batchId]/cancel` | `retail.prices:update` | — | `{ cancelled: number }` (only rows not yet applied; **Defined here**, reached from the toast's "Undo" while the batch is scheduled) |

Service `lib/retail/prices/change.ts`:
`changePrices(tx, { companyId, actor, listId, rows: { productId, price, minQuantity? }[], source, batchId?, effectiveAt? })`
→ validates (list live, product live, price ≥ 0, below-cost rule against `Product.costPrice`), writes rows and history,
followers, `standardPrice` on the default list, audit. `applyDuePriceChanges(companyId)` as W-15. `repriceCostFollowers(tx,
companyId, productId)` for cost changes (buying calls it when a delivery changes a cost).

### 4.6 Packs (PRD-08)

`POST /packs` (`retail.catalog:create`) `{ singleId, size: number, name?: string, price: string, barcode?: string,
breakAtTill: boolean, crateDeposit?: string }` → 201 `{ data: ProductView }`. Errors: 400 fields `single`, `size` ("A case holds
2 to 1,000."), `price`; 409 "Castle Lager 340ml already has a case of 24."

### 4.7 Bundles (PRD-08)

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| POST | `/bundles` | `retail.promotions:create` | `BundleInput` | 201 `{ data: BundleView }` |
| GET | `/bundles/[id]` | `retail.promotions:view` | — | `{ data: BundleView }` |
| PATCH | `/bundles/[id]` | `retail.promotions:update` | `Partial<BundleInput>` (+ rail fields `categoryId`, `siteId`, `tillButton`) | `{ data, changed }` |
| POST | `/bundles/pause` / `/bundles/resume` / `/bundles/duplicate` | `retail.promotions:update` / `:create` | `{ ids }` (packs in `ids` are products: pause = archive the case, resume = sell it again) | `{ changed }` / `{ created }` |
| POST | `/bundles/[id]/stop` | `retail.promotions:update` | — | `{ stoppedAt }` |
| GET | `/bundles/[id]/chart?range=3m\|12m\|all` | `retail.promotions:view` | — | `{ weeks: { start, sold }[] }` |
| GET | `/bundles/[id]/pdf` | `retail.promotions:view` | — | PDF |

```ts
type BundleInput = { kind: "FIXED_SET" | "BUY_MORE"; name: string;
  items: { productId: string; quantity: number }[];   // BUY_MORE: quantity ignored
  buyQuantity?: number;                               // BUY_MORE "Any" (2–24)
  price: string; days: "EVERY_DAY" | "WEEKENDS" | "CHOOSE"; daysOfWeek?: number[];
  until: string | null;                               // "No end date" → null, else "31 December 2026"
  barcode?: string | null };
type BundleView = { id; code; kind; name; barcode; category; price; buyQuantity; days; daysOfWeek; endsOn; site; tillButton;
  state: "ON_SALE" | "PAUSED" | "STOPPED"; items: { productId; name; category; quantity; each; onHand; makes; limiting: boolean }[];
  boughtApart: number; saves: number; savesPercent: number; canMake: number | null; limitingItem: string | null;
  sold30: number; soldPrev30: number; takings30: number; margin: number | null; marginPerBundle: number | null;
  madeBy: string | null; madeAt: string; tabCounts: { items; sales; activity } };
```

### 4.8 Promotions (PRD-09)

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| POST | `/promotions` | `retail.promotions:create` | `PromotionInput` | 201 `{ data: PromotionView }` |
| GET | `/promotions/[id]` | `retail.promotions:view` | — | `{ data: PromotionView }` |
| PATCH | `/promotions/[id]` | `retail.promotions:update` | `Partial<PromotionInput>` + rail fields (`minBasket`, `days`, `siteId`) | `{ data, changed }`; 409 "It has already started. Change when it ends instead." / "It has ended. Duplicate it to run it again." |
| POST | `/promotions/pause` / `resume` / `end` / `duplicate` | `retail.promotions:update` / `:create` | `{ ids }` | `{ changed }` / `{ created }` (duplicate: "<name> (copy)", code "<CODE>-2", starts tomorrow 00:00, no end) |
| GET | `/promotions/[id]/chart?range=3m\|12m\|all` | `retail.promotions:view` | — | `{ weeks: { start, units, onPromotion: boolean }[] }` |
| GET | `/promotions/[id]/pdf` | `retail.promotions:view` | — | PDF |

```ts
type PromotionInput = { name: string; kind: "PERCENT" | "AMOUNT" | "BUY_X_PAY" | "FIXED_PRICE";
  value: string;              // "10" for %, "2.00", "5.00" (BUY_X_PAY "For"), "24.00"
  buyQuantity?: number;       // BUY_X_PAY "Buy"
  appliesTo: "EVERYTHING" | "CATEGORIES" | "PRODUCTS"; productIds?: string[]; categoryIds?: string[];
  starts: string;             // "25 October, 00:00"
  ends: string | null;        // "31 October, 23:59" | "No end date"
  audience: "EVERYONE" | "LOYALTY_MEMBERS" | "STAFF"; stacks: boolean; code: string };
type PromotionView = { id; code; name; kind; value; buyQuantity; scope; products: {id,name}[]; categories: {id,name}[];
  appliesToLabel: string;     // "Spirits, 12 products" | "Staff, all items" | "1 product" | "Basket over US$20"
  minBasket; days: string;    // "Every day, all day"
  stacks; site; startsAt; endsAt; state: "SCHEDULED" | "RUNNING" | "PAUSED" | "ENDED"; badge: { label; tone };
  figures: { soldUnder: number; soldBefore: number; extraTakings: number; givenAway: number; perDollarGiven: number | null;
             products: number; notSold: number; runningDays: number };
  createdBy: string | null; tabCounts: { products; sales; activity } };
```

Figures: "Sold under it" = units on lines with this `promotionId`; "on the month before" = units of the same products in the
same number of days immediately before `startsAt` (+21 % when 142 vs 117); "Extra takings" = takings of the in-scope products
while running − takings in the same length of time before; "US$6.76 for each US$1 given" = extra ÷ given away; "Given away" =
Σ `promotionDiscount`; "US$2.00 a bottle" = value for AMOUNT (or given away ÷ units); "Products" = products in scope (category
scope: live products in those categories), "3 have not sold yet" = those with no line under it; "Running for 31 days",
"No end date" or "Ends 4 October".

### 4.9 Engine and till (PRD-05, PRD-08, PRD-09, PRD-10)

`lib/retail/pricing/engine.ts` (pure, no Prisma; unit-tested with the board's cases: Happy hour Friday 17:30 beer at 10 % off
vs Retail; Wholesale at quantity 6; two lists → the lower; Festive US$2 off; Buy 2 for US$5 ciders; Braai pack allocation; a
non-stacking promotion vs a buy-more deal; basket minimum; a voucher after promotions). `pos/sales` changes (FLR:till builds the
till side; this area changes the server contract):

```ts
// added to the sale body
lines: { productId?: string; bundleId?: string; bundleRef?: string; quantity: number; unitPrice: number /* the till's engine result */ }[];
vouchersSold?: { value: string; customerId?: string }[];
discountVoucher?: { code: string; secret: string };
payments: { tenderType: "CASH" | "CARD" | "MOBILE_MONEY" | "TRANSFER" | "VOUCHER"; amount: number; voucherCode?: string; voucherSecret?: string }[];
// removed: promotionId
```

Server: re-price with the engine (snapshot at `ringAt`), write per line `unitPrice`, `discountAmount`, `promotionId`,
`promotionDiscount`, `bundleId`, `bundleRef`; break a case when needed (W-12); redeem vouchers (W-18); refuse a mismatch online
(409 "Prices changed while you were selling. The till has the new prices; ring it again.").

### 4.10 Vouchers (PRD-10)

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| POST | `/vouchers` | `retail.promotions:create` | `VoucherInput` | 201 `{ data: { vouchers: {id, code}[], printUrl: string \| null, sent: number } }` |
| GET | `/vouchers/[id]` | `retail.promotions:view` | — | `{ data: VoucherView }` (the secret only to Owner and Manager) |
| PATCH | `/vouchers/[id]` | `retail.promotions:update` | `{ expiresOn?: "YYYY-MM-DD" \| "28 September 2027", customerId?: string \| null, siteId?: string \| null }` | `{ data, changed }`; 409 "It was voided." |
| POST | `/vouchers/[id]/send` | `retail.promotions:update` | — | `{ sent: true }`; 400 "<name> has no WhatsApp number." / "Anyone holding it has no one to send to." |
| POST | `/vouchers/extend` | `retail.promotions:update` | `{ ids, expiresOn }` | `{ changed }` |
| POST | `/vouchers/void` | `retail.promotions:delete` | `{ ids, reason }` | `{ voided }` |
| GET | `/vouchers/print?ids=` | `retail.promotions:view` | — | PDF |
| GET | `/vouchers/[id]/chart?range=` | `retail.promotions:view` | — | `{ months: { start, spent }[] }` |
| GET | `/pos/vouchers/check?code=&secret=` | `retail.sell:create` | — | `VoucherCheck` (W-18) |

```ts
type VoucherInput = { kind: "GIFT" | "CREDIT_NOTE" | "DISCOUNT"; value: string /* "50.00", or "10%" / "5.00" for DISCOUNT */;
  howMany: number; customerId?: string | null; expires: string /* "3 October 2027" */; minSale?: string | null;
  sendBy: "PRINT" | "WHATSAPP" | "BOTH" };
type VoucherView = { id; code; secret?: string; kind; kindLabel; holder: string; customer: {id,name} | null; value: number | null;
  valueLabel: string /* "US$20.00" | "10% off" */; left: number | null; leftLabel: string /* "US$7.40" | "12 left" */;
  spent: number; uses: number; leftPercent: number | null; issuedAt; expiresOn; daysToExpiry: number; site: string;
  state: "LIVE" | "IN_USE" | "USED_UP" | "EXPIRED" | "VOID"; soldSale: { id; saleNo; paidWith; cashier } | null;
  minSale: number | null; tabCounts: { uses; activity } };
```

### 4.11 Categories (PRD-02)

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| POST | `/categories` | `retail.categories:create` | `{ name, parentId?: string \| null, vat: "STANDARD" \| "ZERO_RATED" \| "EXEMPT", targetMargin?: string, ageCheck: boolean, returnable: boolean }` | 201 `{ data: CategoryView }` |
| GET | `/categories/[id]` | `retail.categories:view` | — | `{ data: CategoryView }` (for the edit sheet) |
| PATCH | `/categories/[id]` | `retail.categories:update` | `Partial<…same>` | `{ data, changed }` |
| POST | `/categories/[id]/delete` | `retail.categories:delete` | `{ moveTo?: string }` (required when it has products or children) | `{ moved: number }`; 400 field `moveTo`: "Choose where its 61 products go." |
| POST | `/categories/vat` | `retail.categories:update` | `{ ids, vat }` | `{ changed, products }` |
| POST | `/categories/target-margin` | `retail.categories:update` | `{ ids, targetMargin }` | `{ changed }` |
| POST | `/categories/merge` | `retail.categories:delete` | `{ ids, into }` | `{ merged, moved }` |

`CategoryView = { id, name, parent, vat, vatLabel ("15% included" | "Zero-rated" | "Exempt"), targetMargin, ageCheck, returnable,
products, sub ("61 products · VAT 15% · 18+") }`. VAT STANDARD writes `vatRate 15`, ZERO_RATED `0` + `vatExempt false`,
EXEMPT `0` + `vatExempt true`; products in it get `defaultTaxRate` rewritten in the same transaction.

### 4.12 Labels and print jobs (PRD-06)

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| POST | `/labels` | `retail.catalog:update` or `retail.stock:create` | `{ productIds?: string[]; bundleIds?: string[]; size: "STRIP" \| "TAG" \| "A4"; show: { price: boolean; was: boolean; barcode: boolean }; copies: number (1–50); printer: string /* registerId or "here" */ }` | 202 `{ jobId, count }` (till printer) or 200 `{ pdfUrl, count }` (here); 409 "The front till printer is not paired. Pair it, or print here." |
| GET | `/devices/me/print-jobs` | device (SET-04 till auth) | — | `{ jobs: { id, kind, payload }[] }` (QUEUED, oldest first, ≤ 10) |
| POST | `/devices/me/print-jobs/[id]/done` | device | `{ ok: boolean, error?: string }` | `{ status }` |

`A4` on a till printer → 400 field `size`: "A4 sheets print here, not on a till printer." (**Defined here**).

---

## 5. UI per page

Loading, no-match, error and no-permission states are FND-LIST 5.4.11 with each list's noun ("products", "price lists",
"prices", "bundles and packs", "promotions", "vouchers", "categories"); records load and fail as FND-RECORD does, and a 403
renders "Your role cannot view <noun>."; sheets submit, refuse and close as FND-SHEET 5.7.3.

Every list is a FND-LIST page (`<ListFrame source="…" />`), every record a FND-RECORD kind (`<RecordFrame kind="…" id={id} />`,
configured in `lib/retail/record-kinds/products.ts`), every form a FND-SHEET kind (`lib/retail/sheet-kinds/products.ts`), every
confirm an ask in `lib/retail/asks.ts`. Only what differs per page is written here; bands, heights, cells, states and the phone
layout are the frames'. Grid tracks are copied from the boards (`List.dc.html` `cfg[kind].grid`), plus FND's 40px tick and
44px row-menu tracks. "Hidden for" lists roles that do not get a control (the server refuses them anyway).

### 5.1 Products — `/retail/products` · board `ProductsList.png` · source `retail-products` (PRD-01)

- **Header:** title "Products"; no back; primary "+ New product" (`retail.catalog:create`, sheet `product-new`).
- **Tabs:** "Selling 19" (`isActive`, not binned) · "Low stock 4" (selling and low, §3.2) · "Archived 2" (`isActive = false`,
  not binned) · "All 21" (not binned). Counts ignore search and filters.
- **Toolbar:** search "Name, code or barcode" (name, code, barcode); chips "Category Any ⌄" and "Stock Any ⌄" (primary);
  Filters (Site when there are two sites); count; Sort "Name A–Z" (sorts: Name A–Z, Most sold (sold 30 days desc), Least cover
  first, Price, highest first); Group (None, Category); Columns; Export.
- **Columns** (grid `minmax(190px,1.4fr) 130px 120px 110px 130px 100px 80px 60px`, min width 1120px):

| Column | Key | Cell | Align | Notes |
|---|---|---|---|---|
| Product | `name` | link → `/retail/products/{id}` | start | sortable |
| Code | `code` | mono | start | |
| Category | `category` | muted | start | the category path |
| On hand | `onHand` | num | end | "13 bottles" (number and unit word) |
| Cover | `cover` | bar | start | "6 days"; fill per §3.2; "—" with no sales |
| Price | `price` | money | end | default list |
| Sold, 30 days | `sold30` | num | end | sortable; total |
| VAT | `vat` | num | end | "15%", "0%", "Exempt" |

- **Totals:** Σ count ("9"); Sold, 30 days total ("1,089"). Others empty.
- **Row link:** the record. **Row menu (Defined here):** "Edit" (`product-edit`), "Print label" (`labels`), "Adjust stock"
  (`stock-adjust`, stock spec), "Stop selling it" / on the Archived tab "Sell it again".
- **Bulk (in order):** "Change prices" (`bulk-price` over Products, list = default; `retail.prices:update`), "Print shelf labels"
  (`labels`), "Add to an order" (`order-new` with the ids, buying spec; `retail.purchasing:create`), "Add to a price list"
  (`price-list-add` with `ids`; `retail.prices:update`), "Archive" (ask `archivemany`; on the Archived tab "Sell them again";
  `retail.catalog:update`), then `{ key: "export" }`.
- **Export menu extras (Defined here, Owner and Manager):** under a separator, "Import a spreadsheet" (→
  `/retail/products/import`, SET-11) and "Add from the catalogue" (→ `/retail/setup/products?return=/retail/products`, SET-12;
  liquor store only). FND-LIST's `ListSpec` gains `exportExtras: { label, href, requires }[]`.
- **Empty guide (Defined here):** title "What do you sell?"; line "Add a product with a name, a category and a price. It is on
  every till the moment you save."; primary "Add your first product" (sheet `product-new`); secondary "Start from the catalogue"
  (liquor store) or "Import a spreadsheet" (general retail).
- **Phone card:** title name, badge "Low" (warn) / "Out" (bad) / "Archived" (neutral), figure price, meta
  "AMARULA-750 · 13 bottles · 6 days".
- **Roles:** Cashier and Stock clerk see the list, no primary, no bulk except "Print shelf labels" (Stock clerk); Bookkeeper sees
  the list, no primary, no bulk.

### 5.2 New product — `?sheet=product-new` · boards `ProductNew.png`, `ProductNewStock.png` (PRD-03)

Kind `product-new` (`K.product`). Width 520. Requires `retail.catalog:create`. Opened over `/retail/products` and over
`/retail/stock` (On hand's primary "Add a product"); also reached as the inline add of the `product` noun (quick fields only).

- **Header:** title "New product"; sub "Adds it to Products, On hand and the Retail price list" (the default list's name).
- **Section 1** (no title):

| Field | Type | Options / default | Validation | Hint |
|---|---|---|---|---|
| Name | text, full; placeholder "What the till and receipts say" | — | required, 1–200, unique among live products | — |
| Category | auto, noun `category`, placeholder "Search categories"; options sub "VAT 15%, age check" / "VAT 15%"; quick add "Name", "VAT" ("15%"), "18+ check" ("Yes") | — | required | "Sets VAT and the 18+ check." |
| Price | money, half, US$ | — | required, ≥ 0.00 | "Goes into the Retail price list." |

- **Section 2**, folded: button "+ More details" with hint "Barcode, cost, supplier, opening stock, reorder":

| Field | Type | Default | Validation | Hint |
|---|---|---|---|---|
| Barcode | text, half, mono; placeholder "Scan it or type it" | — | 8–14 digits after removing spaces; unique | — |
| Cost | money, half | — | ≥ 0.00 | "Shows the margin. Updated by each delivery." |
| Supplier | auto, noun `supplier`, placeholder "Search suppliers"; sub "Beverages, 30 days"; quick "Name", "Phone or WhatsApp" ("+263 7") | — | optional | — |
| Opening stock | text, half, mono, right; placeholder "0" | — | whole number ≥ 0 (3 dp for By weight) | — |
| At | auto, half, noun `site`; options sub "Default"; quick "Name" | the default site | shown only with two or more open sites | "Asked only because you have two sites." |
| Reorder at | text, half, mono, right; placeholder "Leave empty to never ask" | — | ≥ 0 | — |
| Sold as | seg, half: "Single", "By weight" | Single | — | — |
| Returnable bottle | toggle | the category's `returnable` | shown only for a liquor store with Empties and deposits on | "Charge a US$0.10 deposit, refunded when the bottle comes back. Liquor store." (the category's deposit, else US$0.10) |

- **Footer:** note "Saved means on sale, on every till. The rest can come later."; secondary "Add, then another" (keeps
  Category, At, Sold as; clears the rest; shows the done line in the footer); primary "Add product".
- **Done toast:** "Savanna Dry 330ml is on sale at US$2.10 on every till." with "Open" → the record.
- **Invalidates:** `retail-products`, `retail-prices`, the stock area's `retail-stock`, `nav-badges`.
- **Phone:** full-width sheet; the fold stays.

### 5.3 Edit a product — `?sheet=product-edit&id=` · board `ProductEdit.png` (PRD-03)

Kind `product-edit` (`K.productedit`). Requires `retail.catalog:update`. `load` = `GET /products/[id]`.

- **Header:** title the product's name ("Amarula Cream 750ml"); sub "AMARULA-750 · Spirits · on sale" (code · category · "on
  sale" / "archived").
- **Section 1:** Name, Category, Price as in 5.2 (Price disabled without `retail.prices:update`; a below-cost price from a
  Manager is refused with the field message).
- **Section 2** titled "More details" (open, not folded): Barcode, Cost (hidden without `view-cost`), Supplier, Opening stock and
  At (only while the product has no stock movement; otherwise omitted), Reorder at, Sold as, Returnable bottle — as in 5.2.
- **Footer:** danger "Archive" (trash icon; ask `archive`; hidden on an archived product, where the danger reads "Sell it again"
  and acts without asking); note "Changes reach the tills within a minute."; secondary "Cancel"; primary "Save".
- **Done:** "Amarula Cream 750ml saved."

### 5.4 Product record — `/retail/products/[id]` · board `Product.png` (PRD-04; rail base from FND-06)

RecordKind `product`, entity type `Product`, `binnable: "product"`.

- **Header:** back "Products" → `/retail/products`; title name; reference code (mono). **Action group:** "Edit" (sheet
  `product-edit`; `retail.catalog:update`), "Adjust stock" (sheet `stock-adjust`, stock spec; `retail.stock:create`), "Print
  label" (sheet `labels&ids=<id>`), ⋯. **Primary:** "Receive stock" (→ buying spec's Receive a delivery with this product;
  `retail.purchasing:receive`).
- **⋯ menu:** "Export as PDF" (`GET /products/[id]/pdf`); "Sell it by the case too" (sheet `pack-new&single=<id>`; hidden on a
  case; `retail.catalog:create`); "Duplicate" (sheet `product-new` prefilled with Category, Price, Cost, Supplier, Sold as and the
  name "<name> (copy)" — **Defined here**); "Stop selling it (archive)" (ask `archive`; on an archived product "Sell it again");
  separator; "Move to the bin" with "Managers and owners only" (FND). A case also gets "Break a case" (sheet `break-case`, stock
  spec) after "Sell it by the case too"'s slot.
- **Banners:** archived — `role="status"`, 48px, `--tray`, `--ink-2`: "**Archived.** Not on the till or in reorder suggestions.
  Its 13 bottles in stock still count." and "Sell it again" (32px outline). Binned — FND's bin banner with the board's words:
  "**In the bin** since today, moved by you. Kept until 2 November. Off the till and out of lists; its sales and stock history
  stay." and "Restore".
- **Strip** (no steps): chips — "Reorder soon · about 6 days left" (warn, when low and not out; "Out of stock" bad when out;
  none otherwise); the category path ("Spirits" or "Spirits · Liqueur", plain); "ID check at the till" (plain, when age
  checked); "Case of 24 × Castle Lager 340ml" (plain, on a case); "Archived" (neutral, archived). Figure: "Selling at" US$18.25.
- **KPI strip** (5):

| Label | Value | Note (leading figure tone) |
|---|---|---|
| Sold, 30 days | sold30 "64" | "+12%" (ok when up, bad when down) "bottles, on the 30 before" |
| Takings | takings30 "US$1,168.00" | "+12%" "on the 30 before" |
| Margin | "28.6%" (view-cost; "—" otherwise) | "US$5.22" (ink-2) "a bottle" |
| On hand | "13" | "6" (warn when < 7) "days at this rate" |
| Sold today | "3" | "13:12" (ink-2) "last sale, front till" ("No sale yet today" when none) |

- **Chart panel:** title "When it runs out"; chip "Around 9 October, in 6 days" (warn; "Out now" bad when out; no chip when
  nothing sells); right sentence "Selling about 2.1 a day". No range control. Body: line of on hand at day end for the last 30
  days, dashed projection for the days until it runs out (max 14) at the 30-day rate, a dashed `--warn-dot` horizontal line at
  Reorder at with the label "reorder at 12", a `--ok` dot with "+24 received" on the latest receipt in the window, a "today" band
  over the projection; y labels 0, half, max; x labels every 10 days plus the run-out day; tooltip "Fri 3 Oct" / "13 on hand" /
  "3 sold · 24 received" ("Thu 9 Oct · expected" / "1 on hand, if it keeps selling" / "About 2 a day"). Footer: the advice
  sentence from `/stock-chart` ("Order 24 by Monday to cover the next two weeks; Delta delivers in 2 days." — quantity = Reorder
  or enough for 14 days, day = run-out day minus the supplier's lead time (buying spec), supplier = the product's supplier) and
  "Add to an order" (→ `order-new&productIds=<id>&quantity=<n>`). No footer when there is no supplier and no reorder quantity.
  Data: `GET /products/[id]/stock-chart`.
- **Tabs** (FND record tabs with Export and the "all" link):

| Tab | Source | Columns | Totals row | Footer link |
|---|---|---|---|---|
| Stock movements 57 | stock spec's movements source, `where product` | When (when: "3 Oct" + mono time), Movement (dot + words: Sale hollow, Received ok, Count/breakage warn, Transfer info), Reference (ref link: SALE-… → sale, PO-…/GRN-… → buying, CNT-… → count, TRF-… → transfer), By (text), Change (signed, "+24" ok), Balance (num) — grid `150px 1fr 150px 90px 80px 80px` | "Σ 30 days" · "in +24 · out −41" · Change "−17" · Balance "13" | "All movements" → `/retail/stock/movements?product=<id>` |
| Sales 64 | `retail-product-sales` | When (when), Sale (ref), Till (muted), Cashier (text), Quantity (num), Price (money), Total (money) — **Defined here** | Σ count · quantity · total | "All sales of it" → `/retail/sales?product=<id>` |
| Price history 4 | `retail-product-price-history` | When (when; scheduled rows show "From 3 Oct 22:00" and a pending badge "Scheduled"), List (muted), From (zero), To (money), By (text), How (muted: "Typed", "Changed many at once", "Followed Retail", "Imported", "Added") — **Defined here** | Σ count | "All prices on Retail" → the default list's worksheet filtered by code |
| Suppliers 2 | `retail-product-suppliers` (view-cost) | Supplier (link, buying spec), Last delivered (date), Last cost (money), Delivered, 12 months (num), Usual (badge "Usual" hollow on the product's supplier) — **Defined here** | Σ count · delivered | "All deliveries" → `/retail/buying/deliveries?product=<id>` |
| Activity | FND (shown to Owner, Manager, Bookkeeper) | FND | — | FND |

  Up to 10 rows each, newest first; counts in the tab labels from `tabCounts`.
- **Rail:** top card photo — "Add a photo" / "The till shows it on the product button" (uploads through `/products/image`,
  `retail.catalog:update`). Groups (hint "click any value to change it" on Price):

| Group | Row | Value | Editable (field, who) |
|---|---|---|---|
| Price | Price | "US$18.25" mono | money; `retail.prices:update` (below cost: Owner) |
| | Cost | "US$13.03" mono (row hidden without view-cost) | money; Owner, Manager; triggers `repriceCostFollowers` |
| | VAT | "15% included" / "Zero-rated" / "Exempt" | read (from the category) |
| | Price lists | "Retail, Wholesale US$16.90" (the default list's name, then each other list with its price) | read; each name links to its worksheet |
| Stock | Reorder at | "12 bottles" mono | text number; `retail.catalog:update`; writes `InventoryItem.minStock` at every site that stocks it (one site in practice; with two sites the row reads per site — **Defined here**: "12 at Harare Main Branch, 6 at Borrowdale" and the edit asks the site) |
| | Reorder | "24 bottles" mono | text number → `reorderQuantity` |
| | Supplier | "Afdis Distillers" | auto `supplier` |
| | Sold as | "Single; case of 12" | read (cases link to their records) |
| Details | Name | "Amarula Cream 750ml" | text |
| | Code | "AMARULA-750" mono | text; unique; upper-cased |
| | Barcode | "6001232 35259" mono | text |
| | Category | "Spirits" | auto `category` (rewrites `defaultTaxRate`) |
| | ID check | "Yes, 18 and over" / "No" | seg Yes/No (product-level; when the category checks ID the value is "Yes, from Spirits" and read-only) |
| | Deposit | "None, not returnable" / "US$0.10 a bottle" | money (0 = none); liquor store with deposits on, otherwise the row is hidden |

  Cashier and Stock clerk: every row plain text, no hint, Cost hidden.
- **Phone:** FND (rail under the main column; the action group and primary fold into ⋯ with "Receive stock" first).

### 5.5 Print shelf labels — `?sheet=labels&ids=` · board `Labels.png` (PRD-06)

Kind `labels` (`K.labels`). Requires `retail.catalog:update` or `retail.stock:create`.

- **Header:** title "Print shelf labels"; sub "4 products ticked" ("1 product" from a record; "Braai pack" from a bundle).
- **Fields:** Label — cards, 3 columns, no label: "Shelf strip" / "38 × 21 mm, on the till printer", "Price tag" / "50 × 30 mm,
  label printer", "A4 sheet" / "24 a page, any printer" (default Shelf strip); toggles "Price" (on), "Was price, when it dropped"
  (on), "Barcode" (on); "Copies of each" (text, half, mono, right, default 1, 1–50); "Printer" (auto, half, noun `printer`,
  default the first till printer at the user's site, else "Print here"; no quick add). Choosing "A4 sheet" sets Printer to "Print
  here".
- **Footer:** note "Prices changing tonight print with tomorrow’s price."; secondary "Cancel"; primary "Print 4 labels" (count ×
  copies).
- **Done:** "4 labels sent to the front till printer." (till) / "4 labels ready to print." and the PDF opens in a new tab
  (here). Label content per size: strip — name (2 lines max), price 16pt mono, was struck through, barcode 8 mm high; tag — the
  same larger; A4 — 3 × 8 grid of 70 × 37 mm cells.

### 5.6 Price lists — `/retail/products/price-lists` · board `PriceLists.png` · source `retail-price-lists` (PRD-05)

- **Header:** title "Price lists"; primary "+ New price list" (`retail.prices:create`, sheet `price-list-new`).
- **Toolbar:** search "Name"; chips "Applies to Anyone ⌄", "Site All sites ⌄"; Filters; count; Sort "In use first" (sorts: In
  use first (default first, then ON, DRAFT, PAUSED, then name), Name A–Z, Changed, newest); Group (None, State); Columns; Export.
- **Columns** (grid `minmax(170px,1.2fr) 110px minmax(180px,1.3fr) 150px 90px 90px 140px`, min width 1100px):

| Column | Cell | Align | Value |
|---|---|---|---|
| Price list | link → `/retail/products/price-lists/{id}` | start | name |
| State | state badge: "Default" hollow, "In use" hollow, "Draft" neutral, "Paused" warn | start | |
| Used when | muted | start | `usedWhen` |
| Prices | muted | start | `pricesRule` |
| Products | num | end | |
| Below cost | zero "0" or owed pill "2" | end | total |
| Changed | date | start | the latest of the list's `updatedAt` and its last applied price change |

- **Totals:** Σ "5"; Below cost "2".
- **Bulk:** "Duplicate" (`retail.prices:create`), "Pause" (on a paused selection "Switch on"), "Print price sheet" (download).
- **Row menu (Defined here):** "Edit the rules" (`price-list-rules`), "Add products" (`price-list-add`), "Pause" / "Switch on".
- **Empty:** not reachable (the default list always exists).
- **Phone card:** title name, badge state, figure products count, meta "Used when · Prices".

### 5.7 A price list's prices (worksheet) — `/retail/products/price-lists/[id]` · board `PricesList.png` · source `retail-prices` (PRD-07)

- **Header:** back "Price lists"; title the list name ("Retail"); sub `PriceListView.sub` ("Default price list · all tills · all
  sites"); sub link "Edit the rules" (sheet `price-list-rules&id=`; hidden without `retail.prices:update`); primary "+ Add
  products to this list" (sheet `price-list-add&id=`).
- **Toolbar:** search "Name, code or barcode"; chips "Category Any", "Supplier Any", "Margin Any" (Any, Under target, Under
  cost); Filters; count; Sort "Name A–Z" (also Margin, lowest first; Price, highest first; Changed, newest); Group (None,
  Category); Columns; Export.
- **Columns** (grid `minmax(190px,1.4fr) 130px 100px 120px 130px 90px 110px 60px`, min width 1060px):

| Column | Cell | Align | Notes |
|---|---|---|---|
| Product | link → product record | start | |
| Code | mono | start | |
| Cost | zero | end | `requires: "view-cost"` |
| Margin | margin pill (derived, recomputed as you type): plain ≥ target; warn < target; bad > 5 points under or below cost | end | `requires: "view-cost"`; `derive(row, value)` in the definition |
| Price | edit-money (`aria-label="New price for Amarula Cream 750ml"`) | end | read-only money for roles without `retail.prices:update` |
| Was | zero, or "—" | end | the previous price on this list |
| Changed | date; while edited a warn badge "Not saved"; a scheduled row shows "From 3 Oct 22:00" in `--info` | start | |
| VAT | num | end | |

- **Totals:** Σ count "14"; Cost total "US$124.75"; Margin "24.4% average" ((Σ price − Σ cost) ÷ Σ price of the rows with a
  cost); Price total "US$165.04".
- **Bulk:** "Raise by a percentage", "Set a margin", "Round to 5 cents" (each opens `bulk-price` with `how` set), "Remove from
  this list" (ask `removefromlist`; hidden on the default list).
- **Save bar** (FND 5.4.10): "<n> prices changed" · note "The till picks them up the moment you save. Margins update as you
  type." · "Discard" · "Save prices" → `PATCH /price-lists/[id]/prices`; changedLabel "prices changed".
- **Row menu (Defined here):** "Open the product", "Price history" (record › Price history), "Remove from this list".
- **Empty guide (Defined here):** title "Nothing is on <list> yet"; line "Add products and price them from the Retail list, less
  or more a percentage."; primary "Add products to this list".
- **Roles:** Cashier and Bookkeeper read (no inputs, no Cost/Margin for the cashier); Stock clerk has no access (403 page).
- **Phone card:** title name, figure price (tapping the figure opens a one-field price sheet — **Defined here** — since inline
  inputs do not fit), meta "CODE · margin 31.4%".

### 5.8 Change many prices — `?sheet=bulk-price&list=&ids=&how=` · board `BulkPrice.png` (PRD-07)

Kind `bulk-price` (`K.bulkprice`), wide (760). Requires `retail.prices:update`.

- **Header:** title "Change 4 prices"; sub "Retail price list · 4 ticked".
- **Section 1:** How — seg "Raise by a percentage", "Set a margin", "Set one price" (default from `how`, else Raise); By — text,
  half, mono ("5%"; for Set one price a money field "Price"); Then round — seg, half: "No", "Up to 5 cents", "Up to 10 cents"
  (default Up to 5 cents). Every change re-runs the preview (debounced 300 ms).
- **Section "What changes":** lines field (wide): head Product · Labels · New price · Value · ×; each row the product name 500
  and under it "US$1.20 now, margin 28%" (`--warn` and "· below cost" when flagged); Labels — quantity input (default 1); New
  price — mono, from the preview; Value — New price × Labels (as the board draws; open question 6); × removes; add row "Add a
  product: search, scan, or add a new one" (noun `product`, `context.listId`); totals "Σ 4 lines" · labels "4" · value
  "US$5.05".
- **Section "When":** When — seg "Now", "Tonight, after closing", "On a date" (default Tonight); with On a date a text field
  "Date" ("15 October", **Defined here**); toggle "Print new shelf labels" (on; hidden without a till printer and then labels
  go to "Print here" after saving).
- **Footer:** note "Old prices are kept in each product’s history."; secondary "Cancel"; primary "Change 4 prices".
- **Done:** "4 prices change tonight at 22:00. Labels are queued." / "4 prices changed. Labels are queued." / "4 prices change
  on 15 October. Labels are queued." (without labels, the first sentence only), with "Undo" while scheduled.

### 5.9 New price list — `?sheet=price-list-new` · board `PriceListNew.png` (PRD-05)

Kind `price-list-new` (`K.pricelist`). Requires `retail.prices:create`.

- **Header:** title "New price list"; sub "Products › Price lists".
- **Section 1:** Name (text); Start from (auto, noun `price list`, default the default list; options sub "214 products"; plus
  "Cost" / "What each product costs"; quick add Name); Prices (seg, half: "The same", "% off", "% on"; default "% off"); By
  (text, half, mono, "10%"; hidden for The same).
- **Section "Rules":** Who gets it (seg: "Everyone", "Customers on account", "Loyalty members", "Staff"); When (seg: "Always",
  "Days and hours", "Between dates"); Days and hours (text, shown for Days and hours, placeholder "Fridays, 17:00 to 19:00");
  Between (text, shown for Between dates, placeholder "1 December to 26 December", **Defined here**); Where (auto, noun `site`,
  "All sites" first, options sub "Default"; quick Name); Only these categories (tags, placeholder "Add a category, then Enter";
  suggestions from the `category` noun; hint "Empty means everything on the list.").
- **Section "Switching on":** toggle "Switch it on now" (on), hint "Tills pick it up within a minute."
- **Footer:** note "When two lists apply, the till charges the lower price."; "Cancel"; primary "Add price list".
- **Done:** "Happy hour is on: 10% off beer and ciders, Fridays 17:00 to 19:00." / draft "Happy hour saved. Switch it on when
  it is ready." Then the browser goes to the new list's worksheet.

### 5.10 A list's rules — `?sheet=price-list-rules&id=` · board `PriceListEdit.png` (PRD-05)

Kind `price-list-rules` (`K.pricelistedit`). Requires `retail.prices:update`.

- **Header:** title the list name ("Retail"); sub "Default price list · 214 products" ("<Name> price list · 96 products").
- **Section 1:** Name; toggle "Default list" hint "Every till uses it unless another rule applies."; Prices (seg, half: "Include
  VAT", "Before VAT"); Currency (seg, half: "US$", "ZiG").
- **Section "Rules":** Who gets it (seg as 5.9); Where (auto site). When and the categories are not on this sheet, as drawn
  (open question 14); the worksheet's sub sentence states them.
- **Footer:** danger "Delete this list" (ask `pricelistdelete`; disabled on the default list); note — default: "The default list
  cannot be deleted. Make another the default first."; other lists: "Tills stop using it the moment you delete it." (**Defined
  here**); "Cancel"; primary "Save". Danger hidden without `retail.prices:delete`.
- **Done:** "Retail saved."

### 5.11 Add products to a list — `?sheet=price-list-add&id=` (or `&ids=`) · board `AddToList.png` (PRD-07)

Kind `price-list-add` (`K.addtolist`). Requires `retail.prices:update`.

- **Header:** title "Add products to Wholesale"; sub "Wholesale price list · 96 products". From Products (no `id`): title "Add
  products to a price list", sub "<n> products ticked", and a first field "Price list" (auto, noun `price list`, excluding the
  default) — **Defined here**.
- **Fields:** Products (tags, placeholder "Search, scan, or tick in Products, then Enter"; suggestions from `product` with
  `context.listId`; prefilled from `ids`); Priced at (seg: "The Retail price", "Retail less a percentage", "Set each one" — the
  default list's name; default from the list's rule); Less (text, half, mono, "8%"; shown for "less a percentage"); From quantity
  (text, half, mono, default the list's `minQuantity`, hint "Wholesale prices start at 6 units.").
- **Footer:** note "Prices can be changed in the list afterwards."; "Cancel"; primary "Add 3 products".
- **Done:** "3 products added to Wholesale." ("… Set each price in the list." for Set each one, which adds them at the base
  price.)

### 5.12 Bundles and packs — `/retail/products/bundles` · board `BundlesList.png` · source `retail-bundles` (PRD-08)

- **Header:** title "Bundles and packs"; primary "+ New bundle or pack" → menu (5.13 opener, **Defined here**):
  "A pack, like a case or a six-pack", "A bundle of different products", "Buy more, pay less".
- **Tabs:** "All 7" · "Packs 3" · "Bundles 2" · "Buy more, pay less 2" (not stopped, not binned; stopped ones only under All).
- **Toolbar:** search "Name or barcode"; chips "Kind Any", "Category Any"; Filters; count; Sort "Most sold" (also Name A–Z,
  Saves the most); Group (None, Kind); Columns; Export.
- **Columns** (grid `minmax(180px,1.3fr) 130px minmax(180px,1.4fr) 100px 110px 90px 100px 90px`, min width 1180px):

| Column | Cell | Align | Value |
|---|---|---|---|
| Name | link → pack: product record; bundle: `/retail/products/bundles/{id}` | start | |
| Kind | badge hollow "Pack" / "Bundle" / "Buy more, pay less"; paused adds warn "Paused" (**Defined here**) | start | |
| Made of | muted | start | "24 × Castle Lager 340ml"; "6 × Castle 340ml, Ice 2kg, charcoal 4kg" (quantities > 1 prefixed, names shortened by dropping the pack size word); buy-more "3 from Savanna, Hunter’s, Bernini" / "2 × Amarula Cream 750ml" |
| Price | money | end | |
| On their own | zero | end | bought-apart value |
| Saves | ok pill (`--ok` on `--ok-soft`, "US$2.30") | end | |
| Can make | num; owed pill when ≤ 3 or the limiting item is low; "—" faint for buy-more | end | §3.2 |
| Sold, 30 days | num | end | packs: units; bundles: bundles; buy-more: groups; total |

- **Totals:** Σ "7"; Sold, 30 days "189".
- **Bulk:** "Pause" (on paused rows "Put on sale"), "Print shelf labels", "Duplicate".
- **Row menu (Defined here):** "Change it" (pack → `product-edit`; bundle → `bundle-edit`), "Pause", "Print shelf labels".
- **Empty guide (Defined here):** "Sell more than one at a time" / "Packs sell a case or a six-pack at its own price. Bundles put
  different products together. Buy more, pay less takes money off when they buy enough." / primary "New bundle or pack".
- **Roles:** Cashier and Bookkeeper read; no primary, no bulk.
- **Phone card:** title name, badge kind, figure price, meta "Saves US$2.30 · can make 4".

### 5.13 Sell by the case — `?sheet=pack-new` · board `PackNew.png` (PRD-08)

Kind `pack-new` (`K.pack`). Requires `retail.catalog:create`.

- **Header:** title "Sell by the case"; sub the single's name ("Castle Lager 340ml"; "Pick the single" before one is chosen —
  **Defined here**).
- **Fields:** The single (auto, noun `product` with `context.singles`, options sub "Beer · 6001108"; quick Name, Price); Singles
  in a case (text, half, mono, right, default 24 for beer/ciders, 12 otherwise); The case is called (read, half: "Castle Lager
  340ml, case of 24", becomes the product name; editable afterwards on the product); Case price (money, half; hint "24 singles at
  US$1.20 come to US$28.80. The case saves US$2.80." — warn and "That costs more than 24 singles." when it does not save);
  Case barcode (text, half, mono, optional); Break cases at the till (toggle, on; hint "When the singles run out, the cashier
  opens a case: one case comes off, 24 singles go in."); Deposit on the crate (money, half, liquor store with deposits on; hint
  "Empties and deposits are on for liquor stores.").
- **Footer:** note — the board's "Stock is counted in singles, so a case on the shelf shows as 24." contradicts the case model
  (open question 3); this spec uses "Cases and singles are counted apart. Opening a case moves 24 into singles." until the
  canvas is corrected; "Cancel"; primary "Add the case".
- **Done:** "Castle Lager 340ml, case of 24, is on sale at US$26.00."

### 5.14 New bundle — `?sheet=bundle-new` · board `BundleNew.png` (PRD-08)

Kind `bundle-new` (`K.bundle`), wide. Requires `retail.promotions:create`.

- **Header:** title "New bundle"; sub "Products › Bundles and packs".
- **Section 1:** Kind (seg "A fixed set", "Buy more, pay less"; default from the opener); Name (text).
- **Section "What is in it":** lines (l "In it", ql "How many", cl "Each"): Product (name + category under it), How many,
  Each (default-list price), Value; add row with the `product` noun; totals "Σ 3 lines" · "9" · "US$ 10.50"; hint "Bought apart:
  US$10.50." For "Buy more, pay less" (**Defined here**, the board draws only the fixed set): the How many column is hidden,
  the hint reads "Any of these count.", and Section 1 gains "Any" (text, half, mono, "3") so the deal reads "Any 3 for".
- **Section "Price":** Bundle price (money, half; hint "Saves US$1.00. Margin 18.4%." — margin only with view-cost; for buy more
  the label is "For" and the hint "3 bought apart: US$5.55. Saves US$0.55."); On sale (seg, half: "Every day", "Weekends", "Choose
  days"; Choose days shows seven 32px day chips Mon … Sun, **Defined here**); Until (text, half, "No end date" or a date); Barcode
  (text, half, mono, optional, placeholder "Optional"; fixed set only).
- **Footer:** note "The till offers the bundle when all its items are in a sale."; "Cancel"; primary "Add bundle".
- **Done:** "Braai pack is on sale at US$9.50."

### 5.15 A bundle — `?sheet=bundle-edit&id=` · board `BundleEdit.png` (PRD-08)

Kind `bundle-edit` (`K.bundleedit`), wide. Requires `retail.promotions:update`.

- **Header:** title the name ("Braai pack"); sub "Bundle · sold 42 times this month" (kind · sold this calendar month).
- **Fields:** Name; "What is in it" lines as 5.14; "Price": Bundle price, On sale.
- **Footer:** danger "Stop selling it" (ask `bundlestop`); note "Its sales history stays."; "Cancel"; primary "Save".
- **Done:** "Braai pack saved."

### 5.16 Bundle record — `/retail/products/bundles/[id]` · board `BundleRecord.png` (PRD-08)

RecordKind `bundle`, entity `RetailBundle`, `binnable: "bundle"`.

- **Header:** back "Bundles and packs"; title name; reference code "BND-0004". Actions: "Change the bundle" (`bundle-edit`),
  "Pause" ("Put on sale" when paused; no ask), "Print shelf labels" (`labels&bundleIds=`), ⋯. No primary.
- **⋯:** "Export as PDF", "Duplicate" (`bundle-new` prefilled, name "<name> (copy)"), "Stop selling it" (bad; ask
  `bundlestop`), separator, "Move to the bin".
- **Strip:** chips kind ("Bundle" / "Buy more, pay less", plain), "Can make 4" (warn when the owed rule holds; "Paused" warn;
  "Stopped" neutral); figure "Saves the customer" "US$1.60".
- **KPIs:** "Sold, 30 days" 18, "+6 on the month before"; "Takings" US$198.00, "US$11.00 each"; "Margin" 22.4%, "US$2.46 a
  bundle" (view-cost); "Can make" 4, "Ice 2kg runs out first" (warn; buy-more: "—", "any 3 from the set"); "Saves" US$1.60,
  "12.7% on buying them alone".
- **Chart:** "Bundles sold per week" · unit "all sites"; range seg "3 months", "12 months" (default), "All time"; bars per week;
  `GET /bundles/[id]/chart`.
- **Tabs:** "What is in it 3" (`retail-bundle-items`: Product, Quantity (num), On their own (money), On hand (num, owed when
  limiting), Makes (num, owed when limiting); grid `minmax(0,1fr) 100px 120px 100px 100px`; totals "Σ 3 products" · 8 ·
  US$12.60 · · 4); "Sales 18" (`retail-bundle-sales`: When, Sale (ref), Till, Price, Saved — **Defined here**); "Changes 2"
  (FND Activity, labelled "Changes" as the board). Footer link "Every sale of it" → `/retail/sales?bundle=<id>`.
- **Rail:** "Bundle" (Name text; Barcode text mono; Category auto; Price money), "Selling" (Sites auto site "All sites"; Till
  button seg "Yes" / "No", value "Yes, under Beer"; Points read "Earned on US$11.00"), "Who" (Made by read; Made read, mono
  date). Editable for `retail.promotions:update`.

### 5.17 Promotions — `/retail/products/promotions` · board `PromotionsList.png` · source `retail-promotions` (PRD-09)

- **Header:** title "Promotions"; primary "+ New promotion" (`retail.promotions:create`).
- **Tabs:** "Running 3" · "Scheduled 1" · "Ended 5" · "All 9".
- **Toolbar:** search "Name or code"; chips "Type Any", "Applies to Anything"; Filters; count; Sort "Starts, newest" (also Ends
  soonest, Given away, most); Group (None, State, Type); Columns; Export.
- **Columns** (grid `130px minmax(170px,1.3fr) 110px 100px 120px 130px 110px 80px 80px 110px`, min width 1200px):

| Column | Cell | Align | Value |
|---|---|---|---|
| Promotion | ref link (mono) → record | start | code |
| Name | text | start | |
| State | badge: Running ok, Ends tomorrow / Ends today warn, Scheduled info, Paused warn, Ended neutral | start | |
| Type | muted | start | "Percent off", "Amount off", "Buy X, pay less", "Fixed price" |
| Applies to | muted | start | `appliesToLabel` |
| Starts | date | start | |
| Ends | date, or muted "No end" | start | |
| Value | money | end | "US$2.00", "10%", "2 for US$5.00" |
| Sold | num, "—" faint when scheduled | end | total |
| Given away | money, "—" faint when scheduled | end | total |

- **Totals:** Σ "6"; Sold "547"; Given away "US$909.15".
- **Bulk:** "Pause" ("Resume" on paused), "End now" (ask `promoendmany`), "Duplicate".
- **Row menu (Defined here):** "Edit rules", "Pause"/"Resume", "End now".
- **Empty guide (Defined here):** "No promotions yet" / "Take money off a category, a product or a basket between two dates. It
  runs on its own, and its page says whether it paid." / primary "New promotion".
- **Roles:** Cashier and Bookkeeper read.
- **Phone card:** title name, badge state, figure given away, meta "PROMO-FESTIVE · Spirits, 12 · from 2 Sep".

### 5.18 New promotion — `?sheet=promotion-new` · board `PromotionNew.png` (PRD-09)

Kind `promotion-new` (`K.promotion`). Requires `retail.promotions:create`.

- **Header:** title "New promotion"; sub "Products › Promotions".
- **Section 1:** Name (text); Kind (seg "% off", "Amount off", "Buy X, pay less", "Bundle price"); value fields by kind — % off:
  "Off" (text, half, mono, "10%"); Amount off: "Off each" (money, half); Buy X, pay less: "Buy" (text, half, mono, right, "2") and
  "For" (money, half, "5.00"); Bundle price: "Each at" (money, half) — labels other than Buy/For are **Defined here**.
- **Section "What it applies to":** Applies to (seg "Everything", "Some categories", "Some products"); Products (tags, "Search
  products, then Enter") or Categories (tags, "Add a category, then Enter").
- **Section "When and who":** Starts (text, half, "25 October, 00:00"; default tomorrow 00:00); Ends (text, half, "31 October,
  23:59" or "No end date"); Who (seg "Everyone", "Loyalty members", "Staff"); toggle "Works with other promotions" (off); Code
  (text, half, mono, from the name; hint "Shows on receipts and in Insights.").
- **Footer:** note "It runs on its own between the dates. Judge it on its record."; "Cancel"; primary "Schedule it" ("Start it"
  when Starts is now or past — **Defined here**).
- **Done:** "Month-end two for US$5 ciders starts 25 October." with "Open".

### 5.19 Promotion record — `/retail/products/promotions/[id]` · board `PromotionRecord.png` (PRD-09)

RecordKind `promotion`, entity `RetailPromotion`, `binnable: "promotion"`.

- **Header:** back "Promotions"; title name; reference code. Actions: "Edit rules" (`promotion-edit`), "Pause" ("Resume"),
  "Duplicate" (`promotion-new` prefilled), ⋯. No primary.
- **⋯:** "Export as PDF", "Print shelf labels" (`labels` with its products, Was price on), "End now" (bad, ask `promoend`;
  hidden once ended), separator, "Move to the bin".
- **Strip:** steps Draft · Scheduled · Running · Ended (current per state; Paused shows Running current with a warn chip
  "Paused"); figure "Given away" "US$284.00".
- **KPIs:** "Sold under it" 142, "+21%" (ok/bad) "on the month before"; "Extra takings" US$1,920.00, "US$6.76" "for each US$1
  given"; "Given away" US$284.00, "US$2.00" "a bottle"; "Products" 12, "3" (warn) "have not sold yet"; "Running for" "31 days",
  "No" "end date" ("Ends 4 October"; scheduled: "Starts in" "58 days").
- **Chart:** "Bottles sold per week" · "on promotion"; range seg 3 months / 12 months / All time; bars for the in-scope products
  per week, weeks before the start in `--data-muted`, weeks while running in `--data`; `GET /promotions/[id]/chart`.
- **Tabs:** "Products 12" (`retail-promotion-products`: Product, Normal (money, default list), On promotion (money), Sold (num),
  Given away (money), Margin now (pill as 5.7, view-cost); grid `minmax(0,1fr) 100px 120px 80px 110px 110px`; totals "Σ 12
  products" · · · 142 · US$284.00 · "15.2% average"; footer "All 12 products" → Products list filtered to the scope); "Sales 142"
  (`retail-promotion-sales`: When, Sale, Till, Product, Quantity, Given away — **Defined here**); "Changes 3" (Activity).
- **Rail:** "Rules" (Type read; Value money/percent editable while not ended; Applies to read — change it through "Edit rules";
  Basket money or "Any size" editable; Days editable seg-and-chips ("Every day, all day"); Stacks seg "Not with other promotions"
  / "With other promotions"), "When" (Starts mono, editable while scheduled; Ends editable unless ended; Sites auto site), "Who"
  (Customers seg Everyone / Loyalty members / Staff; Points read "Earned on the promotion price"; Created by read).

### 5.20 Edit a promotion — `?sheet=promotion-edit&id=` · board `PromotionEdit.png` (PRD-09)

Kind `promotion-edit` (`K.promotionedit`). Requires `retail.promotions:update`.

- **Header:** title name; sub "PROMO-FESTIVE · running · 142 sold".
- **Section 1:** Name; Kind (seg, read-only once running — **Defined here**: a running promotion keeps its kind); value field
  by kind ("Off each bottle" for Amount off, money, half — the unit word from the products' unit).
- **"What it applies to":** Applies to seg; Categories / Products tags.
- **"When":** Started (text, half, read-only once running; "Starts" before) ; Ends (text, half).
- **Footer:** danger "End now" (ask `promoend`); note "Changes apply to sales from now on."; "Cancel"; primary "Save".
- **Done:** "Promotion saved."

### 5.21 Vouchers — `/retail/products/vouchers` · board `VouchersList.png` · source `retail-vouchers` (PRD-10)

- **Header:** title "Vouchers"; primary "+ Issue vouchers" (`retail.promotions:create`).
- **Tabs:** "Live 14" · "Used up 31" · "Expired 6" · "All 51".
- **Toolbar:** search "Code or customer"; chips "Kind Any", "Expires Any time"; Filters; count; Sort "Expiring soonest" (also
  Issued, newest; Most left); Group (None, Kind); Columns; Export.
- **Columns** (grid `140px 140px minmax(160px,1.2fr) 100px 100px 140px 140px`, min width 1060px):

| Column | Cell | Align | Value |
|---|---|---|---|
| Code | ref link (mono) → record | start | |
| Kind | badge hollow "Gift voucher" / "Credit note" / "Discount voucher" | start | |
| Holder | text | start | customer name, "Anyone holding it"; discount: "<holder>, 20 printed" |
| Value | money | end | "US$50.00", "10% off" |
| Left | money | end | "US$7.40", "12 left" |
| Issued | date | start | |
| Expires | date; owed pill (warn) within 31 days | start | |

- **Totals:** Σ "5"; Left "US$74.20 + 12" (money left, then " + " and discount uses left when any).
- **Bulk:** "Extend" (opens a one-field sheet "Expires" — **Defined here**, kind `voucher-extend`), "Void" (ask `voidvoucher`
  with reason; `retail.promotions:delete`), "Print" (download).
- **Row menu (Defined here):** "Extend", "Send to the holder", "Void it".
- **Empty guide (Defined here):** "No vouchers yet" / "Gift vouchers, credit notes and discount vouchers, each with what is left
  on it and where it was spent." / primary "Issue vouchers".
- **Roles:** Cashier reads (to answer a customer); Bookkeeper reads.
- **Phone card:** title code, badge kind, figure left, meta "Holder · expires 28 Sep 2027".

### 5.22 Issue vouchers — `?sheet=voucher-new` · board `VoucherNew.png` (PRD-10)

Kind `voucher-new` (`K.voucher`). Requires `retail.promotions:create`.

- **Header:** title "Issue vouchers"; sub "Products › Vouchers".
- **Fields:** Kind (seg "Gift voucher", "Credit note", "Promotion"); Value (money, half; for Promotion a text field "Value" with
  placeholder "10% or 5.00", **Defined here**); How many (text, half, mono, right, 1); For (auto, noun `customer` (CUS), optional,
  sub the phone; quick "Name", "Phone or WhatsApp" ("+263 7"); hint "Leave empty for a voucher anyone can use."); Expires (text,
  half, default a year from today, "3 October 2027"); Smallest sale it works on (money, half, optional); Send by (seg "Print",
  "WhatsApp", "Both"; WhatsApp disabled with no customer — **Defined here**).
- **Footer:** note "Paid gift vouchers are held as money owed until they are spent."; "Cancel"; primary "Issue".
- **Done:** "GV-0022 for US$50.00 sent to Tapiwa Marange on WhatsApp." / "GV-0022 for US$50.00 is ready to print." / "5 gift
  vouchers for US$20.00 are ready to print." / "DV-0008, 10% off, 20 printed." (**Defined here** for the variants).

### 5.23 A voucher — `?sheet=voucher-edit&id=` · board `VoucherEdit.png` (PRD-10)

Kind `voucher-edit` (`K.voucheredit`). Requires `retail.promotions:update`.

- **Header:** title the code ("GV-0021"); sub "Gift voucher · Tapiwa Marange · US$50.00 left".
- **Fields:** Left on it (read, half, mono, right: "US$50.00 of US$50.00"); Expires (text, half); For (auto, customer); Used
  (read: "Not yet" / "2 times, last on 3 September 2026").
- **Footer:** danger "Void it" (ask `voidvoucher`; `retail.promotions:delete`); note "Voiding needs a reason and shows in
  Activity."; secondary "Resend" (sends again by its Send by; disabled without a customer); primary "Save".
- **Done:** "GV-0021 saved." Resend: "GV-0021 sent to Tapiwa Marange on WhatsApp."

### 5.24 Voucher record — `/retail/products/vouchers/[id]` · board `VoucherRecord.png` (PRD-10)

RecordKind `voucher`, entity `RetailVoucher`; **not binnable** (a voucher with money on it is voided, not binned; the record has
no "Move to the bin" — open question 7).

- **Header:** back "Vouchers"; title the kind ("Gift voucher"); reference the code. Actions: "Extend" (`voucher-edit`), "Print"
  (download), "Send to the holder" (POST send; hidden without a customer), ⋯.
- **⋯:** "Export as PDF", "Void it" (bad, ask `voidvoucher`).
- **Strip:** steps Issued · In use · Used up (Expired and Void replace Used up as the last step, current, with a neutral / bad
  chip); chip the holder ("Anyone holding it"); figure "Left" "US$7.40".
- **KPIs:** "Value" US$20.00 "when issued"; "Spent" US$12.60 "2" "times"; "Left" US$7.40 "37%" "of the value"; "Expires" "14 Aug
  2027" "313" "days"; "Sold for" US$20.00 "Cash" "SALE-29410" (GIVEN: "Given" "by Tendai Mhlanga"; REFUND: "Refund of" "SALE-…").
- **Chart:** "Spent from it, by month" · "all sites"; range seg; bars per month; `GET /vouchers/[id]/chart`.
- **Tabs:** "Uses 2" (`retail-voucher-uses`: Sale (ref link), When (date), Till (text), Spent (money), Left after (money); grid
  `minmax(0,1fr) 170px 120px 100px 110px`; totals "Σ 2 uses" · · · US$12.60 · US$7.40); "Changes 1". Footer "Every use" →
  `/retail/sales?voucher=<id>`.
- **Rail:** "Voucher" (Code read mono; Kind read; Holder auto customer, editable; Value read), "Valid" (Issued read; Expires
  editable date; Sites auto site, editable), "Sold" (Sale read link; Paid with read; By read). The secret is shown to Owner and
  Manager as a fourth "Voucher" row "Secret" (read, mono) — **Defined here**.

### 5.25 Categories — `/retail/products/categories` · board `CategoriesList.png` · source `retail-categories` (PRD-02)

- **Header:** title "Categories"; primary "+ New category" (`retail.categories:create`).
- **Toolbar:** search "Name"; chip "Shop type Liquor store ⌄"; Filters; count; Sort "Most sold" (also Name A–Z, Margin now,
  lowest first); Group (None, Inside); Columns; Export.
- **Columns** (grid `minmax(170px,1.3fr) 90px 110px 110px 120px 120px 130px`, min width 1000px):

| Column | Cell | Align | Value |
|---|---|---|---|
| Category | link → `?sheet=category-edit&id=` | start | name; a child reads "Spirits · Liqueur" |
| Products | num | end | live products in it; total |
| VAT | muted | start | "15% included", "Zero-rated", "Exempt" |
| Age check | badge: "Yes" gold, "No" hollow | start | |
| Target margin | num | end | "25%" or "—" |
| Margin now | num, owed pill under target | end | 30-day sales margin; total = overall |
| Sold, 30 days | money | end | total |

- **Totals:** Σ "7"; Products "34"; Margin now "24.6%"; Sold "US$28,604.25".
- **Bulk:** "Change VAT" (one-field sheet `category-vat`: VAT seg — **Defined here**), "Set target margin" (one-field sheet
  `category-margin`: Target margin — **Defined here**), "Merge" (one-field sheet `category-merge`: "Into" auto category, then
  ask `categorymerge`; Owner only).
- **Row menu (Defined here):** "Change it", "Delete category" (Owner).
- **Empty guide (Defined here):** "No categories yet" / "Categories set VAT, the 18+ check and the margin you aim for. A liquor
  store starts with seven." / primary "New category".
- **Roles:** Manager no Delete/Merge; Bookkeeper reads (row link opens the sheet read-only, no footer buttons but "Close");
  Cashier and Stock clerk 403.

### 5.26 New category — `?sheet=category-new` · board `CategoryNew.png` (PRD-02)

Kind `category-new` (`K.category`). Requires `retail.categories:create`. Also the `category` noun's full add.

- **Header:** "New category"; sub "Products › Categories".
- **Fields:** Name (text); Inside (auto, noun `category` top-level only, optional, placeholder "Nothing, top level"); VAT (seg,
  half: "15%", "Zero-rated", "Exempt"); Target margin (text, half, mono, "30%"; hint "Prices below it are flagged."); toggle
  "Check ID, 18 and over" (off; hint "Liquor store: on for beer, spirits, wine and ciders."; hint hidden for general retail);
  toggle "Bottles are returnable" (off; hint "New products in it get a deposit."; liquor store with deposits on only).
- **Footer:** note "Categories are yours. A liquor store starts with seven."; "Cancel"; primary "Add category".
- **Done:** "Mixers added. It is in every category field now."

### 5.27 A category — `?sheet=category-edit&id=` · board `CategoryEdit.png` (PRD-02)

Kind `category-edit` (`K.categoryedit`). Requires `retail.categories:update` (Bookkeeper: read-only).

- **Header:** title name ("Spirits"); sub "61 products · VAT 15% · 18+".
- **Section 1:** Name; VAT (seg, half); Target margin (text, half); "Check ID, 18 and over"; "Bottles are returnable".
- **Section "Deleting":** "If deleted, move its products to" (auto, noun `category`, excluding itself; default the
  alphabetically nearest other category; shown only when it has products; Owner only).
- **Footer:** danger "Delete category" (Owner; ask `categorydelete`); note "Changes apply to all 61 products."; "Cancel"; primary
  "Save".
- **Done:** "Spirits saved." Delete: "Spirits deleted. Its 61 products are in Spirits and liqueurs now." (**Defined here**).

### 5.28 Confirm dialogs added to `lib/retail/asks.ts` (all **Defined here** except `bin`, which is FND's)

| Key | Title | Body | Keep | Go | Fill |
|---|---|---|---|---|---|
| `archive` | "Stop selling Amarula Cream 750ml?" | "It leaves every till and reorder suggestion now. Its 13 bottles in stock stay and still count. You can sell it again from its page." | "Keep selling it" | "Stop selling it" | action |
| `archivemany` | "Stop selling 4 products?" | "They leave every till and reorder suggestion now. Their stock stays and still counts. You can sell them again from the Archived tab." | "Keep selling them" | "Stop selling them" | action |
| `removefromlist` | "Remove 2 products from Wholesale?" | "Tills charge them at the Retail price wherever Wholesale applied. Their price history stays." | "Keep them" | "Remove from Wholesale" | bad |
| `pricelistdelete` | "Delete Happy hour?" | "Tills stop using it now and charge the Retail price instead. Sales keep the prices they were rung at. It stays in the bin for 30 days." | "Keep it" | "Delete this list" | bad |
| `bundlestop` | "Stop selling Braai pack?" | "It leaves every till and is no longer offered when its items are in a sale. Its sales history stays." | "Keep it" | "Stop selling it" | bad |
| `promoend` | "End PROMO-FESTIVE now?" | "It stops at the next sale on every till. What it sold and gave away stays on its page. An ended promotion cannot start again; duplicate it instead." | "Keep it running" | "End it now" | bad |
| `promoendmany` | "End 2 promotions now?" | same, plural | "Keep them running" | "End them now" | bad |
| `voidvoucher` | "Void GV-0019?" | "US$7.40 left on it can no longer be spent. The books write it off, and it shows in Activity with your reason." + a required textarea "Why" (2 rows) | "Keep it" | "Void it" | bad |
| `categorydelete` | "Delete Spirits?" | "Its 61 products move to Spirits and liqueurs first, with that category's VAT and age check. Spirits stays in the bin for 30 days." | "Keep it" | "Delete category" | bad |
| `categorymerge` | "Merge 2 categories into Beer?" | "Their 9 products move into Beer and take its VAT and age check. The others go to the bin for 30 days." | "Keep them apart" | "Merge" | action |
| `leaveprices` | FND's "Leave without saving?" / "3 changes on Retail are not saved." | | "Keep editing" | "Discard changes" | bad |

---

## 6. What to remove (no backward compatibility)

Paths are as they stand after FND-03's `git mv` (`app/retail/catalog/**` → `app/retail/products/**`, `merchandising/pricing` →
`products/price-lists`, `merchandising/promotions` → `products/promotions`). Nothing is redirected.

| Remove | Replaced by | Unit |
|---|---|---|
| `app/retail/products/page.tsx` as it is (`RecordListShell` + `ColumnList` register, client-side filtering, `commonVat`) | `<ListFrame source="retail-products" />` | PRD-01 |
| `GET /api/v2/retail/catalog` (the back-office range read) and its `catalogQuery` | `GET /api/v2/reports/retail-products`; the till keeps `pos/catalog` | PRD-01 |
| `app/api/v2/retail/catalog/route.ts` `POST`, `createWithOwnStockLine`, `normalizeSku` copies; `app/api/v2/retail/catalog/[id]/route.ts` (GET, PATCH, DELETE) | `POST /api/v2/retail/products`, `GET/PATCH /api/v2/retail/products/[id]`, `lib/retail/products/{create,update}.ts`; DELETE is the bin (FND) | PRD-03 |
| `app/api/v2/retail/catalog/image/route.ts`, `app/api/v2/retail/catalog/[id]/break-case/route.ts` | `/api/v2/retail/products/image`, `/api/v2/retail/products/[id]/break-case` (moved as they are; the stock spec owns break-case) | PRD-03 |
| `components/retail/product-dialogs.tsx` (`ProductDialog`, `ChangePriceDialog`, `useInvalidateProducts`), `components/retail/catalog-image-field.tsx` | sheets `product-new`, `product-edit`, the rail Price row, the photo field | PRD-03 |
| `lib/retail/product-details.ts` (`productDetailFields`, `productDetailWrites`, `productDetailsProblem`) | `lib/retail/products/input.ts` (the zod schema shared by the sheet and the endpoint) | PRD-03 |
| `upsertShelfListing`, `archiveShelfListing`, `restoreShelfListing` in `lib/retail/shelf-listing.ts` (the read side `loadShelfListings`/`loadSellableProducts` stays for the till) | `createProduct`, `changePrices`, the product bin service (keeps price rows) | PRD-03 |
| `Product.compareAtPrice` (column, wire fields, the till's struck-through price source) | `wasPrice` from `ProductPriceChange` | PRD-03 |
| `app/retail/products/[id]/page.tsx` field-list body (after FND-06's rail move) | RecordKind `product` | PRD-04 |
| `app/retail/products/categories/page.tsx`, `components/retail/category-dialog.tsx`, `components/retail/category-field.tsx` (`useRetailCategories`) | ListFrame `retail-categories`, sheets `category-new`/`category-edit`, the `category` lookup | PRD-02 |
| `GET /api/v2/retail/categories` (list) and the `archived` flag in `categoryPatch` | `retail-categories` source; `POST /categories/[id]/delete` and the bin | PRD-02 |
| `app/retail/products/price-lists/page.tsx` as moved (the read-only "Prices" register with "Change price") | ListFrame `retail-price-lists` and the worksheet page | PRD-05, PRD-07 |
| `SHELF_PRICE_LIST_NAME`, `activeRetailPriceList` (`lib/retail/shelf-pricing.ts`); `PriceList.isActive` | the default list (`isDefault`), `PriceList.state` | PRD-05 |
| The "Prices" nav label | "Price lists" (FND-03 nav) | FND-03 |
| `app/retail/products/promotions/page.tsx` as moved (list + `PromotionDialog`) | ListFrame `retail-promotions`, sheets, RecordKind `promotion` | PRD-09 |
| `RetailPromotion.status`, `RetailPromotion.notes`, enum `RetailPromotionStatus`, values `BUY_X_GET_Y`/`BUNDLE`; `RetailSale.promotionCode`; `promotionId` in the `pos/sales` body, `inPromotionWindow`, `getPosSupportedPromotionTypes`/`isPosSupportedPromotionType`; `calculateRetailPromotionDiscount` in `lib/retail/checkout.ts` | computed state, line-level `promotionId`, the pricing engine | PRD-09 |
| The till's manual promotion picker (`components/retail/portal/pos-checkout-view.tsx`, `pos-portal-state.tsx`, `pos-types.ts` promotion fields) and the `?status=ACTIVE&pos=1` read of `/promotions` | promotions applied by the engine; the till shows them on the lines (FLR:till) | PRD-09 with the floor unit |
| `lib/retail/words.ts` `promotionStatusLabel` and the old promotion type labels | the labels in §5.17 | PRD-09 |
| `BIN_KINDS` entries handled by `restoreFromBin` per kind | FND bin registry entries `product`, `category`, `promotion`, `bundle`, `price-list` | PRD-02, 03, 05, 08, 09 |
| Default `TenderAccountMapping` VOUCHER → 1018 Voucher Clearing | VOUCHER → 2250 Vouchers Owed | PRD-10 |

`lib/inventory/retail-price-parity.test.ts` is updated (not removed) to read the default list by `isDefault`.

---

## 7. Build units

In build order. Every unit: migrations as SQL folders with their witness test in the same commit, applied to the dev and test
databases; `pnpm typecheck` (one at a time on this machine); `npx eslint <changed files>` with no new errors; the named vitest
files pass; screenshots with `scratchpad/smoke/lib.js` at 1440×960 as `owner@bottlestore.test` (and the roles named), compared
side by side with the board PNG; the seed extended for the unit's boards and re-run
(`pnpm tsx scripts/seed-retail-demo.ts --slug hurudza-creative --days 160 --reset`). Other users: manager
`tafara.manager@bottlestore.test`, cashier `chipo.till@bottlestore.test`, stock clerk `tendai.stock@bottlestore.test` (password
`RetailDemo123!`); a bookkeeper `bookkeeper@bottlestore.test` (`FINANCE_OFFICER`) is added to the seed by PRD-01.

### PRD-01 · Products list, roles and the module (W-09 entry, W-10 entry, W-55) — M

- Depends on: FND-THEME, FND-SHELL, FND-LIST.
- Builds: §3.1 permission resources and grants (+ `permissions.test.ts`), nav `requires` for the six Products items;
  `retail-products` source and loader (`lib/retail/products/figures.ts` with on hand, sold, cover, low — unit-tested); the
  Products page (5.1) with tabs, filters, sorts, group, columns, totals, bulk (Archive and the archive endpoints + asks; the other
  bulk actions open sheets built by later units and are hidden until those exist), row menu, Export extras, empty guide, phone
  cards; seed: products, costs, stock, reorder levels, 30-day sales targets, archived two, bookkeeper user.
- Acceptance: `/retail/products` beside `ProductsList.png`: header "Products" with "+ New product"; tabs "Selling 19 · Low stock
  4 · Archived 2 · All 21"; toolbar "Name, code or barcode", "Category Any", "Stock Any", Filters, count, "Name A–Z", Group,
  Columns, Export; the board's nine rows with the board's Code, Category, On hand ("13 bottles" … "6 bottles"), Cover bars and
  days (Amarula "6 days" warn), Price and Sold figures; Σ row with the count and the Sold total. "Low stock" shows exactly
  Amarula, Castle Lager 340ml, Jameson, Johnnie Walker. Tick two → selection bar; "Archive" → `archivemany` → they move to
  Archived, the till's `GET /api/v2/retail/pos/catalog` no longer lists them; "Sell them again" brings them back. Export →
  Spreadsheet downloads the filtered rows. As the cashier: the list without "+ New product" and with no bulk; as the stock clerk
  only "Print shelf labels" in the bar (once PRD-06 lands); as the bookkeeper read only. `PATCH`/`POST` as the cashier → 403
  "Your role cannot change catalogue items".

### PRD-02 · Categories (W-19) — M

- Depends on: FND-LIST, FND-SHEET, FND-RECORD (bin, asks), PRD-01.
- Builds: migration `20261004132200_retail_category_tree` + witness; `retail-categories` source (Margin now, Sold 30 days,
  Shop type filter); sheets `category-new`, `category-edit`, `category-vat`, `category-margin`, `category-merge`; `POST/GET/PATCH
  /categories`, delete-with-move, bulk VAT/target margin/merge; `category` lookup changes (children, create permission); bin kind
  `category` (restore brings it back empty); VAT rewrite of products in one transaction; audit events; seed target margins.
- Acceptance: `/retail/products/categories` beside `CategoriesList.png`: chip "Shop type Liquor store"; seven rows Spirits, Beer,
  Ciders and coolers, Wine, Soft drinks, Ice and mixers, Snacks (seed names; the board's "Ciders", "Soft drinks and mixers", "Ice"
  are sample names) with Products, "15% included", Age check "Yes" gold for the four alcohol categories, Target margin, Margin now
  with a warn pill where under target, Sold, 30 days; Σ row. "+ New category" → `CategoryNew.png` sheet; add "Mixers" inside
  nothing, Zero-rated, 30% → toast "Mixers added. It is in every category field now." and it appears in the product sheet's
  Category options with sub "VAT 0%". Row "Spirits" → `CategoryEdit.png`; change Target margin to 22% → "Spirits saved."; as
  owner "Delete category" moving products to Wine → `categorydelete` → products now under Wine with Wine's VAT; Management › Bin
  lists Spirits; Restore → Spirits back with no products. Manager: no Delete; `POST /categories/[id]/delete` → 403.

### PRD-03 · New product, edit and archive (W-09, W-11; opening stock; price-change core) — L

- Depends on: FND-SHEET, FND-RECORD, PRD-01, PRD-02, SET-02 (`site` noun, default site), SET-09 (`RetailAccountRole`),
  BUY:suppliers (the `supplier` noun; without it the Supplier field shows existing suppliers read-only and no add option).
- Builds: migration `20261004132300_retail_product_fields` + witness; `lib/retail/products/{input,create,update,archive}.ts`,
  `lib/retail/stock/opening.ts` (`recordOpeningStock` + rule `RETAIL_OPENING_STOCK`, account 3100, role OPENING_BALANCES),
  `lib/retail/prices/change.ts` (`changePrices`, followers, below-cost rule, `applyDuePriceChanges`, `repriceCostFollowers` —
  unit-tested); `POST /products`, `GET /products/new-context`, `PATCH /products/[id]` (all fields), archive/unarchive; lookups
  `product`, `pack` (read); sheets `product-new` (over Products and On hand), `product-edit`; asks `archive`; product bin service
  that keeps price rows; removal rows for PRD-03; `pos/catalog` ships `wasPrice`.
- Acceptance: "+ New product" beside `ProductNew.png` (sheet over the dimmed list, the fold "More details · Barcode, cost,
  supplier, opening stock, reorder", note, "Add, then another", "Add product"). Name "Savanna Light 330ml", Category "Ciders and
  coolers", Price 2.10, More details: Cost 1.38, Supplier Delta Beverages, Opening stock 48, Reorder at 24 → toast "Savanna Light
  330ml is on sale at US$2.10 on every till." with Open; the product is on `/retail/products` (Selling +1), on the Retail
  worksheet at 2.10 margin 34.3%, on `pos/catalog`; a `StockMovement` RECEIPT 48 with source `RETAIL_OPENING_STOCK` and a posted
  journal Dr 1200 66.24 / Cr 3100 66.24; `RETAIL_PRODUCT.CREATED` in Activity. "At" is absent with one open site and present
  with Borrowdale open (`ProductNewStock.png` from `/retail/stock` shows the same sheet). Duplicate name → "There is already a
  product called Savanna Light 330ml." under Name. Record "Edit" → `ProductEdit.png` (title, sub "AMARULA-750 · Spirits · on
  sale", "More details" open, "Archive", note, Save); change the price to 12.00 as the manager → "Below cost needs the owner. It
  costs US$13.03." under Price; as the owner it saves. "Archive" → `archive` ask → record banner "Archived. Not on the till or in
  reorder suggestions. Its 13 bottles in stock still count." → "Sell it again" removes it. Witness passes; `changePrices` tests
  cover followers, below cost, scheduled application idempotence.

### PRD-04 · Product record (W-11, W-14 from the record) — L

- Depends on: FND-RECORD, PRD-03, STK:movements (the movements source and the `stock-adjust` sheet), BUY:orders and
  BUY:deliveries (the "Add to an order" sheet and the Receive page; until they exist those two links are hidden).
- Builds: RecordKind `product` (5.4): header actions and ⋯, banners, strip chips, KPIs, the stock chart (`GET
  /products/[id]/stock-chart` with projection and advice), tabs (movements, `retail-product-sales`,
  `retail-product-price-history`, `retail-product-suppliers`, Activity), the full rail with every editable row and role rules,
  photo upload, `GET /products/[id]/pdf`; activity sentences for the product events.
- Acceptance: `/retail/products/<Amarula Cream 750ml>` beside `Product.png`: "‹ Products / Amarula Cream 750ml AMARULA-750",
  "Edit | Adjust stock | Print label | ⋯", "Receive stock"; strip "Reorder soon · about 6 days left", "Spirits", "ID check at the
  till", "Selling at US$18.25"; KPIs Sold, 30 days 64, Takings, Margin 28.6% with "US$5.22 a bottle", On hand 13 "6 days at this
  rate", Sold today; the "When it runs out" chart with the reorder line at 12, the received marker and the dashed projection;
  tabs "Stock movements · Sales 64 · Price history 4 · Suppliers · Activity" with counts; the movements table with its Σ 30 days
  row and "All movements"; rail groups Price (Price, Cost, VAT "15% included", Price lists "Retail, Wholesale US$16.90"), Stock
  (Reorder at "12 bottles", Reorder "24 bottles", Supplier "Afdis Distillers", Sold as "Single"), Details (Name, Code, Barcode,
  Category, ID check "Yes, from Spirits", Deposit "None, not returnable"). Click Price → 18.50 → Enter → "Saved"; the Price
  history tab gains "Typed" 18.25 → 18.50; Wholesale stays US$16.90 (typed there, so it no longer follows Retail), while a
  Wholesale row that still follows (e.g. Gordon’s) moves with a Retail change.
  As the cashier: no pens, no Cost, no Margin KPI value ("—"), no "Edit"/"Receive stock". ⋯ "Sell it by the case too" opens
  `pack-new` prefilled (after PRD-08).

### PRD-05 · Price lists, their rules and the till's list engine (W-16) — L

- Depends on: FND-LIST, FND-SHEET, PRD-03, SET-02/SET-03 (site and till `priceListId`), CUS:customers (account price list,
  loyalty membership and staff flag on a customer; without them the engine treats those audiences as never matching), FLR:till
  (polls `/pos/pricing`).
- Builds: migration `20261004132400_retail_price_list_rules` + witness; `retail-price-lists` source with Used when / Prices
  sentences (`lib/retail/price-lists/describe.ts`, unit-tested against the board's five sentences) and Below cost; sheets
  `price-list-new`, `price-list-rules`; `POST/GET/PATCH /price-lists`, duplicate, pause/resume, price sheet PDF; bin kind
  `price-list`; hours/dates parser; `lib/retail/pricing/engine.ts` (lists part) and `GET /pos/pricing`; `pos/sales` server
  re-pricing with lists and `priceListId` on lines; `lookup/price list`; seed lists.
- Acceptance: `/retail/products/price-lists` beside `PriceLists.png`: rows Retail (Default, "Always, at every till", "Set for
  each product"), Wholesale ("Customer on a wholesale account, 6 or more", "Retail less 8%"), Happy hour ("Fridays 17:00 to
  19:00", "Retail less 10% on beer", 6), Staff ("Staff accounts", "Cost plus 5%"), Avondale branch (Draft, Below cost "2" owed
  pill); Σ 5 and 2. "+ New price list" beside `PriceListNew.png`; Name "Ciders hour", Start from Retail, % off 10, Days and hours
  "Saturdays, 16:00 to 18:00", categories Ciders and coolers, switch on → toast "Ciders hour is on: 10% off ciders and coolers,
  Saturdays 16:00 to 18:00."; the list exists with the cider products at 90%. Engine tests: a Castle Lager 340ml sale on a Friday
  at 17:30 is charged the Happy hour price; at 19:05 the Retail price; a wholesale-account customer buying 6 gets Wholesale, 5
  gets Retail. "Edit the rules" beside `PriceListEdit.png`; turning "Default list" off on Retail → "One list has to be the
  default. Make another the default first."; Delete is disabled with the board's note. Pause the default → 409 sentence.

### PRD-06 · Shelf labels (W-20) — M

- Depends on: FND-SHEET, PRD-01, PRD-03 (was price from history), SET-03 (`hasPrinter`), SET-04 (device auth for the pull).
- Builds: migration `20261004132500_retail_print_jobs` + witness; sheet `labels`; `lookup/printer`; `POST /labels`;
  `lib/retail/labels/{data,render}.ts` (label data with tomorrow's prices, HTML → PDF through `lib/documents/pdf-renderer.ts`,
  barcodes with `bwip-js` — add the dependency); device pull and ack endpoints; audit `RETAIL_LABELS.PRINTED`.
- Acceptance: Products, tick four → "Print shelf labels" beside `Labels.png` (three cards, three toggles, Copies of each 1,
  Printer "Front till printer", note, "Print 4 labels"); print → toast "4 labels sent to the front till printer."; a QUEUED
  `RetailPrintJob` for Front till with four labels; `GET /api/v2/retail/devices/me/print-jobs` from the paired till returns it and
  `done` marks it PRINTED. "A4 sheet" → Printer "Print here" → a PDF with 24 cells, each with name, price, struck was price where
  the price dropped (Amarula shows no was price because 18.25 > 17.50; Castle case shows none either; a product reduced in PRD-07's
  test shows it), and a scannable EAN-13. As the stock clerk the sheet works; as the cashier the bulk action is absent.

### PRD-07 · The price worksheet: type prices, add products, change many (W-14, W-15) — L

- Depends on: FND-LIST (edit-money and save bar), FND-SHEET, PRD-05, PRD-06 (labels queue), SET-01 (retail worker).
- Builds: `retail-prices` source with `derive` for margin and the Not saved badge; the worksheet page (5.7) with header sub and
  sub link, bulk, save bar, leave guard; `PATCH /price-lists/[id]/prices`; `price-list-add` sheet + `POST
  /price-lists/[id]/products` (+ the Products bulk variant with the "Price list" field); remove from list + ask;
  `bulk-price` sheet with live preview, `POST /price-changes/preview`, `POST /price-changes`, cancel; worker job "price changes"
  (every minute) + apply-on-read; Products bulk "Change prices"; record Price history "Scheduled" rows; seed history.
- Acceptance: `/retail/products/price-lists/<Retail>` beside `PricesList.png`: "‹ Price lists / Retail Default price list · all
  tills · all sites Edit the rules", "+ Add products to this list"; the board's rows with Cost, Margin pills (Gordon’s 24.4% warn,
  Jameson 20.6% warn, Johnnie Walker 20.0% bad), Price inputs, Was (Amarula US$17.50, Castle US$1.10 …), Changed (3 October 2026
  / 1 August 2026), VAT; Σ row "US$… · …% average · US$…". Type 18.99 on Amarula, 27.50 on Castle case, 1.60 on Ice → pills turn
  warn, Changed reads "Not saved", the save bar reads "3 prices changed …" → "Save prices" → toast, the till's next
  `/pos/pricing` carries 18.99; the record's Price history shows the change. Leaving with unsaved edits asks "Leave without
  saving?". As the manager, type 12.00 on Amarula → save refused, the row keeps its pill, toast "1 price was not saved.". Tick 4
  → "Raise by a percentage" beside `BulkPrice.png`: 5%, Up to 5 cents, lines "US$1.20 now, margin 28%" → New price US$1.25;
  "Tonight, after closing" → toast "4 prices change tonight at 22:00. Labels are queued."; rows show "From … 22:00"; after
  22:00 (or by moving `effectiveAt` back in a test) the first `/pos/pricing` call applies them exactly once. "+ Add products to
  this list" on Wholesale beside `AddToList.png` → "3 products added to Wholesale." with prices at Retail less 8% from quantity 6.

### PRD-08 · Packs and bundles (W-12, W-13) — L

- Depends on: FND-LIST, FND-SHEET, FND-RECORD, PRD-03, PRD-05 (engine and snapshot), PRD-06 (labels), STK:movements (break-case
  service moved by the stock unit), FLR:till (bundle buttons and the "make it a bundle" offer).
- Builds: migration `20261004132600_retail_bundles` + witness; `retail-bundles` source (packs ∪ bundles), the page (5.12) with
  the primary menu; sheets `pack-new`, `bundle-new`, `bundle-edit`; `POST /packs`, `/bundles` CRUD, pause/resume/duplicate/stop,
  chart, PDF; RecordKind `bundle` (5.16) with `retail-bundle-items` and `retail-bundle-sales`; bin kind `bundle`; engine: fixed
  sets (allocation) and buy-more deals; snapshot `bundles`; `pos/sales` bundle lines and break-at-till; `lookup/pack`
  quick add; seed packs, bundles and their sales.
- Acceptance: `/retail/products/bundles` beside `BundlesList.png`: tabs "All 7 · Packs 3 · Bundles 2 · Buy more, pay less 2";
  rows Castle Lager case of 24 (Pack, "24 × Castle Lager 340ml", US$26.50, US$28.80, saves US$2.30), Coke 500ml six-pack (Can
  make 30), Chibuku crate of 12 (17), Braai pack (Bundle, "6 × Castle 340ml, Ice 2kg, charcoal 4kg", US$11.00), Gin and tonic,
  Any 3 ciders ("3 from Savanna, Hunter’s, Bernini", Can make "—"), Second Amarula half price; Σ 7 and the Sold total. "Braai
  pack" → `BundleRecord.png`: "BND-0004", chips "Bundle" and "Can make 4" when Ice is at 4 (set in the test), KPIs, weekly bars,
  "What is in it" with the limiting item's owed pills and Σ row, rail. "+ New bundle or pack" → "A pack…" → `PackNew.png`;
  Single Castle Lager 340ml, 24, US$26.00 → hint "24 singles at US$1.20 come to US$28.80. The case saves US$2.80." → a second
  case of 24 is refused with "Castle Lager 340ml already has a case of 24.". Engine tests: a basket of 6 Castle 340ml + Ice +
  Charcoal rung as Braai pack totals US$11.00 with component lines summing to it and stock off each; 3 Savanna = US$5.00; a sale
  of one Castle single with 0 singles and 2 cases at the site breaks one case (cases 2 → 1, singles 0 → 23 after the sale).

### PRD-09 · Promotions (W-17) — L

- Depends on: FND-LIST, FND-SHEET, FND-RECORD, PRD-05 (engine), PRD-06 (labels), CUS:customers (loyalty and staff audience),
  FLR:till (removes the manual picker, shows line discounts).
- Builds: migration `20261004132700_retail_promotion_rules` + witness; `retail-promotions` source and page (5.17); sheets
  `promotion-new`, `promotion-edit`; `POST/GET/PATCH /promotions`, pause/resume/end/duplicate, chart, PDF; RecordKind `promotion`
  (5.19) with `retail-promotion-products` and `retail-promotion-sales`; engine promotions (four kinds, scope, basket, days,
  audience, stacking); snapshot `promotions`; `pos/sales` line attribution; nav badge provider "3 on"; Insights' "Given away in
  promotions" reads `promotionDiscount`; removal rows for PRD-09; seed nine promotions and the Festive history.
- Acceptance: `/retail/products/promotions` beside `PromotionsList.png`: tabs "Running 3 · Scheduled 1 · Ended 5 · All 9";
  PROMO-FESTIVE Running "Amount off" "Spirits, …" from 2 September 2026 "No end" US$2.00 with Sold and Given away from history;
  PROMO-CASE24 "Ends tomorrow" warn; PROMO-XMAS Scheduled with "—"; Σ row; the panel badge reads "3 on". "+ New promotion" beside
  `PromotionNew.png`; "Month-end two for US$5 ciders", Buy X pay less 2 for 5.00, Some products Savanna, Hunter’s, Bernini, 25
  October 00:00 to 31 October 23:59 → toast "Month-end two for US$5 ciders starts 25 October."; on 25 October (test clock) two
  Savanna ring at US$5.00 with `promotionId` on the lines. PROMO-FESTIVE → `PromotionRecord.png`: steps with Running current,
  "Given away US$…", five KPIs, weekly bars with pre-start weeks muted, Products tab with Margin now pills, rail Rules/When/Who.
  "End now" → `promoend` → state Ended, the till stops applying it on the next sale, the badge reads "2 on".

### PRD-10 · Vouchers (W-18) — L

- Depends on: FND-LIST, FND-SHEET, FND-RECORD, PRD-05 (engine for discount vouchers), SET-07 (WhatsApp outbox), SET-09 (role
  mapping), SET-01 (retail worker), CUS:customers (the `customer` noun), FLR:till (voucher tender, selling gift vouchers,
  credit-note refunds).
- Builds: migration `20261004132800_retail_vouchers` + witness; `lib/retail/vouchers/{issue,redeem,expire,void,print}.ts`
  (unit-tested, including the guarded decrement under concurrency); `retail-vouchers` source and page (5.21); sheets
  `voucher-new`, `voucher-edit`, `voucher-extend`; `/vouchers` endpoints; `/pos/vouchers/check`; `pos/sales` voucher tender,
  discount voucher, `vouchersSold`; posting rules and account roles; worker expiry job; RecordKind `voucher` (5.24) with
  `retail-voucher-uses`; seed vouchers through the services.
- Acceptance: `/retail/products/vouchers` beside `VouchersList.png`: tabs "Live 14 · Used up 31 · Expired 6 · All 51"; GV-0021,
  CN-0033, GV-0019 ("Anyone holding it", Left US$7.40), DV-0007 ("10% off", "12 left", Expires owed pill), CN-0031 (owed pill);
  Σ "US$74.20 + 12" for the five. "+ Issue vouchers" beside `VoucherNew.png`: Gift voucher 50.00 × 1 for Tapiwa Marange by
  WhatsApp → toast "GV-0052 for US$50.00 sent to Tapiwa Marange on WhatsApp."; a `RetailMessage` queued; journal Dr 5450 / Cr
  2250 US$50.00. GV-0019 → `VoucherRecord.png` (steps, chip, "Left US$7.40", five KPIs, monthly bars, Uses table with Σ, rail).
  At the till (API test): check GV-0019 with its secret → usable US$7.40; a US$10.00 sale paid US$7.40 by voucher and US$2.60
  cash → balance 0, state Used up, a `RetailVoucherUse`, journal Dr 2250 US$7.40; a second redemption → "Nothing is left on it.";
  five wrong secrets → locked for 15 minutes. "Void it" with a reason on CN-0033 → Dr 2250 / Cr 4200 US$12.60, state Void,
  Activity "Voided: …". The worker run on 10 October expires CN-0031 (Dr 2250 / Cr 4200 US$4.20). As the cashier: the list reads,
  no primary, no bulk.

---

## Open questions

1. **Migration slot.** The setup spec took `20261004132000` and `…132100` from this area's `…132000` slot; this spec starts at
   `…132200` and ends at `…132800`. Reconcile before build.
2. **Cross-area unit ids.** `BUY:suppliers`, `BUY:orders`, `BUY:deliveries`, `STK:movements`, `FLR:till`, `CUS:customers` are
   aliases for units in specs written in parallel. Replace them with the real ids.
3. **Cases.** The canvas says both "Stock is counted in singles, so a case on the shelf shows as 24." (PackNew note; the Bundles
   list's Can make 1/30/17 = singles ÷ size) and that cases are stocked apart (Products "22 cases", Break a case "Cases 4 → 3,
   singles 2 → 26", "Break cases at the till"). This spec keeps cases stocked apart (the code's model and W-26) and changes the
   note. Confirm, or the canvas should redraw PackNew and the Bundles list.
4. **Supplier record.** `Product.supplierId` points at `Vendor` (the AP vendor that `PurchaseBill` already uses). The buying spec
   decides the supplier model; if it is a new table, PRD-03's FK moves to it.
5. **What "low" means.** Products' Low stock tab, the product strip and Stock's "5 low" badge must share one rule; this spec uses
   "out, or at or below the reorder level, or under 7 days of cover". The stock spec may prefer "at or below the reorder level"
   only (then Amarula at 13 / 12 is not low and the record's "Reorder soon" chip needs its own rule).
6. **Bulk price "Value" column and total.** The lines field draws Value (= New price × Labels) and a Σ of it, which means
   nothing for a price change. Kept to match the board; propose dropping Value and the total.
7. **Vouchers and the bin.** The Record template puts "Move to the bin" on every record; this spec does not bin vouchers (money
   owed is voided with a reason, not binned). Confirm.
8. **Gift vouchers issued in the back office.** The Issue sheet has no payment field, so this spec treats them as given by the
   shop (a cost to Promotions and Gifts) and sells paid gift vouchers only at the till. If the owner also takes payment for
   vouchers in the back office, the sheet needs "Paid with".
9. **Voucher secrets.** Sequential codes (GV-0021) are guessable, so every voucher carries a 6-character secret printed and sent
   with it and asked at the till when the code is typed. Not drawn on the boards.
10. **"Staff" options.** "Staff" is added to the promotion Who seg (the seeded PROMO-STAFF needs it) and price lists' Staff
    audience depends on a customer being flagged staff (customers spec). Confirm both.
11. **Sample data that cannot all hold at once.** The boards' counts (Selling 15 / All 17, Retail list 14 products, Spirits "12
    products", "Hampers, 4", "Delta reps", Amarula "Sold as Single; case of 12", "Spirits · Liqueur", "Avondale branch") are
    illustrative and partly contradict each other; §3.5 seeds a consistent set that keeps every named row. A canvas pass could
    align the numbers.
12. **Category names.** The Categories board says "Ciders", "Soft drinks and mixers", "Ice"; the sheets and the seed say "Ciders
    and coolers", "Soft drinks", "Ice and mixers". This spec keeps the seed's.
13. **Printers.** The board's "Back office laser · A4" implies a printer registry; this spec offers tills with printers plus
    "Print here" (the browser). A real network printer list is not specified anywhere.
14. **Price list rules after creation.** The rules sheet edits who and where only (as drawn); when (days and hours, dates) and
    the categories can only be set when the list is made. Add them to the rules sheet?
