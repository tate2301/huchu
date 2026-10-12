# 66 · Accounts: list, open, change, hold, close, owner approval (CUS-07)

## Screen
- **Accounts** list `/retail/accounts` (`?tab=owing|overdue|all`, default owing) with sheets `account-new` (`?sheet=account-new`, `&customerId=` from a record) and `account-edit` (`?sheet=account-edit&id=<accountId>`, over the list or the customer record).
- The customer record's **Account** tab and ⋯ items; panel item "Accounts" with the "1 overdue" badge. There is no account record page (an account shows on its customer).

## Units
CUS-07.

## Boards
- `AccountsList.png`: title "Accounts" + sub "Customers who buy now and pay later"; primary "+ Open an account". Tabs "**Owing 4** · Overdue 1 · All 9". Toolbar: search "Customer"; "State Any"; "Filters"; count "4"; "Most owed | Group | Columns"; "Export ⌄". Columns: ☐ · Customer (bold link) · Limit · Owed · Overdue ("US$212.40" in a warn pill; "US$0.00" muted) · Pays in ("30 days") · Last paid ("4 Sep 2026") · State ("● Overdue" bad, "● Owing" info) · ⋯. Σ "Σ 4 · US$2,450.00 · US$1,213.80 · US$212.40". Panel badge "1 overdue".
- `AccountOpen.png`: sheet "Open an account" / "Accounts"; "Customer" auto "Chikore Weddings"; "Limit" US$ 500.00 (half) hint "Sales over it need a manager PIN."; "Pays in" seg "7 days · **14 days** · 30 days" (half); "Price list" auto "Wholesale"; "Who may buy on it" tags "Farai Chikore ×" "Ruva Chikore ×" placeholder "Add a name, then Enter" hint "The cashier checks the name at the till."; "ID or company papers optional" photo "Add a copy / Drop it here, or take one on a phone"; footer note "Owners approve accounts over US$250.00."; "Cancel"; primary "Open the account".
- `AccountEdit.png`: sheet "Mbare Sports Club’s account" / "Owes US$612.40 · US$212.40 overdue"; "Limit" 800.00 (half); "Pays in" seg "7 days · 14 days · **30 days**" (half); toggle card "Stop selling on account until paid" (on) / "On by itself when anything is 30 days overdue."; "Who may buy on it" tags "Tonderai Dube", "Coach Munyaradzi"; footer danger "🗑 Close the account", note "Closing needs nothing owed. Their sales history stays.", "Cancel", primary "Save".

## Workflows
- **W-49 (approve an account and limit; change, hold or close)**: open (manager) → waits for the owner over the threshold → owner approves; change, hold, close; the automatic 30-days-overdue hold.

## Roles
Matrix on main: `retail.accounts` owner view/create/update/delete/approve; manager view/create/update; bookkeeper view/update; cashier and stock clerk none (no Accounts item; API 403 "Your role cannot view accounts"). Approve a limit over the threshold: `retail.accounts:approve` (owner). Close: `retail.accounts:delete` (owner). Threshold: ADM-04's `getApprovalLimits(companyId).accountOwnerOver` (default US$250.00; C-29 — no fallback). Accounts: owner `owner@bottlestore.test` (Tendai Mhlanga), manager `tafara.manager@bottlestore.test`, bookkeeper `bookkeeper@bottlestore.test`, cashier `chipo.till@bottlestore.test` (`RetailDemo123!`).

## Data
Existing: `Customer` (+ `priceListId`), `PriceList`, `RetailSale`, `RetailAttachment` (BUY-04), `Notification`, ADM-04 approvals (`notifyApprover`, `registerWaitingProvider`).

Migration suffix `retail_customer_accounts` (stamp after the newest folder), witness `lib/retail/accounts/accounts-migration.test.ts`. First statements: `ALTER TYPE "RetailAttachmentKind" ADD VALUE 'ACCOUNT_PAPERS'`; `NotificationType` += `RETAIL_ACCOUNT_APPROVAL`, `RETAIL_ACCOUNT_APPROVED`, `RETAIL_ACCOUNT_HELD`; `NotificationEntityType` += `RETAIL_ACCOUNT`.
```prisma
enum RetailAccountHoldReason { BY_HAND OVERDUE_30 }
model RetailCustomerAccount {
  id String @id @default(uuid()); companyId String; customerId String @unique
  limit Decimal @db.Decimal(14, 2); termsDays Int @default(30); buyers String[] @default([])
  held Boolean @default(false); heldReason RetailAccountHoldReason?; heldAt DateTime?
  approved Boolean @default(true); requestedLimit Decimal? @db.Decimal(14, 2); requestedById String?; requestedAt DateTime?
  approvedById String?; approvedAt DateTime?; openedById String?; openedAt DateTime @default(now())
  closedAt DateTime?; closedById String?; updatedAt DateTime @updatedAt
  // company (Cascade); customer (Restrict); requestedBy/approvedBy/openedBy/closedBy User? (SetNull, named relations)
  charges RetailAccountCharge[]; payments RetailAccountPayment[]; sales RetailSale[] @relation("RetailSaleAccount")
  @@index([companyId, closedAt])
}
model RetailAccountCharge {
  id String @id @default(uuid()); companyId String; accountId String; saleId String @unique
  chargedAt DateTime; amount Decimal @db.Decimal(14, 2)
  credited Decimal @default(0) @db.Decimal(14, 2)   // refunds and voids put back on the account
  paid Decimal @default(0) @db.Decimal(14, 2)       // payments settled against it
  dueOn DateTime @db.Date; buyer String
  // account (Cascade); sale "RetailAccountChargeSale" (Restrict); allocations
  @@index([accountId, dueOn])
}
model RetailAccountPayment {
  id; companyId; accountId; paymentNo String; amount Decimal(14,2); method RetailTenderType; reference String?
  paidOn DateTime @db.Date; shiftId String?; cashMovementId String? @unique; receivedById String?; createdAt
  // account (Cascade); shift "RetailAccountPaymentShift" (SetNull); receivedBy (SetNull); allocations
  @@unique([companyId, paymentNo]); @@index([accountId, paidOn])
}
model RetailAccountAllocation {
  id; paymentId; chargeId; amount Decimal(14,2)
  // payment (Cascade); charge (Cascade)
  @@unique([paymentId, chargeId])
}
model RetailSale { accountId String?; accountBuyer String?
  account RetailCustomerAccount? @relation("RetailSaleAccount", fields: [accountId], references: [id], onDelete: Restrict)
  accountCharge RetailAccountCharge? @relation("RetailAccountChargeSale")
  @@index([accountId]) }
```
Also: CHECK constraints `amount > 0`, `credited >= 0`, `paid >= 0`, `credited + paid <= amount` on charges; `amount > 0` on payments and allocations. (`cashMovementId` added to the spec's payment so a cash payment links its drawer movement — packet 67.) `lib/id-generator.ts`: `RETAIL_ACCOUNT_PAYMENT` (`PMT`, pad 4, company-wide). Witness: the enum, the four tables with columns, defaults and checks, the uniques (`customerId`, `saleId`, `(companyId, paymentNo)`), the indexes, the FKs (`Restrict` charge→sale and account→customer), the two sale columns and index, the attachment kind and notification enum values.

## Server
`lib/retail/accounts/`:
- `balances.ts`: `owes = Σ (amount − credited − paid)` over the account's charges; `overdue` = the same over charges with `dueOn < today` (Africa/Harare); `available = limit − owes` (never below 0); `lastPaidOn = max(paidOn)`. One SQL aggregate per call/list.
- `state.ts#accountState(a)` precedence: **Closed** (`closedAt`) › **Waiting for the owner** (`approved = false` or a `requestedLimit`) › **Overdue** (overdue > 0) › **On hold** (`held`) › **Owing** (owes > 0) › **Paid up**. Words (`lib/retail/words.ts`): `accountStateLabel` tones Overdue bad, Owing info, Paid up hollow, On hold warn, Waiting for the owner pending, Closed neutral; `termsLabel(14)` "14 days".
- `open.ts#openAccount(actor, input)`:
```ts
const openInput = z.object({
  customerId: z.string().uuid({ message: "Pick a customer." }),
  limit: z.string().regex(/^\d+(\.\d{1,2})?$/, "A limit of US$1.00 or more."),   // 1.00–100,000.00
  termsDays: z.union([z.literal(7), z.literal(14), z.literal(30)]),
  priceListId: z.string().uuid(),
  buyers: z.array(z.string().trim().min(2).max(60)).min(1, "Add who may buy on it.").max(10),
  papersUrl: z.string().url().optional(),
});
```
  Customer live and without an **open** account (409 `fieldErrors.cust` "Chikore Weddings already has an account."; a closed one is reopened with the new terms); price list live (400 `fieldErrors.list`); sets `Customer.priceListId`. When the caller lacks `retail.accounts:approve` and `limit > accountOwnerOver`: saved **waiting** (`approved = false`, `requestedLimit = limit`, `limit = 0`, `requestedById/At`) and ADM-04's `notifyApprover({ level: "owner", type: RETAIL_ACCOUNT_APPROVAL, title: "Approve a US$500.00 limit for Chikore Weddings", summary: "Tafara Nyathi opened it: 14 days, Wholesale.", viewPath: "/retail/customers/<customerId>?sheet=account-edit&id=<accountId>", entityType: RETAIL_ACCOUNT, askedById })` (WhatsApp too when "Ask by" says so). Papers photo → a `RetailAttachment` kind `ACCOUNT_PAPERS`. Audit `RETAIL_ACCOUNT.OPENED { accountId, limit, termsDays, priceList, buyers, waiting }` (entity `Customer`, id the customer). 201 `{ data: AccountView, waiting, approver? }`.
- `change.ts#changeAccount(actor, id, { limit?, termsDays?, held?, buyers? })`: closed → 409 "The account is closed."; a raise over the threshold by a non-approver keeps the old limit and records `requestedLimit` (notify as above, summary "Tafara Nyathi wants Mbare Sports Club’s limit raised from US$800.00 to US$1,200.00."); `held: true` → `heldReason BY_HAND`, `heldAt`; `false` → cleared; audits `RETAIL_ACCOUNT.CHANGED { accountId, changes: [{ field, label, from, to }], waiting? }`, `RETAIL_ACCOUNT.HELD` / `.RELEASED { reason: "by hand" }`.
- `approve.ts` (`retail.accounts:approve`): nothing waiting → 409 "Nothing is waiting on this account."; `limit = requestedLimit`, request cleared, `approved = true`, `approvedById/At`; notification `RETAIL_ACCOUNT_APPROVED` to the asker ("Chikore Weddings’ account is open" / "US$500.00 limit, approved by Tendai Mhlanga."); audit `RETAIL_ACCOUNT.APPROVED { accountId, limit }`.
- `close.ts` (`retail.accounts:delete`): owes > 0 → 409 "Mbare Sports Club owes US$612.40. Take a payment first."; `closedAt/ById`; audit `RETAIL_ACCOUNT.CLOSED`.
- `hold.ts#holdOverdueAccounts(companyId, today)` (worker `accounts-hold`, `dailyAt "06:00"`): open accounts with an unsettled charge whose `dueOn ≤ today − 30` and not held → `held`, `OVERDUE_30`, `heldAt`; audit `RETAIL_ACCOUNT.HELD { reason: "overdue" }`; notification `RETAIL_ACCOUNT_HELD` to owners and managers ("Mbare Sports Club’s account is on hold" / "US$212.40 is 30 days overdue. Selling on account stops until it is paid.").
- `waiting.ts`: ADM-04 waiting provider kind `account` (registered in `lib/retail/approvals/providers.ts`): waiting accounts "Chikore Weddings, US$500.00 limit. 3 hours." → their edit sheet.
- **Customer bin refusal** (packet 53's kind): owes > 0 → 409 "Tapiwa Marange owes US$31.00 on account. Take a payment, or close the account, first.".
- **Merge** (packet 65): blocker "Both have accounts. Close T. Marange’s account first."; the duplicate's account moves to a survivor that has none (`accountMoved = true`; undo moves it back).
- **Engine context (D-3, PRD-05)**: `hasOpenAccount` and the account's price list feed the ACCOUNT_CUSTOMERS audience (a list is a candidate when the customer has an open, approved account and `priceListId` = the list, or it is the customer's own list); add the case to the engine's tests (the till passes it from packet 68).

**Routes**
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/v2/reports/retail-accounts` | `retail.accounts:view` | list |
| GET | `/api/v2/retail/accounts/[id]` | `retail.accounts:view` | `{ data: AccountView }`; 404 "Account not found" |
| POST | `/api/v2/retail/accounts` | `retail.accounts:create` | open |
| PATCH | `/api/v2/retail/accounts/[id]` | `retail.accounts:update` | change → `{ data, changed, waiting }` |
| POST | `/api/v2/retail/accounts/[id]/approve` | `retail.accounts:approve` | `{}` |
| POST | `/api/v2/retail/accounts/[id]/close` | `retail.accounts:delete` | `{}` |
```ts
type AccountView = { id; customer: { id; name; phone; whatsapp; email }; state; limit; termsDays; buyers; held; heldReason;
  priceList: { id; name } | null; owes; overdue; available; lastPaidOn; requested: { limit; by; at } | null;
  openedAt; closedAt; can: { change; approve; close; pay; statement } };
```
Route registry: `/api/v2/retail/accounts` → `crm.customers` (`lib/platform/gating/route-registry.ts` + test).

**Sources** (`lib/reports/definitions/retail/customers.ts` + loaders):
- `retail-accounts` (in-memory `load()`, owed/overdue/last paid by SQL aggregate): read `retail.accounts:view`; tabs owing (owes > 0, not closed), overdue (overdue > 0), all (closed and waiting included); search customer name and buyers' names; filter `state` (primary: Any, Owing, Overdue, Paid up, On hold, Waiting for the owner, Closed); sorts "Most owed" (default), "Most overdue", "Paid longest ago", "Name A–Z"; groups state, terms. Columns (grid `40px minmax(180px,1.3fr) 120px 120px 120px 110px 140px 140px 44px`, min 1080px): name `link` → `/retail/customers/{customerId}`; limit `money` sum (a waiting account shows the asked limit in `--ink-3`); owes `money` sum; overdue (`owed` pill when > 0, else `zero` "US$0.00") sum; terms `text`; lastPaidOn `date` short with year ("4 Sep 2026"; add the `short` date style to FND-LIST's cell if absent) "—" never; state tones as above. Totals "Σ n" · limit · owed · overdue. Row menu: "Take a payment" (packet 67), "Change the account" (`?sheet=account-edit&id={id}`), "Send a statement" (packet 69) — `retail.accounts:update`; "Open the customer". Bulk: "Send statements", "Remind on WhatsApp" (packet 69), Export. Empty: "No accounts yet" / "An account lets a customer buy now and pay later, up to a limit you set." / "+ Open an account". Card: title customer, badge state, figure owed, meta "US$800.00 limit · pays in 30 days", figure2 overdue.
- `retail-account-lines` (`load()`, parent `account`): charges ("Sale on account, Rumbi Marange"), credits ("Refund to the account") and payments ("Payment, cash") as statement lines with a running owed; columns When (`date` short "28 Sep", 110px) · What · Reference (`ref` 120px: the sale, or "PMT-0042" → its receipt PDF) · Charge · Paid · Owed (running); totals "Σ n" · Σ charge · Σ paid · owed now.

**Lookups**: noun **`customer-account`** (the name `account` is taken by SET-09's chart-of-accounts noun): read `[retail.accounts, view]` or `[retail.sell, view]`; open, approved accounts; label the customer's name; sub "Owes US$612.40 of US$800.00" / "On hold" / "Waiting for the owner"; matches the customer's and buyers' names. `customer` lookup context `{ for: "account" }`: sub phone, or "Already has an account" (choosing it gives the field error).
**Nav**: `lib/retail/nav/floor.ts` "Accounts" (`/retail/accounts`, last, `requires [["retail.accounts","view"]]`); badge provider `customers.accountsOverdue` (accounts with overdue > 0; "<n> overdue"; hidden at 0; owner, manager, bookkeeper).
Audit/words: `accountOpened` "Opened an account: US$500.00 limit, 14 days" (ok) / "Asked the owner for a US$500.00 account" (warn); `accountApproved` "Approved a US$500.00 limit" (ok); `accountChanged` "Changed the account: Limit from US$800.00 to US$1,000.00" (info); `accountHeld` / `accountReleased` "Put selling on account on hold" / "On hold by itself: US$212.40 is 30 days overdue" / "Took the account off hold" (warn/warn/ok); `accountClosed` "Closed the account" (hollow). All on entity `Customer` with `accountId` in the payload.

## UI
- `app/retail/accounts/page.tsx` → `<ListFrame source="retail-accounts" />` (header sub "Customers who buy now and pay later", primary "+ Open an account" `retail.accounts:create`).
- Sheet `account-new` (`lib/retail/sheet-kinds/customers.ts`): title "Open an account"; sub "Accounts" (from a record: the customer's name); `cust` auto noun `customer` context `{ for: "account" }` (prefilled from `customerId`; quick add Name, "Phone or WhatsApp"); `limit` money half, hint "Sales over it need a manager PIN."; `terms` seg half "7 days", "14 days", "30 days" (default 30 days — Defined here); `list` auto noun `price-list` (sub "Default" / its rule; default the customer's list or the default); `who` tags placeholder "Add a name, then Enter" (prefilled with a person's name — Defined here), hint "The cashier checks the name at the till."; `id` photo opt "Add a copy" / "Drop it here, or take one on a phone" (JPEG, PNG or PDF ≤ 10 MB). Note "Owners approve accounts over US$250.00." (the live threshold); primary "Open the account". Done "Account opened for Chikore Weddings. US$500.00 limit, 14 days." / waiting "Sent to Tendai Mhlanga to approve: US$500.00 limit for Chikore Weddings.".
- Sheet `account-edit`: title "Mbare Sports Club’s account"; sub "Owes US$612.40 · US$212.40 overdue" / "Owes US$31.00" / "Owes nothing" / waiting "Tafara Nyathi asked for US$500.00 on 3 October." (Defined here); `limit` money half; `terms` seg half; `hold` toggle "Stop selling on account until paid", hint "On by itself when anything is 30 days overdue." (held by itself: "On by itself since 5 October: US$128.00 is 30 days overdue." in `--warn`); `who` tags. Footer: danger "Close the account" (owner; ask `closeaccount`); note "Closing needs nothing owed. Their sales history stays."; primary "Save" — for the owner on a waiting account "Approve US$500.00" (saves the fields, then `POST …/approve`). Done "Account saved. Selling on account is on hold until paid." / "Account saved." / "US$500.00 limit approved for Chikore Weddings." / "Account saved. US$1,200.00 waits for Tendai Mhlanga.". requires `[["retail.accounts","update"]]`.
- Ask `closeaccount` (`lib/retail/asks/customers.ts`): "Close Mbare Sports Club’s account?" / "Nothing is owed, so nothing changes in the books. Selling on account stops at every till today, and the 14 sales on it stay in their history. You can open it again later." / "Keep it open" / "Close the account" / bad.
- Customer record (packet 61): `CustomerRecordView.account = AccountView`; **Account** tab (only with an account; owner, manager, bookkeeper; source `retail-account-lines`; footer "Send a statement" joins with packet 69); ⋯ "Open an account" (no account or a closed one; `retail.accounts:create`; `?sheet=account-new&customerId=<id>`) and "Change the account" (`retail.accounts:update`; `?sheet=account-edit&id=<accountId>`).

## Reuse
ADM-04 `lib/retail/approvals/{limits,notify,waiting,providers}.ts`, BUY-04's `RetailAttachment` upload, `lib/notifications.ts`, `lib/retail/worker/jobs.ts`, packet 53 (lookup, bin kind, list file), packet 61 (record kind, conditional tabs), packet 65 (merge), PRD-05 (`price-list` noun, engine context).

## Remove
Nothing (no accounts exist).

## Seed (`seedAccounts`)
Nine accounts (Owing 4 · Overdue 1 · All 9), customers created where missing: Mbare Sports Club (+263 77 300 4410) US$800.00, 30 days, buyers Tonderai Dube and Coach Munyaradzi, held by hand by Tafara Nyathi on 2 October; charges 6 Aug 128.00 and 19 Aug 84.40 (overdue 212.40), 12 Sep 87.60, 19 Sep 156.20, 26 Sep 156.20 (owes 612.40), a payment on 4 Sep 300.00 by bank transfer that settled July's charges. Chikore Weddings (+263 77 880 1203) 500.00, 14 days, Wholesale, buyers Farai Chikore and Ruva Chikore; charge 25 Sep 162.40; payment 28 Sep 240.00 EcoCash settling a 12 Sep charge. Tapiwa Marange 150.00, 30 days, buyer Rumbi Marange; charge 28 Sep 31.00 bought by Rumbi Marange with no loyalty customer on the sale (his visits stay 141); payment 1 Oct 45.50 cash settling a 10 Sep charge. Highfield Shebeen Co-op (+263 71 455 0381) 1,000.00, 7 days, Wholesale, buyers Gift Moyo and Tendai Shumba; charges 30 Sep and 2 Oct 204.00 each; payment 30 Sep 380.00 transfer "CBZ 3009 1180" settling a 23 Sep charge. Nyasha Gwenzi 100.00, 30 days, paid up (last paid 20 Sep). Borrowdale Golf Club Bar 600.00, 30 days, paid up (last paid 15 Sep). Mabvuku Darts Club 200.00, 14 days, held by hand, owes nothing. Kuwadzana Funeral Services 300.00, closed 1 September. Rutendo Banda: waiting, US$300.00 asked by Tafara Nyathi on 2 October, with its `RETAIL_ACCOUNT_APPROVAL` notification to Tendai Mhlanga. Every charge is a planned sale (packet 53's seam; tender `ON_ACCOUNT`, `accountId`, `accountBuyer`) with its `RetailAccountCharge` and `RETAIL_SALE` posting (Dr 1100); payments with allocations (their postings: packet 67). Totals on Owing: US$2,450.00 · US$1,213.80 · US$212.40; badge "1 overdue".

## Tests
- Witness.
- `lib/retail/accounts/state.test.ts`: precedence on fixtures.
- `lib/retail/accounts/balances.test.ts`: owed and overdue on fixtures incl. credited and part-paid charges.
- `lib/retail/accounts/open.test.ts` (test DB): manager over the threshold → waiting + notification to the owner (or the named approver); owner → approved at once; reopen a closed account; the threshold read from ADM-04's settings; approve; close refusal when owing; hold job holds at 30 days and only once.
- `lib/reports/loaders/retail/accounts.test.ts`: tabs, totals, state filter.

## Acceptance
1. `/retail/accounts` beside `AccountsList.png`: header and sub, "+ Open an account"; tabs "Owing 4 · Overdue 1 · All 9"; toolbar; the four rows with the board's figures (Mbare Sports Club US$800.00 US$612.40 US$212.40 pill, 30 days, 4 Sep 2026, Overdue; Chikore Weddings; Tapiwa Marange; Highfield Shebeen Co-op); totals "4 · US$2,450.00 · US$1,213.80 · US$212.40"; panel badge "1 overdue". "All" shows nine with Paid up, On hold, Waiting for the owner and Closed.
2. As Tafara: "+ Open an account" beside `AccountOpen.png`; Blessing Ncube, 500.00, 14 days, Wholesale, buyers "Blessing Ncube", "Thandi Ncube" → "Sent to Tendai Mhlanga to approve: US$500.00 limit for Blessing Ncube."; All shows her "Waiting for the owner"; Tendai has the notification; following it as the owner opens the sheet with "Approve US$500.00" → "US$500.00 limit approved for Blessing Ncube." → state "Paid up". As the owner, US$100.00 for another customer opens at once.
3. Accounts ⋯ on Mbare → "Change the account" beside `AccountEdit.png` (800.00, 30 days, hold on, two buyers) → Save → "Account saved. Selling on account is on hold until paid."; "Close the account" → 409 "Mbare Sports Club owes US$612.40. Take a payment first."; close Mabvuku Darts Club → the ask → "Mabvuku Darts Club’s account is closed.".
4. Bin on Tapiwa Marange's record → 409 "Tapiwa Marange owes US$31.00 on account. Take a payment, or close the account, first.".
5. Tapiwa's record shows the Account tab (charges, payments, running owed) and ⋯ "Change the account".
6. Bookkeeper: Accounts visible; "Change the account" works under the threshold; no "+ Open an account"; no "Close the account". Cashier: no Accounts item; API 403 "Your role cannot view accounts".
7. Migration on dev and test; witness, named tests, eslint, one `pnpm typecheck`.

## Depends on
Packets 61 (record), 65 (merge), 53 (lookup, bin), ADM-04 (limits, notify, waiting — on main), BUY-04 (attachments), PRD-05 (price lists, engine), SET-05 (ON_ACCOUNT tender — on main). Locks **W** (hold job), **CR** (record).

## Risk
money (credit limits, receivables, overdue holds). Pitfalls: owed is always derived from charges (never stored on the account); state precedence; a manager can never raise a limit past the owner threshold without the owner; the CHECKs keep charges consistent.

## Open questions
- Lookup noun `customer-account` (not `account`, taken by Posting to the books).
- "Pays in" counts from the sale date (spec open question 5, recommendation kept).


> Coordinator note (2026-10-06, 85a): add the `retail-accounts` `report:` face (§5.14, Customers, no card) and the built-in
> `accounts-owed` (§5.13) in 85a's three steps.
