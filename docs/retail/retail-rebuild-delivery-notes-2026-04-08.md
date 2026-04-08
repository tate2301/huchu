# Retail Rebuild Delivery Notes

Date: 2026-04-08

## Scope Delivered

This delivery aligns retail implementation to the retail roadmap and POS host model in `docs/retail`.

### POS Host and Cashier Isolation
- Enforced POS host as cashier destination (`pos.<company>.<rootDomain>`).
- Added cashier ejection from back-office host to POS host.
- Restricted POS host to clean public paths (`/`, `/login`, `/held`, `/history`, `/shift`).
- Normalized POS login callback targets to remain inside POS public paths.
- Made POS navigation host-aware and role-aware:
  - Cashiers: Checkout, Held, History, Shift.
  - Supervisors/managers: optional Overview.

### Retail Workspace Model
Retail navigation and workspace grouping now follows the product roadmap model:
- Overview
- Sell
- Merchandise
- Stock
- Buy
- Customers
- Cash Control
- Accounting
- Insights
- Setup

This was implemented through retail tab/workspace mappings and route entrypoints.

### New Retail Entry Routes
Added/used these workspace entry routes:
- `/retail/sell`
- `/retail/merchandise`
- `/retail/stock`
- `/retail/buy`
- `/retail/customers`
- `/retail/cash-control`
- `/retail/accounting`
- `/retail/insights`
- `/retail/setup`

## Build and Verification

### Build
- `pnpm build` completed successfully.
- Notes:
  - Build requires network access for Google Fonts during Next.js build.
  - A stale `.next/lock` was cleared once during build retry.

### Lint/Type Safety
- `pnpm exec tsc --noEmit` passed.
- Targeted eslint checks for changed files passed.
- Full repo lint still has unrelated pre-existing errors outside the retail/POS scope.

## Deployment Status
- Deployment attempt via Vercel MCP failed due missing connector auth.
- Deployment attempt via Vercel CLI reached project retrieval but failed with invalid token.

Required action to complete deployment on this machine:
1. Run `vercel login` (or set a valid `VERCEL_TOKEN`).
2. Re-run `vercel --prod --yes`.

## Recommended Next Slice
- Add POS offline queue and replay idempotency to meet roadmap Phase 2 acceptance.
- Add tender reference validations (card/mobile money reference guards).
- Expand cash-control variance workflow approvals and reconciliation queues.
