# 37 · Tender signup and first-time setup (onboarding, six steps)

## Screen
- `/signup/tender` (the existing self-serve signup flow, new product) → welcome handoff → `/retail/setup`
- `/retail/setup` (redirects to the current step; after `completedAt` → `/retail`), `/retail/setup/type`, `/retail/setup/shop`,
  `/retail/setup/products`, `/retail/setup/tills`, `/retail/setup/staff`, `/retail/setup/test-sale`
- Not in the retail shell: its own two-column frame. Area tag "admin" (setup units are planned under admin in this set).

## Units
SET-12 (docs/handover/10-setup.md §W-01 steps 1–7, §3.3 `retail_onboarding`, §3.6 starter catalogue, §4.12 (not the checklist
rows), §5.1, §6 rows for SET-12, §7 SET-12), with C-17 (import at `/retail/products/import`), C-37 (`RETAIL_PERSON.*`, not
`RETAIL_STAFF.INVITED`), C-38 (staff through ADM-02's `invitePerson`), C-14 (pages save through their own services; onboarding's
endpoints are action endpoints over those services), 99-coverage §2 W-10 fix (step 3 reachable after onboarding by owner and
manager). "Verbatim §x" = that section of `docs/handover/10-setup.md`.

## Boards
- `OnbType.png` — left aside 360px on `--ground`: "T Tender"; "Setting up" over "Harare Bottle Store"; six step links with times
  ("Shop type 30 seconds", "Your shop 2 minutes", "Products and prices 6 minutes", "Tills and payments 2 minutes", "Staff and PINs 2
  minutes", "A test sale 1 minute"; current = white card with shadow and filled number; done = filled check + "Done"; future =
  hollow number); bottom "**Everything saves as you go.** Close this and pick up where you left off." and "Stuck? WhatsApp us on +263
  78 600 1100.". Main: "Step 1 of 6", H1 "What kind of shop is it?", lede, four cards (two "Soon", dimmed), the "A liquor store starts
  with" panel (three bullets). Footer: primary "Continue ›".
- `OnbShop.png`, `OnbTills.png`, `OnbDone.png` — verbatim §5.1 OnbShop / OnbTills / OnbDone.
- `OnbProducts.png` — "Step 3 of 6", "What do you sell?", lede; three cards "From the catalogue" (selected) / "Import a spreadsheet" /
  "One by one"; chips "All 180", "Beer 42", "Spirits 61", "Wine 38", "Ciders and coolers 19", "Soft drinks 14", "Ice and mixers 6";
  table (tick, Product, Category, Sold as, Your price input) with the board's first rows (Castle Lager 340ml 1.20 ✓ … Amarula Cream
  750ml 18.25 ☐); footer "Back", link "I will add them later", primary "Add 137 products ›".
- `OnbStaff.png` — "Step 5 of 6", "Who works the till?"; table Name · Phone · Role (Manager | Cashier) · Till PIN ("4 4 1 9"); "+ Add a
  person"; info panel "**Each person gets their PIN on WhatsApp.** Cashiers only see the till. Managers also see this admin, except
  money settings and the plan, which stay with you as the owner."; footer "Back", "Just me for now", primary "Send their PINs ›".

## Workflows
W-01 First-time setup, signup to first sale (Owner; "Signing up"; guided): Pick the shop type · Name the shop · Add products ·
Tills and payments · Staff and PINs · Make a test sale — steps 1–7 verbatim §W-01 (lines 108–171), with these changes:
- Step 2 saves through `saveShopProfile` (`lib/retail/shop-profile.ts`), which already calls `ensureRetailCategories`; audit
  `RETAIL_SHOP.PROFILE_CHANGED` (C-37), not `RETAIL_SHOP_PROFILE.CHANGED`.
- Step 3 saves through the company settings store (`lib/retail/settings/company.ts` via `saveSettings(companyId, "company", …)`)
  and SET-05's payments store for "You take" (C-14); audit `RETAIL_SETTINGS.CHANGED` (not `RETAIL_COMPANY.CHANGED`). Price currency
  refused once a sale exists (409, existing rule of SET-01's money fields, 98-decisions FND #11).
- Step 4 products through PRD-03's product-create service (`createProduct`) and its shelf listing; import link
  `/retail/products/import?from=setup` (C-17, SET-11).
- Step 5 tills: the pairing code through SET-03's `POST /api/v2/retail/tills/[id]/pairing-code` and poll `GET …/pairing`; tenders and
  the ZiG rate through the payments settings store and `POST /api/v2/retail/payments/zig-rate` (C-14).
- Step 6 staff through ADM-02's `invitePerson(actor, { name, phone, role, sites: "ALL", givePin: true, pin })` with the owner-typed
  PIN (C-38) — it sends the WhatsApp at once, redacts the PIN, writes `RETAIL_PERSON.INVITED`.
- Step 7 test sale: reads the first `RetailSale` (SALE) since `startedAt`, its `printedAt` (SET-04's printed endpoint), and a VOID
  whose `sourceSaleId` is it.

## Roles
Owner (`SUPERADMIN`) only for the onboarding steps; everyone else → `/retail`. After `completedAt`, `/retail/setup/products?return=…`
is served to Owner **and Manager** as step 3 alone (no step aside, its own Back = the `return` path) — 99-coverage §2 W-10 fix, used by
PRD-01's "Start from the catalogue". Endpoint permissions verbatim §4.12 (`retail.company:update` for type/shop, `retail.catalog:create`
for catalogue/products, `retail.payments:update` for tills/tenders, Owner for staff/test-sale/step/complete).
Accounts: a fresh signup at `/signup/tender` (any new email; the verify code is printed by the dev mailer); the demo owner
`owner@bottlestore.test` for the `--fresh-onboarding` demo; `tafara.manager@bottlestore.test` for the W-10 path; `chipo.till@` refused.

## Data
Existing: `Company`, `CompanyBranding`, `RetailShopProfile`, `Site`, `RetailRegister`/tills, `RetailPaymentSettings`,
`CurrencyRate`, `Product`, `InventoryItem`, `ProductPrice`, `PriceList`, `User`, `RetailTillPin`, `RetailStaffInvite`, `RetailSale`,
`SignupRequest` (signup), `WorkspaceProduct`.
Migration `<stamp>_retail_onboarding`, witness `lib/retail/onboarding-migration.test.ts`, verbatim §3.3 (lines 1161–1197):
`WorkspaceProduct` + `TENDER`; enum `RetailOnboardingStep`; model `RetailOnboarding` (incl. SET-13's `checklistTicked`,
`checklistHiddenUntil`, `checklistDoneAt`). Witness: enum values, table, defaults.
Code data: `lib/retail/starter-catalogue/liquor.ts` — 180 rows `{ key, name, category, soldAs, packOf?, packSize?, barcode?, price,
ticked }`, per category Beer 42, Spirits 61, Wine 38, Ciders and coolers 19, Soft drinks 14, Ice and mixers 6; 137 ticked;
`asOf "2026-10"`; the board's rows first in that order (verbatim §3.6). General retail has no catalogue: its "From the catalogue"
card is hidden.

## Server
- `lib/platform/products.ts`: `TENDER: { id: "TENDER", slug: "tender", name: "Tender", selfServe: true, templateCode:
  "TEMPLATE_RETAIL", trialDays: 14, homePath: "/retail/setup", signup: { headline: "From signing up to the first sale in one
  sitting.", lede: "Free for 14 days. No card." } }`.
- `lib/signup/service.ts` `createWorkspaceFromSignup`: after `provisionTenant` for TENDER, `provisionRetail({ companyId })` and create
  `RetailOnboarding { step: TYPE }`; the welcome handoff's `next` is `/retail/setup`.
- `lib/retail/provision.ts`: default till "Front till" (was "Till 1"/"REG-001"), site "Main branch", place "Shop floor"; remove
  `STARTER_RANGE` and the `starterRange` option.
- `lib/retail/onboarding.ts` (+ test): `onboardingState(companyId)`, `markStep(companyId, step, { done })` (adds to `stepsDone`, sets
  `step` to the next not done), `catalogueRows(businessType, category?, companyId)` (with `added` for rows already in Products by code
  or barcode), `addFromCatalogue(actor, lines | manual)` (one transaction; case rows after their single with `packOfId`/`packSize`;
  skip existing; no stock movement, no ledger; audit `RETAIL_PRODUCTS.ADDED_FROM_CATALOGUE { count }`), `testSaleState(companyId)`,
  `completeOnboarding(actor)` (`completedAt`, audit `RETAIL_ONBOARDING.COMPLETED`). Staff validation before calling `invitePerson`:
  name, Zimbabwe mobile E.164, PIN 4 digits not weak (not one digit repeated, not a run like 1234/4321), phone unique in the company;
  per-person result `{ name, sent, error? }`.

API (`app/api/v2/retail/setup/**`), verbatim §4.12 rows except the checklist ones (packet 39):
| Method · path | Permission | Body | Success | Errors |
|---|---|---|---|---|
| GET `/setup` | Owner | — | `{ step, stepsDone, shopName, businessType, completedAt }` | 403 |
| PUT `/setup/type` | `retail.company:update` | `{ businessType: "LIQUOR"\|"GENERAL" }` | `{ step }` | 400 "Pharmacy is not ready yet." for a Soon type |
| GET/PUT `/setup/shop` | `retail.company:update` | `{ shopName, phone?, whatsapp?, address?, take: "USD"\|"USD_ZWG"\|"ZWG", vatRegistered, licence?: { number?, expiresOn?, weekdayHours, sundayHours } }` | `{ step }` | 400 fields ("Use a 24-hour time such as 08:00"); 409 `PRICES_LOCKED` |
| GET `/setup/catalogue?category=` | `retail.catalog:create` | — | `{ categories, rows, asOf }` | 403 |
| POST `/setup/products` | `retail.catalog:create` | `{ lines?: [{ key, price }], manual?: [{ name, category, price }] }` | `{ added }` | 400 price ("Use a point: 12.60") |
| PUT `/setup/tills` | `retail.payments:update` | `{ tenders: { cashUsd, cashZig, ecocash, card }, rate? }` | `{ step }` | 400 rate required with cash ZiG |
| POST `/setup/staff` | Owner | `{ people: [{ name, phone, role: "MANAGER"\|"CASHIER", pin }] }` | `{ results }` | 400 per person |
| GET `/setup/test-sale` | Owner | — | `{ sale: { at, total } \| null, printed, voided, product, till }` | 403 |
| POST `/setup/step` | Owner | `{ step }` | `{ step }` | 400 |
| POST `/setup/complete` | Owner | — | 204 | 403 |
Audit constants: `productsAddedFromCatalogue`, `onboardingCompleted` (+ `LIST_WORDS`, kind Settings per packet 32).

## UI
- `app/retail/setup/layout.tsx` (onboarding frame, verbatim §5.1: aside, main column max 720 left 72, footer bar; skeleton; "This step
  would not load." + "Try again"; mobile top bar "Step 2 of 6 · Your shop" with a disclosure) and one page per step
  (`app/retail/setup/{type,shop,products,tills,staff,test-sale}/page.tsx`), `app/retail/setup/page.tsx` = redirect to the current step
  (or `/retail` when complete; W-10 exception above). Fields persist on blur (600 ms debounce) through the step endpoint.
  Components under `components/retail/onboarding/*`; field primitives from the settings field kit (`.cx-seg--field`,
  `.cx-switch-row`) so the look matches the boards.
- Step pages verbatim §5.1 OnbType … OnbDone (copy, defaults, validation, "(inferred)" strings kept as written). OnbDone's three link
  cards: "Add your suppliers" → `/retail/buying/suppliers?sheet=supplier-new`; "Set reorder levels" → Stock › On hand; "Check the
  overview tomorrow" → `/retail`.
- `NEXT_PUBLIC_SUPPORT_WHATSAPP` (add to `.env.example`) for the aside's number (mono).

## Reuse
`lib/signup/service.ts`, `app/signup/[product]`, `lib/retail/provision.ts`, `lib/retail/shop-profile.ts` (`saveShopProfile`),
`lib/retail/categories.ts` (`ensureRetailCategories`), `lib/retail/settings/{index,company,payments}.ts`,
`app/api/v2/retail/payments/zig-rate`, `app/api/v2/retail/tills/[id]/pairing-code` + `/pairing`, `lib/retail/people/invite.ts`
(`invitePerson`), `lib/retail/people/pins.ts` (`randomTillPin`), PRD-03's `createProduct`, SET-04's printed endpoint.

## Remove
- `STARTER_RANGE` and the `starterRange` option in `lib/retail/provision.ts`; default till "Till 1"/"REG-001".
- Any `app/retail/setup/page.tsx` / `branding` redirect left (FND-03 moved the rest; currently none exist — confirm with `ls`).
- Nothing else: `/retail/setup` is new (route registry already maps it to `retail.core`).

## Seed
`RetailOnboarding` for Harare Bottle Store: completed 2 August, every step done, `checklistDoneAt` set (the demo is fully set up, so
no card — SET-13's acceptance runs on a fresh signup). New flag `--fresh-onboarding` in `scripts/seed-retail-demo.ts` resets this
tenant's `RetailOnboarding` to the state right after onboarding (type, products, till, staff done; `completedAt` set;
`checklistDoneAt` null) for the Guided demo.

## Tests
- Witness.
- `lib/retail/onboarding.test.ts`: step order and `stepsDone`; catalogue counts per category (180 total, 137 ticked) and the board's
  first rows in order; adding twice skips existing; a case row links to its single; manual rows; weak PINs refused (1111, 1234, 4321,
  0000); duplicate phone refused; currency change refused after a sale; test-sale state (sale → printed → voided).
- `lib/retail/starter-catalogue/liquor.test.ts`: 180 rows, unique keys, every `packOf` resolves, prices > 0.
- Signup service test: a TENDER signup provisions retail, creates `RetailOnboarding`, hands off to `/retail/setup`.

## Acceptance
1. Migration on dev + test; witness green.
2. Fresh signup at `/signup/tender` (new email, code from the dev mailer) lands on `/retail/setup/type`; each step side by side with
   `OnbType.png` … `OnbDone.png` at 1440×960.
3. Liquor store → the seven liquor categories exist with VAT and 18+ on the alcohol ones; Shop name saved to `Company.name` and the
   trading name; "Add 137 products" → 137 products on sale (Products list) with prices, no stock movements, no journal.
4. Step 4: the code pairs a browser till (SET-04's `/pair` on the POS host) and the field turns "Paired: Browser, “Front till”"; tenders
   saved; a ZiG rate saved as a `CurrencyRate`.
5. "Send their PINs" with three people → three users with role and phone, `RetailTillPin` set, one `RetailMessage` each with the PIN
   redacted ("••••"), `RETAIL_PERSON.INVITED` × 3; one of them signs in on the paired browser with that PIN.
6. Ring up, print and void on that till → the three rows tick ("Done at hh:mm, US$…", "Printed, with your licence number", "Voided at
   hh:mm"); "Open the overview" → `/retail`; `/retail/setup` now redirects to `/retail`.
7. As `tafara.manager@` after onboarding: `/retail/setup/products?return=/retail/products` shows step 3 alone and adds products; as
   `chipo.till@`: `/retail/setup` → `/retail`; `POST /api/v2/retail/setup/staff` → 403.
8. Bad input: PIN 1234 → "Pick a PIN that is not four of the same digit or four in a row." under it (ADM-03's sentence); licence hours
   "8 to 10" → "Use a 24-hour time such as 08:00".
9. `npx eslint <changed>`; `npx vitest run lib/retail/onboarding.test.ts lib/retail/starter-catalogue lib/signup lib/retail/provision.test.ts`;
   `pnpm typecheck` alone.

## Depends on
PRD-03 (`createProduct`, shelf listing), SET-11 (import at `/retail/products/import` for the "Import a spreadsheet" card — other
planners), ADM-02 (`invitePerson`, landed), SET-01…SET-05, SET-07 (landed). Holds the till (T), auth (A) and messaging (M) locks
for the signup and staff paths.

## Risk
standard (no stock or money moves; products are created without stock or cost). Pitfalls: `WorkspaceProduct` enum add — no use of
the new value in the same migration; never store or log a PIN (invitePerson redacts); the signup flow is shared with Flare — test
both products.

## Open questions
- Setup open question 9 (General retail catalogue): "From the catalogue" hidden for General retail.
- Setup open question 13 (signup copy): as the spec writes it.
- Staff invites use `invitePerson` (C-38), so step 6's own `inviteStaff` is not built; every invited manager gets the People join
  link, as People does.
- The 180-row dataset needs an owner for monthly price updates (setup open question 9): out of scope; `asOf` shown.
