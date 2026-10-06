# 10 · Set up the shop — build spec

Area: **01 Set up the shop** (canvas page `setup`, 23 boards). Workflows W-01 to W-08, W-64 to W-67, W-76.
Canvas: Corelith data tables, version 32. Board images: `scratchpad/shots-v32/<Board>.png` (1440 wide).
Unit ids: SET-01 … SET-13. Migration slot: `20261004131000` onwards (`2026100413MMSS`).

The handover brief's rules apply (scratchpad `handover-brief.md`): the canvas chooses the direction; every value is real data;
every button works server-side; no backward compatibility.

Foundations this area builds on, written elsewhere and **not** re-specified here:

| Alias | What this area uses from it |
|---|---|
| FND-THEME | Tender palette, type scale, `font-mono` numerals, tones `ok / warn / bad / info / hollow / neutral / gold`. |
| FND-SHELL | Module rail (The floor, Products, Stock, Buying, Insights, Reports, gear → Management), module panel with title and back chevron, panel nav with badges, per-entry visibility by permission. |
| FND-LIST | List page: header (title, primary), toolbar (search, filter chips, Filters, count, sort/Group/Columns, Export menu `.xlsx/.csv/.pdf`), selection toolbar with bulk actions and `Export n`, columns with kinds and alignment, Σ totals row, row ⋯ button, pager `1–n of n · Rows per page 50`, empty / loading / error states, table→cards under 768px. |
| FND-SHEET | Right side sheet 520px (760 when `wide`): title, sub, close ×, sections with titles and rules, field types `text auto seg toggle money area tags cards lines read photo`, `half`, `opt` (" optional"), hints, `tone`, `auto` with inline "Add ‘…’ as a new …" quick-add; footer: note (left), danger (left, red with bin icon), secondary, primary; done toast; routed sheet URLs over a list. Full screen under 768px. |
| FND-SETTINGS | Settings page: header title + header buttons, form column (max 680px) of FND-SHEET fields in sections, right aside of `<section><h2>` blocks, bottom save bar: dirty → "● {n} change(s) not saved · Discard · Save changes"; clean → the page's "last changed" line. Aside drops under the form under 1024px; save bar sticks to the bottom. |
| FND-DASH | Overview frame the Guided checklist card sits in (the floor area owns the overview itself). |
| FND-RECORD | Not used by this area (no record pages). |

Role names used below map to `UserRole` exactly as the Roles board says: **Owner** = `SUPERADMIN`; **Manager** = `MANAGER`,
`SHOP_MANAGER`; **Cashier** = `CASHIER` (and `POS_CASHIER`); **Stock clerk** = `STOCK_CLERK`; **Bookkeeper** = `FINANCE_OFFICER`.
**Superuser** (Corelith support acting for the shop, W-68) belongs to the admin area spec and is not handled here.

Copy rule: every string in quotes below is the board's own wording. Strings marked **(inferred)** are not on any board and
are needed to make a state work; keep them as written unless the product owner changes them.

---

## 1. Boards

Canvas reading order of page `setup`. Routes are new unless stated. "Code today" was checked by reading the code and by
screenshots of the running app (owner@bottlestore.test) taken for this spec in `scratchpad/smoke/setup10/`.

| # | Board file | Canvas title | Kind | Target route / where it opens | Code today | Notes |
|---|---|---|---|---|---|---|
| 1 | `OnbType.dc.html` | 1  Shop type: sets categories, catalogue and features | flow (wizard step) | `/retail/setup/type` | **Missing.** Business type exists only as two radio buttons in Settings › General (`/preferences/organization`, `components/retail/shop-profile-fields.tsx`). | Own full-page frame (no shell): left aside with the six steps, main column, sticky footer. |
| 2 | `OnbShop.dc.html` | 2  Your shop: only the name is needed | flow | `/retail/setup/shop` | **Missing.** | Licence section only for a liquor store. |
| 3 | `OnbProducts.dc.html` | 3  Products: tick from the catalogue, set the price | flow | `/retail/setup/products` | **Missing.** `lib/retail/provision.ts` has a 6-line `STARTER_RANGE`, off by default; no 180-brand catalogue. | Needs a starter catalogue dataset per business type. |
| 4 | `OnbTills.dc.html` | 4  Pair the till, choose how people pay | flow | `/retail/setup/tills` | **Missing.** No pairing exists anywhere. | Uses SET-03 pairing and SET-05 payments. |
| 5 | `OnbStaff.dc.html` | 5  Staff and PINs, sent on WhatsApp | flow | `/retail/setup/staff` | **Missing.** PINs exist (`RetailTillPin`, `pos/pin`) but are set by the cashier with their password; no invite, no WhatsApp. | |
| 6 | `OnbDone.dc.html` | 6  A test sale, then the overview | flow | `/retail/setup/test-sale` | **Missing.** | Live checklist read from real sale, print and void events. |
| 7 | `Guided.dc.html` | After: the setup checklist and empty-list guides | dashboard card + pattern | "Finish setting up" card at the top of `/retail` (overview, floor area); empty-list guide inside FND-LIST | **Missing.** The old checklist page was removed; `/retail` today shows "Needs action" and P&L blocks (see `setup10/retail-home.png`). | The Suppliers guide on the board is an example; the buying area writes its copy into the pattern. |
| 8 | `CompanySettings.dc.html` | Company: the business type switches liquor features on | settings | `/retail/manage/company` | **Exists but differs.** Business type + liquor switches + licence live under Settings › General › Shop (`/preferences/organization`, `setup10/org.png`), names and tax numbers under Branding (`/preferences/organization/branding/*`, `setup10/branding.png`), money under accounting. Different layout (preferences modal, blue toggles, no cards, no aside, no logo, no save bar). | One page now; writes three tables (see §3). |
| 9 | `Import.dc.html` | W-08  Import: fix flagged rows in place | flow (worksheet) | `/retail/catalog/import` (follows the Products list route; if the products area renames `/retail/catalog`, this moves with it) | **Missing** for retail. CRM has an unrelated import wizard. | Template and Upload steps are not drawn; specified below as (inferred) states. |
| 10 | `SitesList.dc.html` | Sites | list | `/retail/manage/sites` | **Exists but differs.** `/preferences/organization/sites` is the shared mining-era register (two-pane, Code/Location/Measured in/Status, "Sections here"; `setup10/sites.png`). No places, tills, price list, stock value, default. | |
| 11 | `SiteNew.dc.html` | Add a site | sheet | sheet over `/retail/manage/sites`, URL `/retail/manage/sites/new` | **Exists but differs.** "New" dialog with Name/Location/Measured in only. | Plan limit note. |
| 12 | `SiteEdit.dc.html` | A site: places inside it, close it | sheet | sheet over `/retail/manage/sites`, URL `/retail/manage/sites/[id]` | **Exists but differs.** Right pane with Code/Location/Measured in/Status; "Archive" instead of close; no places. | W-66 places live here. |
| 13 | `TillsList.dc.html` | W-04  Tills and devices | list | `/retail/manage/tills` | **Exists but differs.** `/retail/setup/operations` is a two-pane "Tills" register (Code, Site, Default, Open shifts; `setup10/tills.png`). No device, last sale, on it now, state. No device model exists at all. | |
| 14 | `TillNew.dc.html` | W-04  Pair a till: a new till and its code | sheet | sheet over `/retail/manage/tills`, URL `/retail/manage/tills/new` | **Exists but differs.** "New till" dialog with Name (+ Site when >1). No device kind, code, peripherals. | Creates the till and its code in one go. |
| 15 | `TillEdit.dc.html` | A till: rename, move, replace or unpair the device | sheet | sheet over `/retail/manage/tills`, URL `/retail/manage/tills/[id]` | **Exists but differs.** Read-only facts + "Make default". | |
| 16 | `TillReplace.dc.html` | W-76  Pair another device: the old one stops | sheet | sheet over `/retail/manage/tills`, URL `/retail/manage/tills/[id]/replace` | **Missing.** | |
| 17 | `TillPairing.dc.html` | W-04  Pairing: one app, any device, one till each | explainer + device screens | Not a page. Its four panels are the model (§2 W-04/W-76) and three **device screens on the POS host**: `/pair` (panel 1), the "Who is selling?" lock (panel 3, at `/` when paired and nobody signed in), `/unpaired` (panel 4). Panel 2 is the code block inside TillNew/TillReplace. | **Missing.** POS host today requires a cashier email+password sign-in (`app/portal/pos/login`); a PIN only unlocks an already-signed-in session (`lib/retail/till-pin.ts`). | Changes the till's auth model — see §2 W-04 and open questions. |
| 18 | `PaymentsSettings.dc.html` | W-05  Payments and the ZiG rate | settings | `/retail/manage/payments` | **Missing.** Tender reference rules exist in Till rules; ZiG rates only in Accounting › Currency; no tender on/off, no merchant code, no change rounding. | |
| 19 | `TillRules.dc.html` | W-64  Till rules | settings | `/retail/manage/till-rules` | **Exists but differs.** `/retail/setup/pos-policy` (`setup10/pospolicy.png`): reference tenders, reference pattern, three reason/manager booleans, split tender. No refund PIN limit, void rule, reason lists, discount ceiling, drawer, cash drop, offline. Stored as JSON in `FiscalisationProviderConfig`. | |
| 20 | `FiscalSettings.dc.html` | W-06  Fiscal device | settings | `/retail/manage/fiscal` | **Exists but differs.** `/retail/setup/fiscal` (`setup10/fiscal.png`): Device ID, FDMS address, seller fields; register and fiscal-day console exist in accounting APIs. No serial on the page, no connection line, no close-mode / offline settings, no Test a receipt, no fiscal-days aside. | |
| 21 | `ReceiptSettings.dc.html` | W-07  Receipts, with a preview | settings | `/retail/manage/receipts` | **Missing.** Footer text is the company-wide Branding footer. | Live preview in the aside. |
| 22 | `PostingSettings.dc.html` | W-65  Posting to the books | settings | `/retail/manage/posting` | **Exists but differs.** `/retail/setup/accounting` (`setup10/accounting.png`): readiness checks + read-only tender list + "Set up the accounts". No editable mappings, no sales/stock accounts, no schedule, no last-posted. | |
| 23 | `BillingSettings.dc.html` | W-67  Plan and billing | settings | `/retail/manage/billing` | **Exists but differs.** `/preferences/organization/billing` (`setup10/billing.png`): plan, seats, 34 charge lines, invoices; "Change plan" only shows pricing. No plan cards, no shops/tills usage, no pay method, no close account. | |

Boards reachable from these that belong to **other** areas and are only linked from here: `SupplierNew` and `SuppliersList`
(buying), `StockList` and `TransferNew` (stock), `Floor` (floor overview), `ActivityList` and `PeopleList` (admin), `ProductsList`
(products), `Liquor` (admin, W-61). No other board belongs to this area.

### Management module navigation (from the List template `M.manage`)

FND-SHELL draws the panel; this area owns these routes. Order and labels exactly:

| Label | Route | Owner area | Visible to |
|---|---|---|---|
| Company | `/retail/manage/company` | this | Owner, Manager, Bookkeeper |
| Sites | `/retail/manage/sites` | this | Owner, Manager, Stock clerk, Bookkeeper |
| Tills and devices | `/retail/manage/tills` | this | Owner, Manager |
| Payments | `/retail/manage/payments` | this | Owner, Manager, Bookkeeper |
| Till rules | `/retail/manage/till-rules` | this | Owner, Manager |
| Receipts | `/retail/manage/receipts` | this | Owner, Manager |
| Fiscal device | `/retail/manage/fiscal` | this | Owner, Manager, Bookkeeper |
| Posting to the books | `/retail/manage/posting` | this | Owner, Bookkeeper |
| People | `/retail/manage/people` | admin | (admin spec) |
| Approvals | `/retail/manage/approvals` | admin | (admin spec) |
| Loyalty | `/retail/manage/loyalty` | customers/admin | (their spec) |
| Activity | `/retail/manage/activity` | admin | (admin spec) |
| Bin | `/retail/manage/bin` | admin | (admin spec) |
| Plan and billing | `/retail/manage/billing` | this | Owner, Bookkeeper |

`/retail/manage` redirects to the first entry the viewer may see. The rail gear (bottom, "Management") opens `/retail/manage`.

---

## 2. Workflows

Shared server rules for every workflow below:

- **Session and tenant:** every route starts with `requireRetailSession` (`app/api/v2/retail/_helpers.ts`) and scopes every query by
  `session.user.companyId`. Device routes (W-04 device side) are tenant-scoped by the POS host instead (see W-04).
- **Permission:** `requireRetailPermission(session, resource, action)` from `lib/retail/permissions.ts`, with the new resources in §3.4.
  Refusals are 403 with the matrix's sentence ("Your role cannot change company details").
- **Audit:** every write appends a platform audit event through `writeRetailAuditEvent(tx, …)` (`lib/retail/audit.ts`) **inside the same
  transaction**. New event types are listed per workflow and must be added to `RETAIL_AUDIT_EVENTS` and its test. The admin area's
  Activity list reads these.
- **Last changed lines:** each settings page shows "Last changed by {name}, {d MMMM}." from that page's settings row
  (`updatedAt`, `updatedBy.name`), formatted Africa/Harare. "today" / "yesterday" replace the date when they apply where the board
  does so (Payments).
- **Errors:** `errorResponse(message, status, details?)`; 400 validation (zod issues in `details`), 403 permission, 404 not in tenant,
  409 business rule refused (body `{ error, code }`).

### W-01 First-time setup, signup to first sale — Owner — starts "Signing up" — guided

Steps (board): Pick the shop type · Name the shop · Add products · Tills and payments · Staff and PINs · Make a test sale. Screens:
onb (OnbType…OnbDone), onbproducts, onbstaff, guided.

**Code today: does not work.** Self-serve signup exists only for the FLARE product (`lib/platform/products.ts`, `app/signup/[product]`);
retail tenants are provisioned by an operator script (`scripts/provision-retail.ts` → `lib/retail/provision.ts`).

1. **Signing up.** Add `TENDER` to `WorkspaceProduct` and a product definition in `lib/platform/products.ts`:
   `{ id: "TENDER", slug: "tender", name: "Tender", selfServe: true, templateCode: "TEMPLATE_RETAIL", trialDays: 14,
   homePath: "/retail/setup", signup: { headline: "From signing up to the first sale in one sitting.", lede: "Free for 14 days. No card." } }`
   (headline is the canvas's own Set-up lede; lede reuses Flare's). `/signup/tender` then runs the existing start → verify → workspace
   flow unchanged. In `createWorkspaceFromSignup` (`lib/signup/service.ts`), after `provisionTenant` for a TENDER product, call
   `provisionRetail({ companyId })` and create the `RetailOnboarding` row (`step: TYPE`). `provisionRetail` changes: default till name
   **"Front till"** (was "Till 1"), default site name "Main branch", location "Shop floor"; it writes `RetailShopProfile.defaultSiteId`
   instead of the JSON setup profile, and creates the five settings rows with defaults (§3). The welcome handoff `next` is
   `/retail/setup`, which redirects to the current step.
2. **Pick the shop type** (`/retail/setup/type`). `PUT /api/v2/retail/setup/type { businessType }`. Server: owner only
   (`retail.company:update`); upsert `RetailShopProfile.businessType`; `ensureRetailCategories(tx, companyId, businessType)` seeds the
   type's categories (existing function; liquor seeds Beer, Spirits, Wine, Ciders and coolers, Soft drinks, Snacks, Ice and mixers with
   VAT 15 and 18+ on the alcohol ones); marks step TYPE done, `step = SHOP`; audit `RETAIL_SHOP_PROFILE.CHANGED` (existing). Pharmacy and
   Restaurant and bar are not selectable ("Soon").
3. **Name the shop** (`/retail/setup/shop`). `PUT /api/v2/retail/setup/shop`. Only `shopName` is required. Server writes:
   `Company.name` and `CompanyBranding.tradingName` = shop name; `CompanyBranding.phone`, `RetailShopProfile.whatsapp`;
   `CompanyBranding.physicalAddress` and the default site's `Site.location` = "Where it is"; "You take" sets
   `RetailPaymentSettings.takeCashUsd/takeCashZig` and the price currency (`US$ only` → USD, cash ZiG off; `US$ and ZiG` → USD, both on;
   `ZiG only` → ZWG, cash US$ off) — price currency = `AccountingSettings.baseCurrency` and the default `PriceList.currency`, refused
   once any `RetailSale` exists (409 `PRICES_LOCKED`); "Registered for VAT" sets `RetailShopProfile.vatRegistered` (No → the type's
   categories get `vatRate 0`, receipts hide the VAT line, posting skips VAT); liquor licence fields go to `RetailShopProfile`
   (`licenceNumber`, `licenceExpiresOn`, weekday/sunday open/close parsed from "08:00 to 22:00"). Step SHOP done, `step = PRODUCTS`.
   Audit `RETAIL_COMPANY.CHANGED`.
4. **Add products** (`/retail/setup/products`). Three ways:
   - *From the catalogue* (default): `GET /api/v2/retail/setup/catalogue` returns the starter catalogue for the business type with
     categories, counts, suggested prices and which rows are already in Products. "Add {n} products" → `POST /api/v2/retail/setup/products
     { lines: [{ key, price }] }`. Server (`retail.catalog:create`): for each line, through the products area's product-create service
     (today `createWithOwnStockLine` in `app/api/v2/retail/catalog/route.ts` + `upsertShelfListing`): `Product` (code from the dataset key,
     category by name, barcode if known, `taxPercent` from the category), `InventoryItem` at the default site's first place with stock 0,
     `ProductPrice` on the default price list; a case row is created after its single and linked (`packOfId`, `packSize`). All in one
     transaction; existing products (same code or barcode) are skipped. No stock movement, no ledger entry (no stock, no cost). Audit
     `RETAIL_PRODUCTS.ADDED_FROM_CATALOGUE { count }`. Products are on sale at once ("Nothing blocks selling").
   - *Import a spreadsheet*: link to `/retail/catalog/import?from=setup` (W-08); on commit the import returns to `/retail/setup/tills`.
   - *One by one*: an inline lines table (Name, Category, Price) → same `POST /setup/products` with `{ manual: [{ name, categoryId|categoryName, price }] }`.
   "I will add them later" → step 4 without saving. Step PRODUCTS done either way.
5. **Tills and payments** (`/retail/setup/tills`). On load, `POST /api/v2/retail/tills/{firstTillId}/pairing-code` (W-04) issues a code for
   the provisioned "Front till" unless it is already paired; the page polls `GET /api/v2/retail/tills/{id}/pairing` every 2 s and flips
   "Till" to "Paired: {device}, “{till name}”". "How people pay" toggles and the rate save through `PUT /api/v2/retail/payments` (W-05;
   rate creates a `CurrencyRate`). "Pair it later" skips. Step TILLS done.
6. **Staff and PINs** (`/retail/setup/staff`). `POST /api/v2/retail/setup/staff { people: [{ name, phone, role: "MANAGER"|"CASHIER", pin }] }`.
   Server (Owner): validate name, Zimbabwe mobile in E.164 (`lib/signup/whatsapp-number.ts`), PIN 4 digits not weak (not all one digit,
   not 1234/4321/0000-style sequences), phone unique among the company's users; create `User` (role `MANAGER` or `CASHIER`, `phone`,
   no password, `isActive`), `RetailTillPin` (bcrypt of the PIN), and sends one WhatsApp message per person **immediately** (not queued:
   the PIN must never be stored), logged in `RetailMessage` with the PIN redacted ("••••"), with their PIN and, for managers, a link to set a password (the People area's invite link; if that service does not exist yet this
   unit builds `lib/retail/staff.ts#inviteStaff()` and the admin area reuses it). Audit `RETAIL_STAFF.INVITED { count }` (no PINs in the
   payload). "Just me for now" skips. Step STAFF done.
7. **Make a test sale** (`/retail/setup/test-sale`). Read-only page polling `GET /api/v2/retail/setup/test-sale` every 3 s: the first
   `RetailSale` (type SALE) on any till since `RetailOnboarding.startedAt` → "Done at {HH:MM}, US${total}"; its `printedAt` (set by the
   till via `POST /api/v2/retail/pos/sales/[id]/printed`) → "Printed, with your licence number" (liquor, licence shown) or
   "Printed" **(inferred for non-liquor)**; a VOID sale whose `sourceSaleId` is that sale → done. The suggested product is the
   first ticked catalogue product (Castle Lager 340ml for liquor). "Open the overview" → `POST /api/v2/retail/setup/complete`
   (sets `completedAt`, audit `RETAIL_ONBOARDING.COMPLETED`) → `/retail`. Voided sales do not count in Insights (already true: the void
   writes a reversing sale).
8. **After** (guided): the "Finish setting up" card on `/retail` (SET-13) shows until every item is ticked. Anything skipped above waits there.

Other screens affected: Products list fills; Tills list shows Front till paired; People list shows the invited staff; Overview shows the card.

### W-02 Company information and business type — Owner — Management › Company — guided

Steps: Pick the business type · See what it switches on · Keep or turn off each feature · Legal name, VAT, licence. Screen: company.

**Code today: partly works, in other places.** Business type, the four liquor switches, licence number/expiry and hours save through
`PUT /api/v2/retail/shop-profile` (owner only, audited, seeds categories). Names, VAT and tax numbers save through the Branding pages.
Logo through Branding › Assets. Money settings in accounting. None of it is one page, none matches the board.

- `GET /api/v2/retail/company` (`retail.company:view` — Owner, Manager, Bookkeeper) returns the page model (§4).
- `PUT /api/v2/retail/company` (`retail.company:update` — Owner only) in one transaction:
  - `RetailShopProfile`: businessType, ageCheck, licenceHours, weekday/sunday hours, emptiesAndDeposits, casesAndSingles, licenceNumber,
    licenceExpiresOn, `updatedById`. Switching type never touches products, prices or sales; a feature is on only when the type has it
    and its switch is on (existing `shopFeatures`). `ensureRetailCategories` adds the new type's missing categories.
  - `CompanyBranding`: tradingName (also `Company.name`), legalName, registrationNumber, vatNumber, taxNumber (BP), phone, email,
    physicalAddress, logoUrl.
  - `AccountingSettings`: vatNumber (kept equal to the branding VAT number — the fiscal signer reads this one), fiscalYearStartMonth.
  - Prices in: `AccountingSettings.baseCurrency` + default `PriceList.currency`; refused with 409 `PRICES_LOCKED` "Prices stay in US$
    because sales are recorded in it." **(inferred)** once any sale exists.
  - Audit `RETAIL_SHOP_PROFILE.CHANGED` (existing, with features before/after) and `RETAIL_COMPANY.CHANGED { fields: [...] }`.
- Logo: `POST /api/v2/retail/company/logo` (multipart, image ≤ 2 MB, png/jpg/svg) → Vercel Blob (same helper as
  `app/api/v2/retail/catalog/image/route.ts`) → returns `{ url }`; saved with the page.
- Licence reminder: the retail worker (SET-01) sends the Owner a `Notification` 60 days before `licenceExpiresOn` ("You are reminded 60
  days before."), once.
- Other screens: the till reads the profile through device context (age check, licence hours, deposits, cases) — already wired via
  `loadShopProfile`; receipts header defaults from trading name and address; Products › Categories gain the type's categories.
- Header "Activity" → `/retail/manage/activity?subject=company` (admin area list, filtered to company events).

### W-03 Add a second site — Owner — Management › Sites — guided

Steps: Name and address · Copy prices from a site · Move or start stock · Pair its tills. Screens: sites, sitenew, siteedit.

**Code today: partly** (generic site create/edit/archive in preferences, no retail fields).

1. Sites list → "Add a site" opens the SiteNew sheet. `GET /api/v2/retail/sites/new-context` gives price lists (with product counts),
   other open sites for the stock choice, plan room (`{ planName, maxSites, openSites }`) and a suggested short code.
2. "Add site" → `POST /api/v2/retail/sites` (`retail.sites:create` — Owner). Validates name (required, unique among the company's open
   sites, case-insensitive), short code (2–6 of A–Z 0–9, unique per company — `Site @@unique([companyId, code])`), phone (optional,
   E.164 Zimbabwe landline or mobile), places (≥1, names unique within the site), price list (exists in tenant), hours (free text ≤ 120).
   Plan check: open sites < plan `maxSites` else 409 `PLAN_LIMIT` "Your {plan} plan has no room for another site." **(inferred)**.
   Creates `Site` (`measurementUnit` left at default; retail never shows it), one `StockLocation` per place (code from the name:
   upper-case letters, max 10, de-duplicated), audit `RETAIL_SITE.CREATED`. Returns the site.
3. "Copy prices from a site" is the Price list field: the new site sells from the chosen list (`Site.priceListId`). "Add ‘…’ as a new price
   list" quick-adds through the products area's price-list create endpoint with `{ name, copyFromId }` ("Start from").
4. Stock = "Move some from {default site}" → after the site is created the sheet closes and the stock area's TransferNew sheet opens
   prefilled `from = default site, to = new site` (`/retail/stock/transfers/new?from=…&to=…`). The transfer is the stock area's document
   ("Moving stock makes a transfer for the other site to receive."). "Start empty" does nothing more.
5. Done toast "{name} added. Pair its tills next." with toast action "Pair a till" **(inferred label)** → `/retail/manage/tills/new?site={id}`.

Other screens: Site filters everywhere gain the site; the Tills sheet starts asking "Site" once there are two; Plan and billing "Shops"
count rises.

### W-66 Places inside a site — Manager — Management › Sites, a site

Steps: Add the back store or cold room · Stock asks where only if there is more than one. Screens: sites, siteedit.

**Code today: missing.** One `StockLocation` per site; `InventoryItem` has one `locationId` and one quantity per (site, item).

- In SiteEdit, "Places inside it" tags. `PATCH /api/v2/retail/sites/[id] { places: [{ id?, name }] }` (`retail.sites:update` — Owner,
  Manager). Server diffs against active `StockLocation`s:
  - new name → create `StockLocation`;
  - renamed (same id) → update name;
  - removed → if it holds stock, every `InventoryItem` at that location with non-zero `currentStock` is moved to the **first remaining
    place** ("Removing a place moves its stock to the shop floor."): write a `StockMovement` `TRANSFER` with `toLocationId` = first
    place, `sourceType` `RETAIL_STOCK_TRANSFER`, notes "Place {name} removed", then set the item's `locationId`; then `isActive = false` on the
    location. At least one place must remain (400 "A site keeps at least one place." **(inferred)**).
  - audit `RETAIL_SITE.CHANGED { placesAdded, placesRemoved, stockMoved }`.
- The rule other areas follow: a site with one active place never asks "where" (receive, count, adjust, transfer default to it); a site
  with more than one asks. `GET /api/v2/retail/sites` returns `places` for that. Per-place quantities beyond one location per item are the
  **stock area's** model; when it lands, "removed place" moves balances with the same movement type.

### W-04 Pair a device to a till — Owner, manager — Management › Tills and devices — guided

Steps: Pair a till: name, site, device · A code for 10 minutes · Type or scan it on the device · Test a sale.
Screens: pairing (TillPairing), tills, tillnew, tilledit.

**Code today: missing.** `RetailRegister` exists (name, code, site, isActive); there is no device row, no pairing, and shifts store the
till as `registerCode`/`registerName` text. The POS host signs cashiers in with email and password.

The model (TillPairing): a **till** (`RetailRegister`) is where money is taken — drawer, float, shifts, Z report. A **device**
(`RetailDevice`) is what runs Tender at it. One active device per till. The device carries a **device key** (httpOnly cookie, POS host
only); people say who they are with a **PIN**.

Back office:

1. "Pair a till" opens TillNew. On open the client calls `POST /api/v2/retail/tills` (`retail.tills:create` — Owner, Manager) with
   `{ name: suggested, siteId: default site, deviceKind: "COUNTER_MINI" }`; the server creates the `RetailRegister` (code from
   `reserveIdentifier(…, "RETAIL_REGISTER")`, `hasPrinter true, hasDrawer true, hasScale false`) **and** a pairing code
   (purpose `PAIR`), returns `{ till, code: "482917", expiresAt }`. The suggested name is "Till {n+1}" **(inferred)**, selected so typing
   replaces it. Plan check before issuing any code: paired tills < plan `maxTills`, else 409 `PLAN_LIMIT` "Your {plan} plan has {n} tills,
   all paired." **(inferred)**; the sheet shows that in the code field's place with a link to Plan and billing.
2. Editing Name / Site / Device / Plugged in → `PATCH /api/v2/retail/tills/[id]` on "Done". "Cancel" (or ×) on a till that never paired
   and has no shifts → `DELETE /api/v2/retail/tills/[id]` (hard delete; also deletes its codes). Audit `RETAIL_TILL.CREATED` on Done,
   nothing on cancel.
3. The code: 6 random digits from `crypto.randomInt`, shown "4 8 2 – 9 1 7"; stored only as `sha256(companyId + ":" + code)`; valid once,
   for 10 minutes; issuing a new code for a till expires its older unused codes; codes are unique among a company's live codes
   (regenerate on collision). The sheet polls `GET /api/v2/retail/tills/[id]/pairing` every 2 s:
   `{ state: "waiting" | "paired" | "expired", expiresAt, device? }`. On `expired` the client calls
   `POST /api/v2/retail/tills/[id]/pairing-code` for a fresh one ("A new one appears after that."). When Device is "Kora handheld" the
   code field also shows the QR (payload `tender-pair:482917`), rendered locally with the `qrcode` npm package — never an external QR API.
4. On `paired` the "Waiting for the till…" field becomes "Paired" with value "{device label}" in `ok` tone **(inferred)**, and Done shows the
   board's toast "{name} paired. Ring up a test sale to check the printer." If Done is pressed before pairing: toast "{name} saved."
   **(inferred, from the SiteEdit pattern)** and the till stays "Not paired" in the list.

Device side (POS host `pos.<slug>.<root>`, internal `/portal/pos/*`):

5. Any request to the POS host without a valid device cookie lands on **`/pair`** (panel 1): "Tender · not a till yet", "Pair this
   device", "Type the code from Management › Tills and devices.", six digit boxes (dash after the third), "Scan it instead" (Kora shell
   only — opens the shell scanner), "Price check works before pairing. Selling does not." Price check needs a signed-in session; selling
   routes refuse without a device.
6. Submitting → `POST /api/v2/retail/devices/pair { code }` (no session; tenant from the host via `resolveTenantFromHost`). Server:
   throttle by `(companyId, installId)` where `installId` is a random id in the `tender_install` cookie set on first visit (plus IP):
   5 wrong tries → locked 15 minutes (`RetailPairingThrottle`), response 429 `{ lockedUntil }`. Find a live code by hash; if none → 400
   `{ code: "BAD_CODE" }`. In one transaction: mark the code used; if purpose `REPLACE`, set the till's current device
   `unpairedAt = now, unpairReason = REPLACED, unpairedById = code.createdById`; plan check for `PAIR`; create `RetailDevice`
   (`kind` from header `X-Tender-Shell: countermini|kora`, else `BROWSER` with a `label` from the user agent — "Windows PC", "Mac",
   "Chromebook", "Linux PC", "Android tablet", "Android phone", "iPad", "iPhone"; `appVersion` from `X-Tender-Version`;
   `keyHash = sha256(key)`, `pairedById = code.createdById`); audit `RETAIL_DEVICE.PAIRED` (and `RETAIL_DEVICE.REPLACED`). Response sets
   cookie `tender_device=<32 random bytes, base64url>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=34560000` with **no Domain**
   (host-only, so it is sent only to the POS host). Returns `{ till: { id, name }, site: { id, name } }`.
7. Paired, nobody signed in → **"Who is selling?"** (panel 3) at `/`: header "{till} · {site}", title "Who is selling?", a chip per person
   who may sell here (active users with a `RetailTillPin` and `retail.sell:create`, scoped to the till's site once the admin area adds
   user site scope) labelled "{First} {L}.", four PIN dots, and "Paired {d MMMM} by {name}." **(device footnote; inferred shortening of the
   board's caption)**. PIN → NextAuth credentials provider `till-pin` (`signIn("till-pin", { userId, pin })`): `authorize` reads the device
   cookie from the request, requires an active device in the user's company, verifies the PIN against `RetailTillPin` with the existing
   lockout (`TILL_PIN_MAX_ATTEMPTS`, `TILL_PIN_LOCK_MS`), and issues a session with claims `authMethod: "till-pin"`, `deviceId`,
   `registerId`. `proxy.ts` accepts a till-pin session **only on the POS host**; anywhere else it is treated as signed out.
   Password sign-in on the POS host stays ("the PIN or sign-in says who").
8. Every POS API request goes through a new `requirePosDevice(request, session)` helper (`lib/retail/devices.ts`): resolves the device by
   cookie hash; none → 409 `{ code: "NOT_A_TILL" }`; unpaired → 401 `{ code: "DEVICE_UNPAIRED", by, at, reason, tillName }`; updates
   `lastSeenAt` (at most once a minute) and `appVersion`. Applied to `pos/shifts` (open uses the device's till: no till picker, the request's
   `registerId` is removed), `pos/sales`, `pos/sales/[id]/refund|void|printed`, `pos/held-carts*`, `pos/shifts/[id]/*`, `pos/sync`,
   `pos/current-shift`. Shifts and sales are stamped with `registerId` and `deviceId`. A person with an open shift on another till is
   refused: 409 "Close your shift on {till} first." **(inferred)** ("People are not devices").
9. Test a sale: the TillNew note "Then ring up a test sale and void it." — no server step beyond normal selling.

Other screens: Tills list state and device columns; Shifts and Sales show the till by relation; Z report keeps its frozen register code.

### W-76 Replace or unpair a device — Owner, manager — A till › Device

Steps: Close the shift on it · Pair another device, or Unpair · The old one stops at its next request. Screens: tilledit, tillreplace, pairing.

**Code today: missing.**

- **Pair another device** (TillEdit secondary) → TillReplace sheet → `POST /api/v2/retail/tills/[id]/pairing-code { purpose: "REPLACE" }`
  (`retail.tills:update`). The sheet shows the code, polls pairing, and shows "The one it replaces" (current device label and last seen) and
  "Open shift" (the open shift's cashier and opening time, `warn` tone). An open shift does **not** block the replacement; the shift belongs to
  the till and continues on the new device. When the new device redeems the code, the old device is unpaired in the same transaction
  (W-04 step 6). Done toast "{till} is on the new device." when paired; Cancel expires the code.
- **Unpair** (TillEdit danger) → confirm dialog (§5) → `POST /api/v2/retail/tills/[id]/unpair`. Refused 409 `SHIFT_OPEN` "Close {cashier}’s shift
  on {till} first." **(inferred)** while a shift is open ("Unpair needs the shift on it closed first."). Sets `unpairedAt`, `unpairedById`,
  `unpairReason = UNPAIRED`; audit `RETAIL_DEVICE.UNPAIRED`. The till stays ("Not paired").
- **The old one stops at its next request:** its next POS call gets 401 `DEVICE_UNPAIRED`; the client clears local session state, flushes
  its offline queue first (`pos/sync` accepts it, below), then shows **`/unpaired`** (panel 4): header "{till} · {device label}",
  "This device is no longer a till", "{name} paired another device to {till} at {HH:MM}. The {n} sales this one held offline were sent."
  (for a plain unpair: "{name} unpaired {till} at {HH:MM}." **(inferred)**; the second sentence only when n > 0), button "Pair it to a till" → `/pair`.
- **Offline sales from an unpaired device still come in:** `pos/sync` accepts queued sales from a device whose `unpairedAt` is set **only
  for sales whose client `createdAt` ≤ `unpairedAt`**, posts them normally and sets `RetailSale.reviewReason = "Sold on a device that was
  then unpaired"` ("flagged for you"); later sales are refused. The floor area lists flagged sales for a manager.
- **Lost device:** unpair it here; the shift on it is closed from the shift's own page with the count (floor area, ShiftClose).

### W-05 Payments and currencies — Owner — Onboarding, or Management › Payments — guided

Steps: Tick the tenders you take · Set the ZiG rate · Connect EcoCash merchant. Screen: payments.

**Code today: missing** (no tender switches, rate only in accounting, no merchant code).

- `GET /api/v2/retail/payments` (`retail.payments:view` — Owner, Manager, Bookkeeper).
- `PUT /api/v2/retail/payments` — Owner (`retail.payments:update`) may change everything; Manager may change only the rate and how it is
  updated (`retail.zig-rate:update`; any other changed field → 403 "Your role can change the ZiG rate only." **(inferred)**).
  Validation: at least one tender on; rate > 0 and ≤ 100000, 4 decimals; rounding one of 0.50/1/5; merchant code digits and spaces ≤ 20;
  display name ≤ 30. Writes `RetailPaymentSettings` (+ `updatedById`). A changed rate inserts `CurrencyRate { baseCurrency: "USD",
  quoteCurrency: "ZWG", rate, effectiveDate: now, createdById, source: "MANUAL" }` (history kept; the newest applies). Audit
  `RETAIL_PAYMENTS.CHANGED` and, for a rate, `RETAIL_ZIG_RATE.SET { rate, previous }`.
- "Daily, RBZ rate": the retail worker fetches the day's RBZ rate at 07:00 Africa/Harare through `lib/retail/rbz-rate.ts` and inserts a
  `CurrencyRate` with `source: "RBZ"`, `createdById: null`. The feed source is an open question; until an adapter is configured the option
  is hidden.
- The till: `GET /api/v2/retail/devices/me` carries the tenders that are on, in board order, and today's rate. **The server stamps the rate
  on every ZiG sale and payment from `resolveExchangeRate`** (`lib/money.ts`) and ignores any rate the till sends (today
  `pos/sales` trusts the client's `exchangeRate`). Change rounding is applied by the till; the server checks `changeAmount` against the rule.
- Tender model change: `RetailTenderType` gains `ECOCASH`, `INNBUCKS`, `ON_ACCOUNT`; `MOBILE_MONEY` is migrated to `ECOCASH` and dropped
  (§3). Cash US$ and Cash ZiG are both `CASH` with the payment's `currency`.
- Other screens: Posting shows one account row per tender that is on; Guided "Add your EcoCash merchant code" ticks when EcoCash is on and a
  code is saved (or EcoCash is off).

### W-06 Connect fiscal receipts — Owner — Management › Fiscal — guided

Steps: Enter the FDMS details · Seal tests a receipt · Tills start signing. Screen: fiscal.

**Code today: partly works** (`/api/accounting/fiscalisation/config`, `/device/register`, `/fiscal-days`, `/fiscal-days/[id]`; the signer and
the fiscal worker exist; retail sales are fiscalised by `lib/retail/fiscalisation.ts`).

- `GET /api/v2/retail/fiscal` (`retail.fiscal:view` — Owner, Manager, Bookkeeper) composes: the device row (`fiscalDeviceWhere`), its
  registration, the open fiscal day, the last five days with totals, `AccountingSettings.taxNumber/vatNumber`, `RetailFiscalSettings`.
- `PUT /api/v2/retail/fiscal` (Owner): device ID, serial number → `FiscalisationProviderConfig` (providerKey `ZIMRA_FDMS`, `apiBaseUrl`
  from `ZIMRA_FDMS_API_BASE_URL`); taxpayer number / VAT number → `AccountingSettings.taxNumber / vatNumber` (VAT also to
  `CompanyBranding.vatNumber`); close mode and offline rule → `RetailFiscalSettings`. Changing the device ID of a registered device is
  refused 409 "Close the fiscal day before changing the device." **(inferred)** while a day is open. Audit `RETAIL_FISCAL.CHANGED`.
- Not yet registered: the page shows an "Activation key" field and the header button "Connect" **(inferred state)** →
  `POST /api/v2/retail/fiscal/connect { activationKey }` → the existing register logic (moved from the accounting route into
  `lib/accounting/fdms-registration.ts` and called by both) with `serialNumber` from the saved row; sets `registeredAt`, `registeredById`.
  Audit `RETAIL_FISCAL.CONNECTED`.
- "Test a receipt" → `POST /api/v2/retail/fiscal/test`: builds a zero-value test document, signs it with the device key locally
  (no submission, no counter consumed) and calls FDMS `getStatus`; returns `{ ok, message, ms }`; toast "The device signed a test receipt
  and ZIMRA answered." / the error **(inferred)**.
- "Close day {n}" → `POST /api/v2/retail/fiscal/days/[id]/close` (wraps the existing fiscal-day close; sends the Z-report). Shown only while a
  day is open.
- "Close the fiscal day · With the last shift": when the last open shift of the company closes (floor area's shift close), the shift-close
  service calls `closeFiscalDayIfLastShift(companyId)`; "By hand" never auto-closes. "If ZIMRA cannot be reached · Stop selling": the device
  context carries the rule; `pos/sales` refuses with 409 `FISCAL_OFFLINE` when the last FDMS call failed within 5 minutes and the rule is
  stop; "Keep selling, sign later" is today's behaviour (the fiscal worker retries).
- "Tills start signing": every till's sales are fiscalised by the shop's device until a till carries its own (TillPairing footnote) — the
  per-till device is not built now (open question).

### W-07 Receipts — Manager — Management › Receipts

Steps: Header and footer · Licence number · Preview and print. Screen: receipts.

**Code today: missing.**

- `GET /api/v2/retail/receipts` (`retail.receipts:view` — Owner, Manager) → settings + preview data.
- `PUT /api/v2/retail/receipts` (`retail.receipts:update` — Owner, Manager). Header ≤ 4 lines × 42 chars, footer ≤ 4 × 42 (80 mm paper),
  copies 1|2, send by NOTHING|WHATSAPP|EMAIL. Audit `RETAIL_RECEIPTS.CHANGED`.
- The till renders every receipt from `RetailReceiptSettings` (device context) instead of Branding's footer: header lines, then
  "VAT {n}" when shown and registered, "Licence {n}" when liquor and shown, lines, deposits, total, tenders, footer, then "FDMS {device} · Day {n}".
  Copies printed per setting. "Also send by WhatsApp/Email" queues a `RetailMessage` with the receipt when the sale has a customer phone or email.
- "Print a test receipt" prints the preview in the browser's print dialog at 80 mm (`@page { size: 80mm auto }`), no server write.

### W-08 Import products from a spreadsheet — Manager — Onboarding, or Products — guided

Steps: Download the template · Upload · Fix the rows it flags · Import. Screen: import.

**Code today: missing.**

1. `GET /api/v2/retail/catalog/import/template` → `.xlsx` built with `exceljs` (columns: Name, Price, Category, Barcode, Cost, Supplier,
   Pack size, Opening stock; a header note row; the shop's categories in a second sheet).
2. `POST /api/v2/retail/catalog/import` (multipart `file`, `.xlsx` or `.csv`, ≤ 5 MB, ≤ 5,000 rows; `retail.catalog:create` — Owner, Manager).
   Parses with `exceljs` (CSV through `exceljs` csv reader), maps headers case-insensitively, creates `RetailImport` + one `RetailImportRow`
   per data row, then validates and matches every row (below). Returns the import id; the page moves to Check. Audit none until commit.
3. Matching ("By barcode first, then by name. A row that matches updates that product; anything else is new."): exact barcode → UPDATE of that
   product; else exact name (trimmed, case-insensitive) → UPDATE; else a near name (lower-case, punctuation and spaces removed) → problem
   `LOOKS_LIKE` "Looks like {product name}, already in Products" with fix "Update that one"; else NEW.
4. Problems (each row may have several; the first is shown): `NO_NAME` "No name" **(inferred)**; `NO_PRICE` "No price"; `PRICE_COMMA` "Price has a
   comma"; `PRICE_NOT_NUMBER` "Price is not a number" **(inferred)**; `NEW_CATEGORY` "Category “{name}” is new" with fix "Create the category";
   `BARCODE_SHORT` "Barcode is too short" (< 8 digits); `BARCODE_LONG` "Barcode is too long" **(inferred)** (> 14); `BARCODE_LETTERS`
   "Barcode has letters" **(inferred)**; `DUPLICATE_IN_FILE` "Same barcode as row {n}" **(inferred)**; `LOOKS_LIKE` above.
5. Editing a cell → `PATCH /api/v2/retail/catalog/import/[id]/rows/[rowId] { name?, category?, price?, barcode? }` → re-validates that row and
   returns it plus new tab counts. Fix buttons → `POST /api/v2/retail/catalog/import/[id]/fix { rowId, fix: "CREATE_CATEGORY"|"UPDATE_MATCH" }`:
   CREATE_CATEGORY creates the `RetailCategory` (VAT 15 or 0 when not VAT registered, not 18+, sort last; audit `RETAIL_CATEGORY.CREATED`)
   and re-validates **every** row with that category name; UPDATE_MATCH sets the row's action to UPDATE of the near match.
6. "Import {ok}, skip {needFix}" → `POST /api/v2/retail/catalog/import/[id]/commit`. In one transaction per 200 rows: NEW rows → product-create
   service (product, `InventoryItem` at the default site's first place, price on the default list, cost when given, supplier link when the
   supplier exists, pack size → case linked to a single of the same name without the pack words when present); opening stock > 0 → the stock
   area's opening-stock movement (`StockMovement` RECEIPT, `sourceType` `RETAIL_STOCK_ADJUSTMENT`, ledger through `lib/accounting` Dr Stock /
   Cr Opening balances) — the same path as Products › New product with opening stock; UPDATE rows → price change through the products area's
   price-change service (so "The old one is kept in their history") and cost/barcode when given; rows with problems are skipped. Marks the
   import `IMPORTED`; audit `RETAIL_PRODUCTS.IMPORTED { created, updated, skipped, file }`. Toast "{n} products imported. {k} rows skipped."
   **(inferred)**; navigate to Products (or back to `/retail/setup/tills` when `from=setup`).
7. "Start again" → `DELETE /api/v2/retail/catalog/import/[id]` (marks `DISCARDED`, rows deleted) → Template step.

### W-64 Set the till rules — Owner, manager — Management › Till rules

Steps: PIN limits for refunds and voids · Reasons · Discounts, drawer, offline. Screen: tillrules.

**Code today: partly** (reference tenders, booleans, split tender; JSON in `FiscalisationProviderConfig`, no enforcement of most).

- `GET/PUT /api/v2/retail/till-rules` (`retail.till-rules:view|update` — Owner, Manager). Validation: refund limit 0–100000 (2 dp); void rule
  ALWAYS|AFTER_5_MINUTES|NEVER; 1–20 reasons each, each 1–40 chars, unique case-insensitively; discount 0–100 (accepts "10" or "10%");
  cash drop 0–1000000; offline 1–72 hours (accepts "24" or "24 hours"). Audit `RETAIL_TILL_RULES.CHANGED { before, after }`.
- Enforcement (pure `lib/retail/till-rules.ts#checkTillRule`, unit-tested; applied server-side in the existing routes):
  - `pos/sales/[id]/refund`: refund total > `refundPinOver` → requires `managerPin { userId, pin }`; reason must be one of `refundReasons`.
    The permission matrix gives Cashier `refund` (limited by this rule) — Roles board: "Cashiers refund with a manager PIN over the limit."
  - `pos/sales/[id]/void`: ALWAYS → manager PIN; AFTER_5_MINUTES → PIN when `now − postedAt > 5 min`; NEVER → none; reason one of `voidReasons`.
    Cashier gets `void` under this rule.
  - `pos/sales`: more than one payment when `splitTender` is off → 400 "This shop takes one tender per sale." **(inferred)**; card / EcoCash /
    InnBucks payments without a reference of ≥ 4 characters when `referenceRequired` → 400 (replaces `validateTenderReferences`); any line
    or sale discount above `maxCashierDiscountPercent` → manager PIN.
  - `pos/drawer/open` (new, floor area builds the button): when `drawerOpenWithoutSale` is off → manager PIN; audit `RETAIL_DRAWER.OPENED`.
  - Cash drop prompt and offline window are applied on the device (device context carries them); `pos/sync` flags sales whose client time is
    older than `offlineHours` at arrival: `reviewReason = "Sold offline longer than the till rules allow"`.
  - **Manager PIN** = a `RetailTillPin` of a user with `retail.sell:approve` (Owner, Manager), verified with the PIN lockout, accepted **only on a
    request from a paired device**. It replaces the password override in `lib/retail/manager-override.ts` (removed). The floor area builds the PIN dialog.
- Reasons show in Insights › Losses (insights area reads `RetailSale.overrideReason/voidReason`).

### W-65 Post sales and stock to the books — Owner, bookkeeper — Management › Posting

Steps: An account for each tender · Sales, VAT, stock · Post daily. Screen: posting.

**Code today: partly** (seed pack, readiness checks, tender mappings read-only; every sale posts immediately).

- `GET /api/v2/retail/posting` (`retail.posting:view` — Owner, Bookkeeper): the accounts (`ChartOfAccount` id, code, name, type), the
  company-level `TenderAccountMapping` per tender that is on, the six role accounts (`RetailAccountRoleMapping`), schedule, last run, the
  three readiness checks.
- `PUT /api/v2/retail/posting` (Owner, Bookkeeper): `tenders: [{ tender, accountId }]` → upsert company-level mappings (`siteId null`,
  `registerCode null`, `currency` USD/ZWG for the two cash rows, null otherwise); `roles: [{ role, accountId }]`; `schedule`. Accounts must
  be active, postable (`nodeType` leaf) and of a sensible type per role (tenders: ASSET or LIABILITY for vouchers; SALES: INCOME;
  VAT: LIABILITY; COST_OF_SALES and BREAKAGE: EXPENSE; STOCK: ASSET; DEPOSITS_HELD: LIABILITY) else 400 "{account} is an {type} account."
  **(inferred)**. Audit `RETAIL_POSTING.CHANGED`.
- Quick add from any account field: `POST /api/v2/retail/posting/accounts { codeAndName, type }` → parses leading digits as code → creates
  `ChartOfAccount` (unique code) → returns it. Audit `RETAIL_POSTING.ACCOUNT_ADDED`.
- Role accounts in posting: retail posting rule lines read their account through the new `accountSource = ROLE_MAPPING` + `accountRole`
  (§3.3, migration `20261004131800`), resolved in `lib/accounting/posting.ts` next to `TENDER_MAPPING`. Defaults (`lib/accounting/defaults.ts` `RETAIL_POSTING_RULES` and the
  retail stock-adjustment rules) switch their fixed 4000 / 2200 / 2240 / 5000 / 1200 / 5410 lines to roles; the seed pack creates the
  role mappings.
- Schedule: **With every sale** = today's behaviour (sale → `createJournalEntryFromSource`). **At the end of each day** = retail sources capture
  the accounting event as `PENDING` with `nextRetryAt` = the trading day's 23:00 Africa/Harare instead of posting (no new column: "not before" is what `nextRetryAt` already means to the drain); the retail worker
  (`pnpm worker:retail`, `scripts/retail-worker.ts`) runs `runRetailPosting(companyId, "SCHEDULE")` at 23:00 for each company on that schedule.
- "Post now" → `POST /api/v2/retail/posting/run` → `runRetailPosting(companyId, "BY_HAND")`: posts every pending retail event (sales, refunds,
  voids, deliveries, counts, adjustments, cash movements) through `retryPendingAccountingEvents` scoped to retail source types, writes a
  `RetailPostingRun` with counts per kind, audit `RETAIL_POSTING.RUN`. Toast "Posted {n} sales, {d} deliveries, {c} count(s)." **(inferred)**.
- "Set up the accounts" → dialog listing `previewAccountingSeedPack` (accounts, VAT codes, tender accounts, rates for ZiG and rand) → "Add them"
  **(inferred)** → `runAccountingSeedPack` (existing route `POST /api/accounting/setup/seed-pack`, now gated by `retail.posting:update` for retail).
- Checks (aside "Ready to post"): every tender that is on has a mapping → "Every tender has an account."; the default tax code rate → "VAT is set
  to {rate}%."; costing method of `recordStockMovement` (moving average) → "Stock is valued at average cost." A failing check shows in `warn` with
  what is missing ("Card has no account." **(inferred)**). When retail events could not post, a fourth warn line says so: "{n} items could not
  post. Post now tries them again."

### W-67 Plan and billing — Owner — Management › Plan and billing

Steps: See the plan and what is used · Change the plan · How it is paid. Screen: billing.

**Code today: partly** (`/preferences/organization/billing`, `GET /api/preferences/billing`; plan change exists only in operator scripts
`scripts/platform/domain/commercial-service.ts#assignTier`).

- `GET /api/v2/retail/billing` (`retail.billing:view` — Owner, Bookkeeper): plans (`SubscriptionPlan` START/GROW/SCALE with `maxTills`, §3.3 SET-10; prices: open question 1), current plan, usage (open sites vs
  `maxSites`, paired tills vs `maxTills`, active users), next bill (`currentPeriodEnd`, `effectiveMonthlyAmount`), payment method, billing email,
  last three `SubscriptionPayment`s.
- `PUT /api/v2/retail/billing` (Owner): `{ planCode?, paymentMethod?, paymentPhone?, billingEmail? }`. Plan change: refuse a downgrade that usage
  exceeds (409 `PLAN_TOO_SMALL` "Start has room for one shop. Close Borrowdale first." **(inferred pattern)**); else `assignTier` (moved to
  `lib/platform/plan-change.ts`, called by the scripts too) + `recomputeAndPersistCompanyPricing`; entitlements follow the tier. Audit
  `PLATFORM_PLAN.CHANGED`. Payment fields → `CompanySubscription`.
- "Close the account" (aside link) → confirm dialog → `POST /api/v2/retail/billing/close-account` (Owner): `Company.tenantStatus = DISABLED`,
  `disabledAt = now`, `teardownAfter = now + 90 days`; subscription `CANCELED`; every active `RetailDevice` unpaired (`ACCOUNT_CLOSED`) so tills stop
  at once; audit `PLATFORM_ACCOUNT.CLOSED`; sign out. The platform teardown job (`lib/platform/tenant-teardown.ts`) runs after `teardownAfter`.

---

## 3. Data

### 3.1 Models used (existing)

`Company`, `CompanyBranding`, `AccountingSettings`, `RetailShopProfile`, `RetailCategory`, `Site`, `StockLocation`, `InventoryItem`,
`StockMovement`, `Product`, `PriceList`, `ProductPrice`, `RetailRegister`, `RetailShift`, `RetailSale`, `RetailSalePayment`, `RetailTillPin`,
`User`, `CurrencyRate`, `FiscalisationProviderConfig`, `FiscalDay`, `FiscalReceipt`, `TaxCode`, `ChartOfAccount`, `TenderAccountMapping`,
`PostingRule`, `PostingRuleLine`, `AccountingIntegrationEvent`, `SubscriptionPlan`, `CompanySubscription`, `SubscriptionPayment`,
`Notification`, `PlatformAuditEvent` (through `lib/audit/platform.ts`).

What is wrong with the data today, and is fixed below:

- Three retail settings live as JSON in `FiscalisationProviderConfig` under reserved keys (`RETAIL_SETUP_PROFILE`, `RETAIL_POS_POLICY`,
  `RETAIL_TENDER_POLICY`), which is why `lib/accounting/fiscal-device-scope.ts` has to filter them out of "devices". They become typed rows.
- There is no device model. `RetailRegister` is a name and a code; `RetailShift` stores the till as `registerCode`/`registerName` text with no
  foreign key; `RetailSale` has no till at all.
- `Site` has no phone, hours, price list or close date; `StockLocation` is one per site in practice.
- `RetailTenderType` has one `MOBILE_MONEY` for EcoCash and InnBucks and no "on account".
- Retail posting rule lines hard-code account codes, so the Posting page cannot change "Sales" without editing rules.
- `SubscriptionPlan` has no till limit; nothing records how a company pays us.

### 3.2 Settings rows: one typed row per page

Each settings page owns one row keyed by `companyId`, created with defaults on first read (`upsert` in its loader) and by
`provisionRetail`. Each carries `updatedById` + `updatedAt` for the page's "Last changed by …" line.

| Page | Row | Loader (`lib/retail/…`) |
|---|---|---|
| Company | `RetailShopProfile` (existing, extended) + `CompanyBranding` + `AccountingSettings` | `company.ts` |
| Payments | `RetailPaymentSettings` | `payment-settings.ts` |
| Till rules | `RetailTillRules` | `till-rules.ts` |
| Receipts | `RetailReceiptSettings` | `receipt-settings.ts` |
| Fiscal device | `RetailFiscalSettings` + `FiscalisationProviderConfig` | `fiscal-settings.ts` |
| Posting | `RetailPostingSettings` + `TenderAccountMapping` + `RetailAccountRoleMapping` | `posting-settings.ts` |
| Plan and billing | `CompanySubscription` (extended) | `billing.ts` |

The till reads all of these in one call, `GET /api/v2/retail/devices/me` (§4), via `loadTillContext(companyId, registerId)`.

### 3.3 Schema changes, by migration

Every migration ships its witness test in the same commit (pattern: `lib/retail/sale-line-deposit-migration.test.ts`, querying
`information_schema` / `pg_indexes` / data). Apply with `npx prisma migrate deploy`, then the same against `DATABASE_URL_TEST`.

#### `20261004131000_retail_company_profile` (SET-01) · witness `lib/retail/company-profile-migration.test.ts`

```prisma
model RetailShopProfile {
  // … existing fields unchanged …
  /// The shop's WhatsApp number, from onboarding. Shown to customers; nothing is sent from it.
  whatsapp      String?
  /// "Registered for VAT". No → the type's categories seed at 0%, receipts omit the VAT line, posting skips VAT.
  vatRegistered Boolean  @default(true)
  /// "Default site": new products, orders and stock go here unless another is chosen. Replaces the JSON setup profile.
  defaultSiteId String?

  defaultSite Site? @relation("RetailDefaultSite", fields: [defaultSiteId], references: [id], onDelete: SetNull)
}

model Site {
  // … add the back-relation:
  retailDefaultFor RetailShopProfile[] @relation("RetailDefaultSite")
}
```

SQL also: copy `defaultSiteId` out of each `RETAIL_SETUP_PROFILE` JSON row into `RetailShopProfile` (inserting a profile row with defaults
where none exists), then `DELETE FROM "FiscalisationProviderConfig" WHERE "providerKey" = 'RETAIL_SETUP_PROFILE'`. Witness asserts the three
columns (types, nullability, default `true`), the FK's `ON DELETE SET NULL`, and that no `RETAIL_SETUP_PROFILE` row remains.

#### `20261004131100_retail_sites_and_places` (SET-02) · witness `lib/retail/site-retail-fields-migration.test.ts`

```prisma
model Site {
  // … existing; `location` is the retail "Address" …
  /// Retail: the site's phone.
  phone        String?
  /// Retail: opening hours as written ("Mon to Sat 08:00 to 21:00, Sun 10:00 to 17:00").
  openingHours String?
  /// Retail: the price list this site's tills sell from unless a till says otherwise.
  priceListId  String?
  /// Set when the site is closed; `isActive` goes false with it. History stays.
  closedAt     DateTime?
  closedById   String?

  priceList PriceList? @relation("SitePriceList", fields: [priceListId], references: [id], onDelete: SetNull)
  closedBy  User?      @relation("SiteClosedBy", fields: [closedById], references: [id], onDelete: SetNull)
}

model StockLocation {
  // … existing …
  /// "Places inside it", in the owner's order. The first active place is where removed places' stock goes.
  sortOrder Int @default(0)
}

model PriceList { sites Site[] @relation("SitePriceList") /* + registers in SET-03 */ }
model User      { sitesClosed Site[] @relation("SiteClosedBy") }
```

#### `20261004131200_retail_till_devices` (SET-03) · witness `lib/retail/till-devices-migration.test.ts`

```prisma
enum RetailDeviceKind {
  COUNTER_MINI
  KORA
  BROWSER
}

enum RetailDeviceUnpairReason {
  UNPAIRED
  REPLACED
  SITE_CLOSED
  ACCOUNT_CLOSED
}

enum RetailPairingPurpose {
  PAIR
  REPLACE
}

model RetailRegister {
  // … existing id, companyId, code, name, siteId, isActive, createdAt, updatedAt …
  /// What the owner said will run here ("Device" on Pair a till). The paired device's own kind is what the list shows.
  deviceKind  RetailDeviceKind @default(COUNTER_MINI)
  hasPrinter  Boolean          @default(true)
  hasDrawer   Boolean          @default(true)
  hasScale    Boolean          @default(false)
  /// "Sells from price list". Null = the site's list.
  priceListId String?
  createdById String?

  priceList    PriceList?            @relation("RegisterPriceList", fields: [priceListId], references: [id], onDelete: SetNull)
  createdBy    User?                 @relation("RetailRegisterCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
  devices      RetailDevice[]
  pairingCodes RetailPairingCode[]
  messages     RetailDeviceMessage[]
}

/// What runs Tender at a till. One active device per till (partial unique index below).
model RetailDevice {
  id           String                    @id @default(uuid())
  companyId    String
  registerId   String
  kind         RetailDeviceKind
  /// For a browser: "Windows PC", "Android tablet"… from the user agent. Null for CounterMini and Kora.
  label        String?
  /// sha256 of the device key. The key itself only ever lives in the device's httpOnly cookie.
  keyHash      String                    @unique
  appVersion   String?
  pairedAt     DateTime                  @default(now())
  pairedById   String
  lastSeenAt   DateTime?
  unpairedAt   DateTime?
  unpairedById String?
  unpairReason RetailDeviceUnpairReason?
  createdAt    DateTime                  @default(now())
  updatedAt    DateTime                  @updatedAt

  company    Company        @relation(fields: [companyId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  register   RetailRegister @relation(fields: [registerId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  pairedBy   User           @relation("RetailDevicePairedBy", fields: [pairedById], references: [id], onDelete: Restrict)
  unpairedBy User?          @relation("RetailDeviceUnpairedBy", fields: [unpairedById], references: [id], onDelete: SetNull)

  @@index([companyId, registerId, unpairedAt])
}

/// A six-digit code a manager makes; good once, for 10 minutes. Only its hash is stored.
model RetailPairingCode {
  id          String               @id @default(uuid())
  companyId   String
  registerId  String
  purpose     RetailPairingPurpose
  /// sha256(companyId + ":" + code)
  codeHash    String
  expiresAt   DateTime
  usedAt      DateTime?
  deviceId    String?
  createdById String
  createdAt   DateTime             @default(now())

  company   Company        @relation(fields: [companyId], references: [id], onDelete: Cascade)
  register  RetailRegister @relation(fields: [registerId], references: [id], onDelete: Cascade)
  createdBy User           @relation("RetailPairingCodeCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)

  @@index([companyId, codeHash])
  @@index([registerId, usedAt, expiresAt])
}

/// Five wrong codes from one unpaired device stop it for 15 minutes.
model RetailPairingThrottle {
  companyId      String
  /// Random id in the unpaired device's `tender_install` cookie.
  installId      String
  failedAttempts Int       @default(0)
  lockedUntil    DateTime?
  updatedAt      DateTime  @updatedAt

  @@id([companyId, installId])
}

/// "Send a message" from the Tills list: shown on the till until dismissed.
model RetailDeviceMessage {
  id          String    @id @default(uuid())
  companyId   String
  registerId  String
  body        String
  sentById    String
  createdAt   DateTime  @default(now())
  dismissedAt DateTime?

  company  Company        @relation(fields: [companyId], references: [id], onDelete: Cascade)
  register RetailRegister @relation(fields: [registerId], references: [id], onDelete: Cascade)
  sentBy   User           @relation("RetailDeviceMessageSentBy", fields: [sentById], references: [id], onDelete: Restrict)

  @@index([registerId, dismissedAt])
}
```

SQL also: `CREATE UNIQUE INDEX "RetailDevice_one_active_per_register" ON "RetailDevice" ("registerId") WHERE "unpairedAt" IS NULL;`
Witness asserts the index exists with that predicate and that a second active device for one till is refused (insert two rows in a test
transaction, expect the unique violation, roll back).

#### `20261004131300_retail_till_on_shift_and_sale` (SET-04) · witness `lib/retail/till-on-shift-migration.test.ts`

```prisma
model RetailShift {
  // … existing; `registerCode` / `registerName` stay as the frozen snapshot the Z report keys on …
  registerId String
  deviceId   String?

  register RetailRegister @relation(fields: [registerId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  device   RetailDevice?  @relation(fields: [deviceId], references: [id], onDelete: SetNull)

  @@index([registerId, status])
}

model RetailSale {
  // … existing …
  registerId   String?
  deviceId     String?
  /// Set by the till when the receipt printed (`pos/sales/[id]/printed`). Onboarding's test sale reads it.
  printedAt    DateTime?
  /// Why a manager should look at this sale; null for ordinary sales.
  reviewReason String?
  reviewedAt   DateTime?
  reviewedById String?

  register   RetailRegister? @relation(fields: [registerId], references: [id], onDelete: SetNull)
  device     RetailDevice?   @relation(fields: [deviceId], references: [id], onDelete: SetNull)
  reviewedBy User?           @relation("RetailSaleReviewedBy", fields: [reviewedById], references: [id], onDelete: SetNull)

  @@index([companyId, registerId, postedAt])
}
```

SQL: add `registerId` nullable; backfill `RetailShift.registerId` by `(companyId, registerCode)` → `RetailRegister.code`; for codes with no
register, insert an inactive `RetailRegister` with that code and name at the shift's site; then `SET NOT NULL`. Backfill
`RetailSale.registerId` from its shift. Witness asserts `RetailShift.registerId` is NOT NULL with an FK and no shift is left without a till.

#### `20261004131400_retail_payment_settings` (SET-05) · witness `lib/retail/payment-settings-migration.test.ts`

```prisma
enum RetailRateSource {
  MANUAL
  RBZ_DAILY
}

enum CurrencyRateSource {
  MANUAL
  RBZ
}

/// Payments: the tenders a shop takes, the ZiG rule and EcoCash.
model RetailPaymentSettings {
  companyId           String           @id
  takeCashUsd         Boolean          @default(true)
  takeCashZig         Boolean          @default(true)
  takeCard            Boolean          @default(false)
  takeEcocash         Boolean          @default(true)
  takeInnbucks        Boolean          @default(false)
  takeBankTransfer    Boolean          @default(false)
  takeOnAccount       Boolean          @default(false)
  takeVouchers        Boolean          @default(false)
  zigRateSource       RetailRateSource @default(MANUAL)
  /// "Round ZiG change to": 0.50, 1 or 5.
  zigChangeRounding   Decimal          @default(1) @db.Decimal(6, 2)
  ecocashMerchantCode String?
  /// "Shows customers as".
  ecocashDisplayName  String?
  updatedById         String?
  createdAt           DateTime         @default(now())
  updatedAt           DateTime         @updatedAt

  company   Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  updatedBy User?   @relation("RetailPaymentSettingsUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)
}

/// Replaces MOBILE_MONEY with the two wallets Harare takes, and adds selling on account.
enum RetailTenderType {
  CASH
  CARD
  ECOCASH
  INNBUCKS
  TRANSFER
  ON_ACCOUNT
  VOUCHER
}

model CurrencyRate {
  // … existing …
  createdById String?
  source      CurrencyRateSource @default(MANUAL)

  createdBy User? @relation("CurrencyRateCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
}
```

SQL for the enum (Postgres cannot drop a value): rename the old type, create the new one, `ALTER TABLE "RetailSalePayment" ALTER COLUMN
"tenderType" TYPE "RetailTenderType" USING (CASE "tenderType"::text WHEN 'MOBILE_MONEY' THEN 'ECOCASH' ELSE "tenderType"::text END)::"RetailTenderType"`,
drop the old type; `UPDATE "TenderAccountMapping" SET "tenderType" = 'ECOCASH' WHERE "tenderType" = 'MOBILE_MONEY'`. Code: replace every
`MOBILE_MONEY` (44 references in `app/`, `lib/`, `components/`, `scripts/`) and `lib/retail/words.ts#tenderLabel` gains "EcoCash",
"InnBucks", "On account". Witness asserts the enum labels in order and that no payment or mapping row says `MOBILE_MONEY`.

#### `20261004131500_retail_till_rules` (SET-06) · witness `lib/retail/till-rules-migration.test.ts`

```prisma
enum RetailVoidPinRule {
  ALWAYS
  AFTER_5_MINUTES
  NEVER
}

model RetailTillRules {
  companyId                 String            @id
  /// "Manager PIN for refunds over".
  refundPinOver             Decimal           @default(20) @db.Decimal(14, 2)
  voidPin                   RetailVoidPinRule @default(ALWAYS)
  refundReasons             String[]          @default(["Damaged", "Wrong item", "Changed mind", "Overcharged"])
  voidReasons               String[]          @default(["Rang up wrong", "Customer left", "Test sale"])
  splitTender               Boolean           @default(true)
  /// "Card and EcoCash need a reference" (applies to CARD, ECOCASH, INNBUCKS; 4 characters minimum).
  referenceRequired         Boolean           @default(true)
  maxCashierDiscountPercent Decimal           @default(10) @db.Decimal(5, 2)
  drawerOpenWithoutSale     Boolean           @default(false)
  cashDropPromptOver        Decimal           @default(500) @db.Decimal(14, 2)
  offlineHours              Int               @default(24)
  updatedById               String?
  createdAt                 DateTime          @default(now())
  updatedAt                 DateTime          @updatedAt

  company   Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  updatedBy User?   @relation("RetailTillRulesUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)
}
```

SQL: `DELETE FROM "FiscalisationProviderConfig" WHERE "providerKey" IN ('RETAIL_POS_POLICY', 'RETAIL_TENDER_POLICY')`. With the setup
profile already gone (SET-01), `SETTINGS_PROVIDER_KEYS` and `fiscalDeviceWhere`'s `notIn` filter are deleted. Witness asserts the defaults
(including the two reason arrays) and that no reserved-key row remains.

#### `20261004131600_retail_receipts_and_messages` (SET-07) · witness `lib/retail/receipt-settings-migration.test.ts`

```prisma
enum RetailReceiptSendBy {
  NOTHING
  WHATSAPP
  EMAIL
}

model RetailReceiptSettings {
  companyId         String              @id
  /// "Top of the receipt". Null = trading name (upper case) and the site's address.
  header            String?
  /// "Bottom of the receipt".
  footer            String?
  showVatNumber     Boolean             @default(true)
  showLicenceNumber Boolean             @default(true)
  printLogo         Boolean             @default(false)
  copies            Int                 @default(1)
  alsoSendBy        RetailReceiptSendBy @default(NOTHING)
  updatedById       String?
  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt

  company   Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  updatedBy User?   @relation("RetailReceiptSettingsUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)
}

enum RetailMessageChannel {
  WHATSAPP
  EMAIL
}

enum RetailMessageStatus {
  QUEUED
  SENT
  FAILED
}

/// Outbox for messages the shop sends: receipts now; staff PINs (logged with the PIN redacted); the customers area reuses it.
model RetailMessage {
  id          String               @id @default(uuid())
  companyId   String
  channel     RetailMessageChannel
  to          String
  /// "receipt" | "staff-pin" | …
  template    String
  body        String
  saleId      String?
  status      RetailMessageStatus  @default(QUEUED)
  attempts    Int                  @default(0)
  lastError   String?
  sentAt      DateTime?
  createdById String?
  createdAt   DateTime             @default(now())

  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@index([companyId, status, createdAt])
}
```

#### `20261004131700_retail_fiscal_settings` (SET-08) · witness `lib/retail/fiscal-settings-migration.test.ts`

```prisma
enum RetailFiscalDayClose {
  WITH_LAST_SHIFT
  BY_HAND
}

enum RetailFiscalUnreachable {
  KEEP_SELLING
  STOP_SELLING
}

model RetailFiscalSettings {
  companyId       String                  @id
  dayClose        RetailFiscalDayClose    @default(WITH_LAST_SHIFT)
  whenUnreachable RetailFiscalUnreachable @default(KEEP_SELLING)
  updatedById     String?
  createdAt       DateTime                @default(now())
  updatedAt       DateTime                @updatedAt

  company   Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  updatedBy User?   @relation("RetailFiscalSettingsUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)
}

model FiscalisationProviderConfig {
  // … existing …
  /// ZIMRA's serial for the device (was only passed through at registration).
  serialNumber   String?
  registeredAt   DateTime?
  registeredById String?
  /// Last FDMS call that succeeded / failed. "Stop selling" reads `lastFailedAt`.
  lastOkAt       DateTime?
  lastFailedAt   DateTime?

  registeredBy User? @relation("FiscalDeviceRegisteredBy", fields: [registeredById], references: [id], onDelete: SetNull)
}
```

#### `20261004131800_retail_posting_settings` (SET-09) · witness `lib/retail/posting-settings-migration.test.ts`

```prisma
enum RetailPostingSchedule {
  END_OF_DAY
  EVERY_SALE
}

enum RetailPostingTrigger {
  SCHEDULE
  BY_HAND
}

/// The accounts a retail posting rule line can ask for by role instead of by code.
enum RetailAccountRole {
  SALES
  VAT_OUTPUT
  COST_OF_SALES
  STOCK
  BREAKAGE
  DEPOSITS_HELD
}

enum PostingRuleLineAccountSource {
  FIXED_ACCOUNT
  TENDER_MAPPING
  ROLE_MAPPING
}

model PostingRuleLine {
  // … existing …
  /// With `accountSource = ROLE_MAPPING`: which of the company's role accounts this line posts to.
  accountRole RetailAccountRole?
}

model RetailAccountRoleMapping {
  companyId String
  role      RetailAccountRole
  accountId String
  updatedAt DateTime          @updatedAt

  company Company        @relation(fields: [companyId], references: [id], onDelete: Cascade)
  account ChartOfAccount @relation(fields: [accountId], references: [id], onDelete: Restrict)

  @@id([companyId, role])
}

model RetailPostingSettings {
  companyId   String                @id
  schedule    RetailPostingSchedule @default(END_OF_DAY)
  updatedById String?
  createdAt   DateTime              @default(now())
  updatedAt   DateTime              @updatedAt

  company   Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  updatedBy User?   @relation("RetailPostingSettingsUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)
}

/// One posting pass: what "Last posted" reads.
model RetailPostingRun {
  id               String               @id @default(uuid())
  companyId        String
  trigger          RetailPostingTrigger
  startedById      String?
  startedAt        DateTime             @default(now())
  finishedAt       DateTime?
  salesPosted      Int                  @default(0)
  refundsPosted    Int                  @default(0)
  deliveriesPosted Int                  @default(0)
  countsPosted     Int                  @default(0)
  otherPosted      Int                  @default(0)
  failed           Int                  @default(0)

  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@index([companyId, startedAt])
}
```

SQL: for each company with `RETAIL_*` posting rules, insert `RetailAccountRoleMapping` rows from its accounts coded 4000 (SALES), 2200
(VAT_OUTPUT), 5000 (COST_OF_SALES), 1200 (STOCK), 5410 (BREAKAGE), 2240 (DEPOSITS_HELD); then set those retail rule lines to
`accountSource = 'ROLE_MAPPING'`, `accountRole = …`, `accountId = NULL`. `lib/accounting/defaults.ts` `RETAIL_POSTING_RULES` and the retail
stock rules change the same way; `ensureAccountingDefaults` / the seed pack create the role mappings. Witness asserts the enum value, the
column, and that no retail rule line still carries a fixed 4000/2200/5000/1200/5410/2240 account.

#### `20261004131900_billing_plan_limits` (SET-10) · witness `lib/platform/billing-plan-limits-migration.test.ts`

```prisma
enum SubscriptionPaymentMethod {
  ECOCASH
  CARD
  BANK_TRANSFER
}

model SubscriptionPlan {
  // … existing …
  /// Paired tills the plan allows. Null = any number.
  maxTills Int?
}

model CompanySubscription {
  // … existing …
  paymentMethod SubscriptionPaymentMethod?
  /// EcoCash number the bill is paid from.
  paymentPhone  String?
  /// "Bills go to".
  billingEmail  String?
}

model Company {
  // … existing …
  /// Set when the owner closes the account; the teardown job removes the data after it.
  teardownAfter DateTime?
}
```

`lib/platform/feature-catalog.ts` tiers gain `includedTills` (START 2, GROW 8, SCALE null) and `ensureTierPlan` writes `maxTills`.

#### `20261004132000_retail_product_import` (SET-11) · witness `lib/retail/product-import-migration.test.ts`

```prisma
enum RetailImportStatus {
  CHECKING
  IMPORTED
  DISCARDED
}

enum RetailImportAction {
  NEW
  UPDATE
}

enum RetailImportProblem {
  NO_NAME
  NO_PRICE
  PRICE_COMMA
  PRICE_NOT_NUMBER
  NEW_CATEGORY
  BARCODE_SHORT
  BARCODE_LONG
  BARCODE_LETTERS
  DUPLICATE_IN_FILE
  LOOKS_LIKE
}

model RetailImport {
  id           String             @id @default(uuid())
  companyId    String
  fileName     String
  rowCount     Int
  status       RetailImportStatus @default(CHECKING)
  /// The default site at upload: where new products go on sale.
  siteId       String
  createdById  String
  createdAt    DateTime           @default(now())
  importedAt   DateTime?
  importedById String?
  createdCount Int?
  updatedCount Int?
  skippedCount Int?

  company Company           @relation(fields: [companyId], references: [id], onDelete: Cascade)
  site    Site              @relation(fields: [siteId], references: [id], onDelete: Restrict)
  rows    RetailImportRow[]

  @@index([companyId, status, createdAt])
}

model RetailImportRow {
  id               String                @id @default(uuid())
  importId         String
  /// The spreadsheet's own row number (header is row 1).
  rowNo            Int
  name             String?
  category         String?
  /// As typed, so "12,60" stays visible until fixed.
  price            String?
  barcode          String?
  cost             String?
  supplier         String?
  packSize         String?
  openingStock     String?
  action           RetailImportAction?
  matchedProductId String?
  problems         RetailImportProblem[] @default([])
  /// Names a problem sentence needs: { category, matchedName, duplicateOfRow }.
  problemArgs      Json?

  import RetailImport @relation(fields: [importId], references: [id], onDelete: Cascade)

  @@unique([importId, rowNo])
}
```

#### `20261004132100_retail_onboarding` (SET-12, also used by SET-13) · witness `lib/retail/onboarding-migration.test.ts`

```prisma
enum WorkspaceProduct {
  CORELITH
  FLARE
  TENDER
}

enum RetailOnboardingStep {
  TYPE
  SHOP
  PRODUCTS
  TILLS
  STAFF
  TEST_SALE
}

model RetailOnboarding {
  companyId            String                 @id
  step                 RetailOnboardingStep   @default(TYPE)
  stepsDone            RetailOnboardingStep[] @default([])
  startedAt            DateTime               @default(now())
  completedAt          DateTime?
  /// The first sale rung after `startedAt`; step 6 reads it.
  testSaleId           String?
  /// Checklist item keys ticked by hand (SET-13).
  checklistTicked      String[]               @default([])
  /// "Hide until tomorrow": the next local midnight.
  checklistHiddenUntil DateTime?
  /// Set the first time every item is ticked; the card never shows again.
  checklistDoneAt      DateTime?
  updatedAt            DateTime               @updatedAt

  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
}
```

### 3.4 Permissions (`lib/retail/permissions.ts`)

`retail.setup` is removed and replaced by resources that match the Roles board. `FINANCE_OFFICER` (Bookkeeper) joins the matrix.

| Resource | Owner `SUPERADMIN` | Manager `MANAGER`, `SHOP_MANAGER` | Cashier | Stock clerk | Bookkeeper `FINANCE_OFFICER` |
|---|---|---|---|---|---|
| `retail.company` | view, update | view | – | – | view |
| `retail.sites` | view, create, update, delete | view, update | – | view | view |
| `retail.tills` | view, create, update, delete | view, create, update, delete | – | – | – |
| `retail.payments` | view, update | view | – | – | view |
| `retail.zig-rate` | view, update | view, update | – | – | view |
| `retail.till-rules` | view, update | view, update | – | – | – |
| `retail.receipts` | view, update | view, update | – | – | – |
| `retail.fiscal` | view, update | view | – | – | view |
| `retail.posting` | view, update | – | – | – | view, update |
| `retail.billing` | view, update | – | – | – | view |
| `retail.sell` (changed) | ALL | ALL | `RUN_A_TILL` + `refund`, `void` (both limited by till rules) | – | – |
| `retail.catalog` `create` (import) | yes | yes | – | – | – |

Stock value on Sites needs `retail.catalog:view-cost`; the column is hidden for roles without it (Stock clerk). `canChangeShopProfile` goes
(the matrix answers it). `till-settings.ts` capability "setup" reads `retail.till-rules:update`.

### 3.5 Audit event types added to `RETAIL_AUDIT_EVENTS`

`RETAIL_COMPANY.CHANGED`, `RETAIL_SITE.CREATED`, `RETAIL_SITE.CHANGED`, `RETAIL_SITE.CLOSED`, `RETAIL_TILL.CREATED`, `RETAIL_TILL.CHANGED`,
`RETAIL_DEVICE.PAIRED`, `RETAIL_DEVICE.REPLACED`, `RETAIL_DEVICE.UNPAIRED`, `RETAIL_TILL.MESSAGED`, `RETAIL_PAYMENTS.CHANGED`,
`RETAIL_ZIG_RATE.SET`, `RETAIL_TILL_RULES.CHANGED`, `RETAIL_DRAWER.OPENED`, `RETAIL_RECEIPTS.CHANGED`, `RETAIL_FISCAL.CHANGED`,
`RETAIL_FISCAL.CONNECTED`, `RETAIL_POSTING.CHANGED`, `RETAIL_POSTING.ACCOUNT_ADDED`, `RETAIL_POSTING.RUN`, `RETAIL_CATEGORY.CREATED`,
`RETAIL_PRODUCTS.IMPORTED`, `RETAIL_PRODUCTS.ADDED_FROM_CATALOGUE`, `RETAIL_STAFF.INVITED`, `RETAIL_ONBOARDING.COMPLETED`; platform:
`PLATFORM_PLAN.CHANGED`, `PLATFORM_ACCOUNT.CLOSED`. Payloads never carry PINs, codes, keys or device secrets.

### 3.6 Starter catalogue data

`lib/retail/starter-catalogue/liquor.ts`: 180 rows `{ key, name, category, soldAs: "Single" | "Case", packOf?: key, packSize?, barcode?,
price: "1.20", ticked: boolean }`, per category: Beer 42, Spirits 61, Wine 38, Ciders and coolers 19, Soft drinks 14, Ice and mixers 6;
137 rows `ticked: true` by default; exported `asOf: "2026-10"` ("Prices are suggestions from Harare shops this month."). It must include the
board's rows in this order at the top of "All": Castle Lager 340ml (Beer, Single, 1.20, ticked), Castle Lager 340ml, case of 24 (Beer, Case,
26.00, ticked), Black Label 340ml (1.20, ticked), Zambezi Lager 375ml (1.30, ticked), Chibuku Scud 1L (1.10, ticked), Johnnie Walker Black
750ml (Spirits, 42.00, ticked), Jameson Irish Whiskey 750ml (27.90, ticked), Two Keys Whisky 750ml (9.75, not ticked), Gordon’s Gin 750ml
(16.40, ticked), Amarula Cream 750ml (18.25, not ticked), Ice 2kg bag (Ice and mixers, 1.50, ticked). General retail has no catalogue yet
(open question): its "From the catalogue" option is hidden.

### 3.7 Seed / demo data — extend `scripts/seed-retail-demo.ts`

Add one function per unit, called from `main()` after staff are created, idempotent by natural key. Dates are relative to the run
("today 07:30"). The tenant is `hurudza-creative` (Harare Bottle Store). People named here must exist (the admin area seeds Kuda Banda and
Rudo Moyo; this area needs Tendai Mhlanga (owner, exists), Tafara Nyathi (manager, exists), Chipo Dube (exists), Kuda Banda).

| Unit | Seed |
|---|---|
| SET-01 | `RetailShopProfile`: LIQUOR, all four switches on, 08:00–22:00 / 10:00–18:00, licence `HRE/BL/2024/0711` expiring 2026-12-31, vatRegistered, whatsapp `+263 77 412 0098`, `updatedById` Tendai Mhlanga, `updatedAt` 2 October. `CompanyBranding`: trading name "Harare Bottle Store", legal "Hurudza Creative (Private) Limited", reg `4471/2019`, VAT `10023881`, BP `200118844`, phone `+263 24 270 5521`, email `hello@hararebottlestore.co.zw`, address "14 Samora Machel Avenue, Harare", no logo. `AccountingSettings`: VAT `10023881`, TIN `2000118844`, base USD, year from January. |
| SET-02 | Rename site `MAIN` "Samora Machel Bottle Store" → code `HRE`, "Harare Main Branch", address "14 Samora Machel Avenue, Harare", phone `+263 24 270 5521`, hours "Mon to Sat 08:00 to 22:00, Sun 10:00 to 18:00", price list Retail, default. Places Shop floor (`SHOP`), Back store (`BACK`), Cold room (`COLD`). New site `BDL` "Borrowdale", address "Borrowdale Village, Harare" (inferred), place Shop floor, price list Retail. Every seed lookup by `code: "MAIN"` changes to `HRE`. Stock values come from the stock area's inventory seed (board: US$41,280.00 and US$12,904.50). |
| SET-03 / SET-04 | Tills: Front till (HRE, CounterMini) paired 2 August 2026 by Tafara Nyathi (canvas says "Rufaro Ndlovu", who is not on the People board — open question), last seen now, version 4.12.0; Back till (HRE, BROWSER "Windows PC", last seen 11:38 today); Handheld 1 (HRE, KORA, last seen yesterday 21:55); Borrowdale till (BDL, CounterMini, last seen 2 hours ago); Cold room till (HRE, expected CounterMini, no device). Device key hashes are random (nobody can use them). Open shifts (with the floor seed): Chipo Dube on Front till, Kuda Banda on Back till since 07:55. Sales stamped with tills so "Last sale" reads Today 11:42 / Today 11:38 / Yesterday 21:50 / Today 09:12. Existing shifts get `registerId`. |
| SET-05 | `RetailPaymentSettings`: all on except InnBucks; manual; rounding 1; merchant `0921 774`; shows as `HARARE BOTTLE`. `CurrencyRate` USD→ZWG **26.80** today 07:30 by Tendai Mhlanga (the seed's `ZWG_RATE` changes from 27.5 to 26.80). |
| SET-06 | `RetailTillRules` defaults (they equal the board) with `updatedById` Tafara Nyathi, `updatedAt` 28 September. |
| SET-07 | `RetailReceiptSettings`: header "HARARE BOTTLE STORE\n14 Samora Machel Ave", footer "Bring the bottles back for your deposit.\nNot for sale to persons under 18.", VAT on, licence on, logo off, 1 copy, WhatsApp; Tendai Mhlanga, 12 September. |
| SET-08 | `FiscalisationProviderConfig` `ZIMRA_FDMS`: device `0441-2209`, serial `HC-FD-88120`, registered 14 March by Tendai Mhlanga, `lastOkAt` now. `FiscalDay` 210–213 closed (29 Sep 22:01, 30 Sep 21:58, 1 Oct 22:11, 2 Oct 22:04 relative to today) with totals US$2,977.40 / 4,102.00 / 3,488.75 / 3,912.20 in `countersJson`; day 214 open since 07:58 today. `RetailFiscalSettings` defaults. |
| SET-09 | `RetailPostingSettings` END_OF_DAY, Tendai Mhlanga, 1 September. Tender mappings and role mappings over the tenant's chart (accounts `1001 Till cash, ZiG` and `2250 Vouchers issued` added to the retail chart where missing). `RetailPostingRun` yesterday 23:00: 412 sales, 6 deliveries, 1 count. |
| SET-10 | Plan GROW (`maxSites 3`, `maxTills 8`) ACTIVE, period ends 1 November, US$49.00; payments 1 Oct US$49.00, 1 Sep US$49.00, 1 Aug US$19.00 (PAID, provider `ecocash`); method ECOCASH `+263 77 412 0098`; bills to `tendai@hararebottlestore.co.zw`. |
| SET-11 | Nothing (imports are made in the preview). Put a demo file at `public/demo/price-list-oct.xlsx` with 214 rows that reproduce the board's counts (196 new, 12 updates, 6 flagged: rows 14, 31, 58, 77, 102, 166 as drawn). |
| SET-12 / 13 | `RetailOnboarding` completed 2 August with every step done. Harare Bottle Store is fully set up on the other boards (fiscal connected, EcoCash code saved, suppliers seeded), so every checklist item is done by data and `checklistDoneAt` is set: **the card does not show on this tenant.** The Guided board ("4 of 7") is the state right after onboarding; it is checked on a fresh Tender signup (SET-12/13 acceptance), and `scripts/seed-retail-demo.ts --fresh-onboarding` (new flag) resets this tenant's `RetailOnboarding` to that state for a demo. |

---

## 4. API

All under `/api/v2/retail` unless stated. JSON in and out; money as decimal strings ("41280.00"); dates ISO. Every response is
`successResponse(...)` / `errorResponse(...)` from `lib/api-response.ts`. Gating registry (`lib/platform/gating/route-registry.ts`): add
`/retail/manage/fiscal` → `accounting.zimra.fiscalisation`, `/retail/manage` → `retail.core`, `/retail/setup` → `retail.core`,
`/api/v2/retail/fiscal` → `accounting.zimra.fiscalisation`; the `/api/v2/retail` catch-all covers the rest.

Shared error shape: `{ error: string, code?: string, details?: unknown }`. Codes used: `PLAN_LIMIT`, `PLAN_TOO_SMALL`, `PRICES_LOCKED`,
`SHIFT_OPEN`, `HAS_STOCK`, `DEFAULT_SITE`, `NOT_A_TILL`, `DEVICE_UNPAIRED`, `BAD_CODE`, `LOCKED`, `FISCAL_OFFLINE`, `FISCAL_DAY_OPEN`.

### 4.1 Company (SET-01)

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| GET | `/company` | `retail.company:view` | – | `CompanyPage` |
| PUT | `/company` | `retail.company:update` | `CompanyInput` | `CompanyPage` |
| POST | `/company/logo` | `retail.company:update` | multipart `file` (png/jpg/svg ≤ 2 MB) | `{ url }` |

```ts
type CompanyPage = {
  businessType: "GENERAL" | "LIQUOR";
  liquor: { ageCheck: boolean; licenceHours: boolean; weekdayHours: string /* "08:00 to 22:00" */; sundayHours: string;
            emptiesAndDeposits: boolean; casesAndSingles: boolean; licenceNumber: string | null; licenceExpiresOn: string | null /* YYYY-MM-DD */ };
  business: { tradingName: string; legalName: string | null; registrationNumber: string | null; vatNumber: string | null;
              taxNumber: string | null; phone: string | null; email: string | null; address: string | null; logoUrl: string | null };
  money: { pricesIn: "USD" | "ZWG"; pricesLocked: boolean; financialYearStartMonth: number /* 1–12 */ };
  lastChanged: { by: string; at: string } | null;
  canChange: boolean;
};
type CompanyInput = Omit<CompanyPage, "lastChanged" | "canChange" | "money"> & { money: { pricesIn: "USD" | "ZWG"; financialYearStartMonth: number } };
```
Validation: hours "HH:MM to HH:MM" (24-hour, open before close); email RFC; phone E.164 after normalising "+263 24 270 5521"; VAT 8 digits;
TIN 10 digits; licence ≤ 40. Errors: 400, 403 (Manager/Bookkeeper on PUT), 409 `PRICES_LOCKED`.

Retail worker (`scripts/retail-worker.ts`, `pnpm worker:retail`, house shape of `scripts/fiscal-worker.ts`): daily at 06:00 Africa/Harare —
licence reminder (SET-01); 07:00 RBZ rate (SET-05, when configured); 23:00 posting runs (SET-09); hourly — message outbox drain (SET-07).

### 4.2 Sites and places (SET-02)

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| GET | `/sites?state=open\|closed\|any&q=` | `retail.sites:view` | – | `{ data: SiteRow[], totals: { count, tills, stockValue } }` |
| GET | `/sites/new-context` | `retail.sites:create` | – | `{ priceLists: PriceListOption[], otherSites: {id,name}[], plan: { name, maxSites, openSites }, suggestedCode }` |
| POST | `/sites` | `retail.sites:create` | `SiteInput` | `{ data: SiteDetail }` 201 |
| GET | `/sites/[id]` | `retail.sites:view` | – | `{ data: SiteDetail }` |
| PATCH | `/sites/[id]` | `retail.sites:update` | `Partial<SiteInput> & { isDefault?: true }` | `{ data: SiteDetail }` |
| POST | `/sites/[id]/close` | `retail.sites:delete` | – | `{ data: SiteDetail }` |

```ts
type SiteRow = { id: string; name: string; code: string; places: string /* "Shop floor, back store, cold room" */;
  tills: number /* paired tills */; priceList: string | null; stockValue: string | null /* null without view-cost */;
  state: "DEFAULT" | "OPEN" | "CLOSED" };
type SiteInput = { name: string; code: string; phone?: string | null; address?: string | null; places: { id?: string; name: string }[];
  priceListId: string; openingHours?: string | null; stock?: "EMPTY" | "MOVE" /* create only */ };
type SiteDetail = SiteRow & { phone: string | null; address: string | null; openingHours: string | null; priceListId: string | null;
  placeList: { id: string; name: string; hasStock: boolean }[]; isDefault: boolean; sub: string /* "Default site · 3 tills · US$41,280.00 in stock" */ };
type PriceListOption = { id: string; name: string; sub: string /* "Default, 214 products" */ };
```
Errors: 409 `PLAN_LIMIT` (create), 409 `DEFAULT_SITE` "Make another site the default first." **(inferred)** (close, or `isDefault: false`),
409 `HAS_STOCK` "{n} products still have stock here. Move them or count them to zero first." **(inferred)** (close), 409 `SHIFT_OPEN`
"Close the open shifts here first." **(inferred)** (close). Close also unpairs the site's devices (`SITE_CLOSED`) and sets `closedAt/closedById`.

### 4.3 Tills and devices — back office (SET-03)

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| GET | `/tills?siteId=&state=&q=` | `retail.tills:view` | – | `{ data: TillRow[], totals: { count } }` |
| POST | `/tills` | `retail.tills:create` | `{ name, siteId?, deviceKind }` | `{ data: TillDetail, code: "482917", expiresAt }` 201 |
| GET | `/tills/[id]` | `retail.tills:view` | – | `{ data: TillDetail }` |
| PATCH | `/tills/[id]` | `retail.tills:update` | `{ name?, siteId?, deviceKind?, priceListId?, hasPrinter?, hasDrawer?, hasScale? }` | `{ data: TillDetail }` |
| DELETE | `/tills/[id]` | `retail.tills:delete` | – | 204 — only a till that never paired and has no shifts or sales (else 409) |
| POST | `/tills/[id]/pairing-code` | `retail.tills:update` | `{ purpose: "PAIR" \| "REPLACE" }` | `{ code, expiresAt }` |
| DELETE | `/tills/[id]/pairing-code` | `retail.tills:update` | – | 204 (expires the live code; Cancel) |
| GET | `/tills/[id]/pairing` | `retail.tills:view` | – | `{ state: "waiting" \| "paired" \| "expired", expiresAt, device?: DeviceSummary }` |
| POST | `/tills/[id]/unpair` | `retail.tills:update` | – | `{ data: TillDetail }` |
| POST | `/tills/messages` | `retail.tills:update` | `{ tillIds: string[], body: string /* 1–280 */ }` | `{ sent: number }` |

```ts
type TillState = "SELLING" | "CLOSED" | "OFFLINE" | "NOT_PAIRED";
type TillRow = { id: string; name: string; site: { id: string; name: string }; device: string /* "CounterMini" | "Kora" | "Browser, Windows PC" | "No device yet" */;
  lastSaleAt: string | null; onItNow: string | null; state: TillState; stateLabel: string /* "Selling" | "Closed" | "Offline 2 hours" | "Not paired" */ };
type DeviceSummary = { id: string; kind: "COUNTER_MINI" | "KORA" | "BROWSER"; label: string /* "Browser, Windows PC" */; appVersion: string | null;
  lastSeenAt: string | null; pairedAt: string; pairedBy: string };
type TillDetail = TillRow & { code: string; deviceKind: string; priceListId: string | null; sitePriceList: string | null;
  hasPrinter: boolean; hasDrawer: boolean; hasScale: boolean; current: DeviceSummary | null;
  openShift: { id: string; cashier: string; openedAt: string } | null; sub: string /* "Harare Main Branch · CounterMini · selling now" */;
  siteCount: number };
```
State rule (pure `lib/retail/tills.ts#tillState`, unit-tested), first match wins: no active device → NOT_PAIRED; `lastSeenAt` older than
5 minutes **and** (a shift is open on the till **or** the device is a CounterMini, which stays on all day) → OFFLINE with "Offline {n minutes|n hours|n days}"
(rounded down, "1 hour" singular); open shift → SELLING; else CLOSED. So a Kora or a browser that is simply switched off with no shift reads
"Closed" (Handheld 1 on the board), while a CounterMini that has not called in reads "Offline 2 hours" (Borrowdale till).
`PATCH siteId` with an open shift → 409 `SHIFT_OPEN`. `POST /tills` or `pairing-code` beyond `maxTills` paired → 409 `PLAN_LIMIT`.
`unpair` with an open shift → 409 `SHIFT_OPEN`.

### 4.4 Devices — POS host (SET-04)

Tenant from the host (`resolveTenantFromHost`), not from a session, for `pair`. All others require the device cookie.

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| POST | `/devices/pair` | none (throttled) | `{ code: "482917" }` | sets `tender_device`; `{ till: {id,name}, site: {id,name} }` |
| GET | `/devices/me` | device | – | `TillContext` |
| POST | `/devices/heartbeat` | device | `{ appVersion? }` | `{ messages: { id, body, from, at }[] }` |
| POST | `/devices/messages/[id]/dismiss` | device + session | – | 204 |
| GET | `/devices/people` | device | – | `{ data: { userId, label: "Chipo D." }[] }` |
| NextAuth | `signIn("till-pin", { userId, pin })` | device | – | session with `authMethod: "till-pin"`, `deviceId`, `registerId` |
| POST | `/pos/sales/[id]/printed` | device + session | – | 204 (sets `printedAt` once) |
| POST | `/pos/drawer/open` | device + session | `{ managerPin?: { userId, pin } }` | 204 |

```ts
type TillContext = {
  till: { id: string; name: string; hasPrinter: boolean; hasDrawer: boolean; hasScale: boolean };
  site: { id: string; name: string; places: number };
  device: { id: string; kind: string; label: string; pairedAt: string; pairedBy: string };
  shop: ShopProfile;                         // existing shape from lib/retail/shop-profile-rules.ts
  tenders: { tender: string; currency: "USD" | "ZWG" | null; label: string }[];   // in board order, only those on
  zig: { rate: string; setAt: string; rounding: string } | null;
  rules: RetailTillRulesWire;               // §4.6
  receipt: ReceiptWire;                     // §4.7
  fiscal: { deviceId: string | null; dayNo: number | null; whenUnreachable: "KEEP_SELLING" | "STOP_SELLING" };
  priceListId: string;                      // till's own, else the site's, else the default list
};
```
`pair` errors: 400 `BAD_CODE` `{ triesLeft }`, 429 `LOCKED` `{ lockedUntil }`, 409 `PLAN_LIMIT`. Device errors on any POS route: 409
`NOT_A_TILL`, 401 `DEVICE_UNPAIRED { by, at, reason, tillName, deviceLabel }`.

Changed existing routes (SET-04): `pos/context` is replaced by `devices/me` (delete it); `pos/shifts` POST drops `registerId`/`siteId`
from its schema and uses the device's till; `pos/sales`, `refund`, `void`, `held-carts`, `pos/shifts/[id]/*`, `current-shift`, `sync`
call `requirePosDevice`; `pos/sync` applies the unpaired-device rule; `shifts/context` (back office) returns tills from `RetailRegister`
and the default site from `RetailShopProfile`.

### 4.5 Payments (SET-05)

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| GET | `/payments` | `retail.payments:view` | – | `PaymentsPage` |
| PUT | `/payments` | `retail.payments:update` (all fields) or `retail.zig-rate:update` (rate fields only) | `PaymentsInput` | `PaymentsPage` |

```ts
type PaymentsPage = {
  tenders: { cashUsd: boolean; cashZig: boolean; card: boolean; ecocash: boolean; innbucks: boolean; bankTransfer: boolean; onAccount: boolean; vouchers: boolean };
  zig: { rate: string /* "26.80" */; source: "MANUAL" | "RBZ_DAILY"; rbzAvailable: boolean; rounding: "0.50" | "1" | "5";
         setAt: string | null; setBy: string | null };
  ecocash: { merchantCode: string | null; displayName: string | null };
  lastChanged: { by: string; at: string; what: "rate" | "settings" } | null;
  can: { change: boolean; changeRate: boolean };
};
type PaymentsInput = { tenders?: PaymentsPage["tenders"]; zig?: { rate?: string; source?: "MANUAL" | "RBZ_DAILY"; rounding?: "0.50" | "1" | "5" };
  ecocash?: { merchantCode?: string | null; displayName?: string | null } };
```
Errors: 400 "Take at least one tender." **(inferred)**; 403 for a Manager changing anything but `zig.rate`/`zig.source`.

### 4.6 Till rules (SET-06)

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| GET | `/till-rules` | `retail.till-rules:view` | – | `TillRulesPage` |
| PUT | `/till-rules` | `retail.till-rules:update` | `RetailTillRulesWire` | `TillRulesPage` |

```ts
type RetailTillRulesWire = { refundPinOver: string; voidPin: "ALWAYS" | "AFTER_5_MINUTES" | "NEVER"; refundReasons: string[]; voidReasons: string[];
  splitTender: boolean; referenceRequired: boolean; maxCashierDiscountPercent: string; drawerOpenWithoutSale: boolean;
  cashDropPromptOver: string; offlineHours: number };
type TillRulesPage = RetailTillRulesWire & { lastChanged: { by: string; at: string } | null };
```
Delete `setup/pos-policy` and `setup/tender-policy`. `pos/sales`, `pos/sales/[id]/refund`, `pos/sales/[id]/void` accept
`managerPin?: { userId: string; pin: string }` instead of `managerOverride` (password); errors 403 `{ code: "MANAGER_PIN_NEEDED", reason }`
when the rule asks for one and none (or a wrong one) was given, so the till can open its PIN dialog.

### 4.7 Receipts (SET-07)

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| GET | `/receipts` | `retail.receipts:view` | – | `ReceiptsPage` |
| PUT | `/receipts` | `retail.receipts:update` | `ReceiptInput` | `ReceiptsPage` |

```ts
type ReceiptInput = { header: string; footer: string; showVatNumber: boolean; showLicenceNumber: boolean; printLogo: boolean;
  copies: 1 | 2; alsoSendBy: "NOTHING" | "WHATSAPP" | "EMAIL" };
type ReceiptWire = ReceiptInput & { vatNumber: string | null; licenceNumber: string | null; logoUrl: string | null; liquor: boolean };
type ReceiptsPage = ReceiptWire & {
  preview: { lines: { label: string /* "Castle 340ml x6" */; amount: string }[]; total: string; currency: "US$" | "ZiG";
             tenders: { label: string; amount: string }[]; fiscal: string | null /* "FDMS 0441-2209 · Day 214" */ };
  lastChanged: { by: string; at: string } | null };
```
Preview lines come from the shop's latest posted sale with at most four lines (deposits as "Deposit x{n}"); with no sales, from the first
two catalogue products × 1.

### 4.8 Fiscal (SET-08)

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| GET | `/fiscal` | `retail.fiscal:view` | – | `FiscalPage` |
| PUT | `/fiscal` | `retail.fiscal:update` | `{ deviceId, serialNumber, taxpayerNumber, vatNumber, dayClose, whenUnreachable }` | `FiscalPage` |
| POST | `/fiscal/connect` | `retail.fiscal:update` | `{ activationKey }` | `FiscalPage` (502 with ZIMRA's message on failure) |
| POST | `/fiscal/test` | `retail.fiscal:update` | – | `{ ok: boolean, message: string, ms: number }` |
| POST | `/fiscal/days/[id]/close` | `retail.fiscal:update` | – | `FiscalPage` |

```ts
type FiscalPage = {
  connection: { state: "CONNECTED" | "NOT_CONNECTED" | "UNREACHABLE"; text: string /* "Connected to ZIMRA. Day 214 open since 07:58." */ };
  device: { deviceId: string | null; serialNumber: string | null; taxpayerNumber: string | null; vatNumber: string | null; registered: boolean };
  settings: { dayClose: "WITH_LAST_SHIFT" | "BY_HAND"; whenUnreachable: "KEEP_SELLING" | "STOP_SELLING" };
  openDay: { id: string; no: number; openedAt: string } | null;
  days: { no: number; label: string /* "Today, open" | "2 Oct, closed 22:04" */; total: string }[];  // newest 5
  lastChanged: { by: string; at: string; what: "registered" | "settings" } | null;
};
```
Connection texts: CONNECTED with open day "Connected to ZIMRA. Day {n} open since {HH:MM}."; CONNECTED no open day "Connected to ZIMRA. No
fiscal day open." **(inferred)**; NOT_CONNECTED "Not connected yet." **(inferred)**; UNREACHABLE "ZIMRA has not answered since {HH:MM}.
Receipts are signed and wait." **(inferred)**. 409 `FISCAL_DAY_OPEN` when changing the device ID during an open day.

### 4.9 Posting (SET-09)

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| GET | `/posting` | `retail.posting:view` | – | `PostingPage` |
| PUT | `/posting` | `retail.posting:update` | `{ tenders?: {tender, accountId}[], roles?: {role, accountId}[], schedule? }` | `PostingPage` |
| POST | `/posting/accounts` | `retail.posting:update` | `{ codeAndName: "1012 Cash on hand, rand", type: "ASSET" \| "LIABILITY" \| "INCOME" \| "EXPENSE" }` | `{ data: AccountOption }` 201 |
| POST | `/posting/run` | `retail.posting:update` | `{ runId?: string }` | `{ runId, done, busy, posted, failed, waiting, run: RunSummary & { toast } }` — one slice (see below) |
| POST | `/posting/setup` | `retail.posting:update` | `{ mode: "DRY_RUN" \| "APPLY", fxRates?: { ZWG?: string, ZAR?: string } }` | seed-pack preview/result (existing shape) |

```ts
type AccountOption = { id: string; label: string /* "1010 Cash on hand, US$" */; type: "Asset" | "Liability" | "Income" | "Expense" };
type PostingPage = {
  accounts: AccountOption[];
  tenders: { tender: "CASH_USD" | "CASH_ZWG" | "CARD" | "ECOCASH" | "INNBUCKS" | "TRANSFER" | "ON_ACCOUNT" | "VOUCHER"; label: string; accountId: string | null }[];
  roles: { role: RetailAccountRole; label: string; accountId: string | null }[];   // DEPOSITS_HELD only for a liquor store with empties on
  schedule: "END_OF_DAY" | "EVERY_SALE";
  lastRun: RunSummary | null;
  checks: { ok: boolean; text: string }[];
  lastChanged: { by: string; at: string } | null;
};
type RunSummary = { at: string; text: string /* "2 October, 23:00. 412 sales, 6 deliveries, 1 count." */ };
```
Errors: 400 wrong account type or not postable; 409 duplicate code on quick add.

`/posting/run` posts in slices of about six seconds, so a night's sales never outlast a request. The first call (no `runId`) starts a run or
joins the one already going: a company has one `RetailPostingRun` at a time (started under a per-company advisory lock), and a run that has
not counted an event for two minutes (`RetailPostingRun.updatedAt`) was cut off and is closed where it stopped. The page calls again with
`runId` while `done` is false. One slice posts at a time: it holds the run until `sliceUntil`; a call meanwhile posts nothing and answers
`busy: true`, and the page asks again a second later. A run takes every retail event `PENDING` or `FAILED` captured before it began, so what
could not post is tried again by the next Post now or 23:00 run (posting is idempotent per source). The 23:00 job drives the same slices
(migration `20261006004900_retail_posting_run_slices`).

### 4.10 Billing (SET-10)

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| GET | `/billing` | `retail.billing:view` | – | `BillingPage` |
| PUT | `/billing` | `retail.billing:update` | `{ planCode?, paymentMethod?, paymentPhone?, billingEmail? }` | `BillingPage` |
| POST | `/billing/close-account` | `retail.billing:update` | `{ confirm: "<shop name>" }` | 204, session ended |

```ts
type BillingPage = {
  plans: { code: "START" | "GROW" | "SCALE"; name: string; text: string /* "Up to three shops, eight tills. US$49 a month." */; current: boolean }[];
  using: { shops: string /* "2 of 3" */; tills: string /* "4 of 8" */; people: string /* "9" */; nextBill: string /* "1 November, US$49.00" */ };
  paying: { method: "ECOCASH" | "CARD" | "BANK_TRANSFER" | null; phone: string | null; billingEmail: string | null };
  bills: { text: string /* "1 October, US$49.00, paid" */ }[];  // newest 3
  last: string | null;   // "Paid 1 October by EcoCash."
};
```
Plan text is built from the plan: sites ("One shop" / "Up to three shops" / "Any number of shops"), tills ("two tills" / "eight tills" /
omitted when null), price ("US${n} a month."). Errors: 409 `PLAN_TOO_SMALL`; 400 confirm text mismatch.

### 4.11 Import (SET-11)

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| GET | `/catalog/import/template` | `retail.catalog:create` | – | `.xlsx` download `tender-products-template.xlsx` |
| POST | `/catalog/import` | `retail.catalog:create` | multipart `file` | `{ id }` 201 |
| GET | `/catalog/import/[id]?tab=fix\|new\|update\|all` | `retail.catalog:create` | – | `ImportPage` |
| PATCH | `/catalog/import/[id]/rows/[rowId]` | `retail.catalog:create` | `{ name?, category?, price?, barcode? }` | `{ row: ImportRow, counts }` |
| POST | `/catalog/import/[id]/fix` | `retail.catalog:create` | `{ rowId, fix: "CREATE_CATEGORY" \| "UPDATE_MATCH" }` | `{ rows: ImportRow[] /* every row it changed */, counts }` |
| POST | `/catalog/import/[id]/commit` | `retail.catalog:create` | – | `{ created, updated, skipped }` |
| DELETE | `/catalog/import/[id]` | `retail.catalog:create` | – | 204 |

```ts
type ImportRow = { id: string; rowNo: number; name: string; category: string; price: string; barcode: string;
  problem: { field: "name" | "category" | "price" | "barcode"; text: string; fix: "CREATE_CATEGORY" | "UPDATE_MATCH" | null; fixLabel: string | null } | null;
  action: "NEW" | "UPDATE" | null; matchedName: string | null };
type ImportPage = { fileName: string; rowCount: number; status: string; siteName: string;
  counts: { fix: number; new: number; update: number; all: number }; rows: ImportRow[] };
```
Errors: 400 "Name and price columns are needed." **(inferred)** when headers are missing; 400 file too large / too many rows; 409 when the
import is not `CHECKING`.

### 4.12 Onboarding and checklist (SET-12, SET-13)

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| GET | `/setup` | Owner | – | `{ step, stepsDone, shopName, businessType, completedAt }` |
| PUT | `/setup/type` | `retail.company:update` | `{ businessType }` | `{ step }` |
| GET/PUT | `/setup/shop` | `retail.company:update` | `{ shopName, phone?, whatsapp?, address?, take: "USD" \| "USD_ZWG" \| "ZWG", vatRegistered, licence?: { number?, expiresOn?, weekdayHours, sundayHours } }` | `{ step }` |
| GET | `/setup/catalogue?category=` | `retail.catalog:create` | – | `{ categories: {name, count}[], rows: { key, name, category, soldAs, price, ticked, added }[], asOf }` |
| POST | `/setup/products` | `retail.catalog:create` | `{ lines?: {key, price}[], manual?: {name, category, price}[] }` | `{ added: number }` |
| PUT | `/setup/tills` | `retail.payments:update` | `{ tenders: { cashUsd, cashZig, ecocash, card }, rate?: string }` | `{ step }` |
| POST | `/setup/staff` | Owner | `{ people: { name, phone, role: "MANAGER" \| "CASHIER", pin }[] }` | `{ results: { name, sent: boolean, error?: string }[] }` |
| GET | `/setup/test-sale` | Owner | – | `{ sale: { at, total } \| null, printed: boolean, voided: boolean, product: string, till: string }` |
| POST | `/setup/step` | Owner | `{ step }` (Back / step links, "later" links) | `{ step }` |
| POST | `/setup/complete` | Owner | – | 204 |
| GET | `/setup/checklist` | Owner | – | `{ show: boolean, done: number, total: number, items: ChecklistItem[] }` |
| POST | `/setup/checklist/hide` | Owner | – | 204 (until next local midnight) |
| POST | `/setup/checklist/items/[key]` | Owner | `{ ticked: boolean }` | `{ items }` (hand ticks only; data-done items cannot be unticked) |

```ts
type ChecklistItem = { key: "type" | "products" | "till" | "staff" | "suppliers" | "fiscal" | "ecocash"; label: string; why: string;
  done: boolean; byHand: boolean; href: string; cta: string };
```
Checklist rules (pure `lib/retail/checklist.ts`, unit-tested): type — profile row exists → why = "Liquor store"/"General retail"; products —
≥1 active product → "{n} products, all on sale"; till — ≥1 paired device → "{till}, {device}"; staff — ≥1 other active user with a till PIN
→ "{n} people with PINs"; suppliers — ≥1 supplier → why stays "So low stock turns into an order in a tap."; fiscal — device registered → stays
"ZIMRA needs every receipt signed."; ecocash — present only while EcoCash is on; done when a merchant code is saved. `show` = owner and not
`checklistDoneAt` and not hidden; when every item is done the server sets `checklistDoneAt` and `show` becomes false for good.

---

## 5. UI per page

Field notation: **type** (FND-SHEET field type) · *width* (`full` or `half`) · default · validation · hint (exact). Every field's value comes
from the API in §4; "default" is what a new shop has. Read-only fields (`read`) render in the grey band with bold text; `tone` colours it.

States common to every page here unless a page says otherwise: **loading** — FND-SETTINGS / FND-SHEET skeleton (section titles and
field bars); **load error** — FND inline error with the server sentence and "Try again"; **save error** — field errors under their fields
(zod `details` mapped by path), anything else as a destructive toast with the server sentence, the form keeps its values; **no permission to
view** — the panel entry is hidden and the route renders FND-SHELL's access-denied state; **mobile** — FND-SETTINGS stacks the aside under
the form and sticks the save bar; sheets go full screen.

### 5.1 Onboarding frame (SET-12) — used by OnbType … OnbDone

Not FND-SHELL. Full-page two columns at 1440: left aside 360px on `--ground`, main column (content max 720px, left 72px), footer bar
across the main column with a top rule.

- Aside, top to bottom: brand mark "T" + "Tender"; "Setting up" over the shop name (`Company.name`, bold); ordered list "Setup steps" of six
  links: 1 "Shop type" "30 seconds"; 2 "Your shop" "2 minutes"; 3 "Products and prices" "6 minutes"; 4 "Tills and payments" "2 minutes";
  5 "Staff and PINs" "2 minutes"; 6 "A test sale" "1 minute". Current step: white card with shadow, number in a filled circle,
  `aria-current="step"`. Done steps: filled check circle, sub "Done". Future steps: hollow number circle. Every step is a link (nothing blocks).
  Bottom: "**Everything saves as you go.** Close this and pick up where you left off." and "Stuck? WhatsApp us on +263 78 600 1100." (number
  from `NEXT_PUBLIC_SUPPORT_WHATSAPP`, mono).
- Main: "Step {n} of 6" (small muted), H1, lede paragraph, body.
- Footer: left "Back" (outlined button, absent on step 1); right optional text link (underlined) and primary orange button with chevron.
- Saving: Continue saves the step through its endpoint and navigates; a failed save keeps the page and shows the error as a toast. Fields
  also persist on blur (debounced 600 ms) so "Everything saves as you go" is true.
- Loading: skeleton of the H1 and three field bars. Error loading: "This step would not load." + "Try again" **(inferred)**.
- Mobile (< 768): aside collapses to a top bar "Step 2 of 6 · Your shop" with a disclosure listing the steps; footer sticks to the bottom;
  two-column field rows stack.
- Access: Owner only; others get `/retail`. `/retail/setup` redirects to `/retail/setup/{current step}`; after `completedAt` it redirects
  to `/retail`.

#### OnbType — `/retail/setup/type` · board `OnbType.png`
- H1 "What kind of shop is it?" · lede "We set up categories, a starter catalogue and the right features from this. You can change it later."
- **cards** 2 columns, no label: "General retail" — "Groceries, hardware, clothing: anything sold by the unit."; "Liquor store" — "Beer, wine
  and spirits. Age checks, licence hours, empties and cases."; "Pharmacy" badge "Soon" — "Prescriptions, batches and expiry dates."
  (disabled, 60% opacity); "Restaurant and bar" badge "Soon" — "Tables, tabs and the kitchen." (disabled). Default: the profile's type,
  none selected for a new shop **(Continue disabled until one is picked)**.
- When Liquor store is selected, panel on `--ground`: H2 "A liquor store starts with", bullets: "Categories for beer, spirits, wine, ciders,
  soft drinks, snacks, and ice and mixers, each with VAT and an 18+ check set." / "A catalogue of 180 Zimbabwean brands to tick from, with
  suggested prices." / "Age checks, licence hours, empties and deposits, and cases and singles. Each can be turned off later in Management ›
  Company."
- Footer: primary "Continue".

#### OnbShop — `/retail/setup/shop` · board `OnbShop.png`
- H1 "Tell us about the shop" · lede "This goes on receipts and orders. Only the name is needed now."
- Fields: "Shop name" text full, required, default the signup business name · "Phone" text half mono · "WhatsApp" text half mono `opt`,
  default the signup WhatsApp · "Where it is" area 2 rows full, hint "More than one shop? Add the others later in Management › Sites." ·
  "You take" seg half: "US$ only" / "US$ and ZiG" / "ZiG only", default "US$ and ZiG" · "Registered for VAT" seg half "Yes" / "No",
  default "Yes".
- Section "Your licence" (liquor only): "Liquor licence number" text half mono `opt` · "Licence expires" date half `opt`, shown "31 December
  2026" · "Licence hours, Monday to Saturday" text half mono default "08:00 to 22:00" · "Sundays" text half mono default "10:00 to 18:00".
  Validation: "Use a 24-hour time such as 08:00" (existing message) on a bad hour.
- Footer: "Back", primary "Continue".

#### OnbProducts — `/retail/setup/products` · board `OnbProducts.png`
- H1 "What do you sell?" · lede "Tick what you stock and check the price. Cost, barcode and stock can come later; nothing here stops you selling."
- Radiogroup "How to add products", three cards: "From the catalogue" "Tick what you stock. Recommended." (default) / "Import a spreadsheet"
  "Download our template, fill it, upload." (→ `/retail/catalog/import?from=setup`) / "One by one" "Name, category, price. Nothing else needed."
- Catalogue: category chips with counts "All 180", "Beer 42", "Spirits 61", "Wine 38", "Ciders and coolers 19", "Soft drinks 14",
  "Ice and mixers 6" (selected chip filled). Table "Starter catalogue": checkbox column (header "Tick them all" toggles the visible rows),
  "Product", "Category", "Sold as" (Single/Case), "Your price" (right-aligned mono input, decimal). Unticked rows on `--ground`. Rows already
  in Products: ticked, disabled. Table footer: "**{n}** ticked, on sale as soon as you finish" · right "Prices are suggestions from Harare shops
  this month." Price validation: > 0, two decimals, comma refused ("Use a point: 12.60" **(inferred)**).
- One by one (inferred, not drawn): FND-SHEET `lines`-style table with columns "Name", "Category" (auto with add), "Price", add row
  "Add a product" — same footer.
- Footer: "Back"; link "I will add them later"; primary "Add {n} products" (n = ticked and not yet added; disabled at 0).
- Done: toast "{n} products added." **(inferred)**, go to step 4.

#### OnbTills — `/retail/setup/tills` · board `OnbTills.png`
- H1 "Pair your till and choose how people pay" · lede "Open Tender on the till, choose Pair, and type the code. Do it now or later."
- Section "The till": "Pairing code" read mono "4 8 2 – 9 1 7", hint "Works for 10 minutes. A new code appears after that." · "Till" read:
  waiting "Not paired yet" tone warn **(inferred, same as TillNew)** → paired "Paired: CounterMini, “Front till”" tone ok.
- Section "How people pay": toggles "Cash, US dollars" (on), "Cash, ZiG" (on), "EcoCash" (on, hint "Add your merchant code later in
  Management › Payments."), "Card" (off). Defaults from step 2's "You take". "Today’s rate: US$1 is" money half with prefix "ZiG", default
  the latest rate or empty; required when Cash, ZiG is on; shown only when Cash, ZiG is on.
- Footer: "Back"; link "Pair it later"; primary "Continue".

#### OnbStaff — `/retail/setup/staff` · board `OnbStaff.png`
- H1 "Who works the till?" · lede "Add the people who sell and the people who approve. You are the owner; you can do everything."
- Table "Staff": headers "Name", "Phone", "Role", "Till PIN". Row: Name text, Phone text mono, Role seg "Manager" / "Cashier" (default
  Cashier), Till PIN mono spaced digits "4 4 1 9" (generated with `crypto.getRandomValues`, not weak). Starts with one empty row. "+ Add a
  person" (orange text button) adds a row. Rows with an empty name are ignored. Inline errors under a field: "Add a phone number." /
  "That is not a Zimbabwean mobile number." / "Someone already has that number." **(inferred)**.
- Info panel: "**Each person gets their PIN on WhatsApp.** Cashiers only see the till. Managers also see this admin, except money settings and
  the plan, which stay with you as the owner."
- Footer: "Back"; link "Just me for now"; primary "Send their PINs" (disabled with no complete row).
- Done: toast "PINs sent to {n} people." or, per failure, "{name}’s message did not send. Give them their PIN yourself." **(inferred)**; step 6.

#### OnbDone — `/retail/setup/test-sale` · board `OnbDone.png`
- H1 "Ring one up, then void it" · lede "This checks the till, the printer and the fiscal device in one go. Voided sales do not count."
- Checklist (bordered list, three rows, status circle: green check / dashed empty): "Ring up a {product} on the {till, lower case}" — done
  "Done at {HH:MM}, US${total}" / waiting "Waiting for the till…"; "Print the receipt" — done "Printed, with your licence number" /
  waiting "Waiting for the till…"; "Void it" — done "Voided at {HH:MM}" **(inferred)** / waiting "Waiting for the till…".
  Polls every 3 s.
- H2 "After that, when you have a minute", three link cards: "Add your suppliers" "So orders are one tap from low stock." (→ buying
  SupplierNew sheet); "Set reorder levels" "Tender tells you what to buy." (→ stock On hand); "Check the overview tomorrow" "Yesterday’s
  takings, against last week." (→ `/retail`). Note under: "These stay on your overview until they are done."
- Footer: "Back"; primary "Open the overview" (→ `POST /setup/complete` → `/retail`).

### 5.2 Finish setting up card and empty-list guide (SET-13) · board `Guided.png`

Card at the top of the overview's main column (FND-DASH slot "above everything"), white, radius 12, border. Owner only, while `show`.
- Head: H2 "Finish setting up"; progress bar (ok colour, width = done/total); "{done} of {total}"; right text button "Hide until tomorrow".
- List rows: status button (circle; done = filled ok with check; `aria-pressed`) · label (done → muted + line-through) and why (muted) ·
  right outlined button for open items with the item's cta. Items and ctas: "Pick the shop type" / "Change" → `/retail/manage/company`;
  "Add your products" / "Open" → Products; "Pair a till" / "Open" → `/retail/manage/tills`; "Invite your staff" / "Open" → People;
  "Add your suppliers" / "Add a supplier" → buying SupplierNew; "Connect the fiscal device" / "Connect" → `/retail/manage/fiscal`;
  "Add your EcoCash merchant code" / "Add it" → `/retail/manage/payments`. Clicking an open item's circle ticks it by hand; clicking a
  hand-ticked one unticks it; data-done circles do nothing.
- Footer text: "This card sits at the top of the overview until everything is ticked, then it goes for good. Nothing on it stops you selling."
- Loading: card skeleton with seven rows. Error: the card is omitted (never blocks the overview).
- Mobile: full width; cta buttons wrap under the text.

Empty-list guide (pattern, FND-LIST empty state with three numbered steps): H2 question, lede, ordered list of three bold sentences each
followed by a muted clause, primary + secondary buttons. The board's example is the buying area's Suppliers list: "Who do you buy from?" /
"Add a supplier once, and ordering becomes a tap from anything running low." / 1 "**Add them with a name and a WhatsApp number.** Terms and
bank details can wait." 2 "**Link the products you buy from them.** Or let it happen on their first delivery." 3 "**Order from low
stock.** Tender suggests the lines; you send them on WhatsApp." / "Add your first supplier" + "Import a spreadsheet". The frame label
("Suppliers · Empty, so the guide shows") and the footnote under it are canvas annotation and are **not** rendered. This area adds no guide
of its own: Sites and Tills are never empty (provisioning creates one of each).

### 5.3 Company — `/retail/manage/company` (SET-01) · board `CompanySettings.png`

FND-SETTINGS. Header: title "Company"; header button "Activity" (outlined) → `/retail/manage/activity?subject=company`.
Read-only for Manager and Bookkeeper: every control disabled, no save bar, footer line still shows.

Sections and fields:
1. **Business type** — cards 2 columns, no label, as OnbType (Pharmacy and Restaurant and bar "Soon", disabled). Hint under: "It sets the
   categories and starter catalogue you begin with, and the features below. Products, prices and sales are never changed by switching."
2. **Liquor store features** (only while Liquor store is selected; values kept when hidden):
   toggle "Age check at the till" — "The till asks the cashier to check ID before it sells anything in a category marked 18+."; toggle
   "Licence trading hours" — "The till stops selling alcohol outside your licence hours. Soft drinks and snacks still sell."; text half mono
   "Mondays to Saturdays" "08:00 to 22:00"; text half mono "Sundays and public holidays" "10:00 to 18:00" (both disabled while Licence
   trading hours is off **(inferred)**); toggle "Empties and deposits" — "Charge a deposit on returnable bottles and crates, refund it when
   they come back, and claim it from the supplier."; toggle "Cases and singles" — "Sell a whole case or break it into singles. Stock is
   counted in singles."; text half mono "Liquor licence number"; date half "Licence expires" (shown "31 December 2026"), hint "You are
   reminded 60 days before."
3. **The business** — text "Trading name" (required); text "Legal name"; text half mono "Registration number"; text half mono "VAT number";
   text half mono "Tax number (BP)"; text half mono "Phone"; text "Email"; area 2 rows "Address"; photo "Logo" ("Add your logo" / "Drop it
   here, or take one on a phone"; with a logo: the image, "Change" and "Remove" **(inferred)**), hint "On receipts, orders and statements."
4. **Money** — seg half "Prices in" "US$" / "ZiG" (disabled with hint "Prices stay in US$ because sales are recorded in it." **(inferred)**
   once locked); select-as-text half "Financial year starts" with options "1 January" … "1 December".

Aside: "What the business type changes" bullets "The categories you start with, and whether each needs an age check." / "The starter
catalogue offered when you add products." / "The features on this page, each of which you can turn off." / "Nothing you have already sold,
bought or priced." · "Who can change this" "Owners only. Every change shows in Activity with who made it." · "More shop types" "Pharmacy and
restaurant and bar are on the way. Tell us what you run and we will tell you when it is ready."

Save bar: dirty "{n} changes not saved" + "Discard" + "Save changes"; clean "Last changed by Tendai Mhlanga, 2 October." (→ "Saved just now."
right after saving). Done toast none (the bar says it). Errors: field errors under fields; 409 as toast.

### 5.4 Sites — `/retail/manage/sites` (SET-02) · board `SitesList.png`

FND-LIST. Panel nav: Management, "Sites" active.
- Tabs: none (the board has none).
- Header: title "Sites"; primary "Add a site" (Owner only; hidden for others) → `/retail/manage/sites/new`.
- Toolbar: search "Name or code"; filter chip "State" options "Open" (default), "Closed", "Any"; no "Filters" badge; count; sort "Name A–Z"
  (also "Name Z–A", "Stock value, highest first"); Group (None, State); Columns; Export (`.xlsx`, `.csv`, `.pdf` of "The {n} sites the filters show").
- Columns (grid `minmax(190px,1.4fr) 90px minmax(160px,1.2fr) 70px 140px 130px 120px`, min width 1040):
  "Site" link (bold) · "Code" mono · "Places inside it" text ("Shop floor, back store, cold room": first name as written, the rest lower-case
  first letter, joined ", ") · "Tills" num right (paired tills) · "Price list" text · "Stock value" money right (hidden without view-cost) ·
  "State" badge: "Default" info / "Open" hollow / "Closed" neutral **(inferred tone)**.
- Totals row: Σ "{count}" mono · "{sum tills}" · "{sum stock value}".
- Row link: opens SiteEdit `/retail/manage/sites/[id]`.
- Bulk (selection toolbar): "Export" (+ standard "Export {n}").
- Row ⋯ menu **(inferred, mirrors the sheet)**: "Open", "Make default" (not default, Owner/Manager), "Close this site" (not default, Owner).
- Empty: never in practice; FND-LIST default. No matches: FND-LIST "No sites match." Loading/error: FND-LIST.
- Mobile: cards — name + state badge; "{code} · {places}"; "{tills} tills · {stock value}".

#### SiteNew sheet — `/retail/manage/sites/new` · board `SiteNew.png`
Title "Add a site" · sub "Management › Sites".
1. (no title) — "Name" text full, required, unique among open sites ("There is already a site called {name}." **(inferred)**) ·
   "Short code" text half mono, required 2–6 A–Z0–9 (upper-cased as typed), default suggestion (first three letters), hint "On receipts and
   transfers." · "Phone" text half mono `opt` · "Address" area 2 rows.
2. **Where stock sits** — tags "Places inside it", default ["Shop floor"], placeholder "Back store, cold room… then Enter", hint "Leave it as
   one place unless you move stock between rooms. A site with one place never asks which."
3. **Selling there** — auto "Price list" (options "Retail" "Default, 214 products", "Wholesale" "96 products"; quick add "New price list"
   with fields "Name" and "Start from" (default the default list)); default the default list · seg "Stock" "Start empty" / "Move some from
   {default site}" (second option absent when no other open site), default "Start empty", hint "Moving stock makes a transfer for the other
   site to receive." · text "Open" (e.g. "Mon to Sat 08:00 to 21:00, Sun 10:00 to 17:00"), optional.
Footer: note "Then pair its tills. Your {plan} plan has room for {one|two|…} more site{s}." (no room: "Your {plan} plan has no room for another
site." **(inferred)**, primary disabled, note links "Plan and billing"); secondary "Cancel"; primary "Add site".
Done toast: "{name} added. Pair its tills next." with action "Pair a till" **(inferred)**. If Stock = Move: the TransferNew sheet opens next.

#### SiteEdit sheet — `/retail/manage/sites/[id]` · board `SiteEdit.png`
Title "{site name}" · sub "Default site · {n} tills · US${stock value} in stock" (non-default: "{n} tills · US${value} in stock"; without
view-cost the money part is dropped).
1. "Name" text · "Short code" text half mono · "Phone" text half mono · "Address" area 2 rows · toggle "Default site" — "New products, orders and
   stock go here unless you choose another." (On the default site it cannot be switched off; trying shows the hint in warn "Make another site
   the default instead." **(inferred)**.)
2. **Where stock sits** — tags "Places inside it", placeholder "Add a place, then Enter", hint "Removing a place moves its stock to the shop floor."
   The last remaining tag has no ×.
3. **Selling there** — auto "Price list" (options with sub "Default" / ""; quick add "Name") · text "Open".
Footer: danger "Close this site" (Owner; hidden on the default site); note "Closing keeps its history. Stock must be moved or counted to zero
first."; secondary "Cancel"; primary "Save" (Owner, Manager; Stock clerk and Bookkeeper see a read-only sheet with no footer actions).
Done toast "{name} saved."
Confirm for Close **(inferred, ASKS pattern)**: title "Close {name}?", body "Its tills stop and it leaves every list and filter. Its sales,
stock history and reports stay. You can find it under State: Closed.", keep "Keep it open", go "Close the site" (bad fill). A refused close
shows the server sentence in the dialog.

### 5.5 Tills and devices — `/retail/manage/tills` (SET-03) · board `TillsList.png`

FND-LIST. Panel nav "Tills and devices" active.
- Tabs: none (the board has none).
- Header: title "Tills and devices"; primary "Pair a till" → `/retail/manage/tills/new`.
- Toolbar: search "Till or device"; chip "Site" ("All sites" + each open site; hidden when the shop has one site); chip "State" ("Any",
  "Selling", "Closed", "Offline", "Not paired"); count; sort "Site, then name" (also "Last sale, newest first"); Group (None, Site, State);
  Columns; Export.
- Columns (grid `minmax(160px,1.2fr) 160px 150px 150px 150px 150px`, min width 1000): "Till" link · "Site" text · "Device" muted
  ("CounterMini", "Kora", "Browser, Windows PC", "No device yet") · "Last sale" date ("Today, 11:42", "Yesterday, 21:50", "2 October, 14:05",
  blank when none) · "On it now" text, or muted "Nobody" · "State" badge "Selling" ok / "Closed" hollow / "Offline {duration}" warn /
  "Not paired" neutral.
- Totals: Σ "{count}".
- Row link: TillEdit. Refresh: the list refetches every 30 s (states change).
- Bulk: "Close shifts" → `/retail/shifts?state=open&till={ids}` (floor area closes each with its count); "Send a message" → sheet
  **(inferred, not drawn)** title "Send a message", sub "{n} tills", field area "Message" (1–280), primary "Send", done "Sent to {n} tills."
  — the message shows on each till as a banner until dismissed.
- Row ⋯ **(inferred)**: "Open", "Pair another device" (paired), "Unpair" (paired), "Pair a device" (not paired → TillEdit with the code).
- Mobile: cards — name + state; "{site} · {device}"; "Last sale {..} · {on it now}".

#### TillNew sheet — `/retail/manage/tills/new` · board `TillNew.png`
Title "Pair a till" · sub "Management › Tills and devices". Opening it creates the till and its code (§2 W-04).
1. "Name" text full, required, unique within the site ("There is already a till called {name} at {site}." **(inferred)**) · auto "Site"
   (only when the shop has two or more open sites; options with sub "Default"/""; quick add "Name", "Address" → creates a site through
   `POST /sites` with defaults; Owner only), hint "Only asked because you have {two|three|…} sites." · seg "Device" "CounterMini" /
   "Kora handheld" / "A browser", default "CounterMini", hint "All three run the same Tender. A browser is any laptop, PC or tablet on the
   shop’s POS address."
2. **On the till** — read mono "Pairing code" "4 8 2 – 9 1 7" (+ QR to the right when Device is Kora handheld), hint "On the device, open Tender
   and type this code, or scan it. It works once, for 10 minutes. No password goes on the device." · read "Waiting for the till…" value "Not
   paired yet" tone warn → on pairing label "Paired" value "{device label}" tone ok **(inferred)**. Plan limit: the section shows the 409 text
   instead of the code.
3. **Plugged in** — toggle "Receipt printer" on, hint "Built in on CounterMini. In a browser, receipts go to its print dialog." · toggle "Cash
   drawer" on, hint "Opens on a cash sale." · toggle "Scale" off.
Footer: note "Then ring up a test sale and void it."; secondary "Cancel" (deletes the unpaired till); primary "Done".
Done toast: paired → "{name} paired. Ring up a test sale to check the printer."; not yet → "{name} saved." **(inferred)**.

#### TillEdit sheet — `/retail/manage/tills/[id]` · board `TillEdit.png`
Title "{till name}" · sub "{site} · {device kind label} · {state lower case}" ("Harare Main Branch · CounterMini · selling now";
"… · closed"; "… · offline 2 hours"; not paired: "{site} · not paired").
1. "Name" text · auto "Site" (shown when ≥ 2 sites; disabled with hint "Close the shift on it before moving it." **(inferred)** while a
   shift is open) · seg "Sells from price list" — one option per active price list ("Retail", "Wholesale"), default the site's list.
2. **Device** (paired) — toggle "Receipt printer" · toggle "Cash drawer" · read "Last seen" ("Now, version 4.12.0"; "11:38, version 4.12.0";
   "Yesterday, 21:55" — "Now" when under 2 minutes; version part only when known) · read "Paired" "{d MMMM yyyy} by {name}", hint "Pair another
   device swaps it: the old one stops the moment the new one pairs. Unpair needs the shift on it closed first."
   **Device** (not paired, inferred) — the toggles, then the TillNew "On the till" code block.
Footer (paired): danger "Unpair"; secondary "Pair another device" (→ TillReplace); primary "Save". (Not paired: secondary "Cancel", primary "Save".)
Done toast "{name} saved."
Confirm for Unpair **(inferred)**: title "Unpair {till}?", body "{device} stops being a till at its next request. Sales it holds offline still come
in, flagged for you. The till stays, ready for another device.", keep "Keep it", go "Unpair" (bad fill). With an open shift the dialog shows the
409 sentence and only "Keep it".

#### TillReplace sheet — `/retail/manage/tills/[id]/replace` · board `TillReplace.png`
Title "Pair another device to {till}" · sub "Management › Tills and devices › {till}". Opening it issues a `REPLACE` code.
1. **On the new device** — read mono "Pairing code" "7 3 0 – 2 6 4" (+ QR for Kora), hint "Open Tender on the new device and type this code, or
   scan it. It works once, for 10 minutes." · read "Waiting for the device…" "Not paired yet" warn → "Paired" "{label}" ok.
2. **The one it replaces** — read "On {till} now" "{device label} · last seen {HH:MM}" · read "Open shift" "{cashier}, since {HH:MM}" tone warn,
   hint "Close it on the old device first. If that device is lost, close the shift from its own page and enter the count there." (no open shift:
   value "None" without tone and no hint **(inferred)**).
Footer: note "The old device signs out at its next request. Sales it holds offline still come in, flagged for you."; secondary "Cancel" (expires the
code); primary "Done". Done toast (paired) "{till} is on the new device."

#### Device screens on the POS host (SET-04) · board `TillPairing.png` panels 1, 3, 4
Dark surface (Tender dark tokens), centred card 360px, as drawn.
- `/pair`: eyebrow "Tender · not a till yet"; title "Pair this device"; "Type the code from Management › Tills and devices."; six single-digit
  boxes with a dash after three (auto-advance, paste fills all); "Scan it instead" (Kora shell only); footnote "Price check works before
  pairing. Selling does not." Errors under the boxes **(inferred)**: "That code did not work. {n} tries left." / "Too many tries. Try again at
  {HH:MM}." Success → `/`.
- `/` (paired, nobody signed in): eyebrow "{till} · {site}"; title "Who is selling?"; chips (selected = light fill); four PIN dots and the
  numeric keypad (existing `pos-numeric-keypad.tsx`); footnote "Paired {d MMMM} by {name}." Wrong PIN: dots shake, "Wrong PIN. {n} tries
  left." **(inferred)**; locked: existing lock message.
- `/unpaired`: eyebrow "{till} · {device label}"; title "This device is no longer a till"; body per §2 W-76; button "Pair it to a till".

The explainer's prose (device cards, "The same views everywhere", the three footnotes) is the model for implementers and is not a page.

### 5.6 Payments — `/retail/manage/payments` (SET-05) · board `PaymentsSettings.png`

FND-SETTINGS, no header buttons. Manager: only "US$1 is" and "Updated" enabled. Bookkeeper: read-only.
1. **What you take** — toggles in this order with hints: "Cash, US dollars" — "Change is given in US dollars, then ZiG for anything under US$1." ·
   "Cash, ZiG" — "At today’s rate, below." · "Card" — "On the swipe machine. The cashier types the slip reference." (board names "the CBZ swipe
   machine"; see open questions) · "EcoCash" — "Merchant {code}. Confirmed automatically." when a code is saved, else "Add your merchant code
   below." **(inferred)** · "InnBucks" (no hint) · "Bank transfer" — "Held until the transfer shows in the bank." · "On account" — "For customers
   with an approved account and limit." · "Vouchers" (no hint).
2. **ZiG rate** (shown while Cash, ZiG is on) — money half "US$1 is" prefix "ZiG", 2–4 decimals, right-aligned mono · seg half "Updated" "By hand" /
   "Daily, RBZ rate" (second option only when the RBZ feed is configured; while it is selected the rate is read-only) · seg "Round ZiG change to"
   "Nearest 0.50" / "Nearest 1" / "Nearest 5", hint "Set {this morning|this afternoon|today|on 2 October} at {HH:MM} by {name}."
3. **EcoCash** (shown while EcoCash is on) — text half mono "EcoCash merchant code" · text half mono "Shows customers as" (upper-cased).
Aside: "At the till" "Tenders show in this order on the payment screen. Anything off here is hidden from cashiers." · "Where the money goes" "Each
tender posts to an account in the books. Posting to the books." (link → `/retail/manage/posting`) · "Who can change this" "Owners and managers."
Footer line: the rate's change when it is the latest — "Rate changed by {name} today at 07:30." (other day: "Rate changed by {name}, 2 October.");
else "Last changed by {name}, {date}."

### 5.7 Till rules — `/retail/manage/till-rules` (SET-06) · board `TillRules.png`

FND-SETTINGS, no header buttons.
1. **Refunds and voids** — money half "Manager PIN for refunds over" (US$) · seg half "Voids need a manager PIN" "Always" / "After 5 minutes" /
   "Never" · tags "Refund reasons" placeholder "Add a reason, then Enter" · tags "Void reasons" placeholder "Add a reason, then Enter".
   A list cannot be emptied: the last tag has no × **(inferred)**.
2. **Paying** — toggle "Split a sale across tenders" — "For example US$10 cash and the rest on EcoCash." · toggle "Card and EcoCash need a
   reference" — "The cashier types the slip or confirmation number." · text half mono "Largest discount a cashier can give" (shown "10%"),
   hint "More needs a manager PIN."
3. **The drawer** — toggle "Open the drawer without a sale" — "Off: the drawer only opens on a sale or with a manager PIN." · money half "Ask for a
   cash drop above", hint "The till prompts the cashier to drop to the safe."
4. **Offline** — text half mono "Keep selling offline for up to" (shown "24 hours"), hint "Receipts queue and send when the till is back online."
Aside: "Why these matter" bullets "Refunds and voids are where cash goes missing. A PIN and a reason make every one traceable." / "Reasons show in
Insights › Losses, so you can see which cashier refunds most and why." · "Who can change this" "Owners and managers."
Footer: "Last changed by Tafara Nyathi, 28 September."

### 5.8 Receipts — `/retail/manage/receipts` (SET-07) · board `ReceiptSettings.png`

FND-SETTINGS. Header button "Print a test receipt" (prints the preview, 80 mm).
1. **What it says** — area 2 rows "Top of the receipt" · area 2 rows "Bottom of the receipt" · toggle "Show the VAT number" · toggle "Show the liquor
   licence number" — "Liquor store only." (hidden for General retail) · toggle "Print the logo" — "Slower on most till printers." (disabled with
   hint "Add a logo in Company first." **(inferred)** when there is none) · seg half "Copies" "1" / "2" · seg half "Also send by" "Nothing" /
   "WhatsApp" / "Email".
Aside: "Preview" — a white 80 mm paper card in mono, live from the form: header lines (bold first line, centred), "VAT {n}", "Licence {n}", dashed
rule, lines "{label}  {amount}", dashed rule, "TOTAL US$ {total}" bold, tender lines, dashed rule, footer lines centred, "FDMS {device} · Day {n}".
· "Who can change this" "Owners and managers."
Footer: "Last changed by Tendai Mhlanga, 12 September."

### 5.9 Fiscal device — `/retail/manage/fiscal` (SET-08) · board `FiscalSettings.png`

FND-SETTINGS. Header buttons (outlined): "Test a receipt" (connected only), "Close day {n}" (open day only; confirm **(inferred)**: "Close day
{n}?" / "The Z-report goes to ZIMRA and sales wait for tomorrow’s day." / "Keep it open" / "Close the day"). Not connected: header button
"Connect" **(inferred)**. Manager and Bookkeeper read-only.
1. **The device** — read "Connection" (tone ok when connected, warn when unreachable, none when not connected) · text half mono "Device ID" ·
   text half mono "Serial number" · text half mono "Taxpayer number" · text half mono "VAT number" · not connected: text half mono "Activation
   key" **(inferred)**.
2. **Fiscal days** — seg "Close the fiscal day" "With the last shift" / "By hand", hint "Closing sends the Z-report to ZIMRA. A day left open blocks
   tomorrow’s sales." · seg "If ZIMRA cannot be reached" "Keep selling, sign later" / "Stop selling".
Aside: "Fiscal days" — five rows: day no (mono), label ("Today, open" / "2 Oct, closed 22:04"), total (mono right) · "Who can change this" "Owners
only. Device details come from ZIMRA when you register."
Footer: "Registered by Tendai Mhlanga, 14 March." (after a settings change: "Last changed by …").

### 5.10 Posting to the books — `/retail/manage/posting` (SET-09) · board `PostingSettings.png`

FND-SETTINGS. Header button "Post now". Owner and Bookkeeper.
1. **Where each tender goes** — one auto half per tender that is on, in order: "Cash, US dollars", "Cash, ZiG", "Card", "EcoCash", "InnBucks",
   "Bank transfer", "On account", "Vouchers". Options "{code} {name}" with sub "Asset" / "Liability" / "Income" / "Expense"; quick add "New account"
   fields "Code and name" and "Type" (placeholder "Asset, liability, income or expense").
2. **Sales and stock** — auto half each: "Sales", "VAT" (hidden when not VAT registered), "Cost of sales", "Stock", "Breakage and losses",
   "Deposits on empties" (liquor with empties on).
3. **When** — seg "Post" "At the end of each day" / "With every sale" · read "Last posted" "{d MMMM}, {HH:MM}. {n} sales, {d} deliveries, {c} count."
   (parts with zero dropped; plural/singular; never: "Not yet." **(inferred)**).
Aside: "Starting from nothing" "Sets up the accounts, VAT codes and tender accounts a shop needs, with the ZiG and rand rates. It lists what it
will add before it adds anything." + button "Set up the accounts" (dialog **(inferred)**: title "Set up the accounts", the preview grouped as
"Accounts", "VAT codes", "Tender accounts", "Rates" with ZiG and rand inputs, primary "Add them", secondary "Cancel"; nothing to add → "Everything
is already set up." and only "Close") · "Ready to post" three check bullets (ok dot / warn dot) · "Who can change this" "Owners and the bookkeeper."
Footer: "Last changed by Tendai Mhlanga, 1 September."

### 5.11 Plan and billing — `/retail/manage/billing` (SET-10) · board `BillingSettings.png`

FND-SETTINGS. Owner edits; Bookkeeper read-only.
1. **Plan** — cards 3 columns, no label: "Start" "One shop, two tills. US$19 a month." · "Grow" badge "Yours" "Up to three shops, eight tills. US$49 a
   month." · "Scale" "Any number of shops. US$129 a month." (text built from the plan rows, §4.10). Picking another card makes the page dirty;
   saving asks to confirm **(inferred)** "Move to {plan}?" / "From today you pay US${n} a month. Your next bill is on {date}." / "Keep {current}" /
   "Change the plan".
2. **Using** — read half mono right "Shops" "2 of 3" · read half mono right "Tills" "4 of 8" · read half mono right "People" "9" · read half "Next bill"
   "1 November, US$49.00".
3. **Paying** — seg "Pay by" "EcoCash" / "Card" / "Bank transfer" · text half mono "EcoCash number" (EcoCash only) · text half "Bills go to" (email).
Aside: "Bills" — three bullets "1 October, US$49.00, paid" · "Who can change this" "Owners only." · "Leaving" "Export everything first from any list.
Close the account: tills stop at once, and your data is kept for 90 days in case you come back." ("Close the account" is a red link → confirm
**(inferred)**: title "Close the account?", body "Tills stop at once, and your data is kept for 90 days in case you come back. Type the shop’s name to
confirm.", input, keep "Keep the account", go "Close the account" (bad fill)).
Footer: "Paid 1 October by EcoCash."

### 5.12 Import products — `/retail/catalog/import` (SET-11) · board `Import.png`

Products module panel (Products active). Not FND-LIST; a worksheet page using FND-LIST's table cells and FND-SETTINGS' aside.
- Header: back link "Products" (chevron) / H1 "Import products"; right: "Start again" (outlined), primary "Import {ok}, skip {needFix}" (only
  "Import {ok}" when nothing needs a fix; disabled at 0).
- Steps band (toolbar row under the header): "Template" (check) — "Uploaded {file}, {n} rows" (check; file name mono) — "3 Check" (current, boxed) —
  "Import" (hollow).
- Tabs row: "Need a fix {n}", "New {n}", "Will update {n}", "All {n}".
- Table "Rows that need a fix": "Row" mono muted · "Name" input · "Category" input · "Price" input mono right (placeholder "0.00") · "Barcode" input
  mono · "What to fix" — problem sentence in bad colour + outlined fix button ("Create the category" / "Update that one"). The cell the problem is about
  has bad-soft fill and bad border. Inputs save on blur (PATCH) and the row re-validates; a fixed row leaves the "Need a fix" tab. Other tabs: same
  columns, "What to fix" shows muted "New" or "Updates {name}" **(inferred)**.
- Aside: "When you import" — "**{new}** new products, on sale at once at {default site}." / "**{update}** products already here get the new price.
  The old one is kept in their history." / "**{fix}** rows still need a fix. Skip them, or fix them here." · "How rows are matched" "By barcode first,
  then by name. A row that matches updates that product; anything else is new." · "Columns read" "Name and price are needed. Category, barcode, cost,
  supplier, pack size and opening stock are read when present."
- Template and Upload steps **(inferred, not drawn)**: same header without the primary; steps band with "1 Template" current; body two blocks:
  "Download the template" button (→ template) with the "Columns read" sentence; drop zone "Drop the spreadsheet here, or choose a file" (".xlsx or .csv,
  up to 5,000 rows"). After upload: spinner "Reading {file}…" then Check.
- Loading: table skeleton. Error: FND-LIST error state with "Try again".
- Mobile: table → one card per row with the four inputs stacked and the problem under them; aside under the table.

---

## 6. What to remove (no backward compatibility)

| Remove | Replaced by | Unit |
|---|---|---|
| `app/retail/setup/page.tsx`, `app/retail/setup/branding/page.tsx` (redirects) | `/retail/setup/*` onboarding | SET-12 |
| `app/retail/setup/operations/page.tsx` (Tills register), `app/api/v2/retail/setup/operations/route.ts` | `/retail/manage/tills`, `/api/v2/retail/tills*` | SET-03 |
| `app/retail/setup/pos-policy/page.tsx`, `app/api/v2/retail/setup/pos-policy/route.ts`, `app/api/v2/retail/setup/tender-policy/route.ts`, `lib/retail/pos-policy.ts`, `lib/retail/tender-policy.ts` (and `validateTenderReferences`) | `/retail/manage/till-rules`, `RetailTillRules`, `lib/retail/till-rules.ts` | SET-06 |
| `app/retail/setup/accounting/page.tsx` | `/retail/manage/posting` | SET-09 |
| `app/retail/setup/fiscal/page.tsx` | `/retail/manage/fiscal` | SET-08 |
| `app/api/v2/retail/setup/overview/route.ts`, `lib/retail/setup-snapshot.ts`, `components/retail/shop-settings.tsx` (`ShopSettingsShell`, `useShopSetup`, `SHOP_SETUP_KEY`) | each page's own API; the checklist | SET-01 (overview consumers move as their pages are replaced; delete when the last one goes, SET-09) |
| `lib/retail/setup-profile.ts` (JSON setup profile, `defaultRegisterId`) and its readers in `pos/context`, `pos/till-settings`, `shifts/context`, `lib/retail/provision.ts` | `RetailShopProfile.defaultSiteId`; device context | SET-01 / SET-04 |
| `SETTINGS_PROVIDER_KEYS` and the `notIn` filter in `lib/accounting/fiscal-device-scope.ts` (+ its test) | typed settings rows | SET-06 |
| `app/api/v2/retail/shop-profile/route.ts`, `ShopProfileFields` in `components/retail/shop-profile-fields.tsx` (keep `useShopProfile`, now reading `/api/v2/retail/company`), the Shop section of `components/preferences/organization/organization-overview-preferences.tsx`, `canChangeShopProfile` | `/retail/manage/company` | SET-01 |
| `lib/settings/management-nav.ts` "shop" group entries `retail-tills`, `retail-till-rules`, `retail-posting`, `retail-fiscal-device` (`retail-bin` goes with the admin area) — each removed by the unit that replaces its page, so nothing is ever orphaned | Management module (FND-SHELL) | SET-03, SET-06, SET-09, SET-08 |
| For RETAIL workspaces: the preferences surface's "Sites" (`/preferences/organization/sites`) and "Billing" (`/preferences/organization/billing`) entries — hidden by workspace profile, routes stay for other verticals | `/retail/manage/sites`, `/retail/manage/billing` | SET-02, SET-10 |
| `app/api/v2/retail/pos/context/route.ts` and the POS shift view's site/till picker (`pos-shift-view.tsx` register select, `defaultRegisterId` in `pos-portal-state.tsx`) | `GET /api/v2/retail/devices/me`; the device's till | SET-04 |
| `managerOverride` (password) in `pos/sales`, refund, void; `lib/retail/manager-override.ts`; the "PIN never authorises a manager override" text in `lib/retail/till-pin.ts` | `managerPin` on a paired device | SET-06 (floor area builds the dialog) |
| `RetailTenderType.MOBILE_MONEY` everywhere | `ECOCASH`, `INNBUCKS` | SET-05 |
| `exchangeRate` accepted from the client in `pos/sales` | server-stamped rate | SET-05 |
| `lib/primary-actions.ts` "Shop settings" → `/retail/setup/operations`; `lib/retail/insights.ts` link to `/retail/setup/pos-policy`; route-registry rows for `/retail/setup/fiscal` | `/retail/manage/company`, `/retail/manage/till-rules`, `/retail/manage/fiscal` | SET-01, SET-06, SET-08 |
| `scripts/platform/domain/commercial-service.ts#assignTier` body | `lib/platform/plan-change.ts` (scripts call it) | SET-10 |
| `components/preferences/organization/change-plan-dialog.tsx` + `pricing-panel.tsx` usage for retail | plan cards on Plan and billing | SET-10 |
| `STARTER_RANGE` in `lib/retail/provision.ts` (and the `starterRange` option) | starter catalogue (onboarding step 3) | SET-12 |
| Default till name "Till 1" / code "REG-001" in provisioning | "Front till" | SET-12 |

`app/retail/setup/bin` moves to `/retail/manage/bin` under the admin area spec, not here.

---

## 7. Build units

In build order. Every unit: read `docs/design-system/README.md` and the relevant design-system files first; ship its migration with the
witness test; `pnpm typecheck` (one at a time on this machine), `npx eslint <changed files>`, `npx vitest run <unit tests>`; compare the
page against the board PNG at 1440×(board height) and at 390 wide; walk the end-to-end path on the seeded Harare Bottle Store
(`owner@bottlestore.test` / `RetailDemo123!`; manager `tafara.manager@bottlestore.test`; cashier `chipo.till@bottlestore.test`).
Board PNGs: `scratchpad/shots-v32/<Board>.png`.

### SET-01 · Management module and Company (W-02) · M
- Depends on: FND-THEME, FND-SHELL, FND-SETTINGS.
- Builds: §3.4 permission resources (all of them, replacing `retail.setup`; the old `/retail/setup/*` routes are re-gated to the new
  resources until their units replace them); `RETAIL_AUDIT_EVENTS` additions; migration `20261004131000_retail_company_profile`;
  `lib/retail/company.ts`; `GET/PUT /company`, `POST /company/logo`; `/retail/manage` redirect and `/retail/manage/company`;
  Management panel entries (§1) wired into FND-SHELL with per-entry visibility; `scripts/retail-worker.ts` with the licence reminder;
  `provisionRetail` writes `defaultSiteId`; seed rows (§3.7 SET-01); removals for this unit (§6).
- Acceptance: `/retail/manage/company` matches `CompanySettings.png` (owner). Switch to General retail → Liquor store features disappear,
  Save → reload shows General retail, footer "Last changed by Tendai Mhlanga, {today}"; switch back → values intact; the till still asks for
  ID on a beer sale. Manager sees every control disabled and no save bar; `PUT /api/v2/retail/company` as manager → 403 "Your role cannot
  change company details". Activity (admin list or `PlatformAuditEvent`) has `RETAIL_COMPANY.CHANGED`. `/preferences/organization` no
  longer shows a Shop section. Witness test passes.

### SET-02 · Sites and places (W-03, W-66) · L
- Depends on: SET-01, FND-LIST, FND-SHEET.
- Builds: migration `20261004131100_retail_sites_and_places`; `lib/retail/sites.ts` (list, create, update with place diff + stock move,
  close); `/sites*` API; `/retail/manage/sites` with SiteNew and SiteEdit sheets; plan room from `SubscriptionPlan.maxSites`; seed (§3.7).
- Acceptance: list matches `SitesList.png` (rows Harare Main Branch "Default", Borrowdale "Open", totals). "Add a site" matches `SiteNew.png`
  (note "…Your Grow plan has room for one more site."); add "Avondale"/AVD with places → toast "Avondale added. Pair its tills next." and it
  lists; a fourth site → refused with the plan sentence. SiteEdit matches `SiteEdit.png`; add "Cold room", remove "Back store" holding stock →
  its items are on Shop floor with a `StockMovement` TRANSFER each; "Close this site" on Borrowdale with stock → refused with the count; with
  stock zero → closed, shown under State: Closed, its tills unpaired. Stock clerk: list without Stock value, sheet read-only.

### SET-03 · Tills and devices, back office (W-04, W-76) · L
- Depends on: SET-02, FND-LIST, FND-SHEET.
- Builds: migration `20261004131200_retail_till_devices`; `lib/retail/tills.ts` (`tillState`, labels), `lib/retail/pairing.ts` (code
  generate/hash/expire, plan check); `/tills*` API incl. messages; `/retail/manage/tills` + TillNew, TillEdit, TillReplace sheets with polling and
  QR (`qrcode` package); seed tills and devices; removal of `/retail/setup/operations` + `setup/operations` API + nav entry.
- Acceptance: list matches `TillsList.png` (five seeded tills and their states: Selling, Selling, Closed, Offline 2 hours, Not paired). "Pair a till"
  matches `TillNew.png` with a fresh six-digit code; the DB holds only its hash; after 10 minutes the sheet shows a new code; Cancel removes the
  till. TillEdit matches `TillEdit.png`; Unpair on a till with an open shift is refused with the sentence; TillReplace matches `TillReplace.png`.
  Ninth paired till on Grow → refused. "Send a message" to two tills creates two `RetailDeviceMessage` rows. Cashier gets 403 on `/api/v2/retail/tills`.

### SET-04 · Pairing on the device and PIN sign-in (W-04, W-76) · L
- Depends on: SET-03.
- Builds: migration `20261004131300_retail_till_on_shift_and_sale`; `lib/retail/devices.ts` (`requirePosDevice`, cookie, UA label, heartbeat);
  `POST /devices/pair` with throttle; `GET /devices/me` (till, site, device, shop, price list — later units add their parts); `devices/people`;
  NextAuth `till-pin` provider and the proxy rule; POS host screens `/pair`, "Who is selling?", `/unpaired` (+ `POS_PUBLIC_PATHS`);
  `requirePosDevice` on every POS route; shift open without picker; sale stamping; `pos/sync` unpaired rule; `printed` endpoint; removal of
  `pos/context` and the shift view's till picker.
- Acceptance (two browsers): owner opens Pair a till "Test till" → browser B on `pos.hurudza-creative.apps.localtest.me:3000/pair` types the
  code → B shows "Who is selling?" for Test till; the sheet in A flips to Paired "Browser, {OS}" and the list row shows it with State Closed.
  Chipo's PIN on B opens her shift on Test till with no till picker; a sale's row has `registerId` and `deviceId`. A: "Pair another device" on
  Test till, browser C pairs → B's next action shows `/unpaired` with "Tendai Mhlanga paired another device to Test till at {HH:MM}."; a sale
  queued offline on B before that arrives with `reviewReason` set. Five wrong codes on a fresh browser → "Too many tries…" for 15 minutes.
  `pnpm vitest` covers `tillState`, code hashing/expiry, the unpaired-sync rule; witness test passes.

### SET-05 · Payments and the ZiG rate (W-05) · M
- Depends on: SET-01, SET-04, FND-SETTINGS.
- Builds: migration `20261004131400_retail_payment_settings` (tender enum swap); `lib/retail/payment-settings.ts`; `/payments` API;
  `/retail/manage/payments`; device context tenders + rate; server-stamped rate in `pos/sales`; RBZ job slot in the worker (adapter behind a flag);
  `MOBILE_MONEY` → `ECOCASH` across code; seed (rate 26.80).
- Acceptance: page matches `PaymentsSettings.png`. Manager: only "US$1 is" and "Updated" enabled; changing the rate to 27.10 → footer "Rate
  changed by Tafara Nyathi today at {HH:MM}." and a `CurrencyRate` row with `createdById`; a ZiG cash sale on a paired till carries 27.10 even
  if the client sends another rate. Owner turns InnBucks on → `devices/me` lists it after EcoCash. No `MOBILE_MONEY` left (witness).

### SET-06 · Till rules and their enforcement (W-64) · M
- Depends on: SET-04, FND-SETTINGS.
- Builds: migration `20261004131500_retail_till_rules`; `lib/retail/till-rules.ts` (`checkTillRule`, unit-tested); `/till-rules` API;
  `/retail/manage/till-rules`; `managerPin` in sales/refund/void/drawer routes; Cashier `refund`/`void` in the matrix; removal of pos-policy,
  tender-policy, manager-override, `SETTINGS_PROVIDER_KEYS`, nav entry.
- Acceptance: page matches `TillRules.png` with "Last changed by Tafara Nyathi, 28 September." Refund of US$25 as Chipo on a paired till without
  a PIN → 403 `MANAGER_PIN_NEEDED`; with Tafara's PIN → refunded, audit names Tafara; US$15 → no PIN. Void with "After 5 minutes" inside 5 minutes
  → no PIN. Split tender off → a two-tender sale refused. Reason not in the list → 400. No reserved-key rows remain (witness).

### SET-07 · Receipts and the message outbox (W-07) · M
- Depends on: SET-01, SET-04, FND-SETTINGS.
- Builds: migration `20261004131600_retail_receipts_and_messages`; `lib/retail/receipt-settings.ts`, receipt rendering for the till from these
  settings; `lib/messaging/whatsapp.ts` (Meta Cloud API, env `META_WHATSAPP_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`) and the outbox drain in the
  worker; `/receipts` API; `/retail/manage/receipts` with live preview and test print.
- Acceptance: page matches `ReceiptSettings.png`, preview built from the latest real sale. Edit the footer → preview changes as you type; save →
  the next receipt printed on a paired till shows it; "Print a test receipt" opens the print dialog with the 80 mm receipt. With "WhatsApp", a sale
  with a customer phone creates a `RetailMessage` (QUEUED, or FAILED "WhatsApp is not set up" without credentials).

### SET-08 · Fiscal device (W-06) · M
- Depends on: SET-01, FND-SETTINGS.
- Builds: migration `20261004131700_retail_fiscal_settings`; `lib/retail/fiscal-settings.ts`; `lib/accounting/fdms-registration.ts` (moved from the
  accounting route); `/fiscal*` API; `/retail/manage/fiscal`; close-with-last-shift hook in the shift-close service; stop-selling check in `pos/sales`;
  removal of `/retail/setup/fiscal` + nav entry + registry row.
- Acceptance: page matches `FiscalSettings.png` (connection line, five days in the aside, "Registered by Tendai Mhlanga, 14 March."). Against the
  FDMS test connector: "Test a receipt" reports success; "Close day 214" closes it and the aside shows it closed; with "With the last shift", closing
  the last open shift closes the day. Manager and Bookkeeper read-only.

### SET-09 · Posting to the books (W-65) · L
- Depends on: SET-05, FND-SETTINGS.
- Builds: migration `20261004131800_retail_posting_settings` (role mapping + data move); `ROLE_MAPPING` in `lib/accounting/posting.ts`; defaults and seed
  pack create role mappings; `lib/retail/posting-settings.ts` + `runRetailPosting`; `/posting*` API; `/retail/manage/posting`; 23:00 job; deferral
  in retail sources when END_OF_DAY; removal of `/retail/setup/accounting`, `setup/overview`, `setup-snapshot.ts`, `shop-settings.tsx`, nav entry.
- Acceptance: page matches `PostingSettings.png` (labels are the tenant's real chart; seeded accounts per §3.7). Change "Sales" to another income
  account → the next sale's journal credits it. END_OF_DAY: a new sale leaves a PENDING event and no journal; "Post now" posts it and "Last posted"
  reads "{today}, {HH:MM}. 1 sale." Quick-add "1012 Cash on hand, rand" (Asset) appears in every account field that takes an asset (98-decisions). Manager: no nav entry, 403.

### SET-10 · Plan and billing (W-67) · M
- Depends on: SET-02, SET-03, FND-SETTINGS.
- Builds: migration `20261004131900_billing_plan_limits`; `lib/platform/plan-change.ts`; `/billing*` API; `/retail/manage/billing`; till limit used by
  SET-03; close-account; hide preferences Billing for retail; seed.
- Acceptance: page matches `BillingSettings.png` ("2 of 3", "4 of 8", "9", "1 November, US$49.00", three bills, "Paid 1 October by EcoCash.").
  Choose Scale → confirm → plan Scale, next bill amount recomputed; choose Start → refused "Start has room for one shop. Close Borrowdale first.";
  Pay by Card hides the EcoCash number. Close the account on a throwaway tenant → tenant disabled, its devices unpaired, owner signed out.

### SET-11 · Import products (W-08) · L
- Depends on: SET-02, FND-LIST, FND-SETTINGS (aside), the products area's product-create and price-change services.
- Builds: migration `20261004132000_retail_product_import`; `lib/retail/import/{parse,match,validate,commit}.ts` (unit-tested); `/catalog/import*` API;
  `/retail/catalog/import` (template, upload, check, import); Products list entry point "Import products" in its ⋯/Export menu (with the products
  area); `public/demo/price-list-oct.xlsx`.
- Acceptance: upload the demo file → Check matches `Import.png` (tabs 6 / 196 / 12 / 214, the six flagged rows and highlighted cells). "Create the
  category" on row 14 clears it (and any other "Ciders" row); fix "12,60" → "12.60"; "Update that one" on row 58; button reads "Import 211, skip 3"
  after three fixes; Import → products created on sale at Harare Main Branch, matched products show the new price and the old one in history,
  opening stock posted as a movement and a journal.

### SET-12 · First-time setup: Tender signup and onboarding (W-01) · L
- Depends on: SET-01, SET-02, SET-03, SET-04, SET-05, SET-07, SET-11.
- Builds: migration `20261004132100_retail_onboarding` (+ `WorkspaceProduct.TENDER`); TENDER product + signup hook to `provisionRetail` and
  `RetailOnboarding`; starter catalogue dataset; onboarding frame and six steps; `/setup*` API; staff invite + PIN + WhatsApp; test-sale poll;
  `provisionRetail` default till "Front till"; removal of `STARTER_RANGE` and the `/retail/setup` redirects.
- Acceptance: a fresh signup at `/signup/tender` lands on `/retail/setup/type`; each step matches its board (`OnbType.png` … `OnbDone.png`).
  Liquor store → categories seeded; Shop name saved to the company; "Add 137 products" → 137 products on sale; the step-4 code pairs a browser and
  the field turns "Paired: Browser, “Front till”" (Kora/CounterMini on real hardware); "Send their PINs" creates three users with PINs (one can sign in
  on the paired browser with that PIN); ringing up, printing and voiding on that browser ticks the three rows; "Open the overview" lands on `/retail`.

### SET-13 · Finish setting up card (W-01, after) · S
- Depends on: SET-12, FND-DASH, FND-LIST.
- Builds: `lib/retail/checklist.ts` (unit-tested), `/setup/checklist*` API, the card on the overview, the three-step empty-list guide slot in FND-LIST
  (if FND-LIST does not already have it).
- Acceptance: on the SET-12 tenant (no suppliers, no fiscal device, no EcoCash code) `/retail` shows the card matching `Guided.png` ("4 of 7").
  Ticking "Add your suppliers" by hand → "5 of 7"; "Hide until tomorrow" hides it until local midnight; with every item done the card disappears and
  does not come back. Not shown to managers.

---

## 8. Open questions

1. **Plan prices.** The canvas shows Start US$19, Grow US$49, Scale US$129 with till limits (2, 8, any); the platform tiers are START US$39,
   GROW US$99, SCALE US$199 with no till limit, and are shared by every vertical. The spec reads prices from `SubscriptionPlan` and adds `maxTills`;
   someone must decide Tender's prices (a Tender plan set, or the canvas figures applied to the tiers) before the Plan and billing page can match.
2. **PIN as a sign-in.** The canvas makes PIN + paired device the till sign-in and makes a manager PIN approve refunds/voids/discounts. This
   reverses the threat model written in `lib/retail/till-pin.ts` and `manager-override.ts`. The spec follows the canvas (the device key is the
   second factor, PIN sessions are valid only on the POS host). Confirm with security review.
3. **WhatsApp delivery.** No server-side WhatsApp provider exists. The spec adds a Meta Cloud API adapter behind env vars; without credentials
   staff PINs and receipts are recorded as not sent. Which provider and sender number does Tender use? Shared with the customers area (messages,
   statements).
4. **EcoCash "Confirmed automatically".** There is no EcoCash merchant API integration; saving the merchant code does not confirm payments. Build
   the integration, or change the hint?
5. **RBZ daily rate.** "Daily, RBZ rate" needs a rate feed; none exists. The option is hidden until an adapter is configured.
6. **Card hint names a bank** ("On the CBZ swipe machine"). There is no field for the card machine's bank; the spec drops the bank name. Add a field,
   or keep the generic sentence?
7. **Chart of accounts names.** The board's accounts (1010 Cash on hand, US$; 2150 Vouchers issued; 2160 Deposits held; 1300 Stock …) clash with
   the platform chart's codes (1010 Operating Bank, 2150/2160 payroll). The page shows the tenant's real chart; the seed adds only the missing ZiG cash
   and vouchers-issued accounts. Accept, or define a retail chart?
8. **Who paired Front till.** TillEdit says "2 August 2026 by Rufaro Ndlovu", who is not on the People board. The seed uses Tafara Nyathi.
9. **General retail starter catalogue.** Only a liquor catalogue is specified (180 rows). Hide "From the catalogue" for General retail, or source one?
   The liquor dataset's 180 rows and suggested prices need an owner ("suggestions from Harare shops this month" implies monthly updates).
10. **Per-place stock.** Places are `StockLocation`s, but `InventoryItem` holds one location and one quantity per (site, item). Removing a place moves
    items; counting or receiving into a second place needs the stock area's per-location balances. Owned by the stock spec.
11. **A till's own fiscal device** (TillPairing footnote) is not built; every till signs with the shop's device.
12. **Route names.** Management lives at `/retail/manage/*` and onboarding at `/retail/setup/*`; FND-SHELL must use these. Import follows the Products
    route (`/retail/catalog` today).
13. **Signup copy.** The Tender signup headline/lede reuse canvas and Flare copy; no signup board exists.
14. **Opening stock on import** posts Dr Stock / Cr opening balances; confirm the equity account with the bookkeeper flow (posting area).
