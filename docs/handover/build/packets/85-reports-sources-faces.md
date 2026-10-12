# 85 · Reports: report faces on the list sources, one row for each, built-in templates (INS-06)

## Screen
Server-only "screen": what every Reports run page reads. `GET /api/v2/reports/[key]?face=report&template=<ref>&rows=<keys>&cols=<keys>…`
and `POST /api/v2/reports/[key]/export` with the same query; the 13 built-in templates; two new sources
(`retail-items-sold`, `retail-payments`); `RetailSaleLine.shelfPrice` and the till's write of it. No page of its own (the run page
is packet 87); the acceptance drives the API.

## Units
INS-06. Spec `70-insights-reports.md` decisions 5–6, §3.2.2, §4.3, §5.13, §5.14, §6 rows 8–9, §7 INS-06. Overrides: C-12 (the old
retail report files are already gone), C-11 (migration stamp), C-40.

## What already exists
- FND-04/05 list engine: `lib/reports/list-query.ts` (`parseListQuery`, `resolveListQuery`, `periodRange` with presets
  `today, yesterday, 7d, 30d, this-month, last-month, this-year, any` and `YYYY-MM-DD..YYYY-MM-DD`, `runList`, `publicListSpec`),
  `lib/reports/request.ts#fetchListPage` / `fetchListExport` / `fetchListIds`, `ReportLoader.page()` for database-side paging,
  `POST /api/v2/reports/[key]/export` (CSV/XLSX/PDF, `RETAIL_EXPORT.DOWNLOADED`), types `ListSpec`, `ListColumn` (cell kinds incl.
  `ref`, `money`, `diff`, `owed`, `state`), `ListQuery`, `ReportView` (no `rows`).
- Sources registered today (`lib/reports/definitions/retail/index.ts`): `retail-shifts` (floor.ts), `retail-stock-movements`,
  `retail-stock-transfers`, `retail-products`, `retail-categories`, `retail-bin`, `retail-sites`, `retail-tills`, `retail-people`,
  shift-record tabs. **None has a `report` face.** The old `lib/reports/definitions/retail.ts` and `lib/reports/loaders/retail.ts`
  are already deleted (C-12, FND-04); the generic catalogue already skips list sources (`reportCatalog` keeps only
  `!source.list || list.catalog`).
- `ReportTemplate` model and `lib/reports/templates.ts` (generic save/list/read/update/delete with `view` + `params`).
- Report mode of `GET /api/v2/reports/[key]` (no `page`) still answers for any source, list sources included.

## What INS-06 still adds or changes
1. **Types** (`lib/reports/types.ts`): `ReportFace = ListSpec & { area; card?; rollups; rollupOnly? }` (§4.3);
   `ReportDefinition.report?: ReportFace`; `ReportView.rows?: string[]`; `ListQuery` gains `face?: "list"|"report"`,
   `template?: string`, `rows?: string[]`, `cols?: string[]`; `ResolvedListQuery` likewise; `PERIOD_PRESETS` gains `this-week`
   (Monday 00:00 to now) and `last-weekend` (the most recent Friday 17:00 to Sunday 23:59:59 that has ended), labels "This week",
   "Last weekend" in `components/list-frame/model.ts#PERIOD_LABELS`. `last-weekend` is the one preset with a time edge: resolve
   it to instants (`periodInstants`), not days.
2. **List mode** (`parseListQuery`, `openList`, `fetchListPage`, `fetchListIds`, `fetchListExport`): `face=report` uses
   `definition.report` (404 "Report not found" when none); `template=<ref>` lays the template's query (built-in from
   `templates.ts`, saved from `ReportTemplate` through `template-query.ts`) under the URL's params — the template must be visible
   to the caller (`canSeeTemplate`) and read this source, else 404 "Template not found"; `rows=a,b` rolls up when every key is
   among the face's rollups (else ignored); `cols=a,b` = visible columns in order, first column never hidden, unknown keys dropped.
   The response's `report.list.columns` describe the returned shape. The source's read and `scopeOwn` apply unchanged (a cashier
   still sees only their own sales).
3. **Roll-up** `lib/reports/rollup.ts#rollUp(rows, face, keys, columns)` for in-memory sources: group after tab, filters and search;
   one row per key-value set, id = values joined "|"; key cells = the group's values; the `rollupOnly` count column = number of
   source rows (sales: SALE documents not voided); `num`/`money` columns summed (or their declared total); other columns dropped;
   sort over rolled rows ("Newest first" by the latest date in the group); totals over rolled rows; the key cell links to the face's
   built-in filtered by that value and the same period (`/retail/reports/sales?site=<id>&when=last-weekend`). Database-side
   `page()`s (`retail-sales`, `retail-items-sold`, `retail-payments`) implement the same with `GROUP BY`.
4. **Report faces** on every source of §5.14, written in the owning source's definition file (one `report:` block each):
   `retail-sales` (floor.ts or FLR-01's file), `retail-items-sold` (new), `retail-payments` (new), `retail-stock-on-hand`,
   `retail-stock-movements`, `retail-orders`, `retail-bills`, `retail-customers`, `retail-accounts`, `retail-shifts`,
   `retail-requisitions`, `retail-empties`. Columns, filters, sorts, groups, rollups and reads exactly as §5.14 (period menus list
   Today, Yesterday, This week, Last weekend, Last 7 days, Last 30 days, This month, Last month, This year, Any time, Choose dates…).
   Loader additions: per-tender columns `cash, ecocash, card, account, zig, other, taken, tax` and rollup `sales` on
   `retail-sales`; `valueAtPrice` (on hand × default price) on `retail-stock-on-hand`; `refunds`, `voids`, `noSaleOpens` (refunds
   and voids rung on the shift; `RETAIL_DRAWER.OPENED` events whose payload `shiftId` is the shift) on `retail-shifts`; `short`,
   `over` on `retail-stock-movements`.
5. **New sources** `lib/reports/definitions/retail/reports.ts` + `lib/reports/loaders/retail/reports.ts` (database-side
   `page()`): `retail-items-sold` (lines of posted, not voided SALE and REFUND documents, refunds negative; `discount` = manual part
   `discountAmount − promotionDiscount`; `revenue` ex VAT; `cost`, `margin`, `marginRate` need `view-cost`; `allowedBy` = sale's
   `approvedByName` else the cashier; `why` = `overrideReason`; filter `discounted=yes` = `shelfPrice` not null or manual discount >
   0); `retail-payments` (`RetailSalePayment` of posted SALE and REFUND, refunds negative, voided sales out; `amount` in US$, ZiG at
   the sale's rate). `list` spec: none (report-only sources: `list` absent, `report` present); `catalog` stays false.
6. **Built-ins** `lib/reports/definitions/retail/templates.ts`: the 13 rows of §5.13 as `{ slug, name, summary, area, source,
   audience: "EVERYONE"|"MANAGERS", query: TemplateQuery }`, plus the nine cards' `builtIn` slugs.
   `lib/reports/template-query.ts`: `toTemplateQuery(view, params)` and `fromTemplateQuery(query, face)` (both ways, `rows` and
   column order kept).
7. **Report mode closes for list sources**: `GET /api/v2/reports/[key]` without `page` → 404 "Report not found" for any source with
   a `list` or `report` spec (`/reports/retail-sales` and friends answer 404; other products' report sources unchanged).
8. **Migration** `<stamp>_retail_sale_line_shelf_price` (C-11 stamp): `RetailSaleLine.shelfPrice Decimal? @db.Decimal(14,2)`;
   backfill `shelfPrice = round(unitPrice + (discountAmount − promotionDiscount) / quantity, 2)` where `discountAmount >
   promotionDiscount` and `quantity <> 0`. **Witness** `lib/retail/sale-line-shelf-price-migration.test.ts`: column numeric(14,2)
   nullable; fixture line unit 1.00, discount 0.20, promotion discount 0.05, quantity 3 → 1.05; a line with no manual discount stays
   null.
9. **Till write** (lock **T**): `POST /api/v2/retail/pos/sales` (route and its service) sets `shelfPrice` on a line whose price was
   changed at the till or that carries a manual discount (the price the till offered), and sets the sale's
   `approvedById`/`approvedByName` (FLR-01 columns) when the discount needed a manager PIN (SET-06 `verifyManagerPin`). The same
   write in `pos/sync` for offline sales.

## Boards (data only; the page is packet 87)
- `ReportSales.png`: columns Sale · Date · Shop · Cashier · Type · State · Discount · Total; rows `SALE-31870` …, `RFD-0044`
  Refund −US$27.90, `SALE-31858` Void "● Voided" US$1.20; Σ "1,284 … US$412.35 US$18,940.60".
- `ReportWeekend.png`: one row for each shop — Shop · Sales · Cash · EcoCash · Card · On account · Taken; Σ "3 811 US$4,226.75
  US$2,768.15 US$1,432.25 US$137.20 US$8,564.35".

## Workflows
W-69 steps "Narrow by period, shop and person" and "Totals follow the filters" (server side); W-55 for report faces (export the
same shape with Σ).

## Roles
Each face's read is its source's (sales/items/payments: `retail.sell:view` or `retail.cash-control:view`, cashiers own; stock:
`retail.stock:view`; orders `retail.purchasing:view`; bills `retail.bills:view`; requisitions `retail.requisitions:view`;
customers `retail.customers:view`; accounts `retail.accounts:view`; empties `retail.empties:view`; shifts FND's). Cost columns
need `view-cost`. Templates are reached only through Reports (owner, manager, bookkeeper; C-35). Test accounts C-40.

## Data
Models: `RetailSale`, `RetailSaleLine`, `RetailSalePayment`, `RetailShift`, `PlatformAuditEvent`, `InventoryItem`, price lists,
`StockMovement`, BUY/CUS/STK models behind their sources, `ReportTemplate`. **Schema change**: `RetailSaleLine.shelfPrice` (above).

## Server
- `rollUp(rows: ReportRow[], face: ReportFace, keys: string[], columns: ListColumn[]): ReportRow[]` — pure.
- `templateQueryFor(ref, session): Promise<TemplateQuery | null>` (built-in or saved; null when not visible).
- List-mode refusals: 404 "Report not found" (no face); 404 "Template not found"; 403 "Your role cannot view {noun}" (source read).
- Money invariants: rolled-up totals equal un-rolled totals for every summed column; payments by tender sum to `taken`; items-sold Σ
  revenue over 30 days equals Insights › Profit's revenue for the same window; voided sales left out of money totals (their rows
  still list as "Void · Voided" with the total in `--ink-3`), VOID reversal documents never list.
- Export: `POST /api/v2/reports/[key]/export { query: { face, template, rows, cols, … }, format }` returns exactly the screen's
  rolled, filtered table with Σ; audit `RETAIL_EXPORT.DOWNLOADED { key, template, format, rows }`.

## UI
None of its own. `components/list-frame` must accept the new query keys in `use-list-query.ts` (`face`, `template`, `rows`, `cols`
pass through to the API) so packet 87 can draw them; no visible change to existing lists.

## Reuse
`lib/reports/list-query.ts`, `lib/reports/request.ts`, `lib/reports/export*.ts`, every source's definition/loader file,
`lib/reports/template-access.ts#canSeeTemplate`, `lib/retail/manager-pin.ts`.

## Remove
Report mode for list/report sources (route branch answers 404); nothing else old remains (C-12 done).

## Seed
None of its own beyond what FLR-01/STK/BUY/CUS seed. (Sale lines with a manual discount and a manager approver come from
FLR-01/FLR-02's seed; the backfill fills their `shelfPrice`.)

## Tests
- `lib/retail/sale-line-shelf-price-migration.test.ts` (witness).
- `lib/reports/rollup.test.ts`: one row per shop with Sales = non-voided SALE count, money summed, totals over rolled rows, key-cell
  drill-down href with the same period.
- `lib/reports/list-query.test.ts` additions: `last-weekend` on Sat 3 Oct 2026 14:42 = Fri 25 Sep 17:00 → Sun 27 Sep 23:59:59; on
  Mon 5 Oct = Fri 2 Oct 17:00 → Sun 4 Oct 23:59:59; `this-week` = Monday 00:00 → now; `cols` keeps order and never hides the first
  column; `rows` outside the face is ignored.
- `lib/reports/template-query.test.ts`: round trip with `rows` and column order.
- `lib/reports/loaders/retail/reports.test.ts` (test DB): items sold Σ revenue (30 days) = Profit revenue; payments by tender sum to
  takings paid; a line sold at a changed price lists under `discounted=yes` with its shelf price and approver; a cashier sees only
  their own lines.
- `app/api/v2/retail/pos/sales` test: a price changed at the till stores `shelfPrice`; a promotion-only discount leaves it null.
- Route test: `GET /api/v2/reports/retail-sales` (no page) → 404 "Report not found".

## Acceptance
1. Seeded, owner: `GET /api/v2/reports/retail-sales?face=report&template=sales&page=1&size=50` returns the eight board columns;
   `total` = this month's SALE and REFUND documents (VOID reversals excluded); `totals.total` equals SQL with voided sales left out.
2. `…&rows=site&when=last-weekend&cols=site,sales,cash,ecocash,card,account,taken` returns one row per shop that sold last weekend;
   in every row cash + EcoCash + card + on account (+ ZiG + other) = taken; Σ row sums.
3. `POST /api/v2/reports/retail-sales/export` with that query → workbook with the same rows and Σ.
4. As the cashier `chipo.till@bottlestore.test`: `GET /api/v2/reports/retail-sales?face=report&page=1&size=50` lists only Chipo's
   own sales (source scope); adding `&template=sales` → 404 "Template not found" (no template is visible without
   `retail.reports:view`, C-35).
5. `/reports` (generic) lists no retail source; `GET /api/v2/reports/retail-sales` without `page` → 404.
6. Migration applied on dev and test DBs; witness green. eslint clean; vitest on the tests above; `pnpm typecheck`.

## Depends on
FND-04/FND-05 (landed). Sources from: FLR-01 (`retail-sales`, `approvedById`), STK-02 (`retail-stock-on-hand`), STK-03, STK-09
(`retail-empties`), BUY-02 (`retail-orders`), BUY-04 (`retail-requisitions`), BUY-07 (`retail-bills`), CUS-02 (`retail-customers`),
CUS-07 (`retail-accounts`), SET-06 (landed: manager PIN, drawer events), PRD-09 (`promotionDiscount`). Locks: **T** (pos/sales),
**R** (list engine), **SH** (shifts source), schema.

## Risk
money (touches the till's sale write and every money total in Reports). Pitfalls: roll-up must not double-count voided sales; the
`last-weekend` boundary is 17:00 Friday, not midnight; database-side `page()` and in-memory `rollUp` must agree (test both on the
same fixture); `fetchListExport` today runs the in-memory path even for `page()` sources — make export use the same path as the page.

## Open questions
- Report-only sources (`retail-items-sold`, `retail-payments`) carry no `list` spec; they are not working lists (spec decision 5).
- `retail-bills`, `retail-accounts`, `retail-empties` have faces but no card (spec Open question 13).


> Coordinator note (2026-10-06, packet 85a): **85a** has already delivered the engine and most faces:
> - Types, `this-week`/`last-weekend`, `face/template/rows/cols`, `rollUp`, `template-query.ts` and report mode closed.
> - Faces on stock on hand, stock movements, shifts, items sold and payments (empties if 17 had landed); `REPORT_AREAS`.
> - Six built-ins: items-sold, stock-on-hand, count-differences, stock-movements, takings-by-payment (with a ZiG column),
>   till-shifts.
>
> This packet now covers only: the `retail-sales` face and per-tender columns; built-ins `sales` and `discounts-given`; the
> items-sold columns `shelfPrice/discount/allowedBy/why/promotion` and filters `discounted/promotion`; the `shelfPrice` migration
> and witness; and the till write (lock T). It also seeds 86's saved template "Weekend takings by shop" if 86 skipped it. Depends on
> 85a, 50 (FLR-01: `retail-sales`, `approvedById`) and 22 (PRD-09: `promotionDiscount`). Add each built-in in the three steps
> 85a defines.
