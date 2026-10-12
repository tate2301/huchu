# 40 · Setup › Approvals: price changes that wait for the owner

## Screen
- `/retail/manage/approvals?sheet=price-approval&id=<id>` — sheet over the Approvals page (ADM-04, landed); opened from the aside's
  "Waiting now" item and from the owner's notification.
- Every place prices change (price worksheet, product rail "Price", bulk price change) answers "wait" instead of "saved" for the
  lines that need the owner.

## Units
ADM-05 (docs/handover/80-admin.md §W-58 "Price approvals" table, §3.3 `retail_price_approvals`, §3.4 `priceApproval*`, §3.5
`RETAIL_PRICE_APPROVAL` / `RETAIL_PRICE_DECIDED`, §4.2 price-approval rows + `lib/retail/approvals/prices.ts`, §5.8, §7 ADM-05), with
C-32 (a manager's below-cost price waits instead of PRD-03's 400 refusal; PRD-03/PRD-07 acceptance changes when this lands).

## Boards
`ApprovalSettings.png` — the aside "Waiting now" list gains price items ("Prices on Retail, 2 products, from Tafara Nyathi. 20
minutes."), and the switch "Below cost needs the owner" / hint "Any price under its cost waits for you." becomes true. The sheet has
no board (**Defined here**, §5.8): 760px; title "Price changes on Retail"; sub "Asked by Tafara Nyathi, today 14:02 · from tonight";
read table Product (name, code mono under) · Now · Asked · Cost (`--ink-3`) · Margin (pill: warn under target, bad under cost) · Why
("Owner approves" / "Under cost", muted); Σ "2 products"; a warn read line "Castle Lager 340ml would sell under its cost of US$0.86.";
owner footer: danger "Turn down" (opens an inline area "Why, for Tafara" optional, then "Turn down"), note "The till has the new
prices the moment you approve.", "Cancel", primary "Approve 2 prices"; asker while waiting: note "Waiting for Tendai Mhlanga.",
danger "Withdraw", "Close"; decided: no actions, read line "Approved by Tendai Mhlanga, today 14:20." / "Turned down by Tendai
Mhlanga: <note>".

## Workflows
W-58 Approvals and limits — the price part (verbatim §W-58 "Price approvals" table): a manager changes a price → it waits (toast "2
price changes wait for Tendai Mhlanga.") → the owner approves (prices apply, the till has them) or turns down (nothing changes) → the
manager is told; the asker may withdraw.

## Roles
`retail.prices` (landed): Owner view/create/update/delete/approve; Manager view/create/update (no approve); others view or none.
Decide: `retail.prices:approve` (owner). Read the sheet: the asker or anyone with approve. Withdraw: the asker only (403 "Only Tafara
Nyathi can withdraw this."). Accounts: owner `owner@`, manager `tafara.manager@`, cashier `chipo.till@` at a paired till to read the
till's price.

## Data
Existing: `PriceList`, `ProductPrice`, `ProductPriceChange`, `Product` (`costPrice`), `RetailApprovalSettings` (`priceChanges`,
`belowCostNeedsOwner`), `Notification` (`RETAIL_PRICE_APPROVAL`, `RETAIL_PRICE_DECIDED` already in the enum).
Migration `<stamp>_retail_price_approvals`, witness `lib/retail/price-approvals-migration.test.ts`, verbatim §3.3 (80-admin lines
654–712): enums `RetailPriceApprovalStatus` (WAITING, APPROVED, TURNED_DOWN, WITHDRAWN), `RetailPriceApprovalReason` (OWNER_APPROVES,
BELOW_COST); models `RetailPriceApproval` (companyId, priceListId, requestedById, status, effectiveAt, decidedById/At, note,
`@@index([companyId, status, createdAt])`) and `RetailPriceApprovalLine` (approvalId, productId, fromPrice, toPrice, costAtAsk,
reason; indexes). Witness: enums, tables, FKs, indexes.

## Server
`lib/retail/approvals/prices.ts` (+ `prices.test.ts`):
- The rule itself is PRD-03's single predicate `priceChangeNeedsOwner(limits, actor, row)` in `lib/retail/prices/change.ts` (built so
  this unit can swap refusal for a queued approval — do not write a second one). This unit makes it return the reason
  (`"OWNER_APPROVES"` when `priceChanges = OWNER`; `"BELOW_COST"` when the new price is under `Product.costPrice` while
  `belowCostNeedsOwner`; null for a caller with `retail.prices:approve` or a product with no cost) and adds `splitForOwner(limits,
  actor, rows) → { apply, wait: Array<row & { reason }> }` over it.
- `askPriceApproval(tx, ctx, list, wait, effectiveAt)` → one `RetailPriceApproval` WAITING with its lines (from = the current list
  price, to, `costAtAsk`, reason); audit `RETAIL_PRICE_APPROVAL.ASKED { list, lines: [{ product, from, to, reason }] }`; after commit
  `notifyApprover({ level: "owner", type: RETAIL_PRICE_APPROVAL, title: "Price changes wait for you", summary: "Tafara Nyathi changed
  2 prices on Retail. Castle Lager 340ml US$1.20 → US$0.80, under its cost of US$0.86.", viewPath:
  "/retail/manage/approvals?sheet=price-approval&id=<id>", severity WARNING })`.
- In PRD-03's `changePrices` (`lib/retail/prices/change.ts`, which today throws `PriceRefusal(400, refused)` for owner rows) and
  PRD-07's scheduled price changes: split the rows, apply the `apply` rows as usual, `askPriceApproval` for the `wait` rows **in the
  same transaction**; the result gains `waiting: { id, lines } | null`; the owner-rule refusals ("Below cost needs the owner. It costs
  US$13.03.", "Price changes need the owner.") are removed (C-32) — other refusals (price < 0, binned product) still refuse. Callers' toasts:
  "2 price changes wait for Tendai Mhlanga." (all waited) / "3 prices saved. 2 wait for Tendai Mhlanga." (**Defined here** for mixed).
- `approvePriceApproval(actor, id)` — WAITING only (409 "This was decided already."); re-runs `changePrices` for the lines **as the
  owner** with the current cost re-checked (PRD-03 refusals pass through as 409), honouring `effectiveAt` (a future one is scheduled,
  not applied); each product's `RETAIL_PRICE.CHANGED`/`.SCHEDULED` carries `approvedBy`; status APPROVED, `decidedById/At`; audit
  `RETAIL_PRICE_APPROVAL.APPROVED { list, lines: n, note }`; notification `RETAIL_PRICE_DECIDED` to the asker ("Tendai Mhlanga approved 2
  prices on Retail." → `/retail/products/price-lists/<listId>`). Toast "2 prices approved. The till has them now.".
- `turnDownPriceApproval(actor, id, note ≤300)` — TURNED_DOWN, nothing changes, audit `.TURNED_DOWN`, notification ("Tendai Mhlanga
  turned down 2 prices on Retail. <note>"). Toast "Turned down. Tafara Nyathi is told.".
- `withdrawPriceApproval(actor, id)` — the asker; WAITING only; WITHDRAWN; audit `.WITHDRAWN`. Toast "Withdrawn.".
- Waiting provider (one import line in `lib/retail/approvals/providers.ts`): kind "prices", requires `retail.prices:approve`, WAITING
  approvals → `{ ref: "Prices on Retail", text: ", 2 products, from Tafara Nyathi.", href: "/retail/manage/approvals?sheet=price-
  approval&id=<id>", since: createdAt }`.

API:
| Method · path | Permission | Body | Success | Errors |
|---|---|---|---|---|
| GET `/api/v2/retail/price-approvals/[id]` | `retail.prices:view` (the asker, or approve) | — | `{ data: { id, list, askedBy, askedAt, status, effectiveAt, lines: [{ productId, name, code, from, to, cost, reason, marginAfter }], can: { decide, withdraw } } }` | 404 |
| POST `…/[id]/approve` | `retail.prices:approve` | `{}` | `{ data, applied }` | 409 "This was decided already."; 409 passed through |
| POST `…/[id]/turn-down` | `retail.prices:approve` | `{ note? }` | `{ data }` | 409 |
| POST `…/[id]/withdraw` | the asker | `{}` | `{ data }` | 403 "Only Tafara Nyathi can withdraw this."; 409 |
Audit constants `priceApprovalAsked`, `priceApprovalDecided` (+ `LIST_WORDS`: "Asked to change prices" warn / "Approved prices" ok /
"Turned down prices" hollow, Record = the list name, Change "2 products on Retail"). The Roles sheet's limit sentence for Prices reads
"Below cost needs the owner." / "Price changes need the owner." from the settings (ADM-01's live limit function — confirm it reads
`getApprovalLimits`).

## UI
- Sheet kind `price-approval` in a new `lib/retail/sheet-kinds/approvals.ts` (one line in `sheet-kinds/index.ts`): `wide`, a read `lines`-style table (the `lines` field with `closed: true` and read cells, or a `view` component in
  `components/sheet-form/views.tsx`), the read line, footers per viewer and state; danger "Turn down" shows the optional area then sends.
  Margin pill uses the products spec's margin function (`lib/retail/products/figures.ts`).
- Approvals page (ADM-04): its aside already lists providers; nothing else changes on the page.

## Reuse
`lib/retail/approvals/{limits,notify,waiting,providers}.ts`, PRD-03's `lib/retail/prices/change.ts` (`changePrices`), PRD-07's
scheduling (`ProductPriceChange`, `applyDuePriceChanges`), `lib/retail/products/figures.ts` (margin), `components/sheet-form/*`.

## Remove
PRD-03's below-cost 400 refusal in `changePrices` and any client copy that shows it (C-32).

## Seed
None (no price change is waiting on the board).

## Tests
- Witness.
- `lib/retail/approvals/prices.test.ts`: rule OWNER → every manager line waits; MANAGERS + below cost on → only under-cost lines wait;
  owner never waits; product without cost never "under cost"; mixed save applies some and asks for the rest in one transaction (roll
  back → neither); approve re-checks cost (cost raised meanwhile → still applies as owner); approve twice → 409; turn down changes no
  price; withdraw by someone else → 403; scheduled `effectiveAt` kept on approval.
- Waiting provider and notification tests.
- PRD tests that asserted the 400 refusal are changed to assert the waiting answer.

## Acceptance
1. Migration on dev + test; witness green.
2. As owner, Approvals › Price changes "Owner approves", save. As `tafara.manager@` on the Retail price worksheet: Castle Lager 340ml
   1.20 → 1.30 and Coca-Cola 500ml 0.75 → 0.70 → Save → toast "2 price changes wait for Tendai Mhlanga."; the till (as `chipo.till@`)
   still sells Castle at 1.20; the owner has "Price changes wait for you"; Approvals' aside lists "Prices on Retail, 2 products, from
   Tafara Nyathi. …".
3. Open it → the sheet with the two lines; "Approve 2 prices" → toast "2 prices approved. The till has them now."; the till sells at
   1.30; Activity › Prices shows "Approved prices" and two "Changed a price … approved by Tendai Mhlanga"; Tafara notified.
4. Rule back to "Managers, no approval", "Below cost needs the owner" on; as Tafara price Castle at 0.80 (cost 0.86) → that line waits
   with Why "Under cost" and the warn line; "Turn down" with a note → Tafara told; nothing changed.
5. As Tafara on his own waiting approval: note "Waiting for Tendai Mhlanga.", "Withdraw" → "Withdrawn."; as another manager POST
   withdraw → 403 "Only Tafara Nyathi can withdraw this.".
6. `npx eslint <changed>`; `npx vitest run lib/retail/approvals lib/retail/prices`; `pnpm typecheck` alone.

## Depends on
PRD-03 (`changePrices`) and PRD-07 (price worksheet, bulk change, scheduling) — other planners, on main first (C-32 order). ADM-04
(landed). Packet 32 for the Activity words of the price events.

## Risk
**money** (selling prices the till charges). Pitfalls: the split must happen inside `changePrices`' transaction so no line is half
applied; approving re-runs the change as the owner with today's cost; a waiting approval must never change the till's price.

## Open questions
- Admin open question 4 / C-32: the manager's below-cost price waits (ADM-05's rule) rather than being refused.
- Mixed-save toast wording is **Defined here**.
