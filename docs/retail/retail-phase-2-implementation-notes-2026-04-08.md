# Retail Phase 2 Implementation Notes

Date: 2026-04-08

## Scope Delivered In This Slice

## Post-Review Hardening

### Accounting replay reliability after offline/idempotent sale replay
- Retail POS sales now call an idempotent `ensureRetailSaleJournalPosted(...)` helper.
- This runs both:
  - right after successful sale creation, and
  - when replay hits an existing `saleNo` and returns that prior sale.
- If posting still fails, the flow triggers bounded replay of pending accounting integration events (`retryPendingAccountingEvents`), so accounting can self-heal without manual intervention.

### Journal amounts always visible
- `GET /api/accounting/journals` now returns:
  - `totalDebit`
  - `totalCredit`
  - `amount` (max of debit/credit totals)
- Journals UI now renders dedicated Debit/Credit/Amount columns with numeric fallback to `0.00`.

### 1. Offline-safe POS queue with replay
- Added local POS sale queue in `lib/retail/pos-offline-queue.ts`.
- Checkout now queues sale payloads when network submission fails.
- Auto-sync is triggered when connection returns, with manual `Sync now` action in POS checkout.
- Sale replay is idempotent via client-provided `saleNo`.

### 2. Idempotent sale replay support (API)
- `POST /api/v2/retail/pos/sales` now accepts client-generated `saleNo`.
- On duplicate `saleNo`, API now returns existing sale payload instead of hard failing.
- This enables safe offline retry/replay without duplicate postings.

### 3. Local payment reference guards
- Card and mobile-money references are now validated on API for:
  - sale posting (`/api/v2/retail/pos/sales`)
  - refund posting (`/api/v2/retail/pos/sales/[id]/refund`)
- Checkout UI now marks required references and blocks completion when missing.

### 4. Customer capture + loyalty basics
- POS now captures:
  - customer name
  - customer phone (for WhatsApp)
  - customer email
- Sale API upserts a `Customer` record when capture data is provided.
- Loyalty basics:
  - points earned per sale (floor of sale amount)
  - points balance derived from net posted retail sales
  - tiering: `BRONZE`, `SILVER`, `GOLD`
- POS completion dialog shows loyalty summary when available.
- Added `GET /api/v2/retail/customers` with loyalty-enriched customer rows.
- Retail Customers page now consumes the new endpoint and shows loyalty points/tier.

### 5. WhatsApp receipt delivery
- POS completion dialog now exposes `Send WhatsApp receipt`.
- Link uses `wa.me` with prefilled receipt message and customer phone when available.

### 6. Stock count + transfer workflow inside Retail
- Added retail routes:
  - `/retail/stock/count`
  - `/retail/stock/transfers`
- These post through existing inventory movement APIs for:
  - `ADJUSTMENT` (stock count variance)
  - `TRANSFER` (location transfer)
- Stock landing page now links directly to both workflows.

## Files Added
- `lib/retail/pos-offline-queue.ts`
- `app/api/v2/retail/customers/route.ts`
- `app/retail/stock/count/page.tsx`
- `app/retail/stock/transfers/page.tsx`

## Files Updated
- `app/api/v2/retail/pos/sales/route.ts`
- `app/api/v2/retail/pos/sales/[id]/refund/route.ts`
- `components/retail/portal/pos-portal-state.tsx`
- `components/retail/portal/pos-checkout-view.tsx`
- `app/retail/customers/page.tsx`
- `app/retail/stock/page.tsx`
- `lib/retail/tab-config.ts`
