# Retail Phase 2 Extension (Items 2, 3, 4) - 2026-04-08

## Scope Completed

This delivery extends retail phase 2 with the remaining backlog items:

- Item 2: POS offline completion hardening
- Item 3: Tender controls rollout (configurable policy)
- Item 4: Customer and loyalty maturity
- Follow-up Item 6 hardening: retail stock count and transfer moved to dedicated retail APIs

## Item 2: POS Offline Completion Hardening

### What was implemented

- Upgraded POS offline queue storage model in `lib/retail/pos-offline-queue.ts`:
  - Added per-entry lifecycle state: `QUEUED`, `RETRYING`, `FAILED`
  - Added `lastAttemptAt` and `lastError`
- Added queue lifecycle helpers:
  - `failQueuedPosSale`
  - `markQueuedPosSaleQueued`
- Updated POS portal state in `components/retail/portal/pos-portal-state.tsx`:
  - Queue state is now tracked as full entries, not just count
  - Added per-item retry and remove actions
  - Keeps failed entries visible for operator resolution
- Updated checkout UI in `components/retail/portal/pos-checkout-view.tsx`:
  - Offline queue panel now lists pending entries
  - Per-item retry and remove controls
  - Sync-all remains available

### Outcome

Cashiers can now triage offline queue items individually instead of relying only on bulk retry behavior.

## Item 3: Tender Controls Rollout

### What was implemented

- Added reusable tender policy module in `lib/retail/tender-policy.ts`:
  - Centralized policy model and defaults
  - Company-level policy read/write
  - Shared runtime validation helper
- Added policy management API in `app/api/v2/retail/setup/tender-policy/route.ts`
- Added retail setup page for policy management in `app/retail/setup/pos-policy/page.tsx`
- Linked setup entrypoint from `app/retail/setup/page.tsx`
- Applied centralized policy validation in POS sale and refund APIs:
  - `app/api/v2/retail/pos/sales/route.ts`
  - `app/api/v2/retail/pos/sales/[id]/refund/route.ts`
- Added invalid-regex hardening fallback in tender validation runtime

### Outcome

Tender reference requirements are now centrally configured per company and reused consistently in POS posting endpoints.

## Item 4: Customer and Loyalty Maturity

### What was implemented

- Added customer lookup API for POS:
  - `app/api/v2/retail/customers/search/route.ts`
- Added customer loyalty ledger API:
  - `app/api/v2/retail/customers/[id]/loyalty/route.ts`
- Extended customer aggregate API and model output:
  - `app/api/v2/retail/customers/route.ts`
  - Includes `customerId` in overview rows for direct drill-down
- Added loyalty helper module:
  - `lib/retail/loyalty.ts`
- POS checkout enhancements:
  - Customer lookup and select
  - Customer create shortcut
  - Loyalty redemption points capture
  - Redemption-aware payload posting
- Retail customers page enhancements:
  - Loyalty ledger dialog with amounts and points activity

### Outcome

POS now supports practical customer capture, lookup, and loyalty redemption workflows, while backoffice users can inspect a per-customer loyalty ledger with monetary context.

## Accounting and Replay Consistency Notes

- Sale replay idempotency remains keyed on `companyId + saleNo`
- Replay path still triggers retail sale accounting posting safeguard
- Journal amount visibility work remains in place from prior hardening

## Operational Notes

- Full repository lint currently has unrelated pre-existing failures outside this scope.
- Targeted lint for touched retail files passes.

## Follow-Up: Item 6 Server Boundary Hardening

- Added dedicated retail endpoints:
  - `POST /api/v2/retail/stock/count`
  - `POST /api/v2/retail/stock/transfers`
- Endpoints enforce retail session, tenant/site/item/location access checks, and movement validation.
- Retail stock count and transfer pages now post through these retail routes instead of generic inventory routes.
