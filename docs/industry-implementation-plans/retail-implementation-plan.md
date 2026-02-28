# Retail Implementation Plan

## Goals
- Deliver retail pack with catalog/POS, inventory accuracy, purchasing/receiving, promotions, and cash-up flows tied to posting rules.
- Support store + back-office roles with fast, playbook-compliant UI.

## Phases
1. **Foundation & Roles**
   - Enable retail feature gates; roles for cashier, supervisor, inventory manager, buyer, finance.
   - Navigation for catalog, promotions, POS, inventory, purchasing, cash-up, reports.
   - Permission matrix for create/submit/cancel/approve; audit trail and timeline on every document (order, adjustment, PO, cash-up).
2. **Catalog & Pricing**
   - Items with variants/SKUs, barcodes, tax category, unit conversions.
   - Price lists by channel/store; promotional pricing (BOGO, percentage/amount off, bundles).
   - Bulk import tool with validation; duplicate detection on barcode/SKU; tax category defaults per store/channel.
3. **POS & Orders**
   - Quick-sell cart, scan/search, holds/recalls, refunds/exchanges with receipt reference.
   - Tender types (cash/card/mobile), change calculation, receipt printing/email.
   - Offline-tolerant queue for POS submissions with idempotency keys; device registration and shift binding.
   - Customer capture, loyalty lookup hook, and suspension/resume carts.
4. **Promotions & Discounts**
   - Eligibility rules (date/time, channel, store, customer group); stack/priority logic.
   - Voucher/coupon support; manager override audit.
   - Promotion conflict resolver; audit for overridden discounts; issuance and redemption reports.
5. **Inventory & Stock Movements**
   - Reorder points, cycle counts, adjustments with reason codes, transfers between locations.
   - Lot/serial tracking where required; cost method alignment with accounting.
   - Stock ledger parity checks; blocked transactions when inventory locks (counts/adjustments) are active.
6. **Purchasing & Receiving**
   - Purchase orders, expected dates, partial receipts, supplier returns.
   - Landed cost allocation (freight/duties) to inventory.
   - Three-way match (PO, GRN, invoice) variance reporting; hold/release workflow for invoices with discrepancies.
7. **Cash-Up & Posting**
   - Shift open/close, counted vs. system cash, variance handling, deposit prep.
   - Posting for sales, discounts, taxes, tenders, and inventory COGS with idempotent keys.
   - Variance approval rules; bank deposit batching; lock register after close to prevent edits.
8. **Reporting & Exports**
   - Sales by item/store/tender, margin, promo effectiveness, shrinkage, on-hand valuation.
   - CSV/PDF exports for register summaries and inventory reports.
   - Scheduled store manager digest; audit entries for exports; row-level filters per role/store.

## Acceptance Criteria
- Navigation exposes catalog, promotions, POS, inventory, purchasing, and cash-up with one-table-per-view layouts.
- POS supports scan/search, holds, refunds/exchanges, multiple tenders, and receipt output; overrides audited.
- Promotions apply per eligibility rules and respect stacking/priority; vouchers redeem and log usage.
- Inventory accuracy maintained through receipts, adjustments, transfers, and counts; costed movements reconcile to accounting.
- Purchase orders allow partial receipts and supplier returns; landed costs update item costs.
- Shift close produces variance report; postings for sales/discounts/taxes/COGS/tenders are idempotent and balanced.
- Dashboards show sales, margin, promo lift, shrinkage, and on-hand; exports succeed, are permission-filtered, and log audit entries.
- Offline POS queues replay safely without duplicates; register locks prevent edits after close; three-way match variance flags require resolution.
