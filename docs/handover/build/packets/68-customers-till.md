# 68 · The till: find a customer, spend points, sell on account (CUS-10)

## Screen
The till `/portal/pos/*` (no boards): the customer panel on checkout, "Spend points", the "On account" tender with "Who is buying?", the receipt's points and account lines. Server: `chargeAccount` in `POST /api/v2/retail/pos/sales`, refunds and voids back to the account, the engine's customer context.

## Units
CUS-10.

## Boards
None for the till (spec 5.18 is the least the workflows need, in the till's existing style, `components/retail/portal/*`). The record and list boards it feeds: `CustomerRecord.png` (ledger rows with the cashier as By), `AccountsList.png` (owed after a sale on account).

## Workflows
- **W-46 at the till**: find by phone · points earned on the sale · spend at checkout.
- **W-49 sell on account**: the account · who is buying · over the limit a manager's PIN.

## Roles
Paired device + PIN session (SET-04). Sell on account: `retail.sell:create` and the account rules; over the limit a manager's approval (`retail.sell:approve`, C-31). Cashier `chipo.till@bottlestore.test` (PIN 1928); manager `tafara.manager@bottlestore.test` (PIN 2468). Customer search: `retail.customers:view` or `retail.sell:view`; adding a customer: `retail.customers:create` (cashier has it).

## Data
No schema. Uses `Customer`, `RetailPointsEntry`, `RetailLoyaltySettings`, `RetailCustomerAccount`, `RetailAccountCharge`, `RetailSale.accountId/accountBuyer` (packet 66), `RetailPaymentSettings.takeOnAccount`.

## Server
- **`lib/retail/accounts/charge.ts#chargeAccount(tx, { sale, account: { accountId, buyer }, approver, place, replay })`** — called inside the sale transaction of `POST /pos/sales` (and the `pos/sync` replay) when a payment is `ON_ACCOUNT`:
  - The body must carry `account: { accountId: uuid, buyer: string }` with an `ON_ACCOUNT` payment (400 "Pick the account.").
  - Lock the account row `FOR UPDATE` (serialises concurrent sales against one limit). Account open (409 "Kuwadzana Funeral Services’ account is closed."), approved (409 "Chikore Weddings’ account is waiting for the owner."), not held (409 "Mbare Sports Club’s account is on hold until paid."); buyer is the holder's name or one of `buyers`, case-insensitive (400 "Tonderai Dube is not on Mbare Sports Club’s account.").
  - **Limit**: `owes + amount > limit` needs a manager: `approvalFor({ decision: { needsApprover: true, reason: "Over the US$800.00 limit by US$12.40. A manager’s PIN lets it through." }, can: ["retail.sell","approve"], approver, place })` — C-31's answer, **409 `needsApprover`** (not the spec's 403 `MANAGER_PIN_NEEDED`); the cashier's own session never approves it unless they hold the right. Over the limit → audit `RETAIL_ACCOUNT.OVER_LIMIT { accountId, saleNo, over, approvedBy }` "SALE-31871 went US$12.40 over the limit, allowed by Tafara Nyathi" (warn).
  - Writes `RetailSale.accountId`, `accountBuyer`; `RetailAccountCharge { amount = the ON_ACCOUNT payment's base amount, chargedAt = postedAt, dueOn = sale day + termsDays, buyer }`.
  - Replay (`pos/sync`): the goods have gone, so a refusal (held, waiting, over the limit without a PIN) does not refuse the sale — it charges the account and adds a `reviewReason` (SET-06's replay pattern); the till disables On account offline so this is rare.
  - **Invariants**: one charge per sale (`saleId` unique); charge amount = the ON_ACCOUNT payment's base amount; the `RETAIL_SALE` posting debits the ON_ACCOUNT mapping (1100) by the same amount; owes after = owes before + amount.
- **Refund and void back to the account** (packet 56's services, extended):
  - Refund `to: "ORIGINAL"` on a sale paid `ON_ACCOUNT` → no money moves; the sale's charge gets `credited += value`, refused when `value > amount − credited − paid` (400 `fieldErrors.to` "Only US$200.00 is still owed on this sale. Pay the rest back another way."); the refund's negative payment is `ON_ACCOUNT` (the `RETAIL_REFUND` journal credits 1100).
  - Void of an on-account sale: `credited = amount − paid` on its charge; refused when any of it is paid (409 "Part of SALE-31871 is paid. Refund it instead.").
- **`POST /api/v2/retail/pos/sales`** (changed): `account?: { accountId, buyer }`, `approver?` (also used for the limit), `pointsToSpend?` (packet 52); response adds `loyalty: { earned, spent, balance, tier } | null` and `account: { owes, available } | null`. Remove SET-05's `ON_ACCOUNT_NOT_AT_THE_TILL` refusal (`lib/retail/payment-settings.ts`) — the tender is offered when `takeOnAccount` is on.
- **`GET /api/v2/retail/pos/customers`** (packet 53): `account` filled `{ id, owes, limit, available, held, waiting, buyers }`.
- **Engine customer context** (PRD-05 `priceBasket`): `context.customer = { priceListId, hasOpenAccount, member: true, staff }` from the picked `PosCustomer`; a list is a candidate when its audience matches (ACCOUNT_CUSTOMERS: an open account and `priceListId` = the list; LOYALTY_MEMBERS: any live customer while loyalty is on; STAFF: `staff`) or it is the customer's own `priceListId`. The server re-prices with the same context (the sale's `customerId`).
- **Receipt** (SET-07's renderer, `lib/retail/receipt-settings.ts`): under the totals "Points +32 · 3,021 points" when the sale has a customer; for a sale on account "On account: Mbare Sports Club, bought by Tonderai Dube" and "Owes US$624.80".

## UI (in `components/retail/portal/*`)
- **Customer panel** (`pos-checkout-view.tsx`): one search "Phone, card or name" (`GET /pos/customers`; a scanned loyalty card fills it); a result row shows name, phone, tier, "3,021 points · US$30.21"; picking sets the sale's customer and re-prices with the engine context. "Add a customer" opens the `customer-new` fields (phone first) and posts `{ via: "till" }`; a 409 offers "Use <name>".
- **Spend points**: shown when the customer `canSpend`: "Spend points", "3,021 points, up to US$12.40 on this sale" and the minimum; a number pad for points; the cart applies packet 52's `spreadPointsDiscount` for the preview; the server's sentences show as they come. Hidden when loyalty is off; disabled offline ("Spending points needs the internet.").
- **On account** tender (when `takeOnAccount`): pick the account (the sale's customer's own first, else search noun `customer-account`), then "Who is buying?" — the holder and the named buyers as buttons; "US$187.60 left of US$800.00"; over it, packet 60's approval dialog ("Over the US$800.00 limit by US$12.40."). On hold, waiting or closed accounts show and cannot be picked, with the reason ("On hold until paid", "Waiting for the owner", "Closed"). Disabled offline ("On account needs the internet.").
- **Done screen**: "Points +32 · 3,053 points" (Defined here).
- The History refund panel (packet 60) offers "Back on the account" as the ORIGINAL label for an on-account sale.

## Reuse
Packets 52 (loyalty earn/spend), 53 (`PosCustomer`, `createCustomer`), 56 (refund/void services), 60 (approval dialog, `useApproval`), 63 (engine on the till), 66 (accounts, balances, `customer-account` noun), `lib/retail/manager-pin.ts`, SET-07 receipt renderer.

## Remove
- `ON_ACCOUNT_NOT_AT_THE_TILL` and its use in `lib/retail/payment-settings.ts` (`tillTenders`/`checkSaleTenders`).
- Any remaining name-based customer capture in `app/api/v2/retail/pos/sales/route.ts` (the `customerName`/`customerPhone` upsert): a sale carries `customerId` from the panel; the printed `customerName` is that customer's name.

## Seed
Nothing new.

## Tests
- `lib/retail/accounts/charge.test.ts` (test DB): each refusal's sentence; over the limit → 409 `needsApprover`, with Tafara's PIN → charged and OVER_LIMIT audited; two concurrent sales against one limit → the second sees the first's charge; the charge's due date = sale day + terms; replay of a held account → charged with a review line.
- `lib/retail/floor/refunds.test.ts` extended: refund to the account raises `credited` and never above what is unsettled; void of a part-paid on-account sale → 409.
- `components/retail/portal/pos-customer-panel.test.tsx`: search by phone digits and card; add with 409 offers "Use …"; spend points disabled offline.

## Acceptance
As Chipo on a paired till (then via the APIs):
1. Search "3388" → "Tapiwa Marange · Gold · 3,021 points · US$30.21"; a US$21.40 sale → done screen "Points +32 · 3,053 points"; the next sale "Spend points" 500 → US$5.00 off; both rows in his ledger with "Chipo Dube" as By.
2. "On account" for Mbare Sports Club (held) shows "On hold until paid" and cannot be picked. Highfield Shebeen Co-op, buyer "Gift Moyo", US$300.00 → the sale posts; Accounts reads US$708.00 owed and a charge due in 7 days; US$700.00 more → "Over the US$1,000.00 limit by US$408.00. A manager’s PIN lets it through." → Tafara's PIN → posts; Activity "… went US$408.00 over the limit, allowed by Tafara Nyathi". Buyer "John" → "John is not on Highfield Shebeen Co-op’s account.".
3. Refund the US$300.00 sale back to the account → owed drops by US$300.00; the sale's journal debited 1100 for the on-account part and the refund's credited it.
4. A Wholesale-account customer buying 6 Castle Lager 340ml is charged the Wholesale price (PRD-05's engine with this context).
5. Offline, "On account" and "Spend points" are disabled with their sentences; a sale made offline for a customer earns on sync.
6. eslint on changed files, the named tests, one `pnpm typecheck`.

## Depends on
Packets 52, 53, 56, 60, 63, 66, 67 (CUS-08 before this one), STK-04/SET-06 (manager PIN, on main), SET-05 (tenders), PRD-05 (engine). Lock **T**.

## Risk
money (credit sales charged to receivables, points as a discount, refunds back to an account). Pitfalls: lock the account row for the limit check inside the sale transaction; never let a refund credit more than is unsettled; the till's preview and the server's spread must match.

## Open questions
- C-31 over the spec: over the limit answers 409 `needsApprover` (the spec wrote 403 `MANAGER_PIN_NEEDED`).
- A refund back to the account is limited to what is still unsettled on the sale; the rest goes back another way.
