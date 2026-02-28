# Retail Implementation Plan

## Goals
- Deliver retail pack with catalog/POS, inventory accuracy, purchasing/receiving, promotions, and cash-up flows tied to posting rules.
- Support store + back-office roles with fast, playbook-compliant UI.

## Phases
1. **Foundation & Roles**
   - Enable retail feature gates; roles for cashier, supervisor, inventory manager, buyer, finance.
   - Navigation for catalog, promotions, POS, inventory, purchasing, cash-up, reports.
2. **Catalog & Pricing**
   - Items with variants/SKUs, barcodes, tax category, unit conversions.
   - Price lists by channel/store; promotional pricing (BOGO, percentage/amount off, bundles).
3. **POS & Orders**
   - Quick-sell cart, scan/search, holds/recalls, refunds/exchanges with receipt reference.
   - Tender types (cash/card/mobile), change calculation, receipt printing/email.
4. **Promotions & Discounts**
   - Eligibility rules (date/time, channel, store, customer group); stack/priority logic.
   - Voucher/coupon support; manager override audit.
5. **Inventory & Stock Movements**
   - Reorder points, cycle counts, adjustments with reason codes, transfers between locations.
   - Lot/serial tracking where required; cost method alignment with accounting.
6. **Purchasing & Receiving**
   - Purchase orders, expected dates, partial receipts, supplier returns.
   - Landed cost allocation (freight/duties) to inventory.
7. **Cash-Up & Posting**
   - Shift open/close, counted vs. system cash, variance handling, deposit prep.
   - Posting for sales, discounts, taxes, tenders, and inventory COGS with idempotent keys.
8. **Reporting & Exports**
   - Sales by item/store/tender, margin, promo effectiveness, shrinkage, on-hand valuation.
   - CSV/PDF exports for register summaries and inventory reports.

## Acceptance Criteria
- Navigation exposes catalog, promotions, POS, inventory, purchasing, and cash-up with one-table-per-view layouts.
- POS supports scan/search, holds, refunds/exchanges, multiple tenders, and receipt output; overrides audited.
- Promotions apply per eligibility rules and respect stacking/priority; vouchers redeem and log usage.
- Inventory accuracy maintained through receipts, adjustments, transfers, and counts; costed movements reconcile to accounting.
- Purchase orders allow partial receipts and supplier returns; landed costs update item costs.
- Shift close produces variance report; postings for sales/discounts/taxes/COGS/tenders are idempotent and balanced.
- Dashboards show sales, margin, promo lift, shrinkage, and on-hand; exports succeed without errors.
