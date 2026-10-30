# Books polish: notes

Started 20 Oct 2026, on top of PR #235. `design/books/` is the final design and wins over `design/core-modules/` on anything in Books. This file is written before code changes. Each section says what the build assumed, what the design or the owner says, and what this branch does.

Status marks: **Doing**: built on this branch. **Waiting**: a model change proposed below, not built until the owner says yes. **Left**: noted, not in this pass, with the reason.

## 0. Scope the owner set for this branch

- **Type and icons are for Books only.** Answered 20 Oct: "Books only". The Corelith shell stays in Inter with its own icons in every other module. Inside Books (the Books panel and every Books page), the face is Atkinson Hyperlegible Next with IBM Plex Mono, and icons come from the Corelith UI pack. The rail's module icons are not changed.
- **Consolidation.** Owner, 20 Oct: requisitions, quotes and money things in the CRM "must match books, but we cant have multiple different destinations in navigation its confusing. The money flows should be one thing. Cant click on a quote in books and be sent to crm." See §2.
- **Keep the engine, the migrations and the routes.** Routes stay as #235 built them (`/books/invoices`, not the design's `/books/sales/invoices`). The design's routes in `spec/screens.json` are read as screen names only.

## 1. The line between running a business and doing the accounting

### What the build assumed

1. **Every `/books` address and every `/api/books` call needs `books.screens`** (`BOOKS_SCREENS_GATED` in `lib/platform/gating/route-registry.ts`). Only Takings, `/api/books/core/*`, the accountant export, Management's money reads and the panel's counts are open. So a workspace without the add-on cannot issue an invoice, record a receipt, pay a bill, approve a requisition or write a claim in Books. It sees the upsell (`app/books/layout.tsx`) on every address.
2. **The free documents also hide behind the old Accounting add-ons.** `/books/invoices`, `/books/payments`, `/books/quotes`, `/books/credit-notes`, `/books/customers` need `accounting.ar`. Bills, suppliers, orders, requisitions, claims and payments made need `accounting.ap`. Both keys come from `ADDON_ACCOUNTING_ADVANCED` (SCALE and up) or the FISCAL tier's own list. A START or GROW workspace has neither, so even with `books.screens` it cannot open Invoices.
3. **The panel has no locked state.** Without the screens, the layout swaps every page for `BkUpsell`, and the panel still shows every level as if it were open.
4. **The advanced tier does not exist.** Tax, Close the month and Ledger sit under `books.screens` like everything else, with the old fine keys (`accounting.tax`, `accounting.journals`, …).

### The line (the owner's brief, 20 Oct)

| Tier | Rows |
|---|---|
| **Free, every workspace (thin Books)** | Sales: Invoices, Quotes, Payments received, Credit notes, Customers (and statements). Bills & spending: Bills, Payments made (with withholding and IMTT), Purchase orders, Requisitions, Claims & petty cash, Suppliers. Bank & cash: Accounts (balances, transfers). Takings. Every record page of these. Management's money pages and the accountant export. The Books pieces in CRM, Retail, Payroll and Reports. |
| **Books screens, $10** | Money (the overview). All spending. The views by age (customers and suppliers). To match, statement upload, Reconciliations. Rates & revaluation. Saved views. Bulk actions. Settings: Numbering, Tax codes & rules, Locks & periods. |
| **$99 plan** | Tax (What's due, VAT returns, Withholding, Provisional tax, Fiscal register), Close the month (Checklist, Needs posting, Year end), Ledger (all eight rows). |

Rates & revaluation sits in the Close the month level on the panel but is a $10 row, so it shows unlocked inside a locked level. On the $10 plan the panel shows Close the month with the $99 mark and Rates & revaluation is reached from it. Mixed tiers inside one level are drawn per row.

### What this branch does (Doing)

- **One map, as data**: `lib/books/tiers.ts`. Each panel row and each route prefix (page and API) names its tier: `free`, `screens` or `advanced`. The route registry, the API gate, the Books layout, the panel and the upsell read only this map. Moving a row is a one-line change.
- **Free rows** are gated on `accounting.core` (always on), not on `accounting.ar` or `accounting.ap`. The old fine keys stay in the catalogue for the tiers that list them, and no Books route reads them.
- **Screens rows** need `books.screens`. **Advanced rows** need `books.advanced` (§5.3, built).
- **The panel** shows free rows and levels as they are. A paid level, or a paid row in a free level, shows once with its price ("$10" or "$99") and a lock. It opens `bk-x-noscreens` or `bk-x-advanced`. The layout no longer swaps every page: only paid addresses show the upsell.
- **The server** refuses a paid API with 403 and the feature key, row by row in bulk. `canDo` stays the role check; the plan check sits in the route gate, which every route and API passes through. A test walks the map: every free route opens with the engine only, every `screens` route needs `books.screens`, every `advanced` route needs the advanced key.
- **A free record is never thinner.** An invoice, bill, requisition or claim renders the same component on every plan. Only the paid actions on it (bulk, saved views) go. The record's Void, Revise and Delete permanently are core (`/api/books/core/*`) and stay on every plan, for the roles allowed.
- `spec/books.md` (Tiers) is rewritten to this table.

## 2. One home per money record (consolidation)

### What the build has

The CRM and Books list the same rows from two places, with two addresses for one record:

| Record | CRM | Books | Same rows? |
|---|---|---|---|
| Quote | `/crm/quotes`, `/crm/quotes/[id]` | `/books/quotes`. The number links to `/crm/quotes/[crmId]`, and New quote goes to `/crm/deals` | Yes. `CrmLeadDocument` wraps `SalesQuotation` |
| Invoice | `/crm/invoices`, `/crm/invoices/[id]` | `/books/invoices`, `/books/invoices/[id]` | Yes. Books is the superset |
| Receipt / payment received | `/crm/receipts`, `/crm/receipts/[id]` | `/books/payments` | Yes |
| Collections | `/crm/collections` | Customers by age, the Overdue tab of Invoices | Yes |
| Requisition | `/crm/requisitions`, `/crm/requisitions/[id]` | `/books/requisitions`, `/books/requisitions/[id]`. Raising from Books lands on `/crm/requisitions/[id]` | Yes. `CrmRequisition` (retail too, with `siteId`) |
| Purchase order | none | `/books/orders`. Rows open `/retail/buying/orders/[id]` | Yes. `RetailPurchaseOrder` |
| Supplier | none | `/books/suppliers` and `/retail/buying/suppliers` | Yes. `Vendor` |
| Customer | `/crm/companies` (`CrmClient`) | `/books/customers` (`Customer`) | No. Linked by `CrmClient.customerId` |

Books also sends people into the CRM:
- Money's "requisitions to approve" goes to `/crm/requisitions` (`lib/books/money-board.ts:135`).
- Needs posting sends requisitions and cost entries into the CRM (`lib/books/needs-posting.ts:204-205`).
- "A won deal has no invoice" opens the deal (`lib/books/money.ts:203`).

### The rule (decided for the owner; Doing)

**A money record has one home, in Books, and one address. A module never keeps its own list of a Books record kind. It shows the Books piece in context and opens the Books record.**

- **Books owns the lists and the records** for quotes, invoices, payments received, credit notes, bills, payments made, purchase orders, requisitions, claims and suppliers. They are free (§1), so a CRM-only or retail-only workspace loses nothing.
- **The CRM keeps what only the CRM has**: the pipeline, the deal and its "Money on this deal" block (`bk-x-crm-deal`, built once as a shared component), the cost tracker (a fitter's day, phone first), daily reports, commission rules in CRM settings, and the CRM's own companies.
- **The CRM panel's Money group loses Quotes, Invoices, Receipts, Collections and Requisitions.** "Money in and out" (`/crm/finance`) stays for now as the CRM's job-money view (Left, §8). Collections becomes the Overdue tab of Invoices.
- **Old CRM addresses forward to the record's one address**, the way `/accounting` forwards (`lib/books/moved.ts`):
  - `/crm/quotes` → `/books/quotes`, and `/crm/quotes/[id]` → `/books/quotes/[id]`.
  - `/crm/invoices[/id]` → `/books/invoices[/salesInvoiceId]`.
  - `/crm/receipts[/id]` → `/books/payments[?payment=…]`.
  - `/crm/collections` → `/books/invoices?tab=overdue`.
  - `/crm/requisitions[/id]` → `/books/requisitions[/id]`.
- **The quote record moves to Books** at `/books/quotes/[id]`. It is the CRM's record component (`DocumentRecordContent`), unchanged in what it does, drawn in Books' chrome. The design marks the quote record "not drawn yet" (`open.md`); this keeps the existing record rather than inventing one.
- **New quote in Books** asks which deal and opens the new quote at its Books address. A quote is still written from a deal, because its lines come from the deal's measurements.
- **The deal's documents** (the Paperwork tab and `documentHref`) open Books addresses.
- **Raising a requisition anywhere** lands on `/books/requisitions/[id]`.
- **Purchase orders open beside Books' list.** The receive flow stays Retail's (`/retail/buying/orders/[id]/receive`), because receiving goods is floor work. The design's `bk-orders` is a list with peek, and its record is not drawn (`open.md`).
- **Retail's Buying rows for suppliers and requisitions** (`lib/retail/nav/buying.ts`) duplicate Books' too. Left for the retail pass (§8), because the floor's requisitions are a shop manager's working list and the shop manager does not see Bills & spending (`permissions.json`: `–`).
- **Who sees what is unchanged.** A rep reaches their own requisitions through Bills & spending ("own requests" in `permissions.json`) and their quotes through the deal.

### Done on this branch (lead), 20 Oct

- The CRM panel's Money group no longer carries Quotes, Invoices, Receipts, Collections or Requisitions (`lib/navigation.ts`).
- The old addresses forward:
  - `/crm/quotes[/id]` → `/books/quotes[/id]`; a quote's Books address takes the CRM document id.
  - `/crm/invoices[/id]` → `/books/invoices[/invoice id]`.
  - `/crm/receipts[/id]` → `/books/payments[?payment=receipt id]` (`lib/crm/moved-documents.ts`).
  - `/crm/collections` → `/books/invoices?view=overdue`.
  - `/crm/requisitions` → `/books/requisitions?source=crm`, its queue read as Books' tab; `/crm/requisitions/[id]` → `/books/requisitions/[id]`.
- `documentHref` builds the Books address. The CRM's dashboard, overview, finance, project and job pages, the requisition table and the requisition notifications link to Books. The CRM's document list and collections pages are deleted.
- A rep or fitter reaches their own requests and the CRM's documents at their Books address: `canDo` allows view of Bills & spending, and of Sales for CRM documents; SALES_REP's route allow-list carries those Books addresses. The readers show a rep only their own (Bills & spending and Sales levels).

The design draws `bk-x-crm-reqs` as "Books' requisitions list, filtered to the CRM" sitting in the CRM. Under the owner's 20 Oct consolidation it is that same list at its one address, `/books/requisitions?source=crm`. The CRM panel does not carry a second row for it.

## 3. Type, colour and icons in Books (Doing)

- **Colour.** `spec/tokens.json` colours equal `design/core-modules/app/tokens.json`, light and dark, so no colour role changes. Books uses only roles (`--color-*`), never literals. The audit found literals in `components/core/books.css`, and they are swapped for roles.
- **Type.** The design's face is Atkinson Hyperlegible Next 400/500/600 with IBM Plex Mono 400/500 for amounts, codes, dates and references. The build draws Books in Inter (`:root[data-product="corelith"]` in `app/themes/roles.css`). Books scopes the pair to the Books panel and the Books main region (`data-module="books"`), per §0. The fonts are self-hosted from `design/books/html/*.woff2` through `next/font/local`, not the Google Fonts import.
- **Icons.**
  - `scripts/books/build-icons.mjs` writes `components/books/icons/ci-icons.ts` from `design/books/icons/dist/icons.json`, the way `design/core-modules/build/build-icons.py` writes `components/core/icons.ts`.
  - One `CiIcon` component takes `name`, `style` (`outline`, `outline-duo`, `fill`, `fill-duo`) and `size`. The default style is one constant, so icons v2's fill duo is a one-line change.
  - The labels map (`CI_LABEL` from `source/ci.mjs`) is `components/books/icons/ci-labels.ts`. Panel rows, level rows, page titles and Needs you rows read their icon from the label, so a row and its page title always carry the same icon.
  - The active panel row is filled, everything else outline.
  - No other module's icons change.
- **Phosphor and MingCute icons inside Books** (the kit's `Icon` in `components/core/icons.ts`, drawn on 24 grid) are swapped for the pack on Books pages. The kit's `Icon` stays for other modules.

## 4. The panel (`bk-nav`) against the build

| Design (`BK_TREE`, `bk-nav`) | Build (`lib/navigation.ts` `BOOKS_NAV_ITEMS`) | Change |
|---|---|---|
| Money; Sales; Bills & spending; Bank & cash; Tax; Close the month; Ledger; Settings | Same order | none |
| Each row has its pack icon (`CI_LABEL`) | Phosphor icons, several shared (Calendar twice, ListBullets four times, Percent three times) | Pack icons per label |
| Counts on Sales, Bills & spending, Bank & cash, Tax and Close the month level rows | Counts only on some leaf rows (`lib/books/nav-counts.ts`) | Level rows carry the sum of their rows' counts |
| Settings (drawn in `bk-nav`): Tax codes & rules, Numbering, Locks & periods, Opening balances, Set up the books, then four rows with ↗ that open Management: Business & tax details, Money accounts, Approvals & limits, Fiscal device | The same rows, order and labels | No change. `navigation.md` names a different set (Accountant export instead of Fiscal device); the drawing wins, as `CLAUDE.md` says the HTML is the source of truth. Approvals & limits keeps `/retail/manage/approvals` until Management has `bk-mg-approvals` (§7) |
| Bank & cash: Accounts, To match, Reconciliations, Takings | Same | none |
| Close the month: Checklist, Needs posting, Rates & revaluation, Year end | Same | none |
| Saved views and Reports from Books bands under every level | Present | Saved views are a $10 band (§1) |
| The $10 plan draws Tax, Close the month and Ledger with "$99" and a lock (`bk-nav` plan10) | No locked state | Built from the tier map |

## 5. Model changes: approved 21 Oct and built

The owner said yes to all three (and that the $99 plan is the over-five-members rate). Each paragraph below says what was built; the migrations are `20261021100000_books_outside_accountant` and `20261021110000_books_advanced_tier`.

### 5.1 Who may undo: the outside accountant replaces the void grant — built

**Built as proposed.** `tierOf` lifts an outside accountant to `owner` (`BooksActor.outsideAccountant`, read by `booksActor` from `User.memberKind`/`firmName`/`accessEndsOn`); once the end date has passed they have no role in Books and sign-in refuses them (`lib/books/outside-accountant.ts`). `void-grant.ts`, its setting and `/api/books/core/grants` are deleted; `auditActor` records `outsideAccountant: { firm }`. Management → People has Kind, Firm and Access ends on a finance officer's record (`POST /api/users/member-kind`); changing the role away from finance officer makes them staff. Witnesses: `outside-accountant-migration.test.ts`, `can-do.test.ts`.

- **Design** (`permissions.json`, `decisions.md` 19 Oct): an outside accountant is a kind of user, from the firm that audits or keeps the books, with an access end date. They have the owner's rights in Books, including void, revise, permanent delete and reopening a month. Every act is marked as theirs. A staff accountant (`FINANCE_OFFICER`) never voids, revises or deletes anything posted. The per-person grant `books.void` goes.
- **Build**: `VOID_GRANT = "books.void"` as a `UserPermissionOverride`, nobody holds it by default, and a manager or accountant can be granted void and revise (`lib/books/core/void-grant.ts`, `components/books/void-grant-setting.tsx`).
- **Proposed migration** `20261021100000_books_outside_accountant`:

  ```sql
  -- A member is staff or an outside accountant (design/books/spec/books.md, Roles).
  CREATE TYPE "MemberKind" AS ENUM ('STAFF', 'OUTSIDE_ACCOUNTANT');
  ALTER TABLE "User"
    ADD COLUMN "memberKind" "MemberKind" NOT NULL DEFAULT 'STAFF',
    ADD COLUMN "firmName" TEXT,
    ADD COLUMN "accessEndsOn" DATE;
  -- An outside accountant always has an end date and a firm.
  ALTER TABLE "User" ADD CONSTRAINT "User_outside_accountant_check"
    CHECK ("memberKind" = 'STAFF' OR ("firmName" IS NOT NULL AND "accessEndsOn" IS NOT NULL));
  -- The per-person grant goes: no one keeps void or revise by override.
  DELETE FROM "UserPermissionOverride" WHERE "permission" = 'books.void';
  ```

  Plus the Vane and Explore reader grants for the new columns (`pnpm vane:reader-sql`), and a witness test.
- **Code once approved:**
  - `tierOf` returns `owner` for an outside accountant whose `accessEndsOn` is today or later. Sign-in refuses them after that date, and so does every Books call (`booksActor`).
  - `OWNER_ONLY` reads "the owner or the outside accountant".
  - `void-grant.ts`, the setting and its API go.
  - Management → People gets Staff or Outside accountant, with firm and end date (`bk-mg-users`).
  - The audit trail marks their acts.
- **Role note.** The outside accountant's base role is `FINANCE_OFFICER`, with `memberKind` lifting it in Books only. Outside Books they are a finance officer.

### 5.2 Who may delete permanently — built

**Built.** `delete.posted`, `period.reopen`, `period.freeze` and the other owner-only acts are the owner tier's, which the outside accountant now holds; the refusals read "the owner or the outside accountant". Same change as 5.1.

- **Build**: owner only (`OWNER_ONLY["delete.posted"]`).
- **Design**: owner and outside accountant, with the typed confirmation and the hard refusals.
- No migration beyond 5.1; it is the same `OWNER_ONLY` change.

### 5.3 The $99 tier: `books.advanced` — built

**Built as proposed.** `books.advanced` and `ADDON_BOOKS_ADVANCED` are in the catalogue; `getCompanyFeatureMap` grants the feature to a workspace with `books.screens` and more than five billed members unless an explicit flag says otherwise; `BOOKS_ADVANCED_KEY` in `lib/books/tiers.ts` is now `books.advanced`; the finance officer role may use it. Witness: `books-advanced.test.ts`.

- **Build**: only `books.screens` exists.
- **Design**: Tax, Close the month and Ledger need the $99 plan. In this codebase "$99" is a vertical's rate once a workspace has more than five members (`VERTICAL_RATE.large` in `lib/platform/verticals.ts`). It is not a tier code.
- **Proposed**: a feature `books.advanced` and an add-on `ADDON_BOOKS_ADVANCED`, both in the catalogue. The entitlement resolver grants it to a workspace whose rate is the large one (more than five billed members), on top of `books.screens`. An admin can also grant it by hand.
- **Proposed migration** `20261021110000_books_advanced_tier`, data only, idempotent, the same shape as `20261020110000_books_screens_addon`:
  - insert the `PlatformFeature` and the `FeatureBundle` with its item;
  - for every workspace that has `books.screens` today and more than five billed members, insert a `CompanyFeatureFlag` for `books.advanced`, so nobody loses a page on the day it ships.

  A witness test checks both.
- **Question for the owner:** is the $99 plan the over-five-members rate, or a plan of its own? The proposal reads it as the rate.

### 5.4 Thin Books keys

No new keys are needed. Free rows read `accounting.core`, which is always on. No migration.

## 6. Bills & spending against the design

(Filled in level by level as each screen is compared with its HTML. See §6.1 onwards.)

## 7. Money, Sales and the rest

(Filled in as each level is compared.)

## 8. Left for later, with the reason

- `/crm/finance` "Money in and out" overlaps Money. It stays until the owner decides whether the CRM keeps a job-money view; Money is a $10 screen, and the CRM page is the free view a CRM-only workspace has.
- Retail → Buying's Suppliers and Requisitions rows duplicate Books' lists. They are the shop manager's working lists, and that role does not see Bills & spending. Consolidating them needs the shop manager to get "own site" rows in Bills & spending. It is a permissions change, proposed separately.
- The design's routes (`/books/sales/…`, `/books/spending/…`) are not adopted; the owner said keep the routes.
