# 89 · Retire the old retail frames (FND-11) — last, alone

## Screen
No screen of its own. Every retail route (`app/retail/**`, `components/retail/**`): after every area unit has moved its page onto
ListFrame / RecordFrame / SheetForm / SettingsFrame / DashboardFrame, delete the old retail frame and the leftovers, then prove the
whole retail app on the reseeded tenant.

## Units
FND-11. Spec `00-foundations.md` §6 (the FND-11 row), §7 FND-11; `99-coverage.md` §4.2 step 44 ("Alone, last. Then `pnpm typecheck`,
`pnpm lint` and the end-to-end walk of every workflow on the reseeded tenant."). Floor spec §6: `retailMoney`, `SALE_WIDTH`,
`saleExceptionLabel` go with FND-11.

## Inventory today (checked at HEAD `51abf44`, 6 October)
`grep -rn "retail-shell\|record-list-shell\|management/ui\|record-dialog\|product-dialogs\|category-dialog" app/retail components/retail`
plus `components/records/view-toolbar` and `components/retail/sale-detail` — every hit, the unit that must move it, and what it uses:

| File | Old pieces it uses | Moved by |
|---|---|---|
| `app/retail/page.tsx` (Overview) | `RetailShell`; `management/ui` `ColumnFigure, ColumnList, ColumnName, ColumnText, FactList, SectionHeading` | FLR-08 (DashboardFrame Overview) |
| `app/retail/sales/page.tsx` | `RecordListShell`; `ColumnFigure, ColumnList, ColumnName, ColumnText, StatusDot`; `ViewToolbarFilter` (`components/records/view-toolbar`); `saleExceptionLabel` (sale-detail) | FLR-01 (`<ListFrame source="retail-sales" />`) |
| `app/retail/sales/[id]/page.tsx` | `RetailShell`; `RecordHeader, StatusBadge`; `RetailSaleDetailBody`, `retailMoney` … (sale-detail) | FLR-01 (`RecordFrame kind="sale"`) |
| `app/retail/customers/page.tsx` | `RecordListShell`; `RecordDialog` (points ledger); `ColumnFigure, ColumnList, ColumnName, ColumnRowAction, ColumnText, FactList, SectionHeading`; `retailMoney` | CUS-02 (dialog with CUS-03) |
| `app/retail/products/page.tsx` (already ListFrame) | `ProductDialog` (product-dialogs) for "new" | PRD-03 (`product-new` sheet) |
| `app/retail/products/[id]/page.tsx` (already RecordFrame) | `ProductDialog`, `type RetailProduct` (product-dialogs); `BreakCaseDialog` | PRD-03 (`product-edit`), PRD-04, STK-04 (`case-break` sheet) |
| `app/retail/products/price-lists/page.tsx` | `RecordListShell`; `ColumnFigure, ColumnList, ColumnName, ColumnRowAction`; `ChangePriceDialog`, `RetailProduct`; `retailMoney` | PRD-05, PRD-07 |
| `app/retail/products/promotions/page.tsx` | `RecordListShell`; `RecordDialog` (`PromotionDialog`); `ColumnFigure, ColumnList, ColumnName, ColumnRowAction, ColumnText, FormField, StatusDot`; `ViewToolbarFilter`; `retailMoney` | PRD-09 |
| `app/retail/stock/page.tsx` | `RecordListShell`; `ColumnFigure, ColumnList, ColumnName, ColumnText, StatusDot`; `ViewToolbarFilter`; `type RetailProduct` | STK-02 (`<ListFrame source="retail-stock-on-hand" />`) |
| `app/retail/stock/counts/page.tsx` | `RecordListShell`; `RecordDialog` (`CountStockDialog`); `ColumnFigure, ColumnList, ColumnName, ColumnText, FactList, FormField`; `ViewToolbarFilter` | STK-05 |
| `app/retail/buying/orders/page.tsx` | `RecordListShell`; `ColumnFigure, ColumnList, ColumnName, ColumnText, StatusDot`; `ViewToolbarFilter`; `OrderDialog`; `retailMoney` | BUY-02 |
| `app/retail/buying/orders/[id]/page.tsx` | `RetailShell`; `ColumnFigure, ColumnList, ColumnName, FactList, HeaderAction, RecordHeader, SectionHeading, StatusBadge`; `retailMoney` | BUY-02 (`RecordFrame kind="order"`), BUY-03 |
| `app/retail/buying/orders/_components/order-dialog.tsx` | `RecordDialog`; `FormField`; `retailMoney` | BUY-02 (`order-new`, `order-edit` sheets) |
| `app/retail/buying/requisitions/page.tsx` | `RecordListShell`; `ColumnFigure, ColumnList, ColumnName, ColumnText, StatusDot`; `ViewToolbarFilter`; `RequisitionDialog`; `retailMoney` | BUY-04 |
| `app/retail/buying/requisitions/[id]/page.tsx` | `RetailShell`; `RecordDialog`; `FactList, FormField, HeaderAction, RecordHeader, SectionHeading, StatusBadge`; `retailMoney` | BUY-04 |
| `app/retail/buying/requisitions/_components/requisition-dialog.tsx`, `requisition.ts` | `RecordDialog`; `FormField` | BUY-04 (`req-*` sheets) |
| `app/retail/buying/deliveries/page.tsx` | `RecordListShell`; `RecordDialog` (receive); `ColumnFigure, ColumnList, ColumnName, ColumnText, FormField`; `retailMoney` | BUY-06 (receive page), BUY-08 (`<ListFrame source="retail-deliveries" />`) |
| `app/retail/shifts/[id]/count-close-dialog.tsx` | an interim Radix dialog kept "until FLR-04's count page" | FLR-04 (`/retail/shifts/[id]/close`, C-20) |
| `app/retail/insights/[topic]/page.tsx` | `components/retail/insights/format.ts` | INS-01 (packet 80) |
| `components/retail/product-dialogs.tsx` | `RecordDialog`, `FormField`; also `catalog-image-field.tsx`, `use-shop-features.ts` (its only users) | PRD-03 |
| `components/retail/break-case-dialog.tsx` | `RecordDialog`, `FormField`, `useInvalidateProducts` | STK-04 |
| `components/retail/sale-detail.tsx` | `ColumnFigure, ColumnList, ColumnName, FactList, SectionHeading` | FLR-01 (body); helpers `retailMoney`, `SALE_WIDTH`, `saleExceptionLabel` go here (FND-11) |
| `components/retail/retail-shell.tsx` | — (the frame itself; users: Overview, sale record, order record, requisition record) | FND-11 deletes |
| `components/retail/reports/report-export-button.tsx` | dead: no importer | FND-11 deletes |
| `components/retail/category-dialog.tsx` | already gone (categories on ListFrame, `5cf2fd8`) | — |

Already on the frames (no work): Shifts, shift record, Products list, product record frame, Categories, Movements, Transfers (+
record), every `/retail/manage/*` page, Insights (DashboardFrame).

## What FND-11 does
1. **Precondition check** (first, before any edit): rerun the grep below. If any hit remains in a page that an area unit owns,
   FND-11 stops and reports which unit has not landed; it never rebuilds an area's page itself.
2. Delete `components/retail/retail-shell.tsx`, `components/retail/sale-detail.tsx` (any helper still imported is replaced at its call
   site by `lib/workspace/format#formatMoney` / the floor's words), `components/retail/reports/report-export-button.tsx` (and the empty
   `components/retail/reports/`), and whatever of `product-dialogs.tsx`, `break-case-dialog.tsx`, `catalog-image-field.tsx`,
   `use-shop-features.ts`, `components/retail/insights/` their units left behind with no importer.
3. Remove leftovers that only served the old frames in retail: any `RetailShell` mention in comments/docs under `app/retail`,
   `components/retail`, `lib/retail`; the `lib/retail/nav/types.ts` `borrowed` field if packet 86 has not already.
4. Keep (other products use them): `components/crm/records/record-list-shell.tsx`, `components/crm/records/record-dialog.tsx`,
   `components/management/ui`, `components/records/*` (incl. `view-toolbar`), `components/ui/data-table.tsx`, `RecordPageShell`,
   `components/ui/sheet.tsx`.

## Boards
None (every board is owned by the unit that moved its page).

## Workflows
None of its own; acceptance walks every workflow W-01…W-76 on the reseeded tenant as the closing check (§4.2 step 44).

## Roles
Every role: owner `owner@bottlestore.test`, manager `tafara.manager@bottlestore.test`, cashier `chipo.till@bottlestore.test`, cashier
Borrowdale `farai.till@bottlestore.test`, stock clerk `tendai.stock@bottlestore.test`, bookkeeper `bookkeeper@bottlestore.test`
(password `RetailDemo123!`), and the Corelith superuser.

## Data
No schema change. No migration.

## Server
None.

## UI
None new. Every retail nav item must open on its frame.

## Reuse
—

## Remove
As "What FND-11 does" 2–3.

## Seed
None. Reseed once: `pnpm tsx scripts/seed-retail-demo.ts --slug hurudza-creative --days 160 --reset` (seed lock).

## Tests
No new tests. Run the whole retail suite: `npx vitest run lib/retail lib/reports components/list-frame components/record-frame
components/sheet-form components/settings-frame components/dashboard-frame components/workspace`.

## Acceptance
1. `grep -rn "retail-shell\|record-list-shell\|management/ui\|record-dialog\|product-dialogs\|category-dialog\|records/view-toolbar\|retail/sale-detail\|report-export-button\|retail/insights/format" app/retail components/retail lib/retail`
   returns nothing.
2. `pnpm typecheck` passes (alone on the machine); `pnpm lint` passes.
3. As each of the six accounts, open every retail nav item the role sees (rail × panel, 1440×960 and 390 wide) with the browser
   console open: every page renders on its frame with no console error and no 404; items the role must not see are absent and their
   URLs show the shell's refusal.
4. The end-to-end walk of every workflow on the reseeded tenant passes (the per-area acceptance walks, run in order).
5. The vitest run above is green.

## Depends on
Every unit that moves a retail page: FLR-01, FLR-04, FLR-08, CUS-02, CUS-03, PRD-03, PRD-04, PRD-05, PRD-07, PRD-09, STK-02, STK-04,
STK-05, BUY-02, BUY-03, BUY-04, BUY-06, BUY-08, INS-01 (packet 80), INS-07 (packet 86, `borrowed`). And FND-05…FND-10 (landed). Runs
alone, after packet 88 and every other area's last unit (§4.2 step 44).

## Risk
standard. Pitfall: deleting a shared component another product still imports — grep the whole repo, not just retail, before any
delete; only retail-only files go.

## Open questions
- `components/records/view-toolbar` and `components/retail/sale-detail` are not in the foundations grep but are old-frame pieces
  inside retail pages; added to the acceptance grep so nothing old survives in retail.
- `category-dialog.tsx` is already gone; it stays in the grep as a guard.
