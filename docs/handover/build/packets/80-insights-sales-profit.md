# 80 · Insights › Sales and Profit, and the insights contract (INS-01)

## Screen
Insights › Sales `/retail/insights/sales` and Insights › Profit `/retail/insights/profit` (one page file,
`app/retail/insights/[topic]/page.tsx`), plus the contract every insight page reads:
`GET /api/v2/retail/insights/[topic]`. Query: `period=today|7d|30d|month` (default `30d`) or `from=YYYY-MM-DD&to=YYYY-MM-DD`
(win over `period`); `siteId=<id>|all`; `tab=<table id>`; `all=1` (that tab's every row).

## Units
INS-01. Spec: `docs/handover/70-insights-reports.md` §3.6, §3.7 (Shared, Sales, Profit), §4.1, §5.1–5.3, §6 rows 1–5 and 7,
§7 INS-01. Overrides: `98-decisions.md` direction 7 (headline replaces "What it says"), C-40 (accounts).

## What already exists (do not rebuild)
- `app/retail/insights/[topic]/page.tsx` draws every topic on `DashboardFrame variant="insight"` with `PageChrome`,
  `PeriodToolbar` (Today · 7 days · 30 days · This month, URL `period`), the site chip (Sales only), `KpiStrip`,
  `QuestionPanel`, `HeatGrid` / `InsightBars` / `ColumnsChart`, `InsightTabs` (tab in `?tab=`) and `InsightAside`
  ("Do something about it" only). Loading skeletons and the "This insight would not load" alert exist.
- The two-sentence headline (`lib/retail/insight-headline.ts`, `Headline = { fact, notice }`, `FEW_SALES = 10`) for all seven
  topics, drawn by `DashHeadline` at the top of the main column. No "What it says" panel anywhere (direction 7).
- `GET /api/v2/retail/insights/[topic]`: `retail.insights:view`, `money` also `retail.money:view`; 404 "There is no such insight";
  400 "Choose Today, 7 days, 30 days or This month" / "That site is not this business’s"; `period` + `siteId` only.
- `lib/retail/insights.ts` (1,648 lines): `insightWindow` with `words/short/within/over/beforeWords/beforeNote/compareWords`
  for the four presets; all seven builders returning **numbers with a format** (`Figure`, tones `good|bad|warn`); the page writes
  them with `components/retail/insights/format.ts` (`formatFigure`, `formatChange`).
- Sales content already close to the board: KPIs Takings / Sales "baskets" / Average basket / Items a basket; heat grid on the
  shop's trading hours averaged a day with shut hours `null`; tables By category / By till / By cashier with Takings, Share,
  Against before, Baskets and a Σ row; site chip; sales read one site.
- Nav (`lib/retail/nav/insights.ts`): seven items, Money on `retail.money:view`. Matrix (`lib/retail/permission-matrix.ts`,
  ADM-01): `retail.insights` view for owner, manager, bookkeeper; `retail.money` view for owner, bookkeeper.
- `DashboardFrame` components take "Send me this" (`InsightAside.send`) and table Export (`InsightTabs.exportAction`) as
  optional props (C-22); they stay unused until packet 81.

## What INS-01 still adds or changes
1. **Split the monolith** into `lib/retail/insights/`: `index.ts` (`INSIGHT_TOPICS`, `loadInsight`), `periods.ts`, `words.ts`,
   `figures.ts`, `cells.ts`, `headline.ts` (moved from `lib/retail/insight-headline.ts`), `findings/sales.ts`,
   `findings/profit.ts`, `sales.ts`, `profit.ts`, and `products.ts`, `stock.ts`, `losses.ts`, `customers.ts`, `money.ts`
   **moved and re-shaped only** (same figures, new contract; packets 82–84 rebuild their content). Delete
   `lib/retail/insights.ts`, `lib/retail/insights.test.ts` (tests move to the new files), `lib/retail/insight-headline.ts`
   (+ test, moved) and `components/retail/insights/format.ts`.
2. **Contract**: the server writes every figure. `InsightResponse` (spec §4.1) with these changes for direction 7: no
   `findings`; keep `headline: { fact, notice }`. KPI `delta: { text, tone: "ok"|"bad"|"warn"|null } | null`, `note`; table
   cells `Cell = { text, kind, tone?, href?, mono? }`; columns carry `align` and `width`; `total`, `more`, `empty`,
   `exportCaption`; chart bars carry `text`; `legend` in the response; `title`; `period` may be `{ from, to }`;
   `send: null` and `sendWords` (packet 81 fills them). Tone names become `ok|bad|warn` (today `good`).
3. **Range and paging params**: `from`/`to` (both or neither; `from ≤ to`; ≤ 366 days apart; window `from 00:00` to
   `to 23:59:59` Africa/Harare; before = the same number of days immediately before). Errors: 400 "Choose dates no more than a
   year apart"; 400 "That period could not be read" for a bad date or one of the pair missing. `tab` + `all=1` returns that tab
   with every row (`more: 0`); otherwise rows cap at 10 and `more` counts the rest.
4. **Toolbar range chip** (Defined here, §5.1): with `from`/`to` in the URL no segment is selected and a 32px `FilterChip`
   "1 to 3 October ×" sits after the group; × drops `from`/`to` and sets `period=30d`. Add to `PeriodToolbar` as an optional
   `range` prop.
5. **"Show all {n}"** row (40px, underlined `--ink-2`) under a table whose `more > 0`; it refetches with `&tab=<id>&all=1`.
   Add to `InsightTabs` as `more` + `onShowAll`.
6. **Sales** (§5.2): Takings from the floor's `sumTakings` (`lib/retail/floor/takings.ts`, FLR-01) so Overview and Sales agree;
   KPI deltas worded ("+6.1%", "+US$0.18", "−0.1"); Takings note `beforeNote`; delta and note null when the window before had
   no trade. Heat grid unchanged except `today` = today's weekday row only. Tables unchanged in shape; cells become text; "New"
   muted when the category had nothing before. `exportCaption` "The {n} categories the table shows" (tills, cashiers).
   Actions replace "See the sales" / "Plan a promotion for the quiet hours" with §5.2's rules: "Put two cashiers on {day}
   {HH:00} to {HH:00}" → `/retail/manage/people`; "Run a happy hour on quiet weekday afternoons" →
   `/retail/products/price-lists?sheet=price-list-new`; fallback "See the sales" → `/retail/sales`.
7. **Profit** (§5.3), rebuilt: KPIs "Gross profit" (relative, up ok, note `beforeNote`), "Margin" (`points`, e.g. "−0.4 pts"),
   "Given away in promotions" (Σ `RetailSaleLine.promotionDiscount`, delta "US$6.76" no tone, note "back for each US$1"; both
   null when nothing given away), "Lost to breakage and counts" (BROKEN + OWN_USE movement value, COUNT net shortfall per count
   reference, transfer `quantityLost × unitCost`; money delta, up bad). Today's "Lost to stock counts" reads
   `movementType: "ADJUSTMENT"` — replace with `StockMovement.reason`. Bars: gross profit by category, note "{rate} margin",
   tone warn under `RetailCategory.targetMarginPercent`. Tabs "Products earning least" (lowest margin first) / "Products
   earning most" (most profit first), columns Product (link `/retail/products/{id}`), Price (default price list), Cost
   (`unitCost`; needs `retail.catalog:view-cost`, all three readers hold it), Margin (tone per §3.7), "Profit, {short}"; no Σ.
   Actions: "Raise {two short names} to target margin" → `/retail/products?sheet=bulk-price&list=<default list id>&ids=<ids>&how=margin`;
   "See whether the {word} promotion paid" → `/retail/products/promotions/<id>`; fallback "Set margins you aim for" →
   `/retail/products/categories`. Profit honours `siteId` and shows the site chip.
8. **Headline under direction 7**: `fact` stays as `headline.ts` writes it. `notice` = the **first** finding sentence of the
   page's rules (§5.2, §5.3 "What it says", in order) that fires, written exactly as the board; when none fires, the current
   notice clause; with fewer than `FEW_SALES` sales the current "Too few sales …" notice (findings are not run). The findings
   functions also decide which actions show.
9. **Site chip** shows on Sales and Profit only (the other five read every site until packets 82–84 add `siteId` to them;
   showing a chip they ignore would be dishonest).
10. **Gates elsewhere**: `lib/retail/nav/floor.ts` Overview `requires` → `[["retail.insights","view"]]` (until FLR-08 sets the
    floor's own read); `lib/reports/definitions/retail/floor.ts` Shifts ⋯ "Compare cashiers" `requires` →
    `[["retail.insights","view"]]` (its href `…/insights/sales?tab=cashier&from=…&to=…` now works).

## Boards
- `docs/handover/build/boards/InsightsSales.png`: header "Sales", outline "Export" (packet 81); toolbar "Today | 7 days | **30 days** | This month",
  chip "Site **All sites**", "Compared with the 30 days before", right "Updated 14:42". KPI box: "Takings US$34,918.40 +6.1% on
  the 30 days be…", "Sales 3,862 +4.0% baskets", "Average basket US$9.04 +US$0.18", "Items a basket 2.7 −0.1" (bad). Panel "When
  do we sell?" / "Takings by day and hour, last 30 days, average a day", 7 × 14 grid "08"…"21", Sunday 08–09 and 18–21 closed,
  "Quieter ▭ Busier". Tabs "By category · By till · By cashier" + "Export"; columns Category · Takings · Share · Against before ·
  Baskets; "Σ 6 categories US$34,918.40 100% +6.1% 3,862". Aside "Do something about it": "Put two cashiers on Friday 16:00 to
  21:00", "Run a happy hour on quiet weekday afternoons". The board's "What it says" bullets are now the headline (direction 7);
  "Send me this" is packet 81.
- `docs/handover/build/boards/InsightsProfit.png`: KPIs "Gross profit US$8,412.30 +4.2% on the 30 days be…", "Margin 24.1% −0.4 pts", "Given away
  in promotio… US$284.00 US$6.76 back for each U…", "Lost to breakage and c… US$167.20 +US$40.10" (bad). "What do we actually
  make?" / "Gross profit by category, last 30 days, with margin": bars Beer … Ice and mixers with "US$3,410.20 / 24.0% margin".
  Tabs "Products earning least · Products earning most", columns Product · Price · Cost · Margin · "Profit, 30 days"; Margin in
  bad/warn; no Σ. Actions "Raise Two Keys and Gordon’s to target margin", "See whether the festive promotion paid".

## Workflows
W-52 (Sales, Profit steps): open Insights → Sales (rail mark opens Sales) → read KPIs, heat grid, category table → switch
period/site/tab (URL follows, figures re-read) → Profit → follow "Raise … to target margin" (opens PRD-07's bulk-price sheet
prefilled) or "See whether the … promotion paid" (PRD-09 record). Pure reads; no audit.

## Roles
`retail.insights:view`: owner `owner@bottlestore.test`, manager `tafara.manager@bottlestore.test`, bookkeeper
`bookkeeper@bottlestore.test`. Cashier `chipo.till@bottlestore.test` and stock clerk `tendai.stock@bottlestore.test`: no Insights
mark; API 403 "Your role cannot view insights". Manager on `/retail/insights/money`: panel has no Money; page shows the frame's
403 "Your role cannot view the money page". Password `RetailDemo123!`.

## Data
Models: `RetailSale` (`baseAmount`, `saleType`, `status`, `registerId`, `cashierId`, `approvedById` FLR-01), `RetailSaleLine`
(`lineTotal`, `taxAmount`, `costTotal`, `quantity`, `promotionId`, `promotionDiscount` PRD-09), `RetailCategory`
(`targetMarginPercent`), `Product` (`categoryId`, relation `retailCategory`), `InventoryItem` (`unitCost`), price list default (PRD-05),
`RetailPromotion`, `StockMovement` (`reason`, `reference`, `change`, `balanceAfter`), `RetailStockTransferLine.quantityLost`,
`RetailShopProfile` (hours, licence hours), `Site`. **No schema change, no migration.**

## Server
- `periods.ts#insightWindow(input: InsightPeriod | { from: string; to: string }, now = new Date())` → existing window fields
  plus `range: { from: "YYYY-MM-DD"; to: "YYYY-MM-DD" }`. Range words: `periodWords` "1 to 3 October", `compareWords`
  "Compared with the 3 days before", `short` "3 days".
- `words.ts`: every function of §3.6 (`periodWords`, `compareWords`, `beforeNote`, `signedMoney`, `signedPercent`, `points`,
  `times`, `share`, `rate`, `days`, `dayMonth`, `lastOpenedLabel`, `reportPeriodWords`, `shareWords`, `countWords`, `ordinal`,
  `andList`). Minus is U+2212. Money full cents in KPIs and tables, whole dollars on axes.
- `figures.ts`: `takings(companyId, window, siteId)` = FLR-01 `sumTakings`; `baskets`, `items`, `lineTakings` (SALE not voided
  minus REFUND lines; Σ equals Takings), `revenue/cost/profit/margin`. Invariant tested: Σ category line takings = Takings;
  a voided sale counts in neither baskets nor takings (SALE + its VOID net 0); a refund lowers its category.
- `findings/sales.ts#salesFindings(input)` and `findings/profit.ts#profitFindings(input)` → `{ sentences: string[], fired: {...} }`
  (pure; rules exactly §5.2/§5.3 "What it says"); `actions` derive from `fired`.
- Route `app/api/v2/retail/insights/[topic]/route.ts`: zod query
  `{ period?: enum, from?: /^\d{4}-\d{2}-\d{2}$/, to?: same, siteId: string default "all", tab?: string, all?: "1" }`;
  gates unchanged; 404 "There is no such insight"; 400 as above and "That site is not this business’s"; 403 "Your role cannot
  view insights" / "Your role cannot view the money page". Response `{ data: InsightResponse }`. Within 1.5 s warm on the seeded
  tenant. Writes nothing; no audit; no money, stock or ledger effect.

## UI
- Frame: `DashboardFrame variant="insight"`; header `PageChrome title={response.title}` (no back, no sub, no primary; Export added
  by packet 81). Page computes nothing: draws `kpis[].value text`, `delta.text/tone`, `note`, chart, tables' text cells.
- `components/dashboard-frame/period-toolbar.tsx`: optional `range` chip; `insight-table.tsx`: `more`/"Show all {n}"; cells
  arrive as text (drop `cellView`/`columnWidth`/`tableView` guessing in the page).
- Nav entry unchanged. Phone (<720px): toolbar scrolls sideways, compare + Updated move under it as one 12.5 line; KPI 2 × 2;
  heat grid scrolls with day labels pinned; tables become phone cards (title first column, figure last money column, meta the
  rest joined " · "), Σ one line under the cards; aside under the main column below 1100px.

## Reuse
`lib/retail/insights.ts` (move code), `lib/retail/insight-headline.ts` (move), `lib/retail/shop-profile.ts#loadShopProfile`,
`lib/retail/shop-profile-rules.ts` (`SHOP_TIME_ZONE`, `shopClock`), `lib/retail/stock/levels.ts`, `lib/retail/stockouts.ts`,
`lib/retail/floor/takings.ts#sumTakings` (FLR-01), `components/dashboard-frame/*`, `components/workspace/filter-chip.tsx`,
`lib/retail/permissions.ts#requireRetailPermission`, `app/api/v2/retail/_helpers.ts#requireRetailSession`.

## Remove
`lib/retail/insights.ts`, `lib/retail/insights.test.ts`, `lib/retail/insight-headline.ts` (+ test; moved),
`components/retail/insights/format.ts` (and the now-empty `components/retail/insights/`), the page's
`cellView`/`columnWidth`/`tableView`/`formatFigure` code, the Sales action "Plan a promotion for the quiet hours", Profit's
"Change prices" action and the `movementType: "ADJUSTMENT"` loss reading.

## Seed
Nothing of its own. Reads FLR-01's 160 days of sales, PRD-09's festive promotion on spirits, STK-04's adjustments, PRD-02's
category targets.

## Tests
- `lib/retail/insights/periods.test.ts`: Saturday 3 Oct 2026 14:42 Africa/Harare — Today 3 Oct 00:00–14:42 vs 2 Oct 00:00–14:42;
  30 days 3 Sep 14:42–3 Oct 14:42; This month 1 Oct 00:00–14:42 vs 1 Sep 00:00–3 Sep 14:42; range 1–3 Oct = 1 Oct 00:00–3 Oct
  23:59:59 vs 28–30 Sep; 367-day range refused.
- `words.test.ts`: every row of §3.6 (U+2212, ".0" dropped in pts, "a third", "three times", "second-busiest", "a, b and c").
- `findings/sales.test.ts`, `findings/profit.test.ts`: fixtures reproduce the six board sentences of §7 INS-01 exactly.
- `sales.test.ts` (test DB): Σ category takings = Takings; voided sale in neither; refund lowers its category; `all=1` returns
  every row; `more` counts the rest.
- `profit.test.ts` (test DB): BROKEN −2 at US$12.40 adds US$24.80 to "Lost to breakage and counts"; promotionDiscount sum;
  margin points delta.
- `headline.test.ts` (moved): notice = first fired finding; too-few rule still wins under 10 sales.
- Route test: `from` without `to` → 400; 400-day range → 400 "Choose dates no more than a year apart"; cashier → 403.
- `lib/retail/nav/nav.test.ts`: Overview item now on `retail.insights`; `lib/retail/route-guard-coverage.test.ts` still green.

## Acceptance
1. Seeded, owner, 1440×960, `/retail/insights/sales` beside `InsightsSales.png`: header "Sales"; segmented with "30 days"
   solid; "Site All sites"; "Compared with the 30 days before"; "Updated hh:mm"; four KPIs worded like the board; 7 × 14 grid
   "08"–"21" with Sunday's closed hours drawn closed; "Quieter → Busier"; tabs; "Σ 6 categories" whose takings equal
   `select sum("baseAmount") from "RetailSale" where …` for the same window (floor's definition); headline at top; aside
   "Do something about it" with the board's two actions when their rules fire.
2. "Today", "7 days", "This month", "Site Borrowdale": URL changes, figures equal the same SQL for each window, compare line
   follows; response ≤ 1.5 s warm.
3. `/retail/insights/sales?from=2026-10-01&to=2026-10-03`: no segment selected, chip "1 to 3 October ×", "Compared with the 3
   days before"; × returns to 30 days. Shifts ⋯ "Compare cashiers" lands here with the By cashier tab.
4. A table with > 10 rows shows "Show all {n}"; pressing it lists every row.
5. `/retail/insights/profit` beside `InsightsProfit.png`: four KPIs ("−0.4 pts"-style, "back for each US$1"); bars with "{x}%
   margin" warn under target; tabs and columns as the board; product click → `/retail/products/<id>`; "Raise … to target
   margin" opens the bulk-price sheet with those products and `how=margin`.
6. Manager: Sales and Profit open; no Money item; `/retail/insights/money` → "Your role cannot view the money page". Bookkeeper:
   all seven open. Cashier: no Insights mark; `curl` GET `/api/v2/retail/insights/sales` → 403 "Your role cannot view insights".
7. Products, Stock health, Losses, Customers and Money still load with the same figures as before (re-shaped), headline intact.
8. `npx eslint` on changed files clean; `npx vitest run lib/retail/insights components/dashboard-frame lib/retail/nav`;
   `pnpm typecheck` (one at a time).

## Depends on
FND-09 (landed), FLR-01 (`sumTakings`, `approvedById`, sales source for "See the sales"), PRD-09 (`promotionId`,
`promotionDiscount`, promotion record), PRD-02 (category targets; column exists), STK-04 (BROKEN/OWN_USE adjustments), STK-07
(landed, `quantityLost`), SET-01/SET-04 (landed: hours, `registerId`). Link targets: PRD-07 (bulk-price sheet), PRD-05
(price-list-new sheet), ADM-02 (People page, landed). Holds file lock **IN**.

## Risk
standard (reads money, writes nothing). Pitfalls: Takings must come from the floor's one function or Overview and Sales disagree;
the shop's zone for every window edge; keep the five re-shaped topics' figures unchanged.

## Open questions
- "What it says" → headline notice = first fired finding (direction 7 removes the panel; the board sentences remain the words).
- Site chip only where the topic honours `siteId` (honest version).
- Spec decision on `days` param already done by FND-09; nothing to remove there.


> Coordinator note (2026-10-06, packets 90/80a): §3's `from`/`to` half and all of §4 (the range chip) are delivered by **80a**,
> along with `Segmented value: V | null`, `FilterChip` `onClear` and optional label, "Choose dates" with `INSIGHT_RANGE_PRESETS`, and
> §10 item 2 (Compare cashiers gate). When you split `lib/retail/insights.ts`, move `insightWindow`'s range branch, `singleDay`,
> `range` and their tests into `periods.ts` unchanged. Do not rebuild them. The 400 "Choose dates up to today" is defined by 80a.
> Range words come from `lib/workspace/format.ts#dayRangeWords` (90). `words.ts#periodWords` must call it, not copy it.
