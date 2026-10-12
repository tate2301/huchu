# 83 · Insights › Losses (investigate a loss) and Insights › Customers (INS-03)

## Screen
`/retail/insights/losses` and `/retail/insights/customers` (page file `app/retail/insights/[topic]/page.tsx`), builders
`lib/retail/insights/losses.ts`, `customers.ts`, their findings, and the links into Shifts, Sales, Counts, Till rules,
the customer record and the message sheet.

## Units
INS-03. Spec `70-insights-reports.md` §3.7 (Losses, Customers), §5.6, §5.7, §2 W-53, §7 INS-03. Overrides: direction 7
(headline), C-21 (`audience=lapsed-30`, not `segment`), C-40.

## What already exists
After packet 80, both on the new contract with today's figures re-shaped:
- Losses: three kinds (Stock counts from `movementType: "ADJUSTMENT"`, Drawer differences, Refunds and voids); one column per
  week **of the period**; KPIs "Lost …", "Of takings", "Drawer differences" (unsigned, note "{n} shifts short"), "Refunds and
  voids" (note "{n} of them"); one tab "By cashier" (Cashier, Drawer differences, Refunds, Voids) by `cashierName` with no
  links, no No-sale opens, no Σ; actions "Count the stock", "Look at the shifts", "Tighten the till rules".
- Customers: members guessed from `customerName ≠ "walk-in"` (`isMember` heuristic); stacked columns; table Customer, Last came,
  "Visits, 12 months", Spend — no Points, no links; action "See the customers".
- Headline for both exists. `RETAIL_DRAWER.OPENED` is written by SET-06 (`lib/retail/drawer-open.ts`, entity `RetailRegister`,
  id = register, actor = cashier, payload `shiftId`). Shifts list source `retail-shifts` has filters `cashier`, `state`
  (`short`), `opened` (period: presets or `YYYY-MM-DD..YYYY-MM-DD`).

## What INS-03 still adds or changes
1. **Losses** exactly §5.6. Four kinds: Count differences (per count reference, net value of its COUNT movements when negative),
   Breakage (BROKEN and OWN_USE movement values + transfer lines' `quantityLost × unitCost`), Drawer differences (Σ |variance| of
   shifts closed in the window with variance < 0), Refunds and voids (Σ |baseAmount| of REFUND documents and voided SALE
   documents). Read `StockMovement.reason`, not `movementType`.
2. KPIs: "Lost {in 30 days|in 7 days|today|this month}" (money, delta money up bad, note `beforeNote`); "Of takings" (rate, `points`
   up bad); "Drawer differences" (**signed** net Σ variance "−US$43.79", delta = shifts with variance ≠ 0 no tone, note "shifts out"
   / "shift out"); "Refunds and voids" (money, delta count no tone, note "over the PIN limit: {n}" = those with `approvedById`).
3. Chart: stacked columns, **eight weeks** Monday–Sunday ending with the window's end, labelled by Monday ("28 Sep"); legend
   "Count differences" `--s2`, "Breakage" `--s1`, "Drawer differences" `--s3`, "Refunds and voids" `--s4`, stacked bottom-up in
   that order; tooltip "28 Sep · Breakage" / "US$26.00". Independent of the period.
4. Tabs: "By cashier" — Cashier (link `/retail/shifts?cashier=<id>&opened=<period>`), Drawer differences (signed, bad < 0),
   Refunds (link `/retail/sales?tab=refunds&cashier=<id>&when=<period>`), Voids (link `…tab=voids…`), No-sale opens (warn ≥ 3);
   Σ "Σ {n} cashiers". "By product" — Product (link), Count differences, Breakage, Refunds, Lost; Σ. "By till" — Till, Drawer
   differences, Refunds, Voids, No-sale opens; Σ "Σ {n} tills". Period in links: `today|7d|30d|this-month`, a range
   `2026-09-04..2026-10-03`. Rows: most short / most lost first. Empty "No losses in these dates." Keyed by `cashierId` and
   `registerId` (not names).
5. Losses headline notice = first fired of §5.6 ("Losses have doubled in the last two weeks, mostly from count differences on the
   spirits shelf.", "Chipo Dube has been short three times this month, all on Friday evenings.", "Farai Moyo opened the drawer
   without a sale four times."). Actions: "Count the {spirits} shelf again" → `/retail/stock/counts?sheet=count-new&categoryIds=<id>`;
   "Look at {Chipo}’s {Friday} shifts" → `/retail/shifts?cashier=<id>&state=short&opened=<period>`; "Require a PIN to open the
   drawer" (only when there were no-sale opens and `RetailTillRules.drawerOpenWithoutSale` is true) → `/retail/manage/till-rules`;
   fallback "Look at the shifts" → `/retail/shifts`.
6. **Customers** exactly §5.7. Member = sale with `customerId` whose customer is a loyalty member (CUS-01/02 `isMember`); delete the
   name heuristic. KPIs "Takings from members" (share, `points` up ok, note "of all takings"), "Members who came back" (count,
   change up ok, note "in {short}"), "Member basket" (money, delta `times` "2.3×" no tone, note "a walk-in basket"), "Not seen in 30
   days" (count, change up bad, note "members").
7. Chart: columns **side by side**, eight weeks, legend "Members" `--s2`, "Walk-ins" `--data-muted`.
8. Tabs (no Σ): "Not seen in 30 days" — Customer (link `/retail/customers/{id}`), Last came (`dayMonth`), Visits (12 months), "Spend,
   12 months", Points (CUS points balance); "Best customers" — Customer, Visits (window), "Spend, {short}", Points, Last came.
   Empties "Every member has been in within 30 days." · "No members bought in these dates."
9. Customers headline notice = first fired of §5.7 ("Members spend 2.3 times more a visit, and their share is growing every
   week.", "96 members have not been in for 30 days, including three of your top 20.", "Most lapsed members last came on a
   Saturday promotion."). Actions: "Message the {n} with their points balance" → `/retail/customers?sheet=message&audience=lapsed-30`
   (C-21; needs `retail.customers:update`); "Change what a point is worth" → `/retail/manage/loyalty` (needs
   `retail.loyalty:update`: owner only); fallback "See the customers" → `/retail/customers`.
10. Both honour `siteId` (shifts, sales, movements, drawer events at the site's registers) and show the site chip.

## Boards
- `InsightsLosses.png`: KPIs "Lost in 30 days US$412.60 +US$88.10 on the 30 da…" (bad), "Of takings 1.2% +0.2 pts" (bad), "Drawer
  differences −US$43.79 5 shifts out", "Refunds and voids US$96.20 7 over the PIN limit: 2". "Where is money leaking?" / "Losses
  each week, by kind" with the four-entry legend; eight stacked columns "10 Aug" … "28 Sep" on a US$150 axis. Tabs "By cashier · By
  product · By till" + Export; rows Chipo Dube −US$27.65 US$41.80 US$0.00 0; Farai Moyo −US$16.14 US$12.60 US$6.00 4; Kuda Banda;
  Tafara Nyathi; "Σ 4 cashiers −US$43.79 US$89.00 US$7.20 5". Actions "Count the spirits shelf again", "Look at Chipo’s Friday
  shifts", "Require a PIN to open the drawer".
- `InsightsCustomers.png`: KPIs "Takings from members 38% +3 pts of all takings", "Members who came back 412 +22 in 30 days",
  "Member basket US$14.20 2.3× a walk-in basket", "Not seen in 30 days 96 +11 members". "Who comes back?" side-by-side columns
  Members (blue) / Walk-ins (grey). Tabs "Not seen in 30 days · Best customers"; rows Rutendo Banda 28 August 121 US$2,768.00 2,768
  …; no Σ. Actions "Message the 96 with their points balance", "Change what a point is worth".

## Workflows
W-53: Losses → "By cashier" → click "Chipo Dube" → Shifts list filtered to Chipo, last 30 days (and short from the action) → a
shift record (FLR-03) → back → click her Refunds figure → Sales list on Refunds filtered to Chipo (FLR-01) → "By till" → "Count
the spirits shelf again" → `count-new` with Spirits picked (STK-05 starts the count: `POST /api/v2/retail/stock/counts`, its
audit and notification). Insights writes nothing. W-52 Losses and Customers steps.

## Roles
View: owner, manager, bookkeeper (`owner@`, `tafara.manager@`, `bookkeeper@bottlestore.test`). Message action: owner and
manager (`retail.customers:update`); point worth: owner only. Cashier `chipo.till@`, stock clerk `tendai.stock@`: 403.

## Data
Models: `StockMovement` (`reason` COUNT/BROKEN/OWN_USE, `reference`, `change`, item `unitCost`), `RetailStockTransferLine`
(`quantityLost`, `unitCost`), `RetailShift` (`variance`, `closedAt`, `cashierId`, `registerId`), `RetailSale` (`saleType`,
`status`, `baseAmount`, `cashierId`, `registerId`, `approvedById`, `customerId`, `promotionId` on lines), `RetailRegister`,
`PlatformAuditEvent` (`eventType = "RETAIL_DRAWER.OPENED"`, `entityId` register, actor), `RetailTillRules`, `Customer` + the loyalty
ledger (CUS-01). **No schema change.**

## Server
- `losses.ts#lossesInsight(companyId, window, siteId)`; `customers.ts#customersInsight(…)`; `figures.ts` gains
  `lossKinds(companyId, from, to, siteId)` → per-week, per-cashier, per-product, per-till sums; `eightWeeks(windowEnd)`.
- `findings/losses.ts`, `findings/customers.ts` (pure).
- Same route and gates; reads only.

## UI
Frame unchanged. Legend from the response (`legend` with series colours). Cells with links are `kind: "link"` with `href`.
Phone: the stacked columns keep full width; tables become cards.

## Reuse
Packet 80's `figures.ts`, `words.ts`, `cells.ts`; `lib/retail/drawer-open.ts` (event shape); `lib/retail/audit.ts`
(`RETAIL_AUDIT_EVENTS.drawerOpened`); CUS-01's member/points functions (`lib/retail/customers/*` as that unit names them).

## Remove
The `isMember(name)` heuristic and `lossesFromCounts` (`movementType: "ADJUSTMENT"`); the actions "Count the stock", "Tighten
the till rules"; per-period week columns.

## Seed
Nothing of its own (FLR-04/05 shifts and differences, FLR-02 refunds and voids with approvers, STK-05/06 counts, STK-07/08
transfers with losses, SET-06 drawer opens, CUS members, points and lapsed members).

## Tests
- `findings/losses.test.ts`, `findings/customers.test.ts`: the six board sentences from fixtures (§7 INS-03).
- `losses.test.ts` (test DB): a count of −2 at US$12.40 lands in Count differences US$24.80 in its week; a BROKEN adjustment in
  Breakage; a transfer line lost 1 × US$10 in Breakage; a short shift's variance in Drawer differences and in its cashier's row; a
  refund and a voided sale in Refunds and voids; a `RETAIL_DRAWER.OPENED` event raises No-sale opens for that cashier and till;
  "over the PIN limit" counts `approvedById` only; links carry `opened=30d` / a range.
- `customers.test.ts` (test DB): a named walk-in without `customerId` is a walk-in; a member's points come from the ledger.

## Acceptance
1. Seeded, owner, `/retail/insights/losses` beside `InsightsLosses.png`: four-colour stacked columns, eight weeks, legend; KPIs
   worded as the board; "By cashier" rows equal the shifts' variances by cashier (SQL) and "Σ {n} cashiers".
2. W-53 walk: "Chipo Dube" → `/retail/shifts?cashier=<id>&opened=30d` showing only her shifts; back; her Refunds figure →
   `/retail/sales?tab=refunds&cashier=<id>&when=30d`; "By till" lists Front till, Back till, Handheld 1; "Count the spirits shelf
   again" opens `count-new` with Spirits.
3. `/retail/insights/customers` beside `InsightsCustomers.png`: side-by-side columns Members / Walk-ins; "Not seen in 30 days"
   rows link to customer records; "Message the {n} with their points balance" opens the message sheet with "Not seen in 30 days".
4. Manager: no "Change what a point is worth"; bookkeeper: no message action; cashier: 403.
5. eslint clean; vitest on the files above; `pnpm typecheck`.

## Depends on
Packet 80. FLR-02 (refunds, voids, `approvedById`), FLR-04/FLR-05 (closed shifts, differences), SET-06 (landed, drawer events,
till rules), STK-05/STK-06 (counts, `count-new` reads `categoryIds`), STK-08 (landed, transfer losses), CUS-01/CUS-02/CUS-03
(members, points, customer record), CUS-06 (`message` sheet reads `audience`), FLR-01 (Sales list `tab`, `cashier`, `when`).
Lock **IN**.

## Risk
standard (reads money). Pitfalls: count differences net per count reference (a short and an over in one count offset); voided
sales vs VOID documents (count the voided SALE once, never the VOID reversal); drawer events keyed by register, not name.

## Open questions
- `segment=lapsed-30` in the spec is `audience=lapsed-30` (C-21, CUS-06 owns the name).
- "By product" and "By till" columns are Defined here; built as the spec defines.
