# 45 · Buying: retire the old code, and walk buying end to end

## Screen
No new screen. Every buying route: `/retail/buying/{suppliers,orders,deliveries,requisitions,bills}` and their records, sheets and the
Receive page; the `WfBuying` board (W-29 … W-36, W-70 … W-72, W-25) is the walk.

## Units
BUY-10 (40-buying §7 BUY-10, §6 leftovers, §4.11).

## Boards
All 30 buying boards (`SuppliersList`, `SupplierNew`, `SupplierRecord`, `ContactNew`, `OrdersList`, `OrderNew`, `OrderRecord`, `OrderEdit`,
`OrderChase`, `OrderCloseShort`, `OrderRemove`, `RequisitionsList`, `ReqOrder`, `ReqExpense`, `RequisitionRecord`, `ReqApprove`, `ReqReject`,
`ReqPayout`, `ReqAcquit`, `ReqCancel`, `Receive`, `DeliveriesList`, `DeliveryRecord`, `DeliveryDiff`, `IntakeNew`, `BillsList`, `BillNew`,
`BillEdit`, `PaymentNew`, `ReturnNew`) compared once more on the reseeded tenant, plus `WfBuying.png` as the walk's script.

## Workflows
W-29, W-30, W-31, W-32, W-72, W-33, W-25, W-34, W-70, W-71, W-35, W-36 — end to end on real data (Acceptance 3).

## Roles
As each packet says; the walk uses: Tafara Nyathi `tafara.manager@`, Tendai Mhlanga `owner@`, Tendai Sibanda `tendai.stock@`, Ruvimbo Chari
`bookkeeper@` (all `@bottlestore.test`, `RetailDemo123!`).

## Data
No schema change.

## Server
Nothing new; removals only.

## Remove
Everything listed under "BUY-10 removes now" below, after checking each ledger row is already done.

## The old code: keep, rebuild, retire (ledger)
What existed before buying was rebuilt, and which packet dealt with it. BUY-10 verifies each line and removes whatever is still there.
| Old code | Decision | Where |
|---|---|---|
| `lib/retail/purchase-orders.ts` — `outstanding`, `orderStatusFor`, `isOpenForDelivery`, `planOrderLineEdits`, `matchDeliveryToOrder`, `OrderRefused` (+ test) | **Keep**, extended (sent flag, closed-short lines, SENT/CANCELLED, DRAFT/SENT/PARTIAL open) | packet 31 |
| `lib/retail/purchase-order-close-migration.test.ts`, `lib/retail/requisition-site-migration.test.ts` | **Keep** (witnesses of applied migrations; adjust only if a later migration breaks their fixtures) | — |
| `app/api/v2/retail/purchasing/receipts/route.ts` POST body (receive and post) | **Rebuild** as `lib/retail/buying/deliveries.ts#receiveDelivery` (first layer packet 31, full packet 38); route kept thin for "No order" until packet 43 | 31 → 38 → 43 |
| `app/api/v2/retail/purchasing/orders/[id]/close/route.ts` (close/reopen) | **Rebuild** (moved to `/buying/orders/[id]/close`, + bill rule in 41) | 31 |
| `app/api/v2/retail/purchasing/orders/[id]/route.ts` (GET/PATCH/hard DELETE) | **Retire** (record GET/PATCH rebuilt; hard delete → bin kind `order`) | 31 |
| `app/api/v2/retail/purchasing/orders/route.ts` POST / GET | POST **retire** (31); GET kept for the old dialog's order list, **retire** with it | 31 / 38 |
| `app/api/v2/retail/purchasing/receipts/route.ts` GET + the whole `purchasing/` folder | **Retire** | 43 |
| `app/retail/buying/orders/page.tsx`, `orders/_components/order-dialog.tsx`, `orders/[id]/page.tsx` | **Retire** (ListFrame, RecordFrame, `order-new`/`order-edit`) | 31 |
| `app/retail/buying/deliveries/page.tsx` (register + receive dialog) | dialog's order path **retire** (38); register + "No order" dialog **retire** (43) | 38 / 43 |
| `lib/retail/requisitions.ts` (+ test) — `actOnRetailRequisition`, `requisitionPermissions`, `listRetailRequisitions`, `raiseRetailRequisition`, `loadRetailRequisition`, the "no acquittal" rule | **Rebuild** as `lib/retail/buying/requisitions.ts` (ask/decide/cancel 34, pay/acquit 36); old file **retired** | 34 |
| `lib/retail/requisition-words.ts` (`RETAIL_REQUISITION_CATEGORIES`) | **Retire** (→ `RetailExpenseType`) | 34 |
| `app/api/v2/retail/requisitions/route.ts`, `…/[id]/route.ts` | **Retire** (one route per act under `/buying/requisitions`) | 34 |
| `app/retail/buying/requisitions/page.tsx`, `[id]/page.tsx`, `_components/requisition-dialog.tsx`, `_components/requisition.ts` | **Retire** | 34 |
| Retail's call to `postRequisitionDisbursement` (expense on 1010) | **Retire** (→ `RETAIL_REQUISITION_PAYOUT`/`CHANGE`); the CRM keeps the function | 34/36 |
| `RetailPurchaseOrder.supplierName`, `.notes`; `RetailGoodsReceipt.supplierName`; `RPO`/`RGR` sequences | **Retire** (migration B, `PO`/`GRN`) | 31 |
| Seed "Purchasing" block (`PO-00001`/`GRN-00001`) | **Retire** (§3.6 seed) | 31 |
| `auditGoodsReceived`, `orderClosed`/`orderReopened` events, `closeShortAsk`/`removeOrderAsk`/`cancelRequisitionAsk` | **Keep** | — |
| `lib/crm/requisitions.ts` (state machine) | **Keep**, used as is (+ `STOCK` category) | 34 |

BUY-10 removes now (whatever is left):
- `lib/platform/gating/route-registry.ts` rows `/api/retail/purchasing`, `/api/v2/retail/purchasing`, `/api/v2/retail/requisitions` and
  their cases in `route-registry.test.ts`; the `/api/v2/retail/buying` row (added in packet 30) stays.
- `lib/retail/route-guard-coverage.test.ts`: the header comments naming `purchasing/orders` and any rows left for removed routes.
- `e2e/retail-shots.spec.ts` names `retail-purchasing-orders` / `retail-purchasing-receipts` → `retail-buying-orders` / `retail-buying-deliveries`
  (paths already right); `e2e/retail-journeys.spec.ts` journeys that drove the old dialogs, if any remain.
- `lib/navigation.ts` / `lib/workspaces.ts` buying refs that predate the five-item Buying module (§6 "Nav" row), if any remain.
- Any doc comment or string still saying "purchasing" for the buying pages.

## UI
None new. Fix any board mismatch the final comparison finds, in the owning packet's files.

## Reuse
Everything packets 30–44 built.

## Seed
Run the full seed: `pnpm tsx scripts/seed-retail-demo.ts --slug hurudza-creative --days 160 --reset`. Add a seed check
(`scripts/seed-retail-demo.ts` end, or `lib/retail/buying/seed-check.test.ts` against the test DB after seeding) asserting: Orders tabs Open 3 ·
Drafts 2 · Received 18 · All 23; Requisitions To approve 2 · To pay out 1 · Receipts due 1 · All 15; Bills To pay 4 · Overdue 1 · Paid 31 ·
All 35 with US$2,933.60 / US$1,031.20; Delta owes US$624.00; Office safe US$2,410.00; Front till float US$120.00; PO-0005 total with VAT
US$1,940.00.

## Tests
- `npx vitest run lib/retail/buying lib/retail/purchase-orders.test.ts lib/retail/route-guard-coverage.test.ts lib/platform/gating
  lib/accounting` green.
- New `lib/retail/buying/ledger-agreement.test.ts` (test DB, after the seed or a fixture walk): the ledger's 2000 balance for retail sources
  equals Σ supplier Owed (bills − credits − open returns) across suppliers; 2300 equals Σ posted-unbilled delivery values ex VAT; Stock
  (role STOCK) movement from buying sources equals Σ received − returned − differences at cost; each money account's balance equals its
  ledger account's movement from buying sources plus its opening.

## Acceptance
1. `grep -rn "purchasing/\|requisition-words\|RETAIL_REQUISITION_CATEGORIES\|order-dialog\|requisition-dialog\|supplierName" app lib components
   scripts` returns nothing in retail code (gold/other modules' own `supplierName`, if any, are listed and left).
2. Reseed; every buying board PNG compared side by side at 1440×960 with its page/sheet/record (one screenshot each through
   `scratchpad/smoke/lib.js`), and a phone-width pass (390×844) of each list and record: no horizontal scroll, cards as specified.
3. End to end on the reseeded tenant, with the database effects checked after each step (and "Post now" before reading journals):
   a. Tafara raises an order to Delta from suggestions, sends it on WhatsApp (order SENT, message queued), turns on "Ask for the cash now"
      (requisition SUBMITTED for the total with VAT, waiting for Tendai Mhlanga).
   b. Tendai Mhlanga approves less (APPROVED, Tafara told).
   c. Tafara pays it out from the office safe (DISBURSED; Office safe down by the amount; one supplier credit row; **no**
      `RetailCashMovement`; journal Dr 2000 / Cr 1005).
   d. Tendai Sibanda counts the delivery with one damaged line and one line short (COUNTED, nothing moved, managers notified).
   e. Tafara posts it and closes the short line (POSTED; stock in excluding damaged; BROKEN difference; order RECEIVED or CLOSED; journal Dr
      Stock / Cr 2300).
   f. The bookkeeper records the bill against the delivery (journal Dr 2300 + Dr 2210 ± 5000 / Cr 2000) and the cash requisition is
      accounted for with change (ACQUITTED; change back to Office safe; credit reduced; the bill shows "Paid in cash" once allocated).
   g. Tafara records a difference found later (stock and journal by the difference) and returns the damaged bottles (RTN booked; credit
      expected; Delta's Owed drops).
   h. The owner's Overview (if FLR-08 has landed; otherwise listed for FLR-08's acceptance), the Buying badges ("n open", "n to approve",
      "n overdue"), On hand, the ledger (2000, 2300, Stock, 1005) and the supplier's Owed all agree (the ledger-agreement test passes on this
      state too).
4. Refusal sweep: as `chipo.till@`, every `/api/v2/retail/buying/**` route except `requisitions` (own) answers 403 with the matrix's sentence;
   as `tendai.stock@`, create/approve routes answer 403; as `bookkeeper@`, purchasing writes answer 403 while bills work.
5. `npx eslint` on every file changed by packets 30–45 (no new errors); `pnpm typecheck` passes (alone on the machine).

## Depends on
Packets 30, 31, 33, 34, 36, 38, 41, 43, 44 (all buying units). FLR-08 only for the Overview line in 3h.

## Risk
standard (removals and verification), but the walk crosses every money path: run it on a freshly reseeded tenant and record the DB checks.

## Open questions
- The user asked that BUY-10 retire the old code; AGENTS forbids keeping obsolete paths, so each packet removes what it replaces and BUY-10
  owns the leftovers plus the proof (the ledger above and the grep).
