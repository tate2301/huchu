# 82 · Insights › Products (dead stock) and Insights › Stock health (INS-02)

## Screen
`/retail/insights/products` and `/retail/insights/stock` (same page file, `app/retail/insights/[topic]/page.tsx`), their
builders `lib/retail/insights/products.ts`, `stock.ts`, findings and "Do" links, and the dead-stock seed.

## Units
INS-02. Spec `70-insights-reports.md` §3.7 (Products, Stock health), §5.4, §5.5, §2 W-54, §3.8 INS-02, §7 INS-02.
Overrides: direction 7 (headline), C-40.

## What already exists
After packet 80 both topics are on the `InsightResponse` contract with **today's figures re-shaped** (no new content):
- Products: KPIs "Products selling" (note "of {n}, sold in 30 days"), "Not sold in 60 days" (note "US$… on the shelf"),
  "Top 20 products" (share), "Out of stock" (count **now**, note "now"); chart as horizontal **bars** with the last bucket
  "Over 90 days, or never"; tabs "Not sold in 60 days" (Product, Last sold, On hand, Cash in it — no Do, no Σ), "Best sellers"
  (Product, Sold, Takings), "Slow movers" (Product, Sold, On hand, Cash in it); actions "Run a promotion on what is not
  selling", "Order from suppliers".
- Stock health: KPIs "Stock at cost" (no "on a month ago"), "Days of cover" (note "at the rate sold …"), "Running low" (note "at
  or below reorder level"), "Sales missed"; bars without an aim mark or the aim line; tabs "Out of stock" (Out for, Sales missed,
  Sold a day, Reorder at) and "Too much"; actions "See what is running low", "Order from suppliers".
- Headline for both exists (`headline.ts`). `lib/retail/stock/levels.ts` (`stockLevel`, `daysOfCover`, `COVER_AIM = 14`),
  `lib/retail/stockouts.ts` (`missedSales`, `outSince`). `InsightBars` has no mark; `ColumnsChart` has a nice-scale y axis.
- Neither topic honours `siteId` today.

## What INS-02 still adds or changes
1. **Products** exactly §5.4: KPIs "Products selling" (delta "of {active products with a stock line at the sites}" no tone,
   note "sold in {short}"); "Not sold in 60 days" (count, delta money of their cash **bad**, note "sitting on the shelf"); "Top
   20 products" (share, note "of profit"); "Out of stock days" (Σ product-days in the window where every stock line of the
   product at the sites ended the day ≤ 0, from `StockMovement.balanceAfter`, products that sold in the 90 days before the
   window end; delta days, ok when fewer; note `beforeNote`).
2. Chart becomes **columns** (one series `--data`): question "Where is our cash sitting?", unit "Stock value at cost, by days
   since each product last sold"; buckets "This week" (0–7), "8 to 30 days", "31 to 60 days", "61 to 90 days", "Over 90 days"
   (includes never sold); y axis 0 / half / round max ("US$20,000"); tooltip "31 to 60 days" / "US$2,980.00". Period does not
   change it.
3. Tables: "Not sold in 60 days" — Product (link), Last sold (`dayMonth`, "Never" muted), On hand, Cash in it, **Do**
   (action); Σ "Σ {n} products" · — · on hand · cash · —. "Best sellers" — Product, Sold, Takings, Profit, Share of profit; Σ.
   "Slow movers" — Product, Sold, On hand, Days of cover (`days`), Cash in it, Do; Σ. Idle rule (W-54): not archived, on hand > 0
   at the sites, last posted SALE line > 60 days before the window end, or never sold and created > 60 days ago; by cash
   descending. Slow = sold ≥ 1 and ≤ `max(2, days ÷ 15)` units in the window. Empties: "Everything on the shelf has sold in the
   last 60 days." · "Nothing sold in these dates." · "Nothing is selling slowly."
4. **"Do" rule** `findings/products.ts#deadStockAction(product, role)`: (1) its supplier (`Product.supplierId`, PRD-03)
   delivered it in the last 120 days (posted `RetailGoodsReceipt` line) → "Return to supplier" →
   `/retail/buying/suppliers/<supplierId>?sheet=return-new&supplierId=<id>&productIds=<id>` (needs `retail.purchasing:create`);
   (2) unit cost < US$5.00 → "Write it off" → `/retail/products/<id>?sheet=stock-adjust&productId=<id>&why=broken`
   (`retail.adjustments:create`); (3) else "Run a promotion" → `/retail/products/promotions?sheet=promotion-new&productIds=<id>`
   (`retail.promotions:create`). Without the right the cell is "—" (bookkeeper sees "—").
5. Products headline notice = first fired of §5.4 "What it says" ("US$1,204.30 is sitting in 14 products that have not sold in
   60 days.", "Three of them are spirits over US$30 that sold well only in December.", "Twenty products make 71% of profit; none
   of them ran out this month."). Actions §5.4: "Promote the slow {category}" → `promotion-new&productIds=<…>`; "Send the {word}
   back to {supplier}" → `return-new`; "Stop reordering what does not sell" → `/retail/stock?sheet=reorder-levels&ids=<stock line
   ids>`; fallback "See what is on hand" → `/retail/stock`. Each only for a role that may act.
6. **Stock health** exactly §5.5: KPIs "Stock at cost" (delta money vs Σ each line's `balanceAfter` as at 30 days ago × unit cost
   now, no tone, note "on a month ago"), "Days of cover" (whole days, note "at {this month’s | the last 7 days’ | today’s} sales";
   "this month’s" for 30d and month), "Running low" (`stockLevel()` LOW, note "below reorder level"), "Sales missed" (note
   "estimated, while out of stock").
7. Bars with the aim: rows by category (categories' takings order), bar = days of cover, track max = max(largest, 28), a 2px
   `--ink` mark at 14 on every row; right "{n} days" over the verdict ("Too little" warn < 10, "About right" 10–21, "Too much"
   warn 22–42, "Far too much" bad > 42); under the rows "▏ Aim: 14 days, plus supplier lead time". Categories with nothing sold
   left out. Extend `InsightBars` with `mark?: { value, note }` and a verdict line; the response's bars carry `mark`.
8. Tabs "Ran out {today|this week|this month}" (Product link, Out for `days`, On hand, Sales missed bad > 0, Do: on hand ≤ 0 →
   "Order it" → `/retail/buying/orders?sheet=order-new&productIds=<id>`; back in stock → "Raise reorder level" →
   `/retail/stock?sheet=reorder-levels&ids=<line ids>`) and "Too much" (Days of cover warn or "Not selling", On hand, Cash in it,
   Do "Order less" → reorder-levels); no Σ. Empties "Nothing ran out in these dates." · "Nothing is overstocked."
9. Stock headline notice = first fired of §5.5 ("Beer runs out on Saturdays: 9 days of cover against 14, and Castle ran out
   once.", "Wine has 64 days of cover. US$2,140 is tied up in it.", "Running out cost an estimated US$212 in sales this
   month."). Actions: "Raise reorder levels for {beer and ice}" → reorder-levels with their lines; "Order less {wine} next time"
   → `/retail/buying/orders?sheet=order-new&supplierId=<main supplier>`; fallback "See what is running low" →
   `/retail/stock?level=low`.
10. Both topics honour `siteId` (stock lines, sales, movements at the site) and show the site chip.
11. **Prefill contracts** (W-54): verify in tests that `promotion-new` reads `productIds` (PRD-09), `stock-adjust` reads `why=broken`
    (STK-04: Why "Broken or spoilt" picked), `return-new` reads `supplierId` + `productIds` (BUY-09: lines at on hand),
    `reorder-levels` reads `ids` (STK-02), `order-new` reads `productIds` / `supplierId` (BUY-02). If one is missing when this
    lands, add the read to that sheet kind's `load` in its area file (`lib/retail/sheet-kinds/<area>.ts`).

## Boards
- `InsightsProducts.png`: KPIs "Products selling 186 / of 214 sold in 30 days", "Not sold in 60 days 14 / US$1,204.30 sitting on
  t…" (bad), "Top 20 products 71% / of profit", "Out of stock days 9 / −4 on the 30 days before" (ok). "Where is our cash
  sitting?" columns with US$20,000 / US$10,000 / 0 axis. Tabs "Not sold in 60 days · Best sellers · Slow movers" + Export;
  rows "Nederburg Rosé 750ml 2 July 12 US$118.80 Return to supplier", "Hennessy VS 700ml 19 July 4 US$155.60 Run a promotion",
  "Sparletta Pine Nut 2l 30 June 18 US$61.20 Write it off"; "Σ 14 products 96 US$1,204.…". Actions "Promote the slow spirits",
  "Send the rosé back to Mukuru Wines", "Stop reordering what does not sell".
- `InsightsStock.png`: KPIs "Stock at cost US$31,798.00 +US$1,210 on a month a…", "Days of cover 23 at this month’s sales",
  "Running low 7 below reorder level", "Sales missed US$212.40 estimated, while out of s…". Bars with the 14 mark: Beer 9 days Too
  little … Wine 64 days Far too much; "Aim: 14 days, plus supplier lead time". Tabs "Ran out this month · Too much"; rows
  "Jaggermeister 750ml 6 days 0 US$118.00 Order it", "Castle Lager 340ml 1 day 26 US$62.40 Raise reorder level", "Ice 2kg bag 2
  days 40 US$32.00 Raise reorder level". Actions "Raise reorder levels for beer and ice", "Order less wine next time".
  ("What it says" bullets → headline; "Send me this" / Export from packet 81.)

## Workflows
W-54: Products › "Not sold in 60 days" → per row: "Write it off" → STK-04 adjust sheet (BROKEN; journal LOSS Dr Breakage and
losses / Cr Stock via `postRetailJournal`; manager PIN over the limit; audit `RETAIL_STOCK.ADJUSTED`) → back, the product left
the list, KPI cash fell; "Return to supplier" → BUY-09 `return-new` (SUPPLIER_RETURN movement `RTN-…`, audit
`RETAIL_SUPPLIER_RETURN.BOOKED`) → on hand drops; "Run a promotion" → PRD-09 `promotion-new` (Some products). Insights itself
writes nothing. W-52 Products / Stock steps (reads).

## Roles
View: owner, manager, bookkeeper (C-40 accounts). Do links: manager and owner see all three (manager holds
`retail.promotions:create`, `retail.purchasing:create`, `retail.adjustments:create`); bookkeeper sees "—" and only the
fallback action. Cashier, stock clerk: 403.

## Data
Models: `Product` (`categoryId`, `supplierId` from PRD-03, `archivedAt`, `isActive`, `createdAt`), `InventoryItem` (on hand,
`unitCost`, `minStock`/`reorderQty`, site), `StockMovement` (`reason`, `change`, `balanceAfter`, `createdAt`), `RetailSaleLine`,
`RetailSale`, `RetailGoodsReceipt` (+ lines), `Vendor`, `RetailCategory`. **No schema change.**

## Server
- `lib/retail/insights/products.ts#productsInsight(companyId, window, siteId)`; `stock.ts#stockInsight(…)`; shared
  `figures.ts#lastSoldByProduct`, `outOfStockDays(lines, movements, window)` (a day counts only when every line of the product at
  the sites ended ≤ 0), `stockValueAt(companyId, at, siteId)` (each line's last `balanceAfter` before `at` × unit cost now; none
  → 0).
- `findings/products.ts` (`productsFindings`, `deadStockAction`), `findings/stock.ts` (`stockFindings`, verdict function).
- No API change beyond the topic content (same route, same gates). Reads only; no stock, ledger or audit effect.

## UI
Frame unchanged; `components/dashboard-frame/insight-bars.tsx` gains `mark` (2px `--ink` at the aim on every row), a verdict
line under the value, and the aim note row; the Products chart uses `ColumnsChart` with one `--data` series. "Do" cells are
`kind: "action"` links (underlined `--ink-2`). Phone: Do shows as the card's last meta link.

## Reuse
`lib/retail/stock/levels.ts`, `lib/retail/stockouts.ts`, `components/dashboard-frame/bar-chart.tsx#ColumnsChart`,
`insight-bars.tsx`, packet 80's `figures.ts`, `words.ts`, `cells.ts`.

## Remove
Products' "Over 90 days, or never" label, the bars chart for Products, "Out of stock · now" KPI, actions "Run a promotion on
what is not selling" / "Order from suppliers"; Stock's "Out of stock" tab with "Sold a day" / "Reorder at", "See what is running
low" pointing at `/retail/stock` without `level=low`.

## Seed
`seedDeadStock()` in `scripts/seed-retail-demo.ts`, idempotent, called after the products, stock, buying and sales seeds:
- Vendor **Mukuru Wines** (next free code, "Wine", pays On delivery) if missing.
- Products if missing, each with a stock line at Harare Main Branch and one historical sale line appended to a seeded sale of that
  day: **Nederburg Rosé 750ml** `NEDROSE-750`, Wine, price 13.20, cost 9.90, 12 on hand, supplier Mukuru Wines, a posted delivery
  of 24 from Mukuru Wines on today − 110, last sold today − 93; **Hennessy VS 700ml** `HENNESSY-700`, Spirits, 46.80 / 38.90, 4
  on hand, no delivery in 120 days, last sold today − 76; **Sparletta Pine Nut 2l** `SPARLETTA-2L`, Soft drinks, 4.50 / 3.40, 18 on
  hand, last sold today − 95. Opening stock through the ledger (`OPENING` / `RECEIVED` movements with `balanceAfter`).
- Bols Brandy 750ml stays archived (does not list; Open questions 8).

## Tests
- `findings/products.test.ts`, `findings/stock.test.ts`: the six board sentences from fixtures (§7 INS-02).
- `products.test.ts` (test DB): Do rule — delivered by its supplier 110 days ago → "Return to supplier"; cost US$3.40 → "Write it
  off"; else "Run a promotion"; bookkeeper → "—"; archived never lists; out-of-stock day only when every line is at 0; Σ on hand
  and cash equal the rows.
- `stock.test.ts` (test DB): stock a month ago from `balanceAfter`; verdict thresholds 9/10/21/22/42/43; ran-out "Out for" days.
- `components/dashboard-frame/dashboard-frame.test.tsx`: bars with a mark render the mark at 14 on each row and the aim line.

## Acceptance
1. Seeded, owner, `/retail/insights/products` beside `InsightsProducts.png`: five columns on a US$ axis; "Not sold in 60 days"
   lists Nederburg Rosé ("2 July", 12, US$118.80, "Return to supplier"), Hennessy ("19 July", 4, US$155.60, "Run a promotion"),
   Sparletta ("30 June", 18, US$61.20, "Write it off"); "Σ {n} products" sums equal SQL.
2. W-54 walk as the manager: "Write it off" on Sparletta → adjust sheet with "Broken or spoilt" and 18 → save (PIN if asked) →
   Sparletta gone from the list, KPI cash −US$61.20; Losses' Breakage this week +US$61.20 (once packet 83 is in) and Profit's
   "Lost to breakage and counts" +US$61.20; `StockMovement` BROKEN −18 and a journal entry exist. "Return to supplier" on the rosé
   → `return-new` over Mukuru Wines with 12 × the rosé; booking it removes it. "Run a promotion" on Hennessy → `promotion-new`
   with "Some products" = Hennessy VS 700ml.
3. `/retail/insights/stock` beside `InsightsStock.png`: bars with the 14-day mark and the aim line; "Ran out this month" shows
   Jaggermeister 750ml "6 days", 0, its missed sales, "Order it" → `order-new` with it.
4. Site chip "Site Borrowdale" changes both pages' figures (equal to SQL for that site).
5. Bookkeeper: both pages open; Do cells read "—". Cashier: 403.
6. eslint clean; vitest on the files above; `pnpm typecheck`.

## Depends on
Packet 80 (contract). STK-02 (reorder sheet, On hand `level=low`), STK-03, STK-04 (adjust sheet `why`), PRD-03
(`Product.supplierId`), BUY-01 (suppliers), BUY-02 (`order-new` prefill), BUY-06 (posted deliveries), BUY-09 (`return-new`),
PRD-09 (`promotion-new` `productIds`). Lock **IN**; seed lock for acceptance.

## Risk
standard (reads stock value; the linked sheets post through their own specs). Pitfall: stock value as at 30 days ago must use
each line's last `balanceAfter` before that instant, not today's on hand minus movements.

## Open questions
- Bols Brandy on the board is archived in the products seed: it does not list (spec Open question 8).
- "Jaggermeister 750ml" spelling kept for parity (spec Open question 7); comes from the stock seed.
- Days-of-cover note says "this month’s" with 30 days selected, as the board (spec Open question 18).
