# 60 Customers and accounts: customers, the points ledger, loyalty, messages and accounts

Handover spec for canvas page **"06 Customers and accounts"** of the "Corelith data tables" canvas, version 32.
Lede from the workflow map: "Loyalty is a ledger, not a number: every point has a sale, a person or a rule behind it.
Customers on account get statements and pay like any debtor."

This spec covers the thirteen boards on that page, the area's workflow-map board (`WfCustomers.dc.html`, page "Workflows"),
workflows **W-45 to W-50**, the customer half of **W-62** (edit the record's details in place) and **W-63** (move a customer to
the bin, restore it, including a merged one), and the till work these workflows need (finding a customer by phone or card,
earning and spending points, selling on account).

Read first: `docs/handover/00-foundations.md` (the frames), `10-setup.md` (tenders, the message outbox, posting, the retail
worker), `20-products.md` (price lists and the price engine), `50-floor.md` (the sale record, refunds, the drawer rule, lay-bys,
the till). Rules from the brief apply: the canvas chooses the direction; every value comes from Postgres through real routes;
every button does what the board and the workflow map say, on the server; no backward compatibility.

Canvas sources: `scratchpad/canvas-v32/project/*.dc.html` (`List.dc.html` kinds `customers`, `accounts`; `Record.dc.html` kind
`customer`; `Sheet.dc.html` `K` kinds `customer`, `customeredit`, `merge`, `points`, `message`, `account`, `accountedit`,
`custpayment`, `statement`; the hand-built `LoyaltySettings.dc.html`). Board images: `scratchpad/shots-v32/<Board>.png`.
Screenshots of today's pages (owner, 1440×1000, `c78d01f`): `scratchpad/smoke/cus60/{customers,customers-ledger,accounts,loyalty,customer-record}.png`
(script `scratchpad/smoke/cus60.js`).

## How to read this spec

- **Frames** come from foundations and are referenced, never re-specified. Aliases used here and in the unit list:

  | Alias | Foundations unit(s) | What it gives this spec |
  |---|---|---|
  | `FND-THEME` | FND-01 | Tender tokens, light and dark, the type pair |
  | `FND-SHELL` | FND-03 (with FND-02 components) | Rail, module panel with badges, 48px header, nav table 5.3.4, `GET /api/v2/retail/nav/badges` |
  | `FND-LIST` | FND-04 + FND-05 | List sources (`lib/reports/definitions/retail/customers.ts`, loaders `lib/reports/loaders/retail/customers.ts`), ListFrame, export |
  | `FND-RECORD` | FND-06 | RecordFrame (`lib/retail/record-kinds/customers.ts`), edit in place, Activity tab, ConfirmDialog, the bin endpoints and banner |
  | `FND-SHEET` | FND-07 | SheetForm (`lib/retail/sheet-kinds/customers.ts`), `?sheet=` host, lookups with inline add (`lib/retail/lookups.ts`) |
  | `FND-SETTINGS` | FND-08 | SettingsFrame (`lib/retail/settings-pages/loyalty.ts`), `GET`/`PATCH /api/v2/retail/settings/[page]` |
  | `FND-DASH` | FND-09 | Not used by this area (Insights › Customers is the insights spec's) |

- **Other areas' units** are named by their ids: `SET-01` (retail worker `scripts/retail-worker.ts`), `SET-05` (`ON_ACCOUNT`
  tender, Payments), `SET-07` (the `RetailMessage` outbox, `lib/messaging/whatsapp.ts`), `SET-09` (tender mappings and the
  Posting page), `PRD-05` (`PriceList` audiences, the `price list` lookup noun, `priceBasket` context), `PRD-09` (promotions on
  sale lines), `PRD-10` (vouchers' `customerId`), `STK-04` (`lib/retail/manager-pin.ts`), `BUY-05` (`EVENT_ACCOUNT` posting
  lines), `FLR-01` (`RetailSale.customerId`, the sale record, the Sales list), `FLR-02` (refund and void services), `FLR-03`
  (`resolveDrawer`, cash movements), `FLR-06` (lay-bys), `FLR-09` (the till). Areas not yet written are named by area:
  `ADM:approvals` (Management › Approvals: "Accounts need the owner over", "Owner approvals go to", "Ask by"), `ADM:bin`
  (Management › Bin list), `ADM:activity` (Management › Activity list), `INS:customers` (Insights › Customers and the Reports
  templates "Customer spend" and "Accounts owed").
- **Defined here** marks a choice the canvas shows the control for but not its contents. **Deviation** marks a place where this
  spec deliberately does not copy the board and says why.
- Copy in quotes is exact, sentence case, British English. Money "US$3,021.80", negative "−US$15.79" (U+2212), points with commas
  "3,021", signed points "+32" / "−500"; dates and times per foundations 5.13, in Africa/Harare.
- Every write: session through `requireRetailSession`, permission through `requireRetailPermission`
  (`lib/retail/permissions.ts`), company scope on every query, money in `Decimal` (`lib/money.ts`), and its audit event
  (`lib/retail/audit.ts`) **inside the same transaction**; ledger postings through `postRetailJournal` → `lib/accounting`, never
  by writing journal rows by hand.
- Roles map to `UserRole` as the Roles board says: **Owner** `SUPERADMIN`; **Manager** `MANAGER`, `SHOP_MANAGER`; **Cashier**
  `CASHIER`, `POS_CASHIER`; **Stock clerk** `STOCK_CLERK`; **Bookkeeper** `FINANCE_OFFICER`.

## Decisions at a glance

1. **Routes** (foundations 5.3.4 is canonical; these are this area's rows of it, plus the pages it adds):

   | Page | Route |
   |---|---|
   | Customers | `/retail/customers` |
   | A customer | `/retail/customers/[id]` |
   | Points movements (the record's "All points movements") | `/retail/customers/[id]/points` (**Defined here**) |
   | Accounts | `/retail/accounts` (`?tab=` owing, overdue or all; default owing) |
   | Loyalty | `/retail/manage/loyalty` |

   Sheets (`lib/retail/sheet-kinds/customers.ts`): `customer-new`, `customer-edit`, `customer-merge`, `customer-note`,
   `points`, `customer-tier`, `message`, `account-new`, `account-edit`, `account-payment`, `statement`. There is no account
   record page: an account is shown on its customer's record and in the Accounts list, as the boards draw it (the Accounts
   rows link to `CustomerRecord`).

2. **A customer is the existing `Customer` row**, the one accounting and CRM already use, extended with what the boards
   show (number, WhatsApp, area, date of birth, consent to messages, card, a tier held by hand, a price list, the bin). No
   second customer table. The phone is stored normalised (`+263774123388`) and shown grouped ("+263 77 412 3388"); it is
   unique among a company's live customers (checked by the service, 409 with the holder's name).

3. **Loyalty is a ledger.** Every movement of points is a `RetailPointsEntry` row with a kind (earned, spent, adjusted,
   birthday, expired, reversed), a signed number of points, what they were worth, and the sale, person or rule behind it. A
   balance is the sum of a customer's rows; nothing is read from sale notes or names any more (`LOYALTY_REDEEM:` notes,
   name matching and the 20% redemption cap go). The rules are `RetailLoyaltySettings` (Management › Loyalty). Points spent
   at the till are a discount on the sale, as today; earning is on what was paid in money.

4. **Tiers are by spend in the last 12 months** (the 365 days to today, Africa/Harare), computed when read, from the tiers
   in Loyalty settings; a tier set by hand ("Edit everything" › Tier, or "Change tier") holds for 12 months and then falls
   back to spend. Only the top tier has its own earning rate (the board's "Gold earns").

5. **An account belongs to a customer** (`RetailCustomerAccount`, one per customer): a limit, "Pays in" 7, 14 or 30 days,
   the names who may buy on it, and a hold. A sale paid on account (`ON_ACCOUNT` tender, SET-05) carries the account and the
   buyer's name and creates a **charge** due the terms after the sale. Payments settle the oldest charges first; **owed** is
   what is unsettled; **overdue** is what is unsettled past its due date. Sales over the limit need a manager's PIN at the
   till (STK-04). A limit above the owner threshold (`ADM:approvals`, default US$250.00) waits for the owner when a
   manager sets it.

6. **The loyalty customer and the account are separate on a sale.** `RetailSale.customerId` (FLR-01) is who earns the points
   and whose visit it is; `RetailSale.accountId` is whose account is charged and `accountBuyer` who bought on it. The till
   fills both from one pick when the holder buys; a named buyer on a business account earns nothing unless the cashier
   also picks their own customer.

7. **Messages use SET-07's outbox.** Offers ("Message customers") go only to customers who agreed to WhatsApp messages;
   account reminders, statements and payment receipts are service messages and need only a number. A "STOP" reply turns
   consent off (webhook). Scheduled sends ("Friday 16:00") wait in the outbox until their time.

8. **Statements are a documents source** (`retail.account.statement`, `lib/documents`), rendered to PDF with the shop's
   branding and payment details (`buildPaymentRows`), sent on WhatsApp as a document, emailed as an attachment, or printed.

9. **Ledger**: sales on account already post through the `RETAIL_SALE` rule (Dr the `ON_ACCOUNT` tender's account, 1100
   Accounts Receivable by default); a payment posts `RETAIL_ACCOUNT_PAYMENT` Dr the payment tender's account / Cr the
   receivable. Points are not booked (open question 4).

10. **Numbers people read**: customers `CUS-00141` (five digits, company-wide), loyalty cards "6009 1400 0141" (`600914` +
    the customer's six-digit sequence), account payments `PMT-0042` (four digits, company-wide).

11. **The record board's tabs are kept, and three more appear only when they apply**: the frame's **Activity** tab (owner,
    manager, bookkeeper; FND-RECORD, W-60), **Lay-bys** (only when the customer has one; the floor spec asks the customer
    record to list them) and **Account** (only for a customer with an account). Each is a **Deviation** from
    `CustomerRecord.png`, which draws Points ledger, Purchases and Notes only; the three board tabs stay first and unchanged.

---

## 1. Boards

Canvas reading order of page "06 Customers and accounts" (`boards-by-page.json`), then the area's workflow board. "Code status
today" was checked against the running app (screenshots above) and the source at `c78d01f`.

| # | Board file | Canvas title | What it is | Target route, or where it opens | Code status today | Notes |
|---|---|---|---|---|---|---|
| 1 | `CustomersList.dc.html` | Customers | list (`List` kind `customers`) | `/retail/customers` | **Exists but differs.** `app/retail/customers/page.tsx` (`cus60/customers.png`): old app bar (page icon, "Search ⌘K", check and bell), a `ColumnList` register with the visit count stacked under the name, then Tier, Last visit, Points, Spend; client-side "Search by name" and "8 of 8". No Phone or Visits columns, no Tier / Last visit filters, no sort, group, columns or export, no selection or bulk actions, no totals band, no pager, no "New customer". The rows are not customers: `GET /api/v2/retail/customers` aggregates the last 2,500 posted sales by the free-text `customerName`, so a customer with no sale is missing and two people with one name are one row. Tier comes from points thresholds in code (Gold ≥ 2,000, Silver ≥ 500), points = whole dollars of net spend ever, money "$709.60". The row button "Points ledger" opens a centred dialog (`cus60/customers-ledger.png`). | Source `retail-customers` (CUS-02). |
| 2 | `CustomerNew.dc.html` | W-45  New customer: phone and name | sheet (`customer`) over Customers | `?sheet=customer-new` over `/retail/customers` | **Missing** in the back office. The till adds customers inline (`components/retail/portal/pos-checkout-view.tsx` → `POST /api/v2/retail/customers`), which upserts by phone, email or name and has no consent, date of birth or area. | CUS-02. The till's add uses the same service (CUS-10). |
| 3 | `CustomerRecord.dc.html` | W-46  The points ledger | record (`customer`) | `/retail/customers/[id]` | **Missing.** `/retail/customers/<id>` is a 404 (`cus60/customer-record.png`). The nearest thing is the ledger dialog: Tier, Balance, Earned, Redeemed, Phone ("Not on file") and the last 120 sales by name with +points; `GET /api/v2/retail/customers/[id]/loyalty`. | CUS-03. |
| 4 | `CustomerEdit.dc.html` | Edit everything, or bin | sheet (`customeredit`) over the record | `?sheet=customer-edit&id=<id>` over `/retail/customers/[id]` | **Missing.** No customer can be edited or binned; `Customer` has no bin column. | CUS-03. Danger "Move to the bin" (FND-RECORD bin). |
| 5 | `MergeCustomer.dc.html` | Merge a duplicate | sheet (`merge`) over the record | `?sheet=customer-merge&id=<id>` over `/retail/customers/[id]` | **Missing.** | CUS-05. The bin board (`BinList`, admin) lists the merged duplicate as "Customer, merged" with Restore; this spec makes that restore undo the merge. |
| 6 | `PointsAdjust.dc.html` | W-47  Adjust points, with a reason | sheet (`points`) over the record | `?sheet=points&id=<id>` over the record; `?sheet=points&ids=<…>` over Customers (bulk "Add points") | **Missing.** Points are computed from sales and cannot be changed. | CUS-04. |
| 7 | `LoyaltySettings.dc.html` | W-48  Loyalty: points, tiers, rules | settings | `/retail/manage/loyalty` | **Missing.** `/retail/manage/loyalty` is a 404 (`cus60/loyalty.png`). The rules are constants in `lib/retail/loyalty.ts`: a point per whole US$ of net spend, 100 points = US$1, redemption capped at 20% of the sale, tiers by points; no expiry, birthday, promotion or alcohol rule, no on/off. | CUS-01. |
| 8 | `MessageNew.dc.html` | W-50  Message on WhatsApp | sheet (`message`) over Customers | `?sheet=message&ids=<…>` over `/retail/customers` (bulk "Message on WhatsApp"); `&id=<id>` from the record; other screens pass `ids` and `purpose` (5.10) | **Missing.** Nothing sends WhatsApp today (SET-07 adds the outbox and adapter). | CUS-06. |
| 9 | `AccountsList.dc.html` | Accounts | list (`List` kind `accounts`) | `/retail/accounts` | **Missing.** `/retail/accounts` is a 404 (`cus60/accounts.png`); there is no account model and no on-account tender (`RetailTenderType` is CASH, CARD, MOBILE_MONEY, TRANSFER, VOUCHER). The accounting module's AR (`SalesInvoice`, `GET /api/accounting/reports/customer-statement`) is invoices, not till sales. | Source `retail-accounts` (CUS-07). |
| 10 | `AccountOpen.dc.html` | Open an account with a limit | sheet (`account`) over Accounts | `?sheet=account-new` over `/retail/accounts`; `&customerId=<id>` from the record's ⋯ "Open an account" | **Missing.** | CUS-07. |
| 11 | `AccountEdit.dc.html` | Change, hold or close it | sheet (`accountedit`) over Accounts | `?sheet=account-edit&id=<accountId>` over `/retail/accounts` (row menu) or over the record (⋯ "Change the account") | **Missing.** | CUS-07. Danger "Close the account". |
| 12 | `CustPayment.dc.html` | Take a payment | sheet (`custpayment`) over the record | `?sheet=account-payment&id=<accountId>` over `/retail/customers/[id]` (header "Take a payment") or over `/retail/accounts` (row menu) | **Missing.** | CUS-08. The board draws the sheet for Mbare Sports Club over Tapiwa Marange's record (template reuse); in the product the sheet is always for the record's own account. |
| 13 | `StatementSend.dc.html` | Send statements | sheet (`statement`) over Accounts | `?sheet=statement&ids=<accountIds>` over `/retail/accounts` (bulk "Send statements"); `&id=<accountId>` from the record's ⋯ "Send a statement" | **Missing.** | CUS-09. |
| 14 | `WfCustomers.dc.html` (page "Workflows") | 06 Customers and accounts | explainer (`WorkflowMap` area `customers`) | none | n/a | The six flows and their screens; section 2 is its content. Nothing to build. |

Boards this area links to, owned elsewhere: `SaleRecord` (every SALE-number in the ledger and Purchases tabs → `/retail/sales/[id]`,
FLR-01), `SalesList` (customer cells link here; "All their purchases" opens it filtered, FLR-01), `LaybysList` (FLR-06), `BinList`
and `ActivityList` (`ADM:bin`, `ADM:activity`), `ApprovalSettings` (`ADM:approvals`, the US$250.00 threshold),
`InsightsCustomers` and `InsightsMoney` (`INS:customers`; "Message the 96 with their points balance" opens this area's `message`
sheet; "Owed to you US$1,213.80 · US$212.40 overdue" reads this area's accounts), `EndOfDay` ("On account" in the takings, FLR-07),
`PaymentsSettings` ("On account" tender, SET-05), `PostingSettings` ("On account" mapping, SET-09).

### The floor's panel and Management (List template `M.floor`, `M.manage`)

Customers and Accounts are items of **The floor** (rail mark The floor): Overview · Sales · Shifts ("2 open") · Lay-bys ("3") · End
of day · **Customers** · **Accounts** (badge "1 overdue": accounts with anything overdue, provider in this area). Loyalty is a
**Management** item between Approvals and Activity. Routes and visibility are foundations 5.3.4's rows; this area supplies each
item's `requires`: Customers `[[retail.customers, view]]`, Accounts `[[retail.accounts, view]]`, Loyalty `[[retail.loyalty, view]]`,
and the badge provider `customers.accountsOverdue` for `/retail/accounts` ("<n> overdue", hidden at 0; owner, manager, bookkeeper).

---
## 2. Workflows

Who may do what in this area comes from the Roles board ("Who can do what"), rows **Customers and points** (Owner CRUD,
Manager CRUD, Cashier CR, Stock clerk –, Bookkeeper R; "Cashiers add customers at the till."), **Accounts** (Owner CRUD, Manager
CRU, Cashier –, Stock clerk –, Bookkeeper RU; "Owner approves limits over US$250.") and **Loyalty settings** (Owner RU, Manager
R, others –). In `lib/retail/permissions.ts` (section 3.3) that is three resources, and every action below names the one it
checks. A control the role may not use is not drawn; the server check is the rule.

| Action | Check | Owner | Manager | Cashier | Stock clerk | Bookkeeper |
|---|---|---|---|---|---|---|
| See customers, a customer, the ledger | `retail.customers:view` | ✓ | ✓ | ✓ | – | ✓ |
| Add a customer (back office, till, quick add) | `retail.customers:create` | ✓ | ✓ | ✓ | – | – |
| Edit a customer, edit the rail, adjust points, change tier, add a note, message, stop marketing | `retail.customers:update` | ✓ | ✓ | – | – | – |
| Move to the bin, merge (merge also needs update) | `retail.customers:delete` | ✓ | ✓ | – | – | – |
| See accounts and their lines | `retail.accounts:view` | ✓ | ✓ | – | – | ✓ |
| Open an account | `retail.accounts:create` | ✓ | ✓ | – | – | – |
| Change limit, terms, buyers, hold; take a payment; send statements and reminders | `retail.accounts:update` | ✓ | ✓ | – | – | ✓ |
| Approve a limit over the owner threshold | `retail.accounts:approve` | ✓ | – | – | – | – |
| Close an account | `retail.accounts:delete` | ✓ | – | – | – | – |
| Sell on account at the till | `retail.sell:create` and the account rules (W-49) | ✓ | ✓ | ✓ | – | – |
| See Loyalty settings | `retail.loyalty:view` | ✓ | ✓ | – | – | – |
| Change Loyalty settings | `retail.loyalty:update` | ✓ | – | – | – | – |

### W-45 Add a customer at the till or in admin — **Cashier, manager** — starts "The till, or Customers"

Steps: Phone number · Name · Agree to messages. Screens: customers, customernew, customeredit, merge.

| Step | UI | Server |
|---|---|---|
| Open | Customers header "+ New customer" (`retail.customers:create`) → `?sheet=customer-new` (board `CustomerNew.png`). At the till: the customer panel's "Add a customer" (CUS-10) with the same fields. From any `customer` autocomplete: "Add ‘…’ as a new customer" with quick fields Name and "Phone or WhatsApp". | — |
| Phone number | "Phone or WhatsApp", hint "The till finds customers by phone." | Normalised by `normalizePhoneE164(raw, "ZW")` (`lib/crm/phone.ts`): "0774 123 388", "263774123388", "+263 77 412 3388" all store `+263774123388`. Not a number → 400 `fieldErrors.phone` "That is not a phone number." Already a live customer's → 409 `fieldErrors.phone` "Tapiwa Marange already has this number." with `existing: { id, name }` (the till then offers "Use Tapiwa Marange"). |
| Name | "Name". | Required, trimmed, 1–120 characters (400 `fieldErrors.name` "Add their name."). |
| Agree to messages | Toggle "Agrees to WhatsApp messages", on by default, hint "Receipts, points and offers. They can stop any time by replying STOP." | `marketingConsent`, `consentChangedAt = now` when on. Quick add from an autocomplete has no toggle and stores `false`. |
| Optional details | "Date of birth" (hint "For the birthday bonus; also confirms 18+."), "Area". | Date parsed from "14 March 1988", "14/03/1988" or "1988-03-14"; not in the future, not more than 120 years ago (400 `fieldErrors.dob` "Write it as 14 March 1988."). Area ≤ 80. |
| Save | Primary "Add customer"; note "They start earning points on their next sale." | `POST /api/v2/retail/customers` → `createCustomer` (`lib/retail/customers/create.ts`), one transaction: `code` = `reserveIdentifier("RETAIL_CUSTOMER")` → "CUS-00142"; `cardNo` = `600914` + the code's number padded to six ("6009 1400 0142"); `createdById`; audit `RETAIL_CUSTOMER.CREATED { code, name, consent }` (entity `Customer`). 201. Toast "Simba Nkomo added. 0 points." with "Open". |
| Edit | Record ⋯ "Edit everything" → `?sheet=customer-edit&id=<id>` (board `CustomerEdit.png`; `retail.customers:update`). Single values also edit in place on the rail (W-62). | `PATCH /api/v2/retail/customers/[id]` (4.2): same rules per field; `tier` holds the chosen tier for 12 months (`tierHeld`, `tierHeldUntil` = today + 12 months; choosing the tier the spend already gives clears the hold); `priceListId` must be a live list of the company. One `RETAIL_RECORD.EDITED` per changed field (FND), plus `RETAIL_CUSTOMER.TIER_SET { tier, until }` and `RETAIL_CUSTOMER.CONSENT_CHANGED { agreed, via: "sheet" }`. Toast "Tapiwa Marange saved." |
| Bin | Sheet danger "Move to the bin" (or record ⋯ "Move to the bin") → ConfirmDialog `bin` (FND 5.8). Owner, Manager. | `POST /api/v2/retail/bin { kind: "customer", id }` (FND 4.6; kind registered by this area, `deleteRight: [retail.customers, delete]`). Refusals: 409 "Tapiwa Marange owes US$31.00 on account. Take a payment, or close the account, first." (an account with anything owed); 409 "Rutendo Banda has lay-by LAY-0031 still being paid." (a PAYING or READY lay-by). Otherwise `archivedAt = now`, `isActive = false`, audit `RETAIL_RECORD.BINNED { kind: "customer", name }`. The customer leaves every list, lookup and till search; their sales, points and messages stay. Restore (`/bin/restore`) clears both. |
| Merge | Record ⋯ "Merge with another customer" → `?sheet=customer-merge&id=<id>` (board `MergeCustomer.png`; `retail.customers:update` and `delete`). | See "Merge a duplicate" below. |
| Other screens | — | The customer shows in Customers (no sales yet: Visits 0, Last visit "—", sorted last by spend), in the till's search by phone, card or name, and in every `customer` lookup (lay-bys, vouchers, "Add a customer to it" on a sale, Open an account). |

**Merge a duplicate** (part of W-45):

| Step | UI | Server |
|---|---|---|
| The duplicate | "The duplicate" (`auto`, noun customer, context `{ for: "merge", excludeId }`): options "T. Marange, +263 77 412 3380" with sub "412 points, 9 visits". | Lookup excludes the record itself and binned customers. |
| Keep the phone number | Seg of the two phones, the record's first and chosen. | — |
| After merging | Read field, live: "3,433 points, 150 visits, one ledger". | `GET /api/v2/retail/customers/[id]/merge-preview?duplicateId=` → `{ points, visits, text, blockers }`. Blockers (shown in the footer in `--bad`, primary disabled): "Both have accounts. Close T. Marange’s account first." · "T. Marange has invoices in Accounting. Merge them there." (any `SalesInvoice`/`SalesQuotation`/`CrmClient` on the duplicate). |
| Merge | Primary "Merge"; note "The duplicate goes to the bin. Its sales move across." | `POST /api/v2/retail/customers/[id]/merge { duplicateId, keepPhone }` → `mergeCustomers` (`lib/retail/customers/merge.ts`), one transaction: re-point to the survivor `RetailSale.customerId`, `RetailLayby.customerId` (FLR-06), `RetailVoucher.customerId` (PRD-10), `RetailCustomerNote.customerId`, `RetailPointsEntry.customerId` (each moved entry gets `mergedFromId` = duplicate), and the duplicate's account when the survivor has none (`RetailCustomerAccount.customerId`); copy email, area, date of birth and WhatsApp onto the survivor where the survivor has none; the kept phone onto the survivor (the survivor's old phone is remembered); `mergedIntoId`, `archivedAt = now`, `isActive = false` on the duplicate; a `RetailCustomerMerge` row listing what moved. Audit `RETAIL_CUSTOMER.MERGED { duplicate: { id, name, phone }, keptPhone, points, visits }` on the survivor and `RETAIL_RECORD.BINNED { kind: "customer", name, merged: true }` on the duplicate. Toast "Merged. Tapiwa Marange has 3,433 points." |
| Restore the merged one | Management › Bin lists it as "T. Marange, +263 77 412 3380" · "Customer, merged" with Restore (`ADM:bin`). | `POST /api/v2/retail/bin/restore { kind: "customer", id }` → `unmergeCustomer`: moves back exactly what the merge row lists (rows still pointing at the survivor), entries with `mergedFromId` = duplicate, the account if it moved; puts back the survivor's old phone if the merge replaced it; clears `mergedIntoId`, `archivedAt`; `RetailCustomerMerge.undoneAt`. Refuses 409 "Tapiwa Marange has spent points that came from T. Marange. Take them away first." when moving the entries back would leave the survivor below zero. Audit `RETAIL_CUSTOMER.UNMERGED` on both. |

**Works in code today:** partly. The till adds a customer through `POST /api/v2/retail/customers` (name, phone, email; an upsert by
any of the three). There is no back-office add, no edit, no bin, no merge, no number or card.

### W-46 Earn and spend points — **Cashier** — starts "The till"

Steps: Find by phone · Points earned on the sale · Spend at checkout. Screen: customer (the record is where the ledger is read).

| Step | UI | Server |
|---|---|---|
| Find by phone | The till's customer panel (CUS-10): one box "Phone, card or name"; a scanned loyalty card fills it. Results show name, phone, tier, "3,021 points · US$30.21". | `GET /api/v2/retail/pos/customers?q=` (`retail.customers:view` or `retail.sell:view`): digits match the normalised phone (suffix match from 4 digits) and the card number; text matches the name; live customers only; ≤ 8; each with tier, balance, worth, `canSpend`, `spendFrom`, `adult`, `staff`, `priceListId`, and the account summary (4.6). |
| Points earned on the sale | The receipt and the till's done screen read "Points +32 · 3,021 points" (**Defined here**). | In `POST /api/v2/retail/pos/sales` (and the offline replay), after the sale posts, in the same transaction: `earnPoints(tx, sale)` (`lib/retail/loyalty/earn.ts`). Nothing when loyalty is off or there is no `customerId`. Eligible money = Σ eligible lines' line totals in the base currency (after line and order discounts, VAT included) − the points value spent on this sale; a line is not eligible when it carried a promotion (PRD-09) and "Earn on promotion prices" is off; deposits (`depositAmount`) and vouchers sold are never in it. Rate = "Earn" per US$1, or the top tier's rate when the customer is in the top tier at the moment of the sale. Points = floor(eligible × rate); 0 writes nothing. Entry `EARNED (+n, value = n × point value, saleId, actorName = cashier)`. A lay-by hand-over sale (FLR-06) earns on its total at hand-over. The response carries `loyalty: { earned, spent, balance, tier }`. |
| Spend at checkout | The till's "Spend points" (existing redemption input, CUS-10): shows "3,021 points, up to US$30.21" and the minimum. | `pointsToSpend` (replaces `loyaltyRedemptionPoints`). Refusals (400 with the sentence the till shows): loyalty off "Loyalty is off."; no customer "Pick the customer first."; balance under "Spend from" "Tapiwa needs 500 points to spend them. They have 320."; more than the balance "Tapiwa has 3,021 points."; more than the sale allows "Points can pay US$12.40 of this sale." (the eligible lines; with "Points can pay for alcohol" off, age-restricted lines are not payable by points). The value (points × point value, floored to the cent) is a sale-level discount spread over the payable lines, so VAT follows; entry `SPENT (−n, value, saleId)` in the same transaction. The 20% cap and the `LOYALTY_REDEEM:` note go. |
| Refund or void | — (FLR-02's refund and void) | FLR-02 calls `reversePoints(tx, { saleId, reversalSaleId, share })`: share = refunded value ÷ sale value (1 for a void). Writes `REVERSED` entries: −round(earned × share) and +round(spent × share). Taking back never takes a balance below zero; what cannot be taken back is noted on the entry ("Only 12 could be taken back."). |
| Expiry (Automatic) | Ledger row "Expired, a year old", by "Automatic". | Retail worker (SET-01) daily at 00:05 Africa/Harare: `expirePoints(companyId, today)` when expiry is "After 12 months": for each customer, due = max(0, Σ positive entries dated before today − 12 months − Σ |negative entries| to date); due > 0 writes `EXPIRED (−due)` dated 00:00 and audit `RETAIL_POINTS.EXPIRED { points }`. First in, first out by construction. |
| Birthday bonus (Automatic) | Ledger row "Birthday bonus". WhatsApp (consent and a number): "Happy birthday, Tapiwa. 200 points from Harare Bottle Store, to spend this week." (**Defined here**). | Retail worker daily at 07:00: when "Birthday bonus" is on, customers whose birthday falls in the ISO week that starts today (run on Mondays only; a customer gets it once a calendar year) get `BIRTHDAY (+birthdayPoints)`, audit `RETAIL_POINTS.BIRTHDAY`, and an outbox message (`template "birthday"`). |
| Other screens | — | The customer record (strip figure, Points KPI, ledger), Customers (Points), Loyalty's "Last 30 days", Insights › Customers. |

**Works in code today:** partly. `pos/sales` accepts a customer by name and `loyaltyRedemptionPoints` (checked against a balance
computed as whole dollars of every posted sale under that name, capped at 20% of the sale, written as `LOYALTY_REDEEM:n` into the
sale's notes); there is no ledger, no expiry, no birthday bonus, no settings and no reversal on refund.

### W-47 Adjust points — **Manager** — starts "Customer record"

Steps: How many · Why · Save to the ledger. Screens: customer, points.

| Step | UI | Server |
|---|---|---|
| Open | Record header "Adjust points" → `?sheet=points&id=<id>` (board `PointsAdjust.png`). Customers bulk "Add points" → `?sheet=points&ids=<…>`. Owner, Manager (`retail.customers:update`). | `GET /api/v2/retail/customers/[id]` gives the sub ("Tapiwa Marange · 3,021 points, worth US$30.21"). |
| How many | "Points" seg Add / Take away; "How many" (whole number); "Worth" read, live (n × point value). | 1 to 100,000 (400 `fieldErrors.n` "A whole number of points, 1 or more."). |
| Why | "Why" seg: Missed at the till · Make good a complaint · Birthday · Correction; "Note". | Reason one of `MISSED_AT_TILL`, `COMPLAINT`, `BIRTHDAY`, `CORRECTION`; note 1–300 characters (400 `fieldErrors.note` "Say what happened."). |
| Save to the ledger | Primary "Save to the ledger"; note "Adjustments show in their points ledger with your name." | `POST /api/v2/retail/customers/[id]/points { direction, points, reason, note }` → `adjustPoints` (`lib/retail/loyalty/adjust.ts`): Take away more than the balance → 409 `fieldErrors.n` "Tapiwa Marange has 3,021 points. Take away no more than that."; entry `ADJUSTED (±n, value, reason, note, actorId, actorName)` (reason Birthday is drawn "Birthday bonus"); audit `RETAIL_POINTS.ADJUSTED { direction, points, reason, note, balance }`. Toast "200 points added. 3,221 points now." / "200 points taken away. 2,821 points now." Bulk: `POST /api/v2/retail/customers/points { ids, direction, points, reason, note }`, one entry per customer; Take away skips customers with too few points: toast "200 points added to 8 customers." / warn "200 points taken away from 7 customers. Nyasha Gwenzi had too few." |
| Other screens | — | The ledger row (What = the reason, By = the person, Points signed), the strip figure, the Points KPI, Customers' Points column, Activity "Added 200 points: Make good a complaint". |

**Change tier** (Customers bulk "Change tier", **Defined here**, no board): `?sheet=customer-tier&ids=<…>`: title "Change tier", sub
"8 customers", one seg "Tier" (the settings' tiers), hint "Set by spend. Changing it here holds it for 12 months."; primary
"Change 8 tiers"; done "8 customers are Gold until 3 October 2027." `POST /api/v2/retail/customers/tier { ids, tier }`
(`retail.customers:update`), per customer `RETAIL_CUSTOMER.TIER_SET`.

**Works in code today:** no.

### W-48 Set up loyalty — **Owner** — starts "Management › Loyalty" — guided

Steps: Points per US$ · What a point is worth · Tiers · Expiry. Screen: loyalty.

| Step | UI | Server |
|---|---|---|
| Open | Management › Loyalty (`/retail/manage/loyalty`, board `LoyaltySettings.png`). Owner edits; Manager reads (every field read-only, save bar line "Owners only."). | `GET /api/v2/retail/settings/loyalty` (FND 4.10; `retail.loyalty:view`) → values, aside figures, `lastChanged`, `canEdit`. A company without a settings row reads the defaults (the board's values). |
| Points per US$ | Toggle "Loyalty points" (hint "Customers earn at the till when they give their phone number."); "Earn" "1 point for each US$1". | `enabled`; `earnPerDollar` parsed from the first number in the text (0.01–100, two decimals; 400 `fieldErrors.earn` "Write it as “1 point for each US$1”."). Stored as a number and written back as "{n} point(s) for each US$1". |
| What a point is worth | "A point is worth" (US$), hint live "So 100 points take US$1 off." (= round(1 ÷ worth)); "Spend from" "500 points". | `pointValue` 0.0001–1.00 (four decimals); `spendFrom` whole number 0–100,000 parsed like Earn ("Write it as “500 points”."). |
| Tiers | "Tiers, by spend in 12 months" tags ("Bronze, from US$0" · "Silver, from US$500" · "Gold, from US$1,500"; "Add a tier, then Enter"); "<top tier> earns" "1.5 points for each US$1". | Each tag parsed "<Name>, from US$<amount>" (400 `fieldErrors.tiers` "Write each tier as “Silver, from US$500”."); 1–6 tiers; names unique; the lowest starts at US$0 ("The first tier starts at US$0."); stored ascending. `topTierEarnPerDollar` ≥ "Earn" ("The top tier earns at least what everyone earns."). Held tiers whose name no longer exists fall back to spend. |
| Expiry | "Points expire" Never / After 12 months. Choosing "After 12 months" while it is Never shows a warn hint under it: "38 customers lose 4,120 points tonight, earned more than 12 months ago." (**Defined here**, from `expiryPreview`). | `expiry`. The worker applies it from the next night. |
| Rules | Toggles "Earn on promotion prices"; "Birthday bonus" (hint "200 points in their birthday week, with a WhatsApp message."); "Points can pay for alcohol" (hint "Liquor store. Off where your licence does not allow it."; drawn only for a liquor store). | `earnOnPromotions`, `birthdayBonus` (`birthdayPoints` 200, shown in the hint, not editable), `pointsPayForAlcohol`. |
| Save | Save bar "<n> changes not saved · Discard · Save changes" (FND-SETTINGS). | `PATCH /api/v2/retail/settings/loyalty` (`retail.loyalty:update`, owner only; manager 403 "Your role cannot change loyalty settings"): upsert `RetailLoyaltySettings` (+ `updatedById`), audit `RETAIL_SETTINGS.CHANGED { page: "loyalty", changes: [{ field, label, from, to }] }` (entity `RetailSettings`, id `loyalty`). The bar returns to "Saved just now.", then "Last changed by Tendai Mhlanga, 3 October." |
| Other screens | — | The till reads the rules on every sale (server side) and shows the new worth in its customer panel; tiers in Customers and on records recompute on read; the record rail's Loyalty group ("Earns", "Worth", "Expiry"). |

**Works in code today:** no (constants in `lib/retail/loyalty.ts`).

### W-49 Sell on account and collect — **Manager** — starts "The till, and the customer record" — guided

Steps: Approve an account and limit · Sell on account · Statement · Record payment. Screens: accounts, accountnew, accountedit,
custpay, statement.

| Step | UI | Server |
|---|---|---|
| Approve an account and limit | Accounts header "+ Open an account" → `?sheet=account-new` (board `AccountOpen.png`); record ⋯ "Open an account" → the same with `&customerId=`. Owner, Manager (`retail.accounts:create`). Note "Owners approve accounts over US$250.00." (the `ADM:approvals` threshold; US$250.00 until that page exists). | `POST /api/v2/retail/accounts { customerId, limit, termsDays, priceListId, buyers, papersUrl? }` → `openAccount` (`lib/retail/accounts/open.ts`): customer live and without an open account (400 `fieldErrors.cust` "Chikore Weddings already has an account."; a closed one is reopened with the new terms); limit 1.00–100,000.00; terms 7, 14 or 30; price list live; buyers 1–10 names, 2–60 characters each ("Add who may buy on it."). Sets `Customer.priceListId`. When the caller is not an owner and limit > threshold: the account is saved **waiting** (`approved = false`, `requestedLimit = limit`, `limit = 0`), the owners (or `ADM:approvals`' "Owner approvals go to" person) get notification `RETAIL_ACCOUNT_APPROVAL` (and a WhatsApp when "Ask by" is "WhatsApp and the app"); toast "Sent to Tendai Mhlanga to approve: US$500.00 limit for Chikore Weddings." Otherwise approved at once: toast "Account opened for Chikore Weddings. US$500.00 limit, 14 days." Audit `RETAIL_ACCOUNT.OPENED { limit, termsDays, priceList, buyers, waiting }` (entity `Customer`, id the customer). The papers photo is a `RetailAttachment` (`ACCOUNT_PAPERS`, BUY-04's attachment model). |
| (Owner) approve | The notification links to the customer with `?sheet=account-edit&id=<accountId>`; for a waiting limit the owner's sheet reads sub "Tafara Nyathi asked for US$500.00 on 3 October." and primary "Approve US$500.00" (**Defined here**). | `POST /api/v2/retail/accounts/[id]/approve` (`retail.accounts:approve`): `limit = requestedLimit`, clears the request, `approved = true`; notification `RETAIL_ACCOUNT_APPROVED` to the asker; audit `RETAIL_ACCOUNT.APPROVED { limit }`. Toast "US$500.00 limit approved for Chikore Weddings." |
| Change, hold or close | Accounts row ⋯ "Change the account" or record ⋯ "Change the account" → `?sheet=account-edit&id=<accountId>` (board `AccountEdit.png`). Owner, Manager, Bookkeeper (`retail.accounts:update`); danger "Close the account" for owners. | `PATCH /api/v2/retail/accounts/[id] { limit?, termsDays?, held?, buyers? }`: a raise over the threshold by a non-owner keeps the old limit and records `requestedLimit` (approval as above; toast "Account saved. US$1,200.00 waits for Tendai Mhlanga."); `held` true sets `heldReason = BY_HAND`, `heldAt`; false clears it. Audit `RETAIL_ACCOUNT.CHANGED { changes }` and `RETAIL_ACCOUNT.HELD` / `.RELEASED`. Toast "Account saved. Selling on account is on hold until paid." (held) or "Account saved." Close: ConfirmDialog `closeaccount` → `POST /api/v2/retail/accounts/[id]/close` (`retail.accounts:delete`): owed > 0 → 409 "Mbare Sports Club owes US$612.40. Take a payment first."; else `closedAt`, `closedById`; audit `RETAIL_ACCOUNT.CLOSED`; toast "Mbare Sports Club’s account is closed." |
| Sell on account | Till (CUS-10): tender "On account" (shown when SET-05's "On account" is on) → the account (the sale's customer's own, or search an account) → "Who is buying?" (the holder and the named buyers as buttons) → over the limit: STK-04 manager approval. | `pos/sales` with an `ON_ACCOUNT` payment needs `account: { accountId, buyer }` → `chargeAccount(tx, …)` (`lib/retail/accounts/charge.ts`): account open, approved, not closed (409 "Chikore Weddings’ account is waiting for the owner."), not held (409 "Mbare Sports Club’s account is on hold until paid."); buyer is the holder's name or one of `buyers`, case-insensitive (400 "Tonderai Dube is not on Mbare Sports Club’s account."); owed + amount > limit needs `approver` (STK-04 `verifyManagerPin`) else 403 `{ code: "MANAGER_PIN_NEEDED", error: "Over the US$800.00 limit by US$12.40. A manager’s PIN lets it through." }`. Sets `RetailSale.accountId`, `accountBuyer`; creates `RetailAccountCharge { amount = the ON_ACCOUNT payment's base amount, chargedAt = postedAt, dueOn = sale day + termsDays, buyer }`; over the limit → audit `RETAIL_ACCOUNT.OVER_LIMIT { saleNo, over, approvedBy }`. The `RETAIL_SALE` posting debits the `ON_ACCOUNT` tender's mapped account (1100). A refund or void of an on-account sale back to the account (FLR-02, "Money goes back as" the account) raises `credited` on its charge. |
| Statement | Accounts bulk "Send statements" → `?sheet=statement&ids=<…>`; record ⋯ "Send a statement" → `&id=<accountId>` (board `StatementSend.png`). Owner, Manager, Bookkeeper. | `POST /api/v2/retail/accounts/statements { accountIds, covering, sendBy, message }` (4.7): one PDF per account from the documents source `retail.account.statement` (opening balance, each sale on account with who bought it, refunds, payments, closing, overdue and the shop's payment details); WhatsApp → an outbox message with the PDF as a document and the message as its caption; Email → `sendEmail` with the PDF attached; Print → one PDF of all of them. Accounts without a WhatsApp number or email for the chosen way are skipped and named. Audit `RETAIL_ACCOUNT.STATEMENT_SENT { covering, sendBy, closing }` per account. Toast "4 statements sent on WhatsApp." / warn "3 statements sent on WhatsApp. Highfield Shebeen Co-op has no WhatsApp number." |
| Record payment | Record header "Take a payment" or Accounts row ⋯ "Take a payment" → `?sheet=account-payment&id=<accountId>` (board `CustPayment.png`). Owner, Manager, Bookkeeper. | `POST /api/v2/retail/accounts/[id]/payments { amount, method, reference?, paidOn, shiftId? }` → `recordAccountPayment` (`lib/retail/accounts/payments.ts`), one transaction: 0 < amount ≤ owed (400 `fieldErrors.amt` "Mbare Sports Club owes US$612.40."); method CASH, ECOCASH or TRANSFER; reference 4–40 characters required for EcoCash and bank transfer (400 `fieldErrors.ref` "Add the reference."); paid on ≤ today and ≥ the account's opening ("It cannot be paid before the account was opened."). Cash goes through FLR-03's drawer rule (`resolveDrawer`, site = the person's default site): a `RetailCashMovement` IN "Account payment PMT-0042" on that shift so the drawer expects it; none open → 409 "Open a shift at Harare Main Branch to take cash."; several → the sheet asks (`shiftId`). `RetailAccountPayment` (`paymentNo` `PMT-0042`), allocations to the oldest unsettled charges first (`paid` on each); a hold lifts by itself when nothing is left overdue (`RETAIL_ACCOUNT.RELEASED { by: "payment" }`). Ledger `RETAIL_ACCOUNT_PAYMENT` (3.6). Receipt: an outbox WhatsApp to the customer's number with the receipt PDF ("Harare Bottle Store received US$300.00 from Mbare Sports Club by bank transfer, CBZ 0310 4412, on 3 October 2026. You owe US$312.40." **Defined here**). Audit `RETAIL_ACCOUNT.PAYMENT_RECORDED { paymentNo, amount, method, reference, allocations }`. Toast "US$300.00 recorded. Mbare Sports Club owes US$312.40." |
| Hold by itself (Automatic) | AccountEdit hint "On by itself when anything is 30 days overdue." | Retail worker daily at 06:00: accounts with an unsettled charge whose `dueOn` is 30 or more days ago and not held → `held = true`, `heldReason = OVERDUE_30`; audit `RETAIL_ACCOUNT.HELD { reason: "overdue" }`; notification `RETAIL_ACCOUNT_HELD` to owners and managers. |
| Other screens | — | Accounts (owed, overdue, last paid, state), the nav badge "1 overdue", the customer record (Account tab, "Take a payment"), the till (on-account tender, available credit), End of day ("On account" in takings, FLR-07), Insights › Money ("Owed to you"), Posting (the "On account" account, SET-09). |

**Works in code today:** no.

### W-50 Message customers — **Owner** — starts "Customers, tick rows"

Steps: Pick who · Write once · Send on WhatsApp. Screens: customers, message.

| Step | UI | Server |
|---|---|---|
| Pick who | Tick rows on Customers → bulk "Message on WhatsApp" → `?sheet=message&ids=<…>` (board `MessageNew.png`); record header "Message on WhatsApp" → `&ids=<id>`. Owner, Manager (`retail.customers:update`). "To" seg: "The 8 ticked" · "Gold customers" (the top tier) · "Not seen in 30 days" · "Everyone who agreed". Sub "8 ticked · all agreed to WhatsApp" ("8 ticked · 6 agreed to WhatsApp" when not all did). | `GET /api/v2/retail/customers/messages/preview?audience=&ids=` → `{ total, reach, sub, note, primary }`: reach = live customers in the audience with consent and a WhatsApp number (or phone). |
| Write once | "Message" (4 rows), hint "{first name} and {points} fill in for each person." | 1–1,000 characters; only `{first name}` and `{points}` (400 `fieldErrors.msg` "Only {first name} and {points} fill in."). |
| Send on WhatsApp | "Send" seg "Now" / "Friday 16:00" (the next Friday 16:00, Africa/Harare; "Today 16:00" on a Friday before 16:00 — **Defined here**). Note "WhatsApp charges about US$0.02 a message. 8 messages, US$0.16." Primary "Send to 8" ("Schedule for 8" with Friday). | `POST /api/v2/retail/customers/messages { audience, ids?, body, sendAt }` → `queueCustomerMessages` (`lib/retail/messages/queue.ts`): WhatsApp not set up (SET-07 credentials missing) → 409 "WhatsApp is not set up yet, so nothing was sent."; a `RetailMessageBatch` (purpose OFFER) and one `RetailMessage` per reached customer (`template "customer-offer"`, `customerId`, `batchId`, `scheduledFor`, body filled for the person); the outbox drain (every 5 minutes) sends them, re-filling `{points}` for scheduled ones at send time. Audit `RETAIL_MESSAGES.QUEUED { purpose, audience, count, scheduledFor }` (entity `RetailMessageBatch`). Toast "Sent to 8 customers." / "8 messages go on Friday at 16:00." |
| They reply STOP | — | `POST /api/webhooks/whatsapp` (Meta webhook; `GET` verifies with `META_WHATSAPP_VERIFY_TOKEN`; signature checked with `META_WHATSAPP_APP_SECRET`): an inbound text "STOP" (any case, trimmed) turns `marketingConsent` off for every live customer with that number, audit `RETAIL_CUSTOMER.CONSENT_CHANGED { agreed: false, via: "STOP reply" }`. |
| Other screens | — | The record's chip "Agreed to messages" goes; Customers' "Messages" filter; reminders and statements are not affected. |

The same sheet serves the **reminders** other screens send (**Defined here**): `?sheet=message&purpose=reminder&about=account:<accountIds>`
(Accounts bulk "Remind on WhatsApp") and `&about=layby:<laybyIds>` (FLR-06's Lay-bys bulk). For reminders "To" has the one option
"The 4 ticked", consent is not needed (a number is), the default body is the reminder text (5.10), and its placeholders are
`{first name}` plus `{owed}`, `{overdue}` (accounts) or `{lay-by}`, `{left}`, `{due}` (lay-bys). Purpose `ACCOUNT_REMINDER` /
`LAYBY_REMINDER`; FLR-06 sets `lastRemindedAt` on each lay-by reminded.

**Works in code today:** no.

### W-62 Edit a record's details — the customer record's rail (frame: FND-RECORD 4.9)

Click a value on the rail (owner, manager): Phone, WhatsApp, Email, Area, Card. Enter saves → `PATCH /api/v2/retail/customers/[id]`
with that one field (W-45's rules; WhatsApp "Same number" stores null; Card must be 12 digits and unused in the company, 409
`fieldErrors.cardNo` "That card is Nyasha Gwenzi’s."), `RETAIL_RECORD.EDITED`, "Saved" under the key. Esc cancels. The Loyalty group's
Earns, Worth and Expiry and the "Usually buys" group are read-only (they are computed).

### W-63 Delete and restore — the customer (frame: FND-RECORD 4.6)

As W-45 "Bin" and "Restore the merged one". A binned customer's record opens with the bin banner; its body is dimmed; ⋯ keeps
"Export as PDF".

### Workflows that already work, in one line each

- The till can attach a named customer to a sale and redeem points against a balance worked out from sales by name (W-46, to be
  replaced).
- Nothing else in W-45 to W-50 works today.

---
## 3. Data

### 3.1 Models used

| Model | Used for | Owner of the change |
|---|---|---|
| `Customer` (extended) | Customers, the record, lookups, the till's search, merge, bin | this spec (3.2.1) |
| `RetailCustomerNote` (new) | The record's Notes tab | 3.2.1 |
| `RetailLoyaltySettings` (new) | Management › Loyalty; every earn, spend, expiry, tier and birthday rule | 3.2.2 |
| `RetailPointsEntry` (new) | The points ledger; every balance | 3.2.2 |
| `RetailCustomerMerge` (new) | Merge and its undo from the bin | 3.2.3 |
| `RetailMessageBatch` (new), `RetailMessage` (SET-07, extended) | Offers, reminders, statements, payment receipts, birthday messages | 3.2.4 |
| `RetailCustomerAccount`, `RetailAccountCharge`, `RetailAccountPayment`, `RetailAccountAllocation` (new) | Accounts, owed, overdue, payments, statements | 3.2.5 |
| `RetailSale` (FLR-01's `customerId`; this spec's `accountId`, `accountBuyer`) | Visits, spend, Purchases, the earn and spend, charges | FLR-01, 3.2.5 |
| `RetailSaleLine`, `RetailSalePayment` | Usually buys, Pays with, eligible money, the `ON_ACCOUNT` amount | existing (+PRD-09 line promotion) |
| `PriceList` (PRD-05) | A customer's price list ("Edit everything", "Open an account") | PRD-05 |
| `RetailLayby` (FLR-06), `RetailVoucher` (PRD-10) | The Lay-bys tab; what a merge moves | their specs |
| `RetailCashMovement` (FLR-03) | Cash taken on account goes into a drawer | FLR-03 |
| `RetailAttachment` (BUY-04) | "ID or company papers" | BUY-04 (kind `ACCOUNT_PAPERS` added here) |
| `TenderAccountMapping`, `PostingRule(Line)`, `ChartOfAccount` | `ON_ACCOUNT` → 1100; the payment posting | SET-09, BUY-05, 3.2.6 |
| `PlatformAuditEvent` | Activity, "Last changed by", bin banner | FND |
| `Notification` | Account approval, approved, held | existing (`emitRetailNotification`) |
| `User` (`phone`, `role`) | Staff detection (a customer whose phone is an active staff member's), actor names | existing |

What each figure is (one definition, `lib/retail/customers/stats.ts`, used by the list loader, the record, the till and insights):

| Figure | Definition |
|---|---|
| 12 months | `[today − 365 days, now]` in Africa/Harare; "the 12 before" is the 365 days before that |
| Spend, 12 months | Σ `RetailSale.baseAmount` of the customer's SALE (POSTED or VOIDED), VOID and REFUND documents in the window (voids net to zero, refunds subtract) |
| Visits | Count of the customer's SALE documents in the window that are not voided |
| Days apart | 365 ÷ visits, one decimal ("2.6"); "usually <n>" = that rounded to a whole day |
| Average basket | Spend ÷ visits, to the cent |
| Last visit | `max(postedAt)` of the customer's not-voided SALE documents, ever |
| Points | Σ `RetailPointsEntry.points` of the customer, ever |
| Worth | Points × the point value, floored to the cent |
| Tier | `tierHeld` while `tierHeldUntil` ≥ today and the name is still a tier; else the highest tier whose "from" ≤ Spend, 12 months |
| Owed | Σ over the account's charges of `amount − credited − paid` |
| Overdue | The same, over charges with `dueOn` < today |
| Last paid | `max(paidOn)` of the account's payments |
| Account state | Closed (`closedAt`) › Waiting for the owner (`approved = false` or `requestedLimit` on a new account) › Overdue (overdue > 0) › On hold (`held`) › Owing (owed > 0) › Paid up |
| Staff | an active `User` of the company with a retail role and the same normalised phone (no column) |

### 3.2 Schema changes, by migration

Slot `2026100413 6xxx`. Every migration ships with its witness test in the same commit and is applied with `npx prisma migrate
deploy` on the dev database and again with `DATABASE_URL="$DATABASE_URL_TEST"`. Back-relations on `Company`, `User`, `PriceList`,
`RetailSale`, `RetailShift` are added as named.

#### 3.2.1 `20261004136000_retail_customers` (CUS-01) · witness `lib/retail/customers/customers-migration.test.ts`

```prisma
model Customer {
  // … existing: id, companyId, taxCategoryId, name, contactName, phone, email, address, taxNumber, vatNumber, isActive,
  //   createdAt, updatedAt, and FLR-01's retailSales …
  /// "CUS-00141": company-wide, five digits (`reserveIdentifier` entity RETAIL_CUSTOMER).
  code             String?
  /// The WhatsApp number when it is not `phone`. Null means "Same number".
  whatsapp         String?
  /// "Mbare, Harare".
  area             String?
  dateOfBirth      DateTime?  @db.Date
  /// "Agrees to WhatsApp messages": offers and points news. Receipts, statements and reminders do not need it.
  marketingConsent Boolean    @default(false)
  consentChangedAt DateTime?
  /// Loyalty card, twelve digits, printed in fours: "6009 1400 0141".
  cardNo           String?
  /// A tier chosen by hand, held until `tierHeldUntil`. Null: the tier follows spend.
  tierHeld         String?
  tierHeldUntil    DateTime?  @db.Date
  /// The list this customer buys at ("Edit everything" › Price list, "Open an account" › Price list). Null: the till's list.
  priceListId      String?
  archivedAt       DateTime?
  /// Set on a duplicate merged into another customer (it sits in the bin).
  mergedIntoId     String?
  createdById      String?

  priceList     PriceList?             @relation("CustomerPriceList", fields: [priceListId], references: [id], onDelete: SetNull)
  mergedInto    Customer?              @relation("CustomerMergedInto", fields: [mergedIntoId], references: [id], onDelete: SetNull)
  mergedFrom    Customer[]             @relation("CustomerMergedInto")
  createdBy     User?                  @relation("CustomerCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
  notes         RetailCustomerNote[]
  pointsEntries RetailPointsEntry[]    // 3.2.2
  account       RetailCustomerAccount? // 3.2.5

  @@unique([companyId, code])
  @@unique([companyId, cardNo])
  @@index([companyId, phone])
  @@index([companyId, archivedAt])
}

model RetailCustomerNote {
  id          String   @id @default(uuid())
  companyId   String
  customerId  String
  body        String
  createdById String?
  createdAt   DateTime @default(now())

  company   Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  customer  Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  createdBy User?    @relation("RetailCustomerNoteCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)

  @@index([customerId, createdAt])
}
```

SQL after the DDL: number existing customers per company by `createdAt` (`code` = `'CUS-' || lpad(n, 5, '0')`, `cardNo` =
`'600914' || lpad(n, 6, '0')`); normalise `phone` to E.164 for Zimbabwe (strip spaces and dashes; a leading `0` becomes `+263`, a
leading `263` gains `+`; anything else is left as it was). Code with it (no schema): `lib/id-generator.ts` entity
`RETAIL_CUSTOMER` (prefix `CUS`, pad 5, company-wide, `requiresSiteId: false`; first-use scan reads `Customer.code`). Witness:
the twelve columns with their types and defaults, both unique indexes, both plain indexes, the three FKs with `ON DELETE SET
NULL`, the note table; on a fixture of three customers, codes CUS-00001…3 in creation order, card numbers to match, and
"0774 123 388" stored as `+263774123388`.

#### 3.2.2 `20261004136100_retail_loyalty` (CUS-01) · witness `lib/retail/loyalty/loyalty-migration.test.ts`

```prisma
enum RetailPointsExpiry {
  NEVER
  AFTER_12_MONTHS
}

/// Management › Loyalty. One row per company; absent = the defaults below (the board's values).
model RetailLoyaltySettings {
  companyId            String             @id
  /// "Loyalty points".
  enabled              Boolean            @default(true)
  /// "Earn": points for each US$1 paid.
  earnPerDollar        Decimal            @default(1) @db.Decimal(6, 2)
  /// "A point is worth".
  pointValue           Decimal            @default(0.01) @db.Decimal(8, 4)
  /// "Spend from": the balance needed before points can pay.
  spendFrom            Int                @default(500)
  /// "Points expire".
  expiry               RetailPointsExpiry @default(AFTER_12_MONTHS)
  /// "Tiers, by spend in 12 months", ascending: [{ "name": "Bronze", "from": "0.00" }, …].
  tiers                Json               @default("[{\"name\":\"Bronze\",\"from\":\"0.00\"},{\"name\":\"Silver\",\"from\":\"500.00\"},{\"name\":\"Gold\",\"from\":\"1500.00\"}]")
  /// "<top tier> earns".
  topTierEarnPerDollar Decimal            @default(1.5) @db.Decimal(6, 2)
  /// "Earn on promotion prices".
  earnOnPromotions     Boolean            @default(true)
  /// "Birthday bonus" and how many points it gives (not editable on the page).
  birthdayBonus        Boolean            @default(true)
  birthdayPoints       Int                @default(200)
  /// "Points can pay for alcohol" (liquor store).
  pointsPayForAlcohol  Boolean            @default(true)
  updatedById          String?
  createdAt            DateTime           @default(now())
  updatedAt            DateTime           @updatedAt

  company   Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  updatedBy User?   @relation("RetailLoyaltySettingsUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)
}

enum RetailPointsKind {
  EARNED    // "Earned on a sale"
  SPENT     // "Spent on a sale"
  ADJUSTED  // the reason: "Missed at the till", "Make good a complaint", "Birthday bonus", "Correction"
  BIRTHDAY  // "Birthday bonus", by the rule
  EXPIRED   // "Expired, a year old"
  REVERSED  // "Taken back on a refund" / "Back on a refund"
}

enum RetailPointsReason {
  MISSED_AT_TILL
  COMPLAINT
  BIRTHDAY
  CORRECTION
}

/// One movement of a customer's points. The balance is the sum; rows are never edited or deleted.
model RetailPointsEntry {
  id           String              @id @default(uuid())
  /// Stable order for the running balance.
  seq          BigInt              @default(autoincrement())
  companyId    String
  customerId   String
  kind         RetailPointsKind
  /// Signed: +32 earned, −500 spent.
  points       Int
  /// What the points were worth when they moved (for SPENT: the discount given).
  value        Decimal             @default(0) @db.Decimal(14, 2)
  /// The sale earned on or spent at, or the refund or void that reversed them.
  saleId       String?
  reason       RetailPointsReason?
  note         String?
  /// Null = "Automatic".
  actorId      String?
  actorName    String?
  /// Set on rows a merge moved here: the duplicate they came from.
  mergedFromId String?
  createdAt    DateTime            @default(now())

  company  Company     @relation(fields: [companyId], references: [id], onDelete: Cascade)
  customer Customer    @relation(fields: [customerId], references: [id], onDelete: Cascade)
  sale     RetailSale? @relation("RetailPointsEntrySale", fields: [saleId], references: [id], onDelete: SetNull)
  actor    User?       @relation("RetailPointsEntryActor", fields: [actorId], references: [id], onDelete: SetNull)

  @@index([companyId, customerId, createdAt])
  @@index([companyId, kind, createdAt])
  @@index([saleId])
}
```

SQL after the DDL (the ledger starts from what customers have today; FLR-01's backfill has already set `RetailSale.customerId`):
one `EARNED` row per POSTED SALE with a `customerId` and `totalAmount ≥ 1`, points = floor(`baseAmount`), dated the sale's
`postedAt`, `actorName` the cashier; one `SPENT` row per sale whose `notes` contain `LOYALTY_REDEEM:<n>` (points −n, value n ×
0.01); then strip `LOYALTY_REDEEM:<n>` (and a joining " | ") from every sale's `notes`. Witness: the enums and columns, the
`seq` sequence, the three indexes, and on a fixture (a customer with a US$20.50 sale and a sale noted `LOYALTY_REDEEM:500`) the
balance −480 and no `LOYALTY_REDEEM` left in any note.

#### 3.2.3 `20261004136200_retail_customer_merges` (CUS-05) · witness `lib/retail/customers/merges-migration.test.ts`

```prisma
/// What one merge moved, so a restore from the bin can move it back.
model RetailCustomerMerge {
  id                  String    @id @default(uuid())
  companyId           String
  survivorId          String
  duplicateId         String    @unique
  /// The survivor's phone before the merge, when the duplicate's number was kept.
  survivorPhoneBefore String?
  saleIds             String[]
  laybyIds            String[]
  voucherIds          String[]
  noteIds             String[]
  accountMoved        Boolean   @default(false)
  points              Int
  visits              Int
  mergedById          String?
  createdAt           DateTime  @default(now())
  undoneAt            DateTime?
  undoneById          String?

  company   Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  survivor  Customer @relation("RetailCustomerMergeSurvivor", fields: [survivorId], references: [id], onDelete: Cascade)
  duplicate Customer @relation("RetailCustomerMergeDuplicate", fields: [duplicateId], references: [id], onDelete: Cascade)

  @@index([companyId, survivorId])
}
```

Witness: table, columns, the unique and the index, both FKs.

#### 3.2.4 `20261004136300_retail_customer_messages` (CUS-06) · witness `lib/retail/messages/customer-messages-migration.test.ts`

```prisma
enum RetailMessagePurpose {
  OFFER             // "Message customers"
  ACCOUNT_REMINDER  // Accounts › "Remind on WhatsApp"
  LAYBY_REMINDER    // Lay-bys › "Remind on WhatsApp" (FLR-06)
  STATEMENT
}

/// One "Send to 8": who it was for, what was typed, when it goes.
model RetailMessageBatch {
  id           String               @id @default(uuid())
  companyId    String
  purpose      RetailMessagePurpose
  /// "ticked" | "top-tier" | "lapsed-30" | "all-agreed"
  audience     String
  /// The text as typed, with {first name}, {points}, {owed}, {overdue}, {lay-by}, {left}, {due}.
  template     String
  scheduledFor DateTime?
  total        Int
  createdById  String?
  createdAt    DateTime             @default(now())

  company   Company         @relation(fields: [companyId], references: [id], onDelete: Cascade)
  createdBy User?           @relation("RetailMessageBatchCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
  messages  RetailMessage[]
}

model RetailMessage {
  // … SET-07: id, companyId, channel, to, template, body, saleId, status, attempts, lastError, sentAt, createdById, createdAt …
  customerId   String?
  batchId      String?
  /// Not before this ("Send: Friday 16:00"). Null = as soon as the drain runs.
  scheduledFor DateTime?
  /// A file that goes with it (a statement or a payment receipt): a signed link the provider fetches, and its name.
  documentUrl  String?
  documentName String?

  customer Customer?           @relation("RetailMessageCustomer", fields: [customerId], references: [id], onDelete: SetNull)
  batch    RetailMessageBatch? @relation(fields: [batchId], references: [id], onDelete: SetNull)

  @@index([companyId, status, scheduledFor])
  @@index([customerId, createdAt])
}
```

Witness: enum labels in order, the batch table, the four columns, both FKs (`SET NULL`), both indexes.

#### 3.2.5 `20261004136400_retail_customer_accounts` (CUS-07) · witness `lib/retail/accounts/accounts-migration.test.ts`

```prisma
enum RetailAccountHoldReason {
  BY_HAND      // "Stop selling on account until paid" switched on
  OVERDUE_30   // "On by itself when anything is 30 days overdue."
}

/// A customer who buys now and pays later. One per customer; closing keeps the row (a reopen reuses it).
model RetailCustomerAccount {
  id             String                   @id @default(uuid())
  companyId      String
  customerId     String                   @unique
  limit          Decimal                  @db.Decimal(14, 2)
  /// "Pays in": 7, 14 or 30 days after each sale.
  termsDays      Int                      @default(30)
  /// "Who may buy on it", besides the customer's own name.
  buyers         String[]                 @default([])
  held           Boolean                  @default(false)
  heldReason     RetailAccountHoldReason?
  heldAt         DateTime?
  /// False while a new account waits for the owner.
  approved       Boolean                  @default(true)
  /// A limit waiting for the owner (opening or raising over the threshold).
  requestedLimit Decimal?                 @db.Decimal(14, 2)
  requestedById  String?
  requestedAt    DateTime?
  approvedById   String?
  approvedAt     DateTime?
  openedById     String?
  openedAt       DateTime                 @default(now())
  closedAt       DateTime?
  closedById     String?
  updatedAt      DateTime                 @updatedAt

  company     Company                @relation(fields: [companyId], references: [id], onDelete: Cascade)
  customer    Customer               @relation(fields: [customerId], references: [id], onDelete: Restrict)
  requestedBy User?                  @relation("RetailAccountRequestedBy", fields: [requestedById], references: [id], onDelete: SetNull)
  approvedBy  User?                  @relation("RetailAccountApprovedBy", fields: [approvedById], references: [id], onDelete: SetNull)
  openedBy    User?                  @relation("RetailAccountOpenedBy", fields: [openedById], references: [id], onDelete: SetNull)
  closedBy    User?                  @relation("RetailAccountClosedBy", fields: [closedById], references: [id], onDelete: SetNull)
  charges     RetailAccountCharge[]
  payments    RetailAccountPayment[]
  sales       RetailSale[]           @relation("RetailSaleAccount")

  @@index([companyId, closedAt])
}

/// One sale on account: what it put on the account and when it is due.
model RetailAccountCharge {
  id        String   @id @default(uuid())
  companyId String
  accountId String
  saleId    String   @unique
  chargedAt DateTime
  amount    Decimal  @db.Decimal(14, 2)
  /// Refunds and voids put back on the account.
  credited  Decimal  @default(0) @db.Decimal(14, 2)
  /// Payments settled against it.
  paid      Decimal  @default(0) @db.Decimal(14, 2)
  dueOn     DateTime @db.Date
  /// Who bought on the account ("Tonderai Dube").
  buyer     String

  company     Company                   @relation(fields: [companyId], references: [id], onDelete: Cascade)
  account     RetailCustomerAccount     @relation(fields: [accountId], references: [id], onDelete: Cascade)
  sale        RetailSale                @relation("RetailAccountChargeSale", fields: [saleId], references: [id], onDelete: Restrict)
  allocations RetailAccountAllocation[]

  @@index([accountId, dueOn])
}

/// Money a customer paid on their account. "PMT-0042".
model RetailAccountPayment {
  id           String           @id @default(uuid())
  companyId    String
  accountId    String
  paymentNo    String
  amount       Decimal          @db.Decimal(14, 2)
  /// CASH, ECOCASH or TRANSFER ("Paid by").
  method       RetailTenderType
  reference    String?
  paidOn       DateTime         @db.Date
  /// Cash only: the drawer it went into.
  shiftId      String?
  receivedById String?
  createdAt    DateTime         @default(now())

  company     Company                   @relation(fields: [companyId], references: [id], onDelete: Cascade)
  account     RetailCustomerAccount     @relation(fields: [accountId], references: [id], onDelete: Cascade)
  shift       RetailShift?              @relation("RetailAccountPaymentShift", fields: [shiftId], references: [id], onDelete: SetNull)
  receivedBy  User?                     @relation("RetailAccountPaymentReceivedBy", fields: [receivedById], references: [id], onDelete: SetNull)
  allocations RetailAccountAllocation[]

  @@unique([companyId, paymentNo])
  @@index([accountId, paidOn])
}

model RetailAccountAllocation {
  id        String   @id @default(uuid())
  paymentId String
  chargeId  String
  amount    Decimal  @db.Decimal(14, 2)

  payment RetailAccountPayment @relation(fields: [paymentId], references: [id], onDelete: Cascade)
  charge  RetailAccountCharge  @relation(fields: [chargeId], references: [id], onDelete: Cascade)

  @@unique([paymentId, chargeId])
}

model RetailSale {
  // … existing and FLR-01's customerId …
  /// Sold on this account (an ON_ACCOUNT payment) and who bought on it.
  accountId    String?
  accountBuyer String?

  account       RetailCustomerAccount? @relation("RetailSaleAccount", fields: [accountId], references: [id], onDelete: Restrict)
  accountCharge RetailAccountCharge?   @relation("RetailAccountChargeSale")
  pointsEntries RetailPointsEntry[]    @relation("RetailPointsEntrySale")

  @@index([accountId])
}
```

`RetailAttachmentKind` (BUY-04) gains `ACCOUNT_PAPERS` in the same migration (`ALTER TYPE … ADD VALUE`, first statement). Code
with it: `lib/id-generator.ts` entity `RETAIL_ACCOUNT_PAYMENT` (prefix `PMT`, pad 4, company-wide). Witness: the enum, the four
tables with columns, defaults and checks, the unique `customerId`, `saleId` and `(companyId, paymentNo)`, the indexes, the FKs
(`Restrict` from charge to sale and from account to customer), the two sale columns and their index, and the attachment kind.

#### 3.2.6 `20261004136500_retail_account_payment_posting` (CUS-08) · witness `lib/retail/accounts/payment-posting-migration.test.ts`

```prisma
enum AccountingSourceType {
  // … existing, and BUY-05's additions …
  RETAIL_ACCOUNT_PAYMENT
}
```

SQL: `ALTER TYPE "AccountingSourceType" ADD VALUE 'RETAIL_ACCOUNT_PAYMENT'` (first statement, outside a transaction block);
then for every company that has the retail foundation pack and no active company-level `TenderAccountMapping` for
`ON_ACCOUNT`, insert one (`clearingAccountId` = its `1100` "Accounts Receivable", priority 60). `RETAIL_TENDER_ACCOUNT_MAPPINGS`
in `lib/accounting/defaults.ts` gains `{ tenderType: "ON_ACCOUNT", clearingAccountCode: "1100", priority: 60 }` and
`RETAIL_POSTING_RULES` the rule in 3.6, so new tenants get both from the seed pack. Witness: the enum value, and on a fixture
company with the pack, exactly one `ON_ACCOUNT` mapping pointing at its 1100 account.

### 3.3 Permissions (`lib/retail/permissions.ts`)

| Resource (label in "Your role cannot … <label>") | Owner `SUPERADMIN` | Manager `MANAGER`, `SHOP_MANAGER` | Cashier `CASHIER`, `POS_CASHIER` | Stock clerk | Bookkeeper `FINANCE_OFFICER` |
|---|---|---|---|---|---|
| `retail.customers` (new; "customers") | ALL | view, create, update, delete | view, create | – | view |
| `retail.accounts` (new; "accounts") | ALL (approve = limits over the threshold; delete = close) | view, create, update | – | – | view, update |
| `retail.loyalty` (new; "loyalty settings") | view, update | view | – | – | – |

Customer routes stop using `retail.sell` (the old gate). `lib/retail/permissions.test.ts` gains the rows above (and drops the
"customers, loyalty and the sales list are the counter's" case); `lib/retail/route-guard-coverage.test.ts` gains every new
handler. Route registry (`lib/platform/gating/route-registry.ts`): `/api/v2/retail/accounts` → `crm.customers`; the stale
`/api/retail/customers` entry goes; `/api/webhooks/whatsapp` is added to `lib/public-routes.ts` (verified by signature).

### 3.4 Audit events (`lib/retail/audit.ts`, `RETAIL_AUDIT_EVENTS`) and Activity sentences (`lib/retail/activity-words.ts`)

Account events are written against the **customer** (`entityType "Customer"`, `entityId` the customer), with `accountId` in the
payload, so the customer record's Activity tab shows them; there is no account record.

| Constant | Event | Entity | Payload | Sentence | Tone |
|---|---|---|---|---|---|
| `customerCreated` | `RETAIL_CUSTOMER.CREATED` | `Customer` | `{ code, name, consent, via: "sheet" \| "till" \| "lookup" }` | "Added, agreed to messages" / "Added at the till" | `ok` |
| `customerMerged` | `RETAIL_CUSTOMER.MERGED` | `Customer` (survivor) | `{ duplicate: { id, name, phone }, keptPhone, points, visits }` | "Merged in T. Marange, +263 77 412 3380: 412 points, 9 visits" | `info` |
| `customerUnmerged` | `RETAIL_CUSTOMER.UNMERGED` | `Customer` (both) | `{ other: { id, name }, points, visits }` | "Took T. Marange back out: 412 points, 9 visits" | `warn` |
| `customerConsent` | `RETAIL_CUSTOMER.CONSENT_CHANGED` | `Customer` | `{ agreed, via: "record" \| "sheet" \| "STOP reply" }` | "Stopped marketing messages" / "Agreed to messages" / "Replied STOP on WhatsApp" | `hollow` |
| `customerTier` | `RETAIL_CUSTOMER.TIER_SET` | `Customer` | `{ tier, until }` | "Held at Gold until 3 October 2027" | `info` |
| `customerNote` | `RETAIL_CUSTOMER.NOTE_ADDED` | `Customer` | `{ noteId }` | "Added a note" | `hollow` |
| `pointsAdjusted` | `RETAIL_POINTS.ADJUSTED` | `Customer` | `{ direction, points, reason, note, balance }` | "Added 200 points: Make good a complaint" / "Took away 100 points: Correction" | `warn` |
| `pointsBirthday` | `RETAIL_POINTS.BIRTHDAY` | `Customer` | `{ points }` | "Birthday bonus, 200 points" | `warn` |
| `pointsExpired` | `RETAIL_POINTS.EXPIRED` | `Customer` | `{ points }` | "42 points expired, a year old" | `hollow` |
| `messagesQueued` | `RETAIL_MESSAGES.QUEUED` | `RetailMessageBatch` | `{ purpose, audience, count, scheduledFor }` | "Sent an offer to 8 customers" / "Scheduled …" | `hollow` |
| `accountOpened` | `RETAIL_ACCOUNT.OPENED` | `Customer` | `{ accountId, limit, termsDays, priceList, buyers, waiting }` | "Opened an account: US$500.00 limit, 14 days" / "Asked the owner for a US$500.00 account" | `ok` / `warn` |
| `accountApproved` | `RETAIL_ACCOUNT.APPROVED` | `Customer` | `{ accountId, limit }` | "Approved a US$500.00 limit" | `ok` |
| `accountChanged` | `RETAIL_ACCOUNT.CHANGED` | `Customer` | `{ accountId, changes: [{ field, label, from, to }], waiting? }` | "Changed the account: Limit from US$800.00 to US$1,000.00" | `info` |
| `accountHeld` / `accountReleased` | `RETAIL_ACCOUNT.HELD` / `.RELEASED` | `Customer` | `{ accountId, reason: "by hand" \| "overdue" \| "payment" }` | "Put selling on account on hold" / "On hold by itself: US$212.40 is 30 days overdue" / "Took the account off hold" | `warn` / `warn` / `ok` |
| `accountClosed` | `RETAIL_ACCOUNT.CLOSED` | `Customer` | `{ accountId }` | "Closed the account" | `hollow` |
| `accountOverLimit` | `RETAIL_ACCOUNT.OVER_LIMIT` | `Customer` | `{ accountId, saleNo, over, approvedBy }` | "SALE-31871 went US$12.40 over the limit, allowed by Tafara Nyathi" | `warn` |
| `accountPayment` | `RETAIL_ACCOUNT.PAYMENT_RECORDED` | `Customer` | `{ accountId, paymentNo, amount, method, reference, allocations: [{ saleNo, amount }] }` | "Took US$300.00 by bank transfer, CBZ 0310 4412" | `ok` |
| `accountStatement` | `RETAIL_ACCOUNT.STATEMENT_SENT` | `Customer` | `{ accountId, covering, sendBy, closing }` | "Sent the September statement on WhatsApp" | `hollow` |

Edits through the rail and the edit sheet are FND's `RETAIL_RECORD.EDITED` with labels Name, Phone, WhatsApp, Email, Area, Date of
birth, Card, Price list. `lib/retail/audit.test.ts` asserts the full list.

### 3.5 Notifications (`emitRetailNotification`, `lib/notifications.ts`)

| Type | To | Title | Summary | Link | Severity |
|---|---|---|---|---|---|
| `RETAIL_ACCOUNT_APPROVAL` | `ADM:approvals`' "Owner approvals go to" person, else every owner | "Approve a US$500.00 limit for Chikore Weddings" | "Tafara Nyathi opened it: 14 days, Wholesale." / "Tafara Nyathi wants Mbare Sports Club’s limit raised from US$800.00 to US$1,200.00." | `/retail/customers/<customerId>?sheet=account-edit&id=<accountId>` | WARNING |
| `RETAIL_ACCOUNT_APPROVED` | the person who asked | "Chikore Weddings’ account is open" | "US$500.00 limit, approved by Tendai Mhlanga." | `/retail/customers/<customerId>` | INFO |
| `RETAIL_ACCOUNT_HELD` | owners and managers | "Mbare Sports Club’s account is on hold" | "US$212.40 is 30 days overdue. Selling on account stops until it is paid." | `/retail/customers/<customerId>` | WARNING |

Entity type `RETAIL_ACCOUNT`. With `ADM:approvals` "Ask by: WhatsApp and the app", the approval also goes to that person's phone
through the outbox ("Tafara Nyathi asks you to approve a US$500.00 limit for Chikore Weddings. Open Tender to approve." **Defined
here**).

### 3.6 Ledger (`lib/accounting/defaults.ts`, `lib/accounting/source-types.ts`)

| Source type | Event when | Lines |
|---|---|---|
| `RETAIL_SALE` (existing) | a sale with an `ON_ACCOUNT` payment posts | unchanged: Dr the tender's mapped account per payment (`ON_ACCOUNT` → 1100 Accounts Receivable) / Cr 4000, 2200 … |
| `RETAIL_REFUND`, `RETAIL_VOID` (existing) | money goes back to the account | unchanged: they reverse through the same `ON_ACCOUNT` mapping |
| `RETAIL_ACCOUNT_PAYMENT` (new fallback rule "Retail account payment", company scope, `GUIDED`, `isFallback`) | a payment is recorded | Dr `TENDER_MAPPING` repeat over `payments` (one: the method, CASH / ECOCASH / TRANSFER) / Cr `EVENT_ACCOUNT` `receivable` AMOUNT (BUY-05's line source) |

`lib/retail/accounts/posting.ts` captures the event after commit with `payload.payments = [{ tenderType: method, amount }]` and
`payload.accounts.receivable` = the company's `ON_ACCOUNT` mapping's clearing account (missing → `EVENT_ACCOUNT_MISSING`, a
PENDING posting the drain retries); a locked period leaves it PENDING. `lib/retail/accounts/posting.test.ts` asserts the entry
balances and reads the right accounts. Points move no money in the books (see open question 4).

### 3.7 Words (`lib/retail/words.ts`)

`pointsKindLabel`: EARNED "Earned on a sale" (tone ok), SPENT "Spent on a sale" (info), BIRTHDAY "Birthday bonus" (warn),
EXPIRED "Expired, a year old" (hollow), REVERSED "Taken back on a refund" (negative) / "Back on a refund" (positive) (hollow),
ADJUSTED by reason: "Missed at the till", "Make good a complaint", "Birthday bonus", "Correction" (warn). `accountStateLabel`:
"Overdue" (bad), "Owing" (info), "Paid up" (hollow), "On hold" (warn), "Waiting for the owner" (pending), "Closed" (neutral).
`termsLabel(n)` "14 days". `signedPoints(n)` "+32" / "−500" (U+2212) / "0". `pointsWorth(n, value)` "US$30.21". Phones
`formatPhone("+263774123388")` "+263 77 412 3388"; cards `formatCard("600914000141")` "6009 1400 0141".

### 3.8 Seed and demo data (`scripts/seed-retail-demo.ts`)

One idempotent function per unit, called from `main()` after the foundations, setup, products and floor seeds. Run: `pnpm tsx
scripts/seed-retail-demo.ts --slug hurudza-creative --days 160 --reset`. Times are offsets from the run; shown here for a run on
Saturday 3 October 2026, 14:42 Africa/Harare. People: Tendai Mhlanga (owner), Tafara Nyathi (manager), Chipo Dube and Farai Moyo
(cashiers), the bookkeeper from PRD-01.

**How the history is made.** The boards need 12 months of the regulars' visits (and 24 for Tapiwa Marange's "on the 12 before"),
and the floor history is 160 days. So:
- `planCustomerSales()` (CUS) builds the regulars' and the accounts' sales inside the floor window — date-time, customer or
  account and buyer, lines, tender, amount — and **FLR-01's history generator takes them as planned sales** (`seedSalesHistory({
  planned })`): it rings each on the shift open at that time at Harare Main Branch and numbers it in sequence with the rest, so
  sale numbers stay contiguous and each shift's counts (FLR-04) include them. FLR-01's own sales are walk-in unless CUS attaches
  a customer (below); FLR-01 stops picking random customer names.
- Before the floor window, `seedCustomerHistory()` creates one closed shift per day that has a planned visit (Front till; cashier
  Chipo Dube Monday–Wednesday, Farai Moyo Thursday–Saturday, Tafara Nyathi Sunday; float US$100.00; counted = expected), rings
  only the planned visits on it, numbers them below the floor's lowest `SALE-` number, and runs FLR-07's close-day for that site
  and date so Past days shows them closed.
- Members' points are written as ledger rows directly (below), not recomputed.

| Unit | Seed |
|---|---|
| CUS-01 | `RetailLoyaltySettings` for the company with the defaults (enabled; 1 point for each US$1; 0.01; 500; After 12 months; Bronze from US$0, Silver from US$500, Gold from US$1,500; Gold earns 1.5; promotion, birthday and alcohol on), `updatedById` Tendai Mhlanga, and one `RETAIL_SETTINGS.CHANGED { page: "loyalty" }` event by him dated 1 August 09:30 ("Last changed by Tendai Mhlanga, 1 August."). |
| CUS-02 | **The board's eight regulars**, all consenting, Gold by spend, phones exactly as the board: Tapiwa Marange +263 77 412 3388 (code CUS-00141, member since 12 March 2024, area "Mbare, Harare", email tapiwa.marange@gmail.com, date of birth 14 March 1988), Nyasha Gwenzi +263 71 220 9014, Rutendo Banda +263 78 301 5521, Munashe Chari +263 77 988 1043, Blessing Ncube +263 73 640 2219, Kudzai Zhou +263 77 105 6672, Simba Mutasa +263 71 884 0397, Rudo Chirwa +263 78 552 7710 (the other seven member since a date in August–September 2025). Each one's visits in the last 12 months, last visit and 12-month spend equal the board's row — 141 / 15 Aug / US$3,021.80; 149 / 16 Aug / US$2,975.55; 121 / 15 Aug / US$2,768.00; 139 / 16 Aug / US$2,515.10; 127 / 17 Aug / US$2,414.10; 138 / 17 Aug / US$2,345.90; 122 / 16 Aug / US$2,146.50; 124 / 14 Aug / US$2,051.30 — spread evenly with jitter, the last amount fixing the total, and their points equal the board (3,021; 2,975; 2,768; 2,515; 2,414; 2,345; 2,146; 2,051): for the seven, `EARNED` rows only (floor of each sale, the last row fixing the sum); Tapiwa's as CUS-03. **Members**: 420 generated customers (Shona and Ndebele names, unique valid `+263 71/73/77/78` numbers, 85% consenting, member since across the last 18 months, a few with an area or a date of birth; three with birthdays next week), attached to existing FLR-01 sales across the window, favouring larger baskets so a member's average basket is about 2.3 times a walk-in's, exactly 412 of them with a sale in the last 30 days, each with 12-month spend under US$1,500 (Bronze or Silver), with `EARNED` rows per the rules; and 96 of those 412 each get one planned sale in the last 30 days that spends points, together 21,400 points (US$214.00 off). **The duplicate** "T. Marange" +263 77 412 3380: 9 visits in the last 12 months, last 2 September, US$412.60, 412 points, not merged (MergeCustomer walks it). **Not seeded**: "Simba Nkomo" (CustomerNew adds him). FLR-01's named customers keep their phones (Farai Chikore +263 77 509 1144, Tinashe Mavhunga +263 71 330 8826). The list then reads, sorted by Most spent, the board's eight rows first. |
| CUS-03 | **Tapiwa Marange's record.** 141 visits in the last 12 months as CUS-02, with the monthly spend of the board's bars on the months they name (Nov 240, Dec 196, Jan 262, Feb 310, Mar 228, Apr 251, May 244, Jun 290, Jul 309, Aug 89; the rest of the US$3,021.80 between 3 and 31 October 2025); Castle Lager case of 24 on the most visits, Chibuku Scud 1L next; EcoCash on about 60% of visits. The 12 months before: 126 visits, US$2,561.58 (so "+18% on the 12 before" and "+US$1.10 on last year"), their points spent within that year except 42. Ledger rows exactly as the board's last seven: 20 Jul 12:05 +41 (Chipo Dube), 28 Jul 16:20 +27 (Tafara Nyathi), 31 Jul 00:00 −42 expired (Automatic), 1 Aug 09:00 +100 adjusted, reason Birthday, by Tendai Mhlanga, 9 Aug 17:15 +18 (Chipo Dube), 14 Aug 11:40 −500 spent on a US$5.00 sale paid wholly in points (Farai Moyo), 15 Aug 14:02 +32 (Chipo Dube, a US$21.40 sale); before them, in the last 12 months, `EARNED` rows on his other visits totalling +4,110 with the +100 (earned +4,210 in all), 70 small `SPENT` rows, so 214 rows in 12 months and a balance of 3,021. Two notes: "Prefers EcoCash. Ask before charging the card." (Tafara Nyathi, 12 March 2024) and "Says the Castle was warm on 30 September. Make it good." (Tafara Nyathi, 30 September 2026; the PointsAdjust board is that making good, done in the walkthrough, not seeded). Customer price list Retail. |
| CUS-05 | Nothing beyond CUS-02's duplicate. |
| CUS-06 | One past offer batch (Tendai Mhlanga, 25 September, "Gold customers", 8 messages SENT) so the outbox has history. |
| CUS-07 | **Nine accounts** (Owing 4 · Overdue 1 · All 9), customers created where missing: Mbare Sports Club (+263 77 300 4410) limit US$800.00, 30 days, buyers Tonderai Dube and Coach Munyaradzi, held by hand by Tafara Nyathi on 2 October; charges 6 Aug US$128.00 and 19 Aug US$84.40 (overdue US$212.40), 12 Sep US$87.60, 19 Sep US$156.20, 26 Sep US$156.20 (owes US$612.40), a payment PMT on 4 Sep US$300.00 by bank transfer that settled July's charges. Chikore Weddings (+263 77 880 1203) US$500.00, 14 days, Wholesale, buyers Farai Chikore and Ruva Chikore; charge 25 Sep US$162.40; payment 28 Sep US$240.00 (EcoCash) settling a 12 Sep charge. Tapiwa Marange US$150.00, 30 days, buyer Rumbi Marange; charge 28 Sep US$31.00 bought by Rumbi Marange with no loyalty customer on the sale (his visits stay 141); payment 1 Oct US$45.50 (cash) settling a 10 Sep charge, also Rumbi's. Highfield Shebeen Co-op (+263 71 455 0381) US$1,000.00, 7 days, Wholesale, buyers Gift Moyo and Tendai Shumba; charges 30 Sep and 2 Oct US$204.00 each; payment 30 Sep US$380.00 (transfer, "CBZ 3009 1180") settling a 23 Sep charge. Nyasha Gwenzi US$100.00, 30 days, paid up (last paid 20 Sep). Borrowdale Golf Club Bar US$600.00, 30 days, paid up (last paid 15 Sep). Mabvuku Darts Club US$200.00, 14 days, held by hand, owes nothing. Kuwadzana Funeral Services US$300.00, closed 1 September. Rutendo Banda: waiting for the owner, US$300.00 asked by Tafara Nyathi on 2 October, with its `RETAIL_ACCOUNT_APPROVAL` notification to Tendai Mhlanga. Every charge is a planned sale (tender `ON_ACCOUNT`, the account and buyer set) with its `RetailAccountCharge`; payments with allocations. Totals on Owing: US$2,450.00 · US$1,213.80 · US$212.40; badge "1 overdue". |
| CUS-08 | The four payments above get their `RETAIL_ACCOUNT_PAYMENT` postings (or PENDING in a locked period). |
| CUS-09 | One statement sent: Highfield Shebeen Co-op, August, WhatsApp, by Tafara Nyathi on 1 September. |

**Changes asked of other seeds** (also in open questions): FLR-01's `SALE-31869` (today 12:02, US$9.30) is rung for Farai Chikore,
not Tapiwa Marange, and the `RFD-0044` pair (Nyasha Gwenzi) for Tinashe Mavhunga, so the regulars' last visits stay in August as the
customers boards show; FLR-01 takes `planned` sales; FLR-07 closes the history days this seed adds.

---
## 4. API

Conventions are foundations section 4's (session, `requireRetailPermission`, `successResponse` with decimals as numbers to two
places, `errorResponse` with `fieldErrors` keyed by the sheet's field ids, company scope, audit in the transaction). Paths are
under `/api/v2/retail` unless written in full. "403" everywhere answers `{ "error": "Your role cannot <verb> <label>" }`.

### 4.1 List sources (FND-LIST: `GET /api/v2/reports/[key]`, `POST /api/v2/reports/[key]/export`)

Definitions in `lib/reports/definitions/retail/customers.ts`, loaders in `lib/reports/loaders/retail/customers.ts`. All exclude
binned rows; columns, filters and tabs are section 5's.

| Key | Read | Loader | Parent filter | Notes |
|---|---|---|---|---|
| `retail-customers` | `[retail.customers, view]` | database-side `page()`: one SQL statement with CTEs (12-month sales per customer, 12-month window, points balance, tier from the settings' thresholds and `tierHeld`, account flag, consent) doing search, filters, sort, group, paging and totals | — | Search over name, normalised phone digits, card digits, code. Totals over every filtered row. Report face for "Customer spend" is `INS:customers`'. |
| `retail-accounts` | `[retail.accounts, view]` | in-memory `load()` (accounts ≤ 5,000), owed/overdue/last paid by SQL aggregate | — | Tabs owing, overdue, all. Report face for "Accounts owed" is `INS:customers`'. |
| `retail-points` | `[retail.customers, view]` | database-side `page()`; running balance `SUM(points) OVER (PARTITION BY "customerId" ORDER BY "createdAt", seq)` computed over the customer's whole ledger before paging | `customer` (required) | The record tab adds `period=12m`; totals give earned, spent, expired, adjusted and the net, and `summary.balance`. |
| `retail-customer-purchases` | `[retail.customers, view]` | database-side `page()` over `RetailSale` where `customerId` | `customer` (required) | SALE, REFUND and VOID documents; items = Σ line quantities; points = the sale's `EARNED` row. |
| `retail-customer-notes` | `[retail.customers, view]` | `load()` | `customer` | Newest first. |
| `retail-account-lines` | `[retail.accounts, view]` | `load()`: charges (sales on account), credits (refunds and voids to the account) and payments as statement lines, with a running owed | `account` | Shown as the record's Account tab. |

FLR-01's `retail-sales` gains a `parent` filter `customer` (for "All their purchases"); FLR-06's `retail-laybys` gains `customer`.

### 4.2 Customers (CUS-02, CUS-03, CUS-04, CUS-05)

| Method | Path | Permission | Body / query | Response | Errors |
|---|---|---|---|---|---|
| POST | `/customers` | `retail.customers:create` | `{ phone: string, name: string, marketingConsent: boolean, dateOfBirth?: string, area?: string, via?: "sheet" \| "till" }` | 201 `{ data: { id, code, name, phone, cardNo } }` | 400 `fieldErrors` `phone`, `name`, `dob`, `area`; 409 `{ error: "Tapiwa Marange already has this number.", fieldErrors: { phone }, existing: { id, name } }` |
| GET | `/customers/[id]` | `retail.customers:view` | — | `{ data: CustomerRecordView }` (binned ones too, with `binned`) | 404 "Customer not found" |
| PATCH | `/customers/[id]` | `retail.customers:update` | one or more of `{ name, phone, whatsapp: string \| null, email: string \| null, area, dateOfBirth: string \| null, marketingConsent: boolean, cardNo, tier: string, priceListId: uuid \| null }` | `{ data: CustomerRecordView, changed: [{ field, from, to }] }` | 400 `fieldErrors` (email "That is not an email address."; cardNo "A card number is 12 digits."; tier "That is not a tier."; priceListId "That price list is not this shop’s."); 409 phone or card taken; 409 "Restore it to change it" |
| GET | `/customers/[id]/spend?range=3m\|12m\|all` | `retail.customers:view` | — | `{ unit: "US$", bars: [{ key: "2026-08", label: "Aug", tip: "Aug 2026", value: 89.00 }], yTop: "US$400", yMid: "US$200" }` — 3m: 13 weekly bars ("6 Jul"); 12m: 12 monthly bars ending this month; all: monthly since the first visit (yearly past 36 months) | 400 bad range |
| GET | `/customers/[id]/merge-preview?duplicateId=` | `retail.customers:update` and `:delete` | — | `{ points: 3433, visits: 150, text: "3,433 points, 150 visits, one ledger", phones: [string, string], blockers: string[] }` | 400 "Pick a different customer." (itself, binned) |
| POST | `/customers/[id]/merge` | same | `{ duplicateId, keepPhone }` (one of the two phones) | `{ data: { id, points, visits } }` | 400 as above, `fieldErrors.keep` "Keep one of their two numbers."; 409 the blocker sentence |
| POST | `/customers/[id]/points` | `retail.customers:update` | `{ direction: "ADD" \| "TAKE", points: int, reason: "MISSED_AT_TILL" \| "COMPLAINT" \| "BIRTHDAY" \| "CORRECTION", note: string }` | 201 `{ data: { entryId, balance } }` | 400 `fieldErrors` `n`, `note`; 409 `fieldErrors.n` (too many to take away); 409 "Loyalty is off." |
| POST | `/customers/points` | same | `{ ids: uuid[] (≤500), direction, points, reason, note }` | `{ done: number, skipped: [{ id, name }] }` | as above |
| POST | `/customers/tier` | same | `{ ids: uuid[] (≤500), tier: string }` | `{ count, until: "2027-10-03" }` | 400 tier |
| POST | `/customers/[id]/notes` | same | `{ body: string (1–1,000) }` | 201 `{ data: { id } }` | 400 `fieldErrors.note` "Write the note." |
| GET | `/customers/[id]/pdf` | `retail.customers:view` | — | `application/pdf`: header, chips, KPIs, the 12-month chart as a table, the ledger for 12 months, the rail values | 404 |
| GET | `/customers/messages/preview` | `retail.customers:update` (reminders: `retail.accounts:update` or `retail.laybys:update`) | `?audience=ticked\|top-tier\|lapsed-30\|all-agreed&ids=&purpose=offer\|reminder&about=account:<ids>\|layby:<ids>` | `{ total, reach, sub: "8 ticked · all agreed to WhatsApp", note: "WhatsApp charges about US$0.02 a message. 8 messages, US$0.16.", primary: "Send to 8", options: [{ value, label }], body: string /* default text */, later: { at: ISO, label: "Friday 16:00" } }` | 400 unknown audience |
| POST | `/customers/messages` | same | `{ purpose: "OFFER" \| "ACCOUNT_REMINDER" \| "LAYBY_REMINDER", audience, ids?: uuid[], about?: string, body: string, sendAt: ISO \| null }` | 201 `{ batchId, queued, sendAt }` | 400 `fieldErrors.msg`; 409 "WhatsApp is not set up yet, so nothing was sent."; 409 "None of them can be sent a message." (reach 0) |

```ts
type CustomerRecordView = {
  id: string; code: string /* "CUS-00141" */; name: string;
  phone: string | null /* "+263 77 412 3388" */; whatsapp: string | null /* null = same number */;
  email: string | null; area: string | null; dateOfBirth: string | null /* "14 March 1988" */; adult: boolean | null;
  marketingConsent: boolean; memberSince: string /* "12 March 2024" */; cardNo: string | null /* "6009 1400 0141" */;
  staff: boolean;
  tier: { name: string; isTop: boolean; heldUntil: string | null };
  priceList: { id: string; name: string } | null;
  points: { balance: number; worth: number; canSpend: boolean; spendFrom: number };
  kpis: Array<{ label: string; value: string; delta: string; deltaTone: "ok" | "bad" | "warn" | ""; note: string }>; // 5.3
  meter: { label: string; value: string; pct: number; note: string };
  usually: { most: string | null; then: string | null; paysWith: string | null };
  loyalty: { earns: string /* "1.5 points per US$1" */; worth: string /* "100 points = US$1.00" */; expiry: string /* "After a year unused" | "Never" */ };
  account: AccountView | null;
  counts: { points12m: number; purchases: number; notes: number; laybys: number; accountLines: number };
  binned: { at: string; by: string; keptUntil: string; restorable: boolean } | null;
  mergedInto: { id: string; name: string } | null;
  can: { edit: boolean; adjustPoints: boolean; message: boolean; merge: boolean; bin: boolean; note: boolean;
         openAccount: boolean; changeAccount: boolean; takePayment: boolean; sendStatement: boolean; activity: boolean };
};
```

### 4.3 Loyalty settings (CUS-01) — FND 4.10's contract

| Method | Path | Permission | Body | Response | Errors |
|---|---|---|---|---|---|
| GET | `/settings/loyalty` | `retail.loyalty:view` | — | `LoyaltySettingsPage` | 403 |
| PATCH | `/settings/loyalty` | `retail.loyalty:update` | the changed values, keyed as below | `LoyaltySettingsPage` | 400 `fieldErrors` `earn`, `worth`, `min`, `tiers`, `gold`; 403 "Your role cannot change loyalty settings" |

```ts
type LoyaltySettingsPage = {
  values: { on: boolean; earn: string /* "1 point for each US$1" */; worth: string /* "0.01" */; min: string /* "500 points" */;
            exp: "Never" | "After 12 months"; tiers: string[] /* "Bronze, from US$0" */; gold: string /* "1.5 points for each US$1" */;
            promo: boolean; bday: boolean; alc: boolean };
  labels: { gold: string /* "Gold earns" — the top tier's name */ };
  birthdayPoints: number; liquorStore: boolean;          // alc is drawn only for a liquor store
  aside: { earned: { customers: number; points: number }; spent: { customers: number; points: number; value: number };
           timesMore: number | null };                    // last 30 days
  expiryPreview: { customers: number; points: number };  // what "After 12 months" would expire tonight
  canEdit: boolean; lastChanged: { by: string; at: string } | null;
};
```

### 4.4 Lookups (FND 4.4, `lib/retail/lookups.ts`)

| Noun | Read | Create (quick add) | Options |
|---|---|---|---|
| `customer` | `[retail.customers, view]` or `[retail.sell, view]` | `[retail.customers, create]`, quick fields "Name", "Phone or WhatsApp" ("+263 7"), runs `createCustomer` with `via: "lookup"`, consent false | label = name, sub = phone ("+263 77 412 3388"). Context `{ for: "merge", excludeId }`: sub "412 points, 9 visits". Context `{ for: "account" }`: sub phone, or "Already has an account" (choosing it gives the field error). Matches name, phone digits, card digits. |
| `account` | `[retail.accounts, view]` or `[retail.sell, view]` | none | Open, approved accounts; label = the customer's name, sub "Owes US$612.40 of US$800.00" / "On hold" / "Waiting for the owner"; matches the customer's name and the buyers' names. |

`price list` is PRD-05's noun; the customer sheets pass context `{ for: "customer" }` so its sub reads "Default" for the default list
and the list's rule otherwise ("8% off, 6 or more").

### 4.5 Bin (FND 4.6)

Kind `customer` registered in `lib/retail/bin.ts`: `{ kind: "customer", label: "Customer" (or "Customer, merged" when
`mergedIntoId`), deleteRight: [retail.customers, delete], move: binCustomer, restore: restoreCustomer (unmerge for a merged one),
name: "<name>, <phone>" }`. Refusals in W-45.

### 4.6 The till (CUS-10, consumed by FLR-09's till)

| Method | Path | Permission | Body / query | Response | Errors |
|---|---|---|---|---|---|
| GET | `/pos/customers` | `retail.customers:view` or `retail.sell:view` | `?q=` (≥ 2 characters; digits, a card, or a name) `&limit=8` | `{ data: PosCustomer[] }` | — |
| POST | `/pos/sales` (changed) | as today | adds `pointsToSpend?: int` (replaces `loyaltyRedemptionPoints`), `account?: { accountId: uuid, buyer: string }` (required with an `ON_ACCOUNT` payment), `approver?: { userId, pin }` (STK-04, for over the limit) | adds `loyalty: { earned, spent, balance, tier } \| null`, `account: { owes, available } \| null` | W-46 and W-49 sentences; 403 `MANAGER_PIN_NEEDED` |
| POST | `/customers` | as 4.2, `via: "till"` | — | — | — |

```ts
type PosCustomer = {
  id: string; code: string; name: string; phone: string | null; cardNo: string | null;
  tier: string; points: number; worth: number /* US$ */; canSpend: boolean; spendFrom: number;
  adult: boolean | null; staff: boolean; priceListId: string | null;
  account: { id: string; owes: number; limit: number; available: number; held: boolean; waiting: boolean; buyers: string[] } | null;
};
```

The price engine (PRD-05 `priceBasket`) gets `context.customer = { priceListId, hasOpenAccount, member: true, staff }` from this
row: a list is a candidate when its audience matches (ACCOUNT_CUSTOMERS: an open account and `priceListId` = the list; LOYALTY_MEMBERS:
any live customer while loyalty is on; STAFF: `staff`) **or** it is the customer's own `priceListId`.

### 4.7 Accounts (CUS-07, CUS-08, CUS-09)

| Method | Path | Permission | Body / query | Response | Errors |
|---|---|---|---|---|---|
| GET | `/accounts/[id]` | `retail.accounts:view` | — | `{ data: AccountView }` | 404 "Account not found" |
| POST | `/accounts` | `retail.accounts:create` | `{ customerId, limit: "500.00", termsDays: 7 \| 14 \| 30, priceListId, buyers: string[], papersUrl?: string }` | 201 `{ data: AccountView, waiting: boolean, approver?: string }` | 400 `fieldErrors` `cust`, `limit` ("A limit of US$1.00 or more."), `terms`, `list`, `who` ("Add who may buy on it."); 409 `fieldErrors.cust` "Chikore Weddings already has an account." |
| PATCH | `/accounts/[id]` | `retail.accounts:update` | `{ limit?, termsDays?, held?, buyers? }` | `{ data, changed, waiting }` | 400 as above; 409 "The account is closed." |
| POST | `/accounts/[id]/approve` | `retail.accounts:approve` | `{}` | `{ data }` | 409 "Nothing is waiting on this account." |
| POST | `/accounts/[id]/close` | `retail.accounts:delete` | `{}` | `{ data }` | 409 "Mbare Sports Club owes US$612.40. Take a payment first." |
| GET | `/accounts/[id]/payment-preview?amount=` | `retail.accounts:update` | — | `{ text: "The oldest sales first: US$212.40 overdue, then US$87.60 of September.", allocations: [{ saleNo, date, amount, overdue }], drawer: { shiftId, label } \| { choose: [{ shiftId, label }] } \| { none: true } }` | 400 amount |
| POST | `/accounts/[id]/payments` | `retail.accounts:update` | `{ amount: "300.00", method: "CASH" \| "ECOCASH" \| "TRANSFER", reference?: string, paidOn: "3 October 2026" \| "2026-10-03", shiftId?: uuid }` | 201 `{ data: { paymentNo, owes, overdue, receiptUrl } }` | 400 `fieldErrors` `amt`, `ref`, `date`; 409 drawer sentences (FLR-03) |
| GET | `/accounts/payments/[paymentId]/receipt` | `retail.accounts:view` | — | `application/pdf` (A6: shop, "Received from", amount, how, reference, date, what it paid, what is still owed) | 404 |
| GET | `/accounts/statements/preview?ids=` | `retail.accounts:update` | — | `{ count, owing, sub: "4 accounts owing", lastMonth: "September", body: string }` | — |
| POST | `/accounts/statements` | `retail.accounts:update` | `{ accountIds: uuid[] (≤500), covering: "LAST_MONTH" \| "LAST_30_DAYS" \| "SINCE_OPENING", sendBy: "WHATSAPP" \| "EMAIL" \| "PRINT", message: string (≤ 600) }` | `{ sent: number, skipped: [{ name, why }], printUrl?: string }` | 409 "WhatsApp is not set up yet, so nothing was sent." / "Email is not set up yet, so nothing was sent." |
| GET | `/accounts/statements/print?ids=&covering=` | `retail.accounts:view` | — | `application/pdf`, one statement per page | — |
| GET | `/accounts/[id]/statement?covering=` | `retail.accounts:view` | — | `application/pdf` | — |

```ts
type AccountView = {
  id: string; customer: { id: string; name: string; phone: string | null; whatsapp: string | null; email: string | null };
  state: "Overdue" | "Owing" | "Paid up" | "On hold" | "Waiting for the owner" | "Closed";
  limit: number; termsDays: 7 | 14 | 30; buyers: string[]; held: boolean; heldReason: "BY_HAND" | "OVERDUE_30" | null;
  priceList: { id: string; name: string } | null;
  owes: number; overdue: number; available: number; lastPaidOn: string | null;
  requested: { limit: number; by: string; at: string } | null;
  openedAt: string; closedAt: string | null;
  can: { change: boolean; approve: boolean; close: boolean; pay: boolean; statement: boolean };
};
```

Statement document (`lib/documents/retail-sources.ts`, source key `retail.account.statement`, default template in
`lib/documents/default-template-catalog.ts`, sample payload in `sample-payloads.ts`): shop branding; "Statement for <customer>",
"Covering September 2026" / "Covering the last 30 days" / "Since 12 March 2024"; opening balance; a table Date · What
("Sale on account, bought by Tonderai Dube" / "Refund" / "Payment, bank transfer, CBZ 0310 4412") · Reference · Charge · Payment ·
Balance; closing balance; "Overdue: US$212.40"; payment details from `buildPaymentRows(branding)`. WhatsApp statements upload the
PDF through `lib/uploads/upload-file.ts` (company folder `statements/`) and send a signed link valid 7 days as a WhatsApp
document (`lib/messaging/whatsapp.ts` gains `sendDocument({ to, url, filename, caption })`).

### 4.8 WhatsApp replies (CUS-06)

| Method | Path | Auth | Does |
|---|---|---|---|
| GET | `/api/webhooks/whatsapp` | `hub.verify_token` = `META_WHATSAPP_VERIFY_TOKEN` | Echoes `hub.challenge` (Meta's subscription check) |
| POST | `/api/webhooks/whatsapp` | `X-Hub-Signature-256` HMAC with `META_WHATSAPP_APP_SECRET` (401 otherwise) | For each inbound text message "STOP": consent off for every live customer with that number (any company), audit per company; delivery statuses (`sent`, `failed`) update the matching `RetailMessage` |

### 4.9 Worker jobs (`scripts/retail-worker.ts`, SET-01)

| When (Africa/Harare) | Job | File |
|---|---|---|
| Every 5 minutes | Outbox drain (SET-07's hourly drain, made five-minutely): sends QUEUED messages whose `scheduledFor` is null or past; re-fills `{points}`, `{owed}`, `{overdue}` from the batch template for scheduled ones | `lib/retail/messages/drain.ts` |
| Daily 00:05 | Points expiry | `lib/retail/loyalty/expire.ts` |
| Daily 06:00 | Accounts on hold by themselves (30 days overdue) | `lib/retail/accounts/hold.ts` |
| Mondays 07:00 | Birthday bonuses for the week | `lib/retail/loyalty/birthday.ts` |

### 4.10 Removed endpoints

`GET /api/v2/retail/customers` (the aggregate over sales by name), `GET /api/v2/retail/customers/search`, `GET
/api/v2/retail/customers/[id]/loyalty`, and the upsert behaviour of `POST /api/v2/retail/customers` (it now creates, or answers 409
with the existing customer). Their callers move in the same unit: the till's customer search (`pos-portal-state.tsx`,
`pos-customers-view.tsx`) → `GET /pos/customers`; `lib/offline/module-registry.ts` → `GET /pos/customers` and `POST /customers`.

---
## 5. UI per page

Every page sits in the shell (FND-SHELL). Customers, a customer and Accounts: rail mark "The floor" current, panel "The floor"
with Customers (or Accounts) current in solid ink. Loyalty: the Management gear current, panel "Management" with Loyalty current.
Loading, error, no-match and phone behaviour are the frames' unless stated.

### 5.1 Customers — `/retail/customers` (board `CustomersList.png`) · CUS-02

ListFrame, source `retail-customers`.

**Header**: title "Customers"; no sub; primary "+ New customer" (`retail.customers:create`; not drawn for the bookkeeper) →
`?sheet=customer-new`.

**Tabs**: none.

**Toolbar**: search "Name, phone or card" (name contains; digits match the phone from the fourth digit and the card; "CUS-00141"
matches the code). Choices on the row: "Tier" — "Any", then the settings' tiers in order ("Bronze", "Silver", "Gold"); "Last visit"
— "Any", "In the last 30 days", "30 to 90 days ago", "Over 90 days ago", "Never" (**Defined here**). Inside Filters (**Defined
here**): "Messages" — "Anyone", "Agreed", "Not agreed"; "Account" — "Anyone", "Has an account", "No account". Count. Sort "Most
spent" (others: "Most visits", "Most points", "Last visit, newest", "Longest since a visit", "Name A–Z", "Newest members"). Group:
None, Tier, Last visit. Columns. Export ("The 436 customers the filters show").

**Columns** (grid `40px minmax(180px,1.4fr) 150px 110px 80px 150px 90px 130px 44px`, min width 980px):

| Column | Key | Cell | Align | Priority | Notes |
|---|---|---|---|---|---|
| Customer | `name` | `link` → `/retail/customers/{id}` | start | 1 | |
| Phone | `phone` | `mono` | start | 2 | "+263 77 412 3388"; "—" when none |
| Tier | `tier` | `state` | start | 2 | tones: the top tier `gold`, the others `neutral` (**Defined here**: Silver and Bronze are not drawn) |
| Visits | `visits` | `num` | end | 2 | 12 months; total Σ |
| Last visit | `lastVisitAt` | `date` | start | 3 | "15 August 2026"; "—" never |
| Points | `points` | `num` | end | 1 | balance; total Σ |
| Spend, 12 months | `spend12m` | `money` | end | 1 | total Σ |

**Totals band**: "Σ" · the count ("8" on the board) · — · — · Σ visits ("1,061") · — · Σ points ("20,235") · Σ spend
("US$20,238.25"). With the seed the band covers every customer the filters let through, so it reads more than the board's eight.

**Row menu** (**Defined here**): "Adjust points" (`?sheet=points&id=`), "Message on WhatsApp" (`?sheet=message&ids=<id>`), "Edit
everything" (`?sheet=customer-edit&id=`) — all `retail.customers:update`; "Move to the bin" (`--bad`, `retail.customers:delete`,
ConfirmDialog `bin`). Cashier and bookkeeper: no row menu items, so the ⋯ cell is empty.

**Bulk** (selection bar): "Message on WhatsApp" (`?sheet=message&ids=<…>`), "Add points" (`?sheet=points&ids=<…>`), "Change
tier" (`?sheet=customer-tier&ids=<…>`) — `retail.customers:update`; then "Export <n>". Cashier and bookkeeper see only Export.

**Empty** (no customers at all; FND 5.12.2 guide): "No customers yet" / "Customers join at the till when they give their phone
number, or add them here." / "+ New customer" (**Defined here**).

**Phone card** (FND 5.4.12): title the name, badge the tier, figure the 12-month spend, meta "+263 77 412 3388 · 141 visits",
figure2 "3,021 points".

**Address**: `?q=&tier=&lastVisit=&messages=&account=&sort=&group=&page=&size=`.

### 5.2 New customer — `?sheet=customer-new` (board `CustomerNew.png`) · CUS-02

From `K.customer`. Title "New customer"; sub "Customers"; width 520.

| Field (id) | Type | Options, default | Validation (server message) | Hint |
|---|---|---|---|---|
| Phone or WhatsApp (`phone`) | `text`, mono | empty | required; a phone number ("That is not a phone number."); not a live customer's (409 "<name> already has this number.", with a link under it "Open <name>") | "The till finds customers by phone." |
| Name (`name`) | `text` | empty | required, ≤ 120 ("Add their name.") | — |
| Agrees to WhatsApp messages (`msgs`) | `toggle` | on | — | "Receipts, points and offers. They can stop any time by replying STOP." |
| Date of birth (`dob`), optional, half | `text`, placeholder "Optional" | empty | a past date ("Write it as 14 March 1988.") | "For the birthday bonus; also confirms 18+." |
| Area (`area`), optional, half | `text`, placeholder "Optional" | empty | ≤ 80 | — |

Footer: note "They start earning points on their next sale."; secondary "Cancel"; primary "Add customer". Done: "Simba Nkomo added. 0
points." with "Open". Submits `POST /api/v2/retail/customers`; invalidates `retail-customers`.

### 5.3 A customer — `/retail/customers/[id]` (board `CustomerRecord.png`) · CUS-03

RecordFrame kind `customer` (`lib/retail/record-kinds/customers.ts`), entity type `Customer`, binnable (`customer`), data from
`GET /api/v2/retail/customers/[id]`.

**Header**: back "Customers" → `/retail/customers`; title the name ("Tapiwa Marange"); reference the code ("CUS-00141").
Action group, in order, each drawn only when it applies and the role may:
- "Adjust points" → `?sheet=points&id=<id>` (`retail.customers:update`).
- "Take a payment" → `?sheet=account-payment&id=<accountId>` (an open account; `retail.accounts:update`).
- "Message on WhatsApp" → `?sheet=message&ids=<id>` (`retail.customers:update`; not drawn when they have no number).

⋯ menu, in order: "Export as PDF" (`GET …/pdf`, everyone who can see); "Edit everything" (`?sheet=customer-edit&id=`); "Open an
account" (no account, or a closed one; `retail.accounts:create`; `?sheet=account-new&customerId=<id>`); "Change the account" (an
account; `retail.accounts:update`; `?sheet=account-edit&id=<accountId>`); "Send a statement" (an account;
`retail.accounts:update`; `?sheet=statement&id=<accountId>`); "Merge with another customer" (`?sheet=customer-merge&id=`;
update and delete); "Stop marketing messages" (consent on; "Allow marketing messages" when off — **Defined here**; `PATCH {
marketingConsent }`, toast "Tapiwa Marange gets no more offers. Receipts still go." / "Tapiwa Marange will get offers again.");
separator; "Move to the bin" with "Managers and owners only" under it (`retail.customers:delete`; ConfirmDialog `bin`: "Move Tapiwa
Marange to the bin?" / "It leaves every list and search today. Anything sold, paid or counted against it stays exactly as it is.
You can restore it from the bin until 2 November." / "Keep it" / "Move to the bin"). No primary.

**Strip**: chips — the tier (`gold` tone for the top tier, `plain` otherwise; "Gold, held" when held — **Defined here**), "Member
since 12 March 2024" (`plain`), "Agreed to messages" (`plain`, only with consent), "Staff" (`plain`, only for staff — **Defined
here**). Figure: "Points" "3,021".

**KPI strip** (five tiles, from `kpis`):

| Label | Value | Delta (tone) | Note | Rules |
|---|---|---|---|---|
| Spend, 12 months | "US$3,021.80" | "+18%" (`ok`; "−6%" `bad`) | "on the 12 before" | No spend in the 12 before: delta "", note "their first year" (**Defined here**) |
| Visits | "141" | "2.6" (no tone) | "days apart" | Under 2 visits: delta "", note "too few to tell" |
| Average basket | "US$21.43" | "+US$1.10" (`ok`; negative `bad`) | "on last year" | No visits in the 12 before: delta "", note "their first year" |
| Points | "3,021" | "US$30.21" (no tone) | "to spend" | Under "Spend from": note "to spend from 500" |
| Last visit | "15 Aug" ("15 Aug 2025" in another year; "Today") | "49" (`warn` when it is more than three usual gaps and at least 14 days; else no tone) | "days ago, usually 3" | Never: value "—", note "no visits yet"; today: delta "", note "usually 3 days apart" |

**Chart panel**: title "Spend per month", unit "US$", range segmented "3 months" · "12 months" (default, current) · "All time"
(`GET …/spend?range=`); bars per FND 5.6.5, the current period's bar in `--data` dark (`#4b5363`), the others lighter; y labels from
the response ("US$400", "US$200", "0"); hover tooltip "Aug 2026" / "US$89.00". **Deviation**: the board's twelve bars end in August
(Sep 2025 … Aug 2026); the build's end with the current month.

**Tabs** (each with its count; "Export" button at the right exports the current tab's source):

1. **Points ledger** (count = rows in the last 12 months, "214"). Source `retail-points`, parent `customer`, `period=12m`, newest
   first, up to 10 rows. Columns (grid `150px minmax(0,1fr) 120px 120px 90px 90px`): When (`when`, "15 Aug 14:02") · What (dot in
   the kind's tone + `pointsKindLabel`; a note, when there is one, is the cell's title) · Receipt (`ref` → `/retail/sales/{saleId}`,
   "SALE-31702"; "—" when none) · By (`text`: the cashier, the person who adjusted, or "Automatic") · Points (end, signed mono;
   positive in `--ok` 500) · Balance (end, mono, the running balance after the row). Totals row: "Σ 12 months" · "earned +4,210 ·
   spent −1,189 · expired −42" (parts that are zero are left out; "taken back −n" is added when adjustments or refunds took points)
   · — · — · the net ("+2,979") · the balance ("3,021"). Footer "1–10 of 214" and "All points movements" →
   `/retail/customers/[id]/points`.
2. **Purchases** (count = sales in the last 12 months, "141"). Source `retail-customer-purchases`, parent `customer`, `period=12m`.
   Columns (grid `150px 120px 70px minmax(0,1fr) 90px 120px`, **Defined here**): When (`when`) · Sale (`ref` →
   `/retail/sales/{id}`) · Items (`num`, end) · Paid with (`text`: "EcoCash", "Cash and EcoCash", "On account, Rumbi Marange") ·
   Points (`num`, end, "+32" or "—") · Total (`money`, end; refunds negative). Totals "Σ 141 sales" · — · Σ items · — · Σ points ·
   Σ total. Footer "1–10 of 141" and "All their purchases" → `/retail/sales?customer=<id>`.
3. **Notes** (count, "2"). Source `retail-customer-notes`. Columns (**Defined here**): When (`when`, 150px) · Note (`text`, the
   whole note on hover) · By (`text`, 160px). Footer "1–2 of 2" and "Add a note" → `?sheet=customer-note&id=<id>`
   (`retail.customers:update`).
4. **Lay-bys** (**Deviation**, only when the customer has any lay-by): FLR-06's `retail-laybys` source with parent `customer` and
   its columns; footer "All their lay-bys" → `/retail/laybys?customer=<id>`.
5. **Account** (**Deviation**, only for a customer with an account; owner, manager, bookkeeper): source `retail-account-lines`.
   Columns: When (`date` short, "28 Sep", 110px) · What (`text`: "Sale on account, Rumbi Marange", "Payment, cash", "Refund to the
   account") · Reference (`ref` 120px: the sale, or "PMT-0042" → its receipt PDF) · Charge (`money` end 110px) · Paid (`money` end
   110px) · Owed (`money` end 110px, running). Totals "Σ <n>" · — · — · Σ charge · Σ paid · owed now. Footer "1–10 of 14" and
   "Send a statement" → `?sheet=statement&id=<accountId>`.
6. **Activity** (FND-RECORD 5.6.8; owner, manager, bookkeeper; **Deviation**: not on the board).

**Details rail**:
- **Meter** (top card): label "Silver, on the way to Gold", value "US$1,120 of US$1,500" (whole dollars of 12-month spend and the
  next tier's start), bar = that share, note "US$380 more, about 3 months at this rate" (months = the gap ÷ their average monthly
  spend over 12 months, rounded up; "within a month" under one). In the top tier: label "Gold, the top tier", value "US$3,021 in 12
  months", bar full, note "Stays Gold while they spend US$1,500 in 12 months." Held: label "Gold, held until 3 October 2027".
  **Deviation**: the board reads "Gold, on the way to Platinum" · "3,021 of 5,000" · "1,979 more points, about 9 months at this
  rate"; Loyalty settings' tiers (canonical) are by spend and end at Gold, and there is no Platinum.
- **Contact** — hint "click any value to change it" (owner, manager): Phone ("+263 77 412 3388", mono, editable `text`), WhatsApp
  ("Same number" when null; editable `text`; clearing it stores null), Email (editable `text`; "—" when none), Area (editable
  `text`).
- **Loyalty**: Earns ("1 point per US$1"; "1.5 points per US$1" in the top tier — read-only), Worth ("100 points = US$1.00",
  read-only), Card ("6009 1400 0141", mono, editable `text`, 12 digits), Expiry ("After a year unused" / "Never", read-only).
- **Usually buys** (read-only, last 12 months): Most (the product on most of their visits: "Castle Lager case of 24"), Then (the
  next: "Chibuku Scud 1L"), Pays with ("EcoCash, mostly" when one tender paid half their visits or more; else "EcoCash or cash";
  "—" with no visits).

Each editable row saves through `PATCH /api/v2/retail/customers/[id]` (W-62). Cashier and bookkeeper: every row plain.

**Binned**: FND's banner; for a merged duplicate the banner adds "Merged into Tapiwa Marange." with the name as a link, and
Restore undoes the merge (W-45). **Not found**: FND's 404 page.

### 5.4 Points movements — `/retail/customers/[id]/points` (**Defined here**, no board) · CUS-03

ListFrame, source `retail-points` with parent `customer`. Header: back "Tapiwa Marange" → the record; title "Points movements";
sub "3,021 points, worth US$30.21". Toolbar: search "Receipt or note"; "What" choice ("Any", "Earned", "Spent", "Adjusted",
"Birthday bonus", "Expired", "Refunds"); "When" period (default "Any time"); count; sort "Newest first" ("Oldest first",
"Biggest first"); no group; Export. Columns: the ledger tab's six plus Note (`muted`, minmax). Totals as the tab's, over the
filters. No bulk. Empty: "No points yet" / "Points start with their first sale." (no button).

### 5.5 Edit a customer — `?sheet=customer-edit&id=<id>` (board `CustomerEdit.png`) · CUS-03

From `K.customeredit`. Title the name; sub "CUS-00141 · Gold · 3,021 points". Section 1: the five fields of 5.2 with the current
values. Section 2 "Loyalty and prices":

| Field (id) | Type | Options, default | Validation | Hint |
|---|---|---|---|---|
| Tier (`tier`) | `seg` | the settings' tiers ("Bronze", "Silver", "Gold"); the current tier | a tier | "Set by spend. Changing it here holds it for 12 months." (held: "Held until 3 October 2027. Choose Silver to go back to spend." — **Defined here**) |
| Price list (`list`) | `auto`, noun `price list` (context `{ for: "customer" }`) | options "Retail" sub "Default", "Wholesale" …; the customer's list, else the default; quick add Name (PRD-05's create, owner only) | a live list | — |

Footer: danger "Move to the bin" (owner, manager; ConfirmDialog `bin`, then the sheet closes and the record shows the banner);
note "Their sales and points history stay whatever happens."; secondary "Cancel"; primary "Save". Done "Tapiwa Marange saved."
Sends only changed fields to `PATCH /api/v2/retail/customers/[id]`.

### 5.6 Merge with another customer — `?sheet=customer-merge&id=<id>` (board `MergeCustomer.png`) · CUS-05

From `K.merge`. Title "Merge with another customer"; sub "Tapiwa Marange · +263 77 412 3388".

| Field (id) | Type | Options, default | Validation | Hint |
|---|---|---|---|---|
| The duplicate (`other`) | `auto`, noun customer, context `{ for: "merge", excludeId }` | sub "412 points, 9 visits"; quick add Name, "Phone or WhatsApp" ("+263 7") as the template draws (adding a new customer to merge is allowed but merges nothing of note) | required; not this customer | — |
| Keep the phone number (`keep`) | `seg` | the record's phone, the duplicate's phone (appears when a duplicate is picked); default the record's | one of the two | — |
| After merging (`res`) | `read` | live from merge-preview: "3,433 points, 150 visits, one ledger"; "—" until a duplicate is picked | — | — |

Footer: note "The duplicate goes to the bin. Its sales move across."; secondary "Cancel"; primary "Merge" (disabled while a
blocker shows; the blocker sentence replaces the note in `--bad`). Done "Merged. Tapiwa Marange has 3,433 points."

### 5.7 Adjust points — `?sheet=points&id=<id>` (board `PointsAdjust.png`) · CUS-04

From `K.points`. Title "Adjust points"; sub "Tapiwa Marange · 3,021 points, worth US$30.21". Bulk (`&ids=`): title "Add points",
sub "8 customers" (**Defined here**).

| Field (id) | Type | Options, default | Validation | Hint |
|---|---|---|---|---|
| Points (`dir`) | `seg` | "Add", "Take away"; default "Add" | — | — |
| How many (`n`), half | `text`, mono, right, `inputmode="numeric"` | empty, placeholder "0" | whole number 1–100,000; Take away ≤ balance | — |
| Worth (`val`), half | `read`, mono, right | live n × point value ("US$2.00"; "US$0.00" while empty) | — | — |
| Why (`why`) | `seg` | "Missed at the till", "Make good a complaint", "Birthday", "Correction"; default "Missed at the till" | — | — |
| Note (`note`) | `area`, 2 rows | empty | required, ≤ 300 ("Say what happened.") | — |

Footer: note "Adjustments show in their points ledger with your name."; secondary "Cancel"; primary "Save to the ledger". Done
"200 points added. 3,221 points now." / "200 points taken away. 2,821 points now." (bulk: 4.2's toasts).

### 5.8 Change tier — `?sheet=customer-tier&ids=<…>` (**Defined here**, no board) · CUS-04

Title "Change tier"; sub "8 customers"; one `seg` "Tier" (the settings' tiers, no default; required), hint "Set by spend. Changing
it here holds it for 12 months."; note "Each one goes back to their spend tier after 12 months."; primary "Change 8 tiers"; done
"8 customers are Gold until 3 October 2027."

### 5.9 Add a note — `?sheet=customer-note&id=<id>` (**Defined here**, no board) · CUS-03

Title "Add a note"; sub the customer's name; one `area` "Note" (4 rows, required, ≤ 1,000); note "Everyone who can open the
customer reads it."; primary "Add the note"; done "Note added."

### 5.10 Message customers — `?sheet=message&ids=<…>` (board `MessageNew.png`) · CUS-06

From `K.message`. Title "Message customers"; sub from the preview ("8 ticked · all agreed to WhatsApp"; "8 ticked · 6 agreed to
WhatsApp"; for a segment "Gold customers · 23 agreed to WhatsApp").

| Field (id) | Type | Options, default | Validation | Hint |
|---|---|---|---|---|
| To (`who`) | `seg` | "The 8 ticked" (only when opened with ids; "The 96 you picked" when opened from another screen with ids — **Defined here**), "Gold customers" (the top tier's name), "Not seen in 30 days", "Everyone who agreed"; default the first | — | — |
| Message (`msg`) | `area`, 4 rows | empty for offers; the reminder text for reminders | required, ≤ 1,000; only the listed placeholders | "{first name} and {points} fill in for each person." |
| Send (`when`) | `seg` | "Now", "Friday 16:00" (the next Friday 16:00); default "Now" | a time in the future | — |

Footer: note from the preview ("WhatsApp charges about US$0.02 a message. 8 messages, US$0.16."; the figure is
`WHATSAPP_COST_PER_MESSAGE` = 0.02 in `lib/messaging/whatsapp.ts`); secondary "Cancel"; primary "Send to 8" / "Schedule for 8"
(recomputed when To changes). Done "Sent to 8 customers." / "8 messages go on Friday at 16:00."

Reminders (**Defined here**): `&purpose=reminder&about=account:<ids>` → title "Remind on WhatsApp", sub "4 accounts · 4 with a
WhatsApp number", To has the one option "The 4 ticked", Message default "Hello {first name}, your Harare Bottle Store account owes
{owed}. Pay by EcoCash 0921 774 or CBZ 1002 4471. Thank you." with hint "{first name}, {owed} and {overdue} fill in for each
account."; `about=layby:<ids>` → sub "4 lay-bys", default "Hi {first name}, {lay-by} at Harare Bottle Store: {left} left to pay by
{due}." with hint "{first name}, {lay-by}, {left} and {due} fill in for each lay-by." No Send choice for reminders (they go now).
Primary "Send to 4"; done "Reminders sent to 4 customers." The payment details in defaults come from SET-05's EcoCash merchant
code and the default bank account (bank name and number); when either is missing that part is left out.

### 5.11 Loyalty — `/retail/manage/loyalty` (board `LoyaltySettings.png`) · CUS-01

SettingsFrame, page `loyalty` (`lib/retail/settings-pages/loyalty.ts`). Header: title "Loyalty"; no header buttons (the board has
none). Form (max 680px):

| Section | Field (id) | Type | Value on the board | Rules, hint |
|---|---|---|---|---|
| Points | Loyalty points (`on`) | `toggle` | on | hint "Customers earn at the till when they give their phone number." |
| | Earn (`earn`), half | `text`, mono | "1 point for each US$1" | written back as "{n} point for each US$1" / "{n} points for each US$1" |
| | A point is worth (`worth`), half | `money` (US$), up to four decimals | "0.01" | hint live "So 100 points take US$1 off." |
| | Spend from (`min`), half | `text`, mono | "500 points" | |
| | Points expire (`exp`), half | `seg` | "After 12 months" (of "Never", "After 12 months") | warn hint when switching to After 12 months (W-48) |
| Tiers | Tiers, by spend in 12 months (`tiers`) | `tags`, placeholder "Add a tier, then Enter" | "Bronze, from US$0" · "Silver, from US$500" · "Gold, from US$1,500" | sorted on save |
| | <Top tier> earns (`gold`) | `text`, mono | "Gold earns" "1.5 points for each US$1" | the label follows the last tier's name as tags change |
| Rules | Earn on promotion prices (`promo`) | `toggle` | on | no hint |
| | Birthday bonus (`bday`) | `toggle` | on | hint "200 points in their birthday week, with a WhatsApp message." |
| | Points can pay for alcohol (`alc`) | `toggle` | on | hint "Liquor store. Off where your licence does not allow it."; drawn only for a liquor store |

Aside: "Last 30 days" — bullets "412 customers earned 38,204 points." · "96 spent 21,400 points, US$214.00 off." · "Members spent
2.3 times more a visit." (from `aside`; a line whose figure is zero reads "Nobody spent points." / is left out when there are no
walk-ins or no members); "Who can change this" — "Owners only." Save bar: clean "Last changed by Tendai Mhlanga, 1 August."; dirty
"● 2 changes not saved · Discard · Save changes". Manager: read-only, the bar reads "Owners only.". Under 1100px the aside drops
under the form.

### 5.12 Accounts — `/retail/accounts` (board `AccountsList.png`) · CUS-07

ListFrame, source `retail-accounts`.

**Header**: title "Accounts"; sub "Customers who buy now and pay later"; primary "+ Open an account" (`retail.accounts:create`) →
`?sheet=account-new`.

**Tabs**: "Owing" (owed > 0 and not closed; default) · "Overdue" (overdue > 0) · "All" (every account, closed and waiting
included), each with its count ("4", "1", "9").

**Toolbar**: search "Customer" (the customer's name and the buyers' names); "State" — "Any", "Owing", "Overdue", "Paid up", "On
hold", "Waiting for the owner", "Closed" (**Defined here**); Filters (empty beyond State: shown with no badge); count; sort "Most
owed" ("Most overdue", "Paid longest ago", "Name A–Z"); Group: None, State, Pays in; Columns; Export.

**Columns** (grid `40px minmax(180px,1.3fr) 120px 120px 120px 110px 140px 140px 44px`, min width 1080px):

| Column | Key | Cell | Align | Notes |
|---|---|---|---|---|
| Customer | `name` | `link` → `/retail/customers/{customerId}` | start | |
| Limit | `limit` | `money` | end | total Σ; a waiting account shows the asked limit in `--ink-3` |
| Owed | `owes` | `money` | end | total Σ |
| Overdue | `overdue` | `owed` when > 0, else `zero` ("US$0.00") | end | total Σ |
| Pays in | `terms` | `text` | start | "30 days" |
| Last paid | `lastPaidOn` | `date`, short form with the year ("4 Sep 2026") | start | "—" never. FND-LIST adds the `short` date style |
| State | `state` | `state` | start | tones: Overdue `bad`, Owing `info`, Paid up `hollow`, On hold `warn`, Waiting for the owner `pending`, Closed `neutral` |

**Totals band**: "Σ" · count ("4") · Σ limit ("US$2,450.00") · Σ owed ("US$1,213.80") · Σ overdue ("US$212.40") · — · — · —.

**Row menu** (**Defined here**): "Take a payment" (owing; `?sheet=account-payment&id=`), "Change the account"
(`?sheet=account-edit&id=`), "Send a statement" (`?sheet=statement&id=`) — `retail.accounts:update`; "Open the customer".

**Bulk**: "Send statements" (`?sheet=statement&ids=<…>`), "Remind on WhatsApp" (`?sheet=message&purpose=reminder&about=account:<…>`)
— `retail.accounts:update`; "Export <n>".

**Empty**: "No accounts yet" / "An account lets a customer buy now and pay later, up to a limit you set." / "+ Open an account"
(**Defined here**). **Phone card**: title the customer, badge the state, figure owed, meta "US$800.00 limit · pays in 30 days",
figure2 overdue.

**Address**: `?tab=&q=&state=&sort=&group=&page=`.

### 5.13 Open an account — `?sheet=account-new` (board `AccountOpen.png`) · CUS-07

From `K.account`. Title "Open an account"; sub "Accounts" (from a record: the customer's name).

| Field (id) | Type | Options, default | Validation | Hint |
|---|---|---|---|---|
| Customer (`cust`) | `auto`, noun customer, context `{ for: "account" }` | sub the phone; quick add Name, "Phone or WhatsApp" ("+263 7"); prefilled from `customerId` | required; no open account | — |
| Limit (`limit`), half | `money` | empty | 1.00–100,000.00 | "Sales over it need a manager PIN." |
| Pays in (`terms`), half | `seg` | "7 days", "14 days", "30 days"; default "30 days" (**Defined here**) | — | — |
| Price list (`list`) | `auto`, noun `price list` | "Retail" sub "Default", "Wholesale" sub "8% off, 6 or more"; default the customer's list or the default | a live list | — |
| Who may buy on it (`who`) | `tags`, placeholder "Add a name, then Enter" | the customer's name when a person is picked (**Defined here**) | 1–10 names, 2–60 characters | "The cashier checks the name at the till." |
| ID or company papers (`id`), optional | `photo` | "Add a copy" / "Drop it here, or take one on a phone" | JPEG, PNG or PDF, ≤ 10 MB | — |

Footer: note "Owners approve accounts over US$250.00." (the threshold); secondary "Cancel"; primary "Open the account". Done
"Account opened for Chikore Weddings. US$500.00 limit, 14 days." (waiting: "Sent to Tendai Mhlanga to approve: US$500.00 limit for
Chikore Weddings.").

### 5.14 Change the account — `?sheet=account-edit&id=<accountId>` (board `AccountEdit.png`) · CUS-07

From `K.accountedit`. Title "Mbare Sports Club’s account"; sub "Owes US$612.40 · US$212.40 overdue" ("Owes US$31.00" with nothing
overdue; "Owes nothing"; waiting: "Tafara Nyathi asked for US$500.00 on 3 October." — **Defined here**).

| Field (id) | Type | Options, default | Validation | Hint |
|---|---|---|---|---|
| Limit (`limit`), half | `money` | the limit | 1.00–100,000.00 | — |
| Pays in (`terms`), half | `seg` | "7 days", "14 days", "30 days"; the terms | — | — |
| Stop selling on account until paid (`hold`) | `toggle` | `held` | — | "On by itself when anything is 30 days overdue." (held by itself: "On by itself since 5 October: US$128.00 is 30 days overdue." in `--warn` — **Defined here**) |
| Who may buy on it (`who`) | `tags`, placeholder "Add a name, then Enter" | the buyers | 1–10 names | — |

Footer: danger "Close the account" (owner; ConfirmDialog `closeaccount`); note "Closing needs nothing owed. Their sales history
stays."; secondary "Cancel"; primary "Save" (owner on a waiting account: "Approve US$500.00", which saves the fields and approves).
Done "Account saved. Selling on account is on hold until paid." (held) / "Account saved." / "US$500.00 limit approved for Chikore
Weddings." / "Account saved. US$1,200.00 waits for Tendai Mhlanga."

### 5.15 Take a payment — `?sheet=account-payment&id=<accountId>` (board `CustPayment.png`) · CUS-08

From `K.custpayment`. Title "Take a payment"; sub "Mbare Sports Club · owes US$612.40, US$212.40 overdue" ("Tapiwa Marange · owes
US$31.00" with nothing overdue).

| Field (id) | Type | Options, default | Validation | Hint |
|---|---|---|---|---|
| Amount (`amt`), half | `money` | what is overdue, or everything owed when nothing is (**Defined here**) | > 0, ≤ owed | — |
| Paid by (`how`), half | `seg` | "Cash", "EcoCash", "Bank transfer"; default "Cash" (**Defined here**) | — | Cash: "Goes into the front till’s drawer (Chipo Dube)." (FLR-03's drawer answer; several drawers → a "Drawer" `seg` appears under it) |
| Reference (`ref`), half | `text`, mono | empty | 4–40 characters, required for EcoCash and bank transfer (label gains "optional" while Cash is chosen) | — |
| Paid on (`date`), half | `text` | today ("3 October 2026") | not after today; not before the account opened | — |
| Pays (`alloc`) | `read` | live from payment-preview: "The oldest sales first: US$212.40 overdue, then US$87.60 of September." | — | — |

Footer: note "A receipt goes to them on WhatsApp." (no number: "They have no WhatsApp number. Print the receipt from the Account
tab." — **Defined here**); secondary "Cancel"; primary "Record US$300.00" (follows the amount; "Record it" while empty). Done
"US$300.00 recorded. Mbare Sports Club owes US$312.40." ("… owes nothing now.").

### 5.16 Send statements — `?sheet=statement&ids=<accountIds>` (board `StatementSend.png`) · CUS-09

From `K.statement`. Title "Send statements" (one account: "Send a statement"); sub "4 accounts owing" ("4 accounts, 3 owing"; one:
"Mbare Sports Club · owes US$612.40").

| Field (id) | Type | Options, default | Validation | Hint |
|---|---|---|---|---|
| Covering (`period`) | `seg` | "<last full month>" ("September"), "Last 30 days", "Since opening"; default the month | — | — |
| Send by (`how`) | `seg` | "WhatsApp", "Email", "Print"; default "WhatsApp" | — | — |
| Message (`msg`) | `area`, 3 rows (not drawn for Print) | "Hello, your Harare Bottle Store statement is attached. Pay by EcoCash 0921 774 or CBZ 1002 4471. Thank you." (built as in 5.10) | ≤ 600 | — |

Footer: note "Each statement lists sales, payments and what is overdue."; secondary "Cancel"; primary "Send 4 statements" ("Send
the statement"; Print: "Print 4 statements"). Done "4 statements sent on WhatsApp." / "4 statements emailed." / "4 statements
ready to print." (Print opens `printUrl` in a new tab); skipped accounts make it a warn toast naming them.

### 5.17 Confirm dialogs (`lib/retail/asks.ts`)

| Key | Title | Body | Keep | Go | Fill |
|---|---|---|---|---|---|
| `bin` (FND) | "Move Tapiwa Marange to the bin?" | FND's body | "Keep it" | "Move to the bin" | bad |
| `closeaccount` (**Defined here**) | "Close Mbare Sports Club’s account?" | "Nothing is owed, so nothing changes in the books. Selling on account stops at every till today, and the 14 sales on it stay in their history. You can open it again later." | "Keep it open" | "Close the account" | bad |

### 5.18 The till (no boards; CUS-10 on FLR-09's till)

The canvas has no till boards; this is the least the workflows need, in the till's existing style (`components/retail/portal/*`).
- **Customer panel** (`pos-checkout-view.tsx`): one search "Phone, card or name" (`GET /pos/customers`); a result row shows the
  name, phone, tier, "3,021 points · US$30.21"; picking sets the sale's customer. "Add a customer" opens the 5.2 fields (phone
  first) and posts with `via: "till"`; a 409 offers "Use <name>".
- **Spend points**: shown when the customer `canSpend`: "Spend points" with the balance and "up to US$12.40 on this sale"; a number
  pad for points; the server's sentences show as they come. Hidden when loyalty is off; disabled offline ("Spending points needs
  the internet.").
- **On account** tender (shown when SET-05's "On account" is on): pick the account (the sale's customer's own first, else search
  `account`), then "Who is buying?" — the holder and the named buyers as buttons; the available credit "US$187.60 left of
  US$800.00"; over it, STK-04's manager approval. On hold, waiting or closed accounts are shown and cannot be picked, with the
  reason. Disabled offline ("On account needs the internet.").
- **Receipt** (SET-07's renderer): "Points +32 · 3,021 points" under the totals when the sale has a customer; for a sale on account
  "On account: Mbare Sports Club, bought by Tonderai Dube" and "Owes US$624.80".

---
## 6. What to remove (no backward compatibility)

| Remove | Replaced by | Unit |
|---|---|---|
| `app/retail/customers/page.tsx` as it is (`RecordListShell` + `ColumnList` register, client-side search, the "Points ledger" `RecordDialog`) | `<ListFrame source="retail-customers" />`; the ledger is the record's tab | CUS-02 (dialog with CUS-03) |
| The `GET` handler of `app/api/v2/retail/customers/route.ts` (the aggregate over 2,500 sales by `customerName`, its own `getLoyaltyTier`) and the upsert in its `POST` | `retail-customers` source; `createCustomer` (create or 409) | CUS-02 |
| `app/api/v2/retail/customers/search/route.ts` | `GET /api/v2/retail/pos/customers` and the `customer` lookup | CUS-02 |
| `app/api/v2/retail/customers/[id]/loyalty/route.ts` | `GET /api/v2/retail/customers/[id]` and `retail-points` | CUS-03 |
| `lib/retail/loyalty.ts` (`LOYALTY_REDEEM_POINTS_PER_USD`, `LOYALTY_MAX_REDEEM_SHARE`, `getLoyaltyTier`, `parseLoyaltyRedeemPoints`, `getCustomerLoyaltyBalance`) | `lib/retail/loyalty/*` and `RetailLoyaltySettings` | CUS-01 |
| `LOYALTY_REDEEM:<n>` in sale notes (stripped by `20261004136100`), `loyaltyNote` and the redemption checks in `app/api/v2/retail/pos/sales/route.ts` (the 20% cap, "Order discount must match loyalty redemption amount", "Select a customer before loyalty redemption") | `pointsToSpend` and W-46's rules | CUS-01 |
| `loyaltyRedemptionPoints` in `saleSchema` and in the till (`components/retail/portal/pos-portal-state.tsx`, `pos-checkout-view.tsx`) | `pointsToSpend` (renamed in the same commit) | CUS-01 |
| `loyaltyPoints` / `loyaltyTier` on the till's customer type (`pos-portal-state.tsx`, `pos-customers-view.tsx`, `pos-checkout-view.tsx`) and `loyaltyTier` in `app/api/v2/retail/pos/sync/route.ts` | `PosCustomer` (`points`, `tier`) | CUS-02 |
| Customer calls in `lib/offline/module-registry.ts` to `/customers/search` | `GET /pos/customers` | CUS-02 |
| `retail.sell` gates on customer routes; `permissions.test.ts`' row "customers, loyalty and the sales list are the counter's" | `retail.customers`, `retail.accounts`, `retail.loyalty` | CUS-02 |
| The `retail-customers` section in `lib/navigation.ts`, its inclusion in the CRM module (`lib/workspaces.ts` `crm.getItems`) and the "Customers" entries in `lib/primary-actions.ts`, where FND-03 has not already removed them | The floor panel's Customers and Accounts items (FND-03 nav table) | CUS-02 |
| Route registry entry `/api/retail/customers` (no such route exists) | — | CUS-02 |
| `lib/retail/insights.ts`' member guess (`customerName` ≠ "walk-in") | `RetailSale.customerId` and the ledger (the insights spec's change) | `INS:customers` |

---

## 7. Build units

In build order. Every unit: `pnpm typecheck` passes (one at a time on this machine); `npx eslint <changed files>` has no new
errors; the named vitest files pass; every migration's witness passes after `npx prisma migrate deploy` on the dev and the test
databases; the seed is extended for the unit's boards and re-run (`pnpm tsx scripts/seed-retail-demo.ts --slug hurudza-creative
--days 160 --reset`); screenshots with `scratchpad/smoke/lib.js` at 1440×960 as `owner@bottlestore.test` (and the roles named:
manager `tafara.manager@`, cashier `chipo.till@`, stock clerk `tendai.stock@`, bookkeeper `bookkeeper@`, all `@bottlestore.test`,
`RetailDemo123!`), compared side by side with the board PNG. Unit sizes: S under a day, M a day, L two days.

| Unit | Title | Size | Depends on | Boards | Workflows | Routes |
|---|---|---|---|---|---|---|
| CUS-01 | Loyalty rules and the points ledger | L | FND-SETTINGS, FND-SHELL, FND-THEME, FLR-01, PRD-09, SET-01 | LoyaltySettings | W-48, W-46 (server) | `/retail/manage/loyalty`, `/api/v2/retail/settings/loyalty`, `/api/v2/retail/pos/sales` |
| CUS-02 | Customers list, new customer, the customer lookup | M | CUS-01, FND-LIST, FND-SHEET, FND-SHELL | CustomersList, CustomerNew | W-45 (add), W-50 (entry), W-55 | `/retail/customers`, `?sheet=customer-new`, `/api/v2/retail/customers`, `/api/v2/retail/pos/customers`, `/api/v2/retail/lookup/customer` |
| CUS-03 | The customer record, edit, notes, bin | L | CUS-02, FND-RECORD, FLR-01, FLR-06 | CustomerRecord, CustomerEdit | W-46 (ledger), W-62, W-63, W-60 | `/retail/customers/[id]`, `/retail/customers/[id]/points`, `?sheet=customer-edit`, `?sheet=customer-note` |
| CUS-04 | Adjust points, add points, change tier | M | CUS-03 | PointsAdjust | W-47 | `?sheet=points`, `?sheet=customer-tier` |
| CUS-05 | Merge a duplicate, and undo it from the bin | M | CUS-03, FLR-06, PRD-10 | MergeCustomer | W-45 (merge), W-63 (restore) | `?sheet=customer-merge`, `/api/v2/retail/customers/[id]/merge` |
| CUS-06 | Message customers on WhatsApp | M | CUS-02, SET-07, SET-01 | MessageNew | W-50 | `?sheet=message`, `/api/v2/retail/customers/messages`, `/api/webhooks/whatsapp` |
| CUS-07 | Accounts: list, open, change, hold, close, approve | L | CUS-03, SET-05, PRD-05, BUY-04, FND-LIST, FND-SHEET | AccountsList, AccountOpen, AccountEdit | W-49 (approve an account and limit) | `/retail/accounts`, `?sheet=account-new`, `?sheet=account-edit`, `/api/v2/retail/accounts` |
| CUS-08 | Take a payment on account | M | CUS-07, BUY-05, SET-09, FLR-03 | CustPayment | W-49 (record payment) | `?sheet=account-payment`, `/api/v2/retail/accounts/[id]/payments` |
| CUS-09 | Statements and reminders | M | CUS-08, CUS-06 | StatementSend | W-49 (statement) | `?sheet=statement`, `/api/v2/retail/accounts/statements` |
| CUS-10 | The till: find a customer, spend points, sell on account | L | CUS-01, CUS-02, CUS-07, CUS-08, FLR-09, STK-04, SET-05, PRD-05 | — (the till) | W-46 (till), W-49 (sell on account) | `/portal/pos`, `/api/v2/retail/pos/customers`, `/api/v2/retail/pos/sales` |

### CUS-01 · Loyalty rules and the points ledger (W-48, W-46 server) — L

Builds: migrations `20261004136000_retail_customers` and `20261004136100_retail_loyalty` with their witnesses; the three
resources in `lib/retail/permissions.ts`; `lib/retail/loyalty/{settings,tiers,earn,spend,reverse,expire,birthday,format}.ts`;
`lib/retail/settings-pages/loyalty.ts` and `app/retail/manage/loyalty/page.tsx` (`<SettingsFrame page="loyalty" />`); the
`loyalty` page in `GET`/`PATCH /api/v2/retail/settings/[page]`; earning and spending in `pos/sales` (and the offline replay); the
`reversePoints` hook FLR-02 calls (until FLR-02 lands, the existing refund and void services in `app/api/v2/retail/_services.ts`
call it); the expiry and birthday jobs in the retail worker; the Loyalty nav item's `requires`; seed CUS-01; removals in section 6
marked CUS-01.

Tests: `lib/retail/loyalty/earn.test.ts` (floor of US$ × rate; the top tier's rate; promoted lines out when "Earn on promotion
prices" is off; deposits and vouchers sold out; the points value subtracted; loyalty off earns nothing), `spend.test.ts` (each
refusal's exact sentence; alcohol lines not payable when the rule is off; the value floored to the cent; the discount spread so
VAT follows), `expire.test.ts` (first in, first out on a fixture of earns, spends and an earlier expiry), `tiers.test.ts` (parse
"Silver, from US$500"; order; a held tier; a held tier whose name was removed), `settings.test.ts` (every field's parse and
message).

Acceptance:
- `/retail/manage/loyalty` as the owner, side by side with `LoyaltySettings.png`: panel "Management" with Loyalty current; title
  "Loyalty" and no header button; Points (toggle on, "1 point for each US$1", "US$ 0.01" with "So 100 points take US$1 off.", "500
  points", "Never | After 12 months" with After 12 months in solid ink), Tiers (three tags, "Gold earns 1.5 points for each
  US$1"), Rules (three toggles with their hints); aside "Last 30 days" with three lines computed from the ledger (412 customers;
  "96 spent 21,400 points, US$214.00 off."; the members' ratio) and "Who can change this · Owners only."; bar "Last changed by
  Tendai Mhlanga, 1 August."
- Change "A point is worth" to 0.02 → the hint reads "So 50 points take US$1 off." → bar "1 change not saved" → Save changes →
  "Saved just now."; `RetailLoyaltySettings.pointValue` = 0.0200 and one `RETAIL_SETTINGS.CHANGED` row. Add the tag "Platinum, from
  US$5,000" → the label reads "Platinum earns". Type "lots" in Earn → "Write it as “1 point for each US$1”." Put both back.
- Manager: every field read-only, bar "Owners only."; `PATCH` as the manager → 403 "Your role cannot change loyalty settings".
  Cashier: no Loyalty in the panel; `GET` → 403.
- End to end at the till's API (`POST /api/v2/retail/pos/sales` as Chipo on the open Front till shift): a US$21.40 sale for Tapiwa
  Marange (Gold) answers `loyalty.earned` 32 and writes one `EARNED` +32 row; a sale spending 500 points takes US$5.00 off and
  writes `SPENT` −500; spending 300 for a customer with 320 → 400 "… needs 500 points to spend them. They have 320."; a full refund
  of the US$21.40 sale writes `REVERSED` −32. After the migration no sale note contains `LOYALTY_REDEEM`.
- Running the expiry job for the run date on the seed writes nothing for Tapiwa (his 42 already expired on 31 July) and the right
  amount on a fixture customer.

### CUS-02 · Customers list, new customer, the customer lookup (W-45 add, W-50 entry) — M

Builds: source `retail-customers` (definition and database-side `page()`), sheet kind `customer-new`, `createCustomer`,
`lib/retail/customers/stats.ts`, the `customer` lookup noun, `GET /api/v2/retail/pos/customers`, the bin kind `customer` (move,
restore, name; the lay-by refusal — CUS-07 adds the account refusal), the Customers nav item's `requires`; the till and offline callers repointed; seed CUS-02 (with the
`planned` seam into FLR-01 and the history days before the window); removals marked CUS-02.

Tests: `lib/reports/loaders/retail/customers.test.ts` (12-month spend nets voids and refunds; visits exclude voided sales; tier by
spend and by a live hold; each filter and sort; totals equal a SQL sum over the filtered rows; search by phone digits and card),
`lib/retail/customers/create.test.ts` (normalising, the duplicate-phone 409 with `existing`, code and card numbering under two
concurrent creates).

Acceptance:
- `/retail/customers` side by side with `CustomersList.png`: header "Customers" and "+ New customer"; toolbar "Name, phone or
  card", "Tier Any", "Last visit Any", "Filters", count, "Most spent | Group | Columns", "Export"; the first eight rows are the
  board's (Tapiwa Marange +263 77 412 3388 Gold 141 15 August 2026 3,021 US$3,021.80 … Rudo Chirwa … US$2,051.30) in that order;
  the totals band and the pager cover every customer ("1–50 of 436"), equal to SQL.
- Tick two rows: "2 selected │ Message on WhatsApp · Add points · Change tier · Export 2". "Tier Silver": the count equals SQL.
  Search "3388": Tapiwa Marange only. "Last visit · Over 90 days ago": none of the eight.
- "+ New customer" → sheet as `CustomerNew.png`; type "+263 71 554 0912", "Simba Nkomo", leave the toggle on → "Add customer" →
  toast "Simba Nkomo added. 0 points." with "Open"; he is in the list (Visits 0, Last visit "—", Points 0), with the next CUS
  number and card. The same phone again → under the field "Simba Nkomo already has this number." with "Open Simba Nkomo".
- Cashier: sees the list and "+ New customer"; ticking shows only "Export <n>"; no row menu. Stock clerk: no Customers item and the
  list API answers 403 "Your role cannot view customers". Bookkeeper: list, no "+ New customer".
- `GET /api/v2/retail/pos/customers?q=5540912` as Chipo returns Simba Nkomo with 0 points; `?q=6009 1400 0141` returns Tapiwa.

### CUS-03 · The customer record, edit, notes, bin (W-46 ledger, W-62, W-63) — L

Builds: record kind `customer`; sources `retail-points`, `retail-customer-purchases`, `retail-customer-notes`; the conditional
Lay-bys tab (FLR-06's source with `customer`); `GET /customers/[id]`, `/spend`, `/notes`, `/pdf`; `PATCH /customers/[id]`; sheet
kinds `customer-edit`, `customer-note`; the Points movements page; FLR-01's `retail-sales` `customer` parent filter; seed CUS-03;
the loyalty route and dialog removed.

Tests: `lib/retail/customers/stats.test.ts` (each KPI's value, delta, tone and note, including the first-year and no-visit
cases; the meter's three forms; Usually buys), `lib/retail/customers/update.test.ts` (each field's rule; tier hold and release;
card uniqueness).

Acceptance:
- `/retail/customers/<Tapiwa>` side by side with `CustomerRecord.png`: "‹ Customers / Tapiwa Marange CUS-00141" and "⋯" (each
  action joins the group when its sheet lands: "Adjust points" with CUS-04, "Message on WhatsApp" with CUS-06, "Take a payment"
  with CUS-08, whose acceptance repeats the header comparison: "Adjust points | Take a payment | Message on WhatsApp | ⋯"); strip "● Gold · Member since 12 March 2024 · Agreed to messages … Points 3,021"; KPIs
  "US$3,021.80 +18% on the 12 before", "141 2.6 days apart", "US$21.43 +US$1.10 on last year", "3,021 US$30.21 to spend", "15 Aug
  49 days ago, usually 3" (49 in amber); "Spend per month US$" with "12 months" selected and Nov–Aug at the board's heights
  (Deviation: Sep and Oct empty at the end); tabs "Points ledger 214 · Purchases 141 · Notes 2" then Activity (Account joins with CUS-07); the
  ledger's first seven rows are the board's (dates, What with their dots, By, Points, Balance; receipt numbers are the seeded
  sales'); the totals row per 5.3 ("Σ 12 months", earned +4,210, spent −1,189, expired −42, +2,979, 3,021); "1–10 of 214" and "All
  points movements"; rail meter (Deviation text), Contact with the hint, Loyalty, Usually buys as the board.
- ⋯ lists Export as PDF, Edit everything, Stop marketing messages, and Move to the bin with "Managers and owners only" (Merge
  with another customer joins with CUS-05; Open an account, Change the account and Send a statement with CUS-07 and CUS-09).
- "Edit everything" → `CustomerEdit.png` (fields filled, Tier "Gold" selected, Price list "Retail"); change Area to "Mbare" → Save
  → toast "Tapiwa Marange saved."; the rail reads "Mbare"; Activity "Changed Area from Mbare, Harare to Mbare". Rail: click Email,
  type "tapiwa@example.com", Enter → "Saved" under the key; Esc on another row cancels.
- Bin a member → banner "In the bin since …", gone from the list and from `pos/customers`; Restore → back.
- "All points movements" opens `/retail/customers/<id>/points` with every row and the same balance; a Receipt link opens the sale.
- Cashier on the record: no action group, ⋯ with Export as PDF only, rail plain, no Account or Activity tab.

### CUS-04 · Adjust points, add points, change tier (W-47) — M

Builds: sheet kinds `points` (one and many) and `customer-tier`; `POST /customers/[id]/points`, `/customers/points`,
`/customers/tier`; `lib/retail/loyalty/adjust.ts` (+ test: take-away limit, bulk skips, entry fields).

Acceptance:
- Tapiwa's record → "Adjust points" → `PointsAdjust.png`: sub "Tapiwa Marange · 3,021 points, worth US$30.21"; choose Add, type
  200 (Worth "US$2.00"), "Make good a complaint", note "Warm beer sold on 30 September." → "Save to the ledger" → toast "200
  points added. 3,221 points now."; the ledger's first row "Make good a complaint · Tafara Nyathi (as the manager) · +200 · 3,221";
  strip "Points 3,221"; Activity "Added 200 points: Make good a complaint".
- Take away 5,000 → "Tapiwa Marange has 3,221 points. Take away no more than that."
- Customers: tick three → "Add points" → sheet titled "Add points", sub "3 customers", 50 → toast "50 points added to 3
  customers."; "Change tier" on two Silver members → "Gold" → toast "2 customers are Gold until 3 October 2027."; their Tier
  cells read Gold; their records' chips "Gold, held".
- Cashier: no "Adjust points"; `POST …/points` → 403 "Your role cannot change customers".

### CUS-05 · Merge a duplicate, and undo it from the bin (W-45 merge, W-63 restore) — M

Builds: migration `20261004136200_retail_customer_merges` + witness; `lib/retail/customers/merge.ts` (`mergeCustomers`,
`unmergeCustomer`, blockers) + tests; sheet kind `customer-merge`; merge-preview; the bin kind's restore for merged customers.

Acceptance:
- Tapiwa's record → ⋯ "Merge with another customer" → `MergeCustomer.png`: pick "T. Marange, +263 77 412 3380" (sub "412 points,
  9 visits"); "Keep the phone number" shows "+263 77 412 3388 | +263 77 412 3380" with the first selected; "After merging 3,433
  points, 150 visits, one ledger" → "Merge" → toast "Merged. Tapiwa Marange has 3,433 points."; Points 3,433, Visits 150, the
  duplicate's ledger rows in his ledger; T. Marange gone from Customers; `GET /api/v2/retail/bin` (or `ADM:bin`'s page) lists "T.
  Marange, +263 77 412 3380 · Customer, merged".
- Restore it → both customers back with 3,021 and 412 points and their own sales; Activity on both ("Merged in …", "Took T.
  Marange back out …").
- A duplicate with an account while the survivor has one → the footer reads "Both have accounts. Close T. Marange’s account
  first." and "Merge" is disabled.

### CUS-06 · Message customers on WhatsApp (W-50) — M

Builds: migration `20261004136300_retail_customer_messages` + witness; `lib/retail/messages/{audience,render,queue,drain}.ts`
(+ tests: each audience; placeholder filling; scheduled re-fill; consent rules per purpose); sheet kind `message` (offers and
reminders); preview and send endpoints; the drain at five minutes with `scheduledFor`; `lib/messaging/whatsapp.ts`
`sendDocument` and `WHATSAPP_COST_PER_MESSAGE`; the STOP webhook (+ test with a signed payload); seed CUS-06.

Acceptance:
- Customers: tick the eight Gold regulars → "Message on WhatsApp" → `MessageNew.png`: sub "8 ticked · all agreed to WhatsApp"; To
  "The 8 ticked" selected; type the board's message; note "WhatsApp charges about US$0.02 a message. 8 messages, US$0.16."; "Send
  to 8" → toast "Sent to 8 customers."; eight `RetailMessage` rows, Tapiwa's body "Hi Tapiwa, Savanna Dry is two for US$5 this
  month end, 25 to 31 October. You have 3,021 points to spend. Harare Bottle Store."
- "Not seen in 30 days" → the primary and note follow SQL's count of consenting customers without a visit in 30 days. "Friday
  16:00" → "Schedule for 8" → rows with `scheduledFor` next Friday 16:00 Africa/Harare; a drain run before then sends none.
- Without WhatsApp credentials → 409 "WhatsApp is not set up yet, so nothing was sent." shown in the footer.
- A signed STOP from +263 77 412 3388 → Tapiwa's chip "Agreed to messages" is gone, Activity "Replied STOP on WhatsApp", and the
  next "Everyone who agreed" leaves him out.

### CUS-07 · Accounts: list, open, change, hold, close, approve (W-49) — L

Builds: migration `20261004136400_retail_customer_accounts` + witness; `lib/retail/accounts/{open,change,approve,close,hold,
balances,state}.ts` (+ tests: state precedence, owed and overdue on fixtures, the threshold rule for owner and manager, close
refusal); sources `retail-accounts` and `retail-account-lines`; the `account` lookup noun; sheet kinds `account-new`,
`account-edit`; the record's Account tab and ⋯ items; the customer bin kind's account refusal; notifications; the badge provider
"1 overdue"; the hold job; seed CUS-07.

Acceptance:
- `/retail/accounts` side by side with `AccountsList.png`: "Accounts · Customers who buy now and pay later" and "+ Open an
  account"; tabs "Owing 4 · Overdue 1 · All 9"; "Customer", "State Any", "Filters", count "4", "Most owed"; the four rows with the
  board's figures (Mbare Sports Club US$800.00 US$612.40 US$212.40 pill, 30 days, 4 Sep 2026, Overdue; Chikore Weddings …; Tapiwa
  Marange …; Highfield Shebeen Co-op …); totals "4 · US$2,450.00 · US$1,213.80 · US$212.40"; the panel's Accounts badge "1
  overdue". "All" shows nine with Paid up, On hold, Waiting for the owner and Closed badges.
- As Tafara (manager): "+ Open an account" → `AccountOpen.png` layout; Customer "Blessing Ncube", Limit 500.00, "14 days",
  "Wholesale", buyers "Blessing Ncube", "Thandi Ncube" → "Open the account" → toast "Sent to Tendai Mhlanga to approve: US$500.00
  limit for Blessing Ncube."; All shows her "Waiting for the owner"; Tendai has the notification; following it as the owner opens
  the sheet with "Approve US$500.00" → toast "US$500.00 limit approved for Blessing Ncube." → state "Paid up". As the owner,
  US$100.00 for another customer opens at once.
- Accounts ⋯ on Mbare → "Change the account" → `AccountEdit.png` (800.00, 30 days selected, the hold on, the two buyers) → Save →
  toast "Account saved. Selling on account is on hold until paid."; "Close the account" → 409 "Mbare Sports Club owes US$612.40.
  Take a payment first." Close Mabvuku Darts Club → ConfirmDialog `closeaccount` → "Mabvuku Darts Club’s account is closed."
- Bin on Tapiwa Marange's record → 409 "Tapiwa Marange owes US$31.00 on account. Take a payment, or close the account, first."
- Bookkeeper: Accounts visible; "Change the account" works for a limit under the threshold; no "+ Open an account"; no "Close the
  account". Cashier: no Accounts item; the API answers 403 "Your role cannot view accounts".

### CUS-08 · Take a payment on account (W-49 collect) — M

Builds: migration `20261004136500_retail_account_payment_posting` + witness; `lib/retail/accounts/{payments,allocate,posting,
receipt-pdf}.ts` (+ tests: oldest first; the preview sentence's forms; the cash drawer path; posting balances); sheet kind
`account-payment`; preview, record and receipt endpoints; the hold lifting by itself; seed CUS-08.

Acceptance:
- Tapiwa Marange's record header now reads "Adjust points | Take a payment | Message on WhatsApp | ⋯" as `CustomerRecord.png`.
- Mbare Sports Club's record → "Take a payment" → `CustPayment.png`: sub "Mbare Sports Club · owes US$612.40, US$212.40 overdue";
  type 300.00, "Bank transfer", "CBZ 0310 4412", Paid on "3 October 2026"; Pays "The oldest sales first: US$212.40 overdue, then
  US$87.60 of September."; primary "Record US$300.00" → toast "US$300.00 recorded. Mbare Sports Club owes US$312.40."
- The Accounts row reads US$312.40 owed, "US$0.00" overdue, Last paid "3 Oct 2026", state Owing (the hold lifted: Activity "Took
  the account off hold"); the badge is gone; a journal entry for `RETAIL_ACCOUNT_PAYMENT` Dr the transfer account US$300.00 / Cr
  1100 US$300.00 (SQL); a queued receipt message with the PDF.
- A cash payment while only the Front till is open → `RetailCashMovement` IN on Chipo Dube's shift and the shift's "Should be in
  the drawer" rises by the amount; with no shift open → "Open a shift at Harare Main Branch to take cash."
- 700.00 → "Mbare Sports Club owes US$312.40." under Amount.

### CUS-09 · Statements and reminders (W-49 statement) — M

Builds: the documents source `retail.account.statement` with its default template and sample payload; statement preview, send,
print and single-statement endpoints; sheet kind `statement`; the reminder purposes of `message` for accounts; seed CUS-09.

Acceptance:
- Accounts: tick the four owing → "Send statements" → `StatementSend.png`: sub "4 accounts owing"; "September" and "WhatsApp"
  selected; the message "Hello, your Harare Bottle Store statement is attached. Pay by EcoCash 0921 774 or CBZ 1002 4471. Thank
  you."; "Send 4 statements" → toast "4 statements sent on WhatsApp."; four outbox rows with a document link; Mbare's PDF shows
  the opening balance at 1 September, the September charges with their buyers, the payment, the closing balance, "Overdue:
  US$212.40" and the CBZ payment details.
- "Print" → "Print 4 statements" opens one PDF of four pages. "Email" with two customers lacking an email → warn toast naming them.
- "Remind on WhatsApp" → the reminder sheet ("Remind on WhatsApp", "4 accounts · 4 with a WhatsApp number") → "Send to 4" →
  "Reminders sent to 4 customers."; Mbare's body names US$612.40.

### CUS-10 · The till: find a customer, spend points, sell on account (W-46, W-49 at the till) — L

Builds: the till's customer panel, "Spend points" and "On account" in `components/retail/portal/*` (on FLR-09's till);
`chargeAccount` in `pos/sales`; refunds and voids to the account raising `credited` (with FLR-02); the price engine's customer
context (PRD-05); receipt lines (SET-07's renderer); offline disabling.

Acceptance (as Chipo on a paired till, then via the APIs):
- Search "3388" → "Tapiwa Marange · Gold · 3,021 points · US$30.21"; a US$21.40 sale → done screen "Points +32 · 3,053 points";
  the next sale "Spend points" 500 → US$5.00 off; both rows in his ledger with Chipo Dube as By.
- "On account" for Mbare Sports Club (held) shows "On hold until paid" and cannot be picked. Highfield Shebeen Co-op, buyer "Gift
  Moyo", US$300.00 → the sale posts; Accounts reads US$708.00 owed, a charge due in 7 days; US$700.00 more → "Over the
  US$1,000.00 limit by US$408.00. A manager’s PIN lets it through." → Tafara's PIN → posts; Activity "… went US$408.00 over the
  limit, allowed by Tafara Nyathi". Buyer "John" → "John is not on Highfield Shebeen Co-op’s account."
- Refund the US$300.00 sale back to the account → owed drops by US$300.00; the sale's journal debits 1100 for the on-account part.
- A wholesale-account customer buying 6 Castle Lager 340ml is charged the Wholesale price (PRD-05's engine with this context).
- Offline, "On account" and "Spend points" are disabled with their sentences; a sale made offline for a customer earns on sync.

---

## Open questions

1. **Sample data that cannot all hold at once.** The seed keeps every named row of this area's boards and lists what does not hold:
   (a) FLR-01 rings `SALE-31869` (today) for Tapiwa Marange and `RFD-0044` (today) for Nyasha Gwenzi, which would make their last
   visits today, not mid-August; this spec asks FLR-01 to use Farai Chikore and Tinashe Mavhunga instead. (b) The ledger's
   receipt numbers (SALE-31702 on 15 August) cannot sit 168 sales below SALE-31870 at 130 sales a day; the seeded rows carry the
   numbers FLR-01's sequence gives them. (c) The ledger's totals row cannot be "earned +4,210 · spent −1,147 · expired −42 · +3,021"
   with a balance of 3,021 and 42 points expiring that were earned before the 12 months; the seed keeps the seven rows and the
   balance and the totals read "spent −1,189" and "+2,979". (d) The list's count and totals (8, 1,061, 20,235, US$20,238.25)
   versus Loyalty's "412 customers earned 38,204 points" — the seed has ~436 customers so Loyalty and Insights read sensibly; the
   board's eight rows are the top eight. "38,204 points" cannot be earned from the floor's takings and will read lower. (e)
   Insights › Customers shows Rutendo Banda last came 28 August and Simba Nkomo with 38 visits; this area's boards say 15 August
   and "new". (f) The Bin board shows T. Marange already merged on 28 September while MergeCustomer merges it now; the seed leaves
   it unmerged. (g) The history before the floor's 160 days is added as one thin closed shift per day (section 3.8); the
   alternative is a longer global history.
2. **Platinum.** The record's meter says "Gold, on the way to Platinum · 3,021 of 5,000 · 1,979 more points"; Loyalty settings'
   tiers (by spend, in US$) end at Gold. This spec follows the settings and words the meter in US$ (Deviation). Redraw the meter,
   or add Platinum to the settings board?
3. **Points as a discount.** Spending points stays a sale-level discount (VAT falls with it), as the till does today. If ZIMRA
   treats points as a means of payment, they become a `POINTS` tender instead (no VAT change).
4. **Points are not booked.** Outstanding points are a liability the books do not show (no deferral on earn, no release on spend
   or expiry). Add a "Points owed" account and postings later?
5. **When a sale on account falls due.** This spec counts "Pays in" from the sale date. Statement-based terms (from the end of the
   month) also fit the boards ("US$87.60 of September" not yet due). Confirm.
6. **Overpayments** are refused ("Mbare Sports Club owes US$312.40."); the buying side holds supplier overpayments as credit.
   Should customers' be held too?
7. **Correcting a payment and writing off a debt** are not on the canvas. A bookkeeper will need "Void a payment" (reverse its
   allocations and posting) and "Write it off" (Dr 5600 Bad Debt Expense / Cr 1100). Design them?
8. **Accounting's receivables.** Retail accounts are charges on till sales, not `SalesInvoice`s, so Accounting's AR aging and
   customer statement do not list them (the 1100 balance does include them). Should Accounting's reports read retail charges?
9. **Tabs the board does not draw**: Activity (frame rule, W-60), Lay-bys (the floor spec asks the record to list them) and Account
   (where a manager sees what an account holder owes and paid). Confirm, or redraw `CustomerRecord`.
10. **Staff** are recognised by their phone matching an active staff member's (no flag on the customer). PRD's open question 10
    asks for a "Staff" customer; confirm phone matching or add a field.
11. **"Also confirms 18+"**: this spec stores the date of birth and gives the till `adult`; whether the till may skip the ID check
    for an adult customer is the floor's and the liquor rules' call.
12. **WhatsApp templates.** Offers, reminders and statements are business-initiated messages; Meta requires approved templates
    outside a 24-hour reply window. SET-07's adapter sends free text. Decide the provider and register the templates (SET-07 open
    question 3). A "STOP" from the shared sender number turns consent off in every shop the number is a customer of.
13. **Links from Insights.** `INS:customers` links "Message the 96…" to `?sheet=message&segment=lapsed-30` and "Chase Mbare Sports
    Club" to `/retail/accounts/<customer id>?sheet=customer-payment`; this spec's addresses are `/retail/customers?sheet=message&audience=lapsed-30`
    and `/retail/customers/<customer id>?sheet=account-payment&id=<account id>`. Reconcile in the insights spec.
14. **Approvals.** The threshold ("Accounts need the owner over"), "Owner approvals go to" and "Ask by" are `ADM:approvals`'
    settings; until that page exists this area uses US$250.00, every owner, and the app only.
15. **Migration slot.** This area uses `20261004136000`–`20261004136500`. Reconcile with the other specs before build.
