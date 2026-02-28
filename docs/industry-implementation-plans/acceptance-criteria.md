# Acceptance Criteria Summary

## School Pack
- Enrollment covers guardians/health flags, hostel eligibility, and documents; navigation and gating expose school modules.
- Fee templates create term invoices with waivers/refunds adjusting balances; receipts post via accounting with idempotent keys.
- Hostel capacity and gender policy enforced; attendance and assessments recorded and report cards publish with controls.
- Dashboards and exports for collections, arrears, enrollment, and occupancy run without errors; scheduled reports deliver on time; exports are permission-filtered and audited.
- Maker-checker approvals enforced for waivers, refunds, and grade changes after publish; timeline shows submit/cancel actors and comments.

## Auto Pack
- Leads track source, assignment, stage history, and convert to deals while preserving lineage.
- Inventory holds VIN/options, cost basis, floor/target pricing, and media/docs; deals follow controlled status machine with accurate balances.
- Payments block overpayment and post to accounting with idempotent keys; delivery checklist completion gates delivery state.
- Dashboards surface pipeline/margin/payment/delivery metrics; exports complete successfully and are audited; scheduled KPI email fires.
- Approval and permission rules applied to discounts/price overrides/cancellations; refund/chargeback paths leave journal-safe audit entries.

## Retail Pack
- Catalog, promotions, POS, inventory, purchasing, and cash-up available via gated navigation with one-table-per-view layouts.
- POS supports scan/search, holds, refunds/exchanges, tender mix, receipts, and audited overrides; promotions respect eligibility/priority.
- Inventory moves (receipts, transfers, adjustments, counts) keep on-hand accurate and reconcile with accounting postings for sales/discounts/taxes/COGS/tenders.
- Shift close outputs variance report; dashboards and exports for sales, margin, promo lift, shrinkage, and on-hand succeed; exports are permission-filtered and audited.
- Offline POS submissions replay without duplicates; register locks prevent post-close edits; three-way match variances must be resolved or approved before posting vendor bills.

## Posting Engine Housekeeping
- Source-key schema enforced and duplicate submissions rejected; posting metrics/alerts active for lag, DLQ, retries.
- DLQ triage with replay/ignore and audit trail available; posting rules versioned with dry-run path for changes.
- Reconciliation job highlights variances with exports and tracked resolutions (owner + timestamp); manual edits to posting-managed accounts require approval and segregation of duties.
