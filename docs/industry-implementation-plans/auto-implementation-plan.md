# Auto Implementation Plan

## Goals
- Stand up automotive sales pack with lead→deal workflow, inventory, pricing controls, financing, and posting-safe payments.
- Provide executive visibility through dashboards and exports.

## Phases
1. **Foundation & Roles**
   - Enable automotive feature gates; roles for sales rep, sales manager, finance, inventory clerk.
   - Navigation entries for leads, inventory, deals, payments, delivery; permissions with submit/cancel/approve separation.
   - Audit trail and timeline comments on all documents (lead/deal/payment/delivery).
2. **Lead Management**
   - Intake (web/phone/showroom), assignment, qualification stages, reminders.
   - Source tags, trade-in interest, preferred vehicle metadata; SLA timers and snooze/reschedule for reminders.
   - Lead de-duplication on phone/email/VIN interest; conversion history.
3. **Inventory & Pricing**
   - Vehicle stock with VIN, trim, options, cost basis, floor price, reconditioning costs.
   - Pricing rules (floor, target, promo), hold flags, photo/docs upload; approvals for price overrides.
   - Stock ledger hook for vehicles reserved vs available; aging and reconditioning log.
4. **Deals & Financing**
   - Deal creation from lead or inventory; status machine (draft → quoted → approved → delivered).
   - Financing options, deposits, trade-in valuation, taxes/fees breakdown; EMI calculators and lender templates.
   - Maker-checker on discounts or margin-below-floor; revision history on quotes.
5. **Payments & Posting**
   - Accept deposits and settlements by tender; overpayment blocks; balance tracking.
   - Posting through accounting rules with idempotent source keys and reconciliation reports.
   - Payment collection via gateways; receipts generation; refund/cancellation path with audit.
   - Ledger integrity: entry must balance, include source references, and align with tax jurisdictions.
6. **Delivery & Handover**
   - Delivery checklist (insurance, registration, PDI, plate, keys); sign-off capture.
   - Title/registration document generation and storage.
   - Delivery blocking if checklist incomplete or payment balance > 0; VIN/plate validation.
7. **After-Sales & Service Hooks**
   - Service appointment capture, warranty/recall flags, follow-up reminders.
   - Parts and labor estimation placeholders; upsell/service campaign hooks.
8. **Reporting & Exports**
   - Pipeline dashboards, margin analysis (cost vs. deal), payment status, delivery throughput.
   - CSV/PDF exports for deals and payments; scheduled executive email with KPIs.
   - Data protection: exports respect row-level permissions and log download events.

## Acceptance Criteria
- Role-based navigation surfaces leads, inventory, deals, payments, delivery with vertical tabs where multiple contexts exist.
- Leads track source, assignment, stage history, and reminders; conversions create deals preserving lineage.
- Inventory records include VIN/options, cost basis, floor/target price, and hold status; photos/docs attach successfully.
- Deals enforce status transitions; financing, taxes, fees, and trade-ins compute balances accurately.
- Payments are posted via accounting with idempotent keys; overpayments blocked; balances visible per deal.
- Delivery checklist completion is required before marking delivered; signed artifacts stored; delivery blocked if balance remains or checklist gaps.
- Dashboards show pipeline, margin, payment, and delivery metrics; exports run without errors and are audited; scheduled KPI email dispatch works.
- Permission and approval rules enforced for discounts, price overrides, and cancellations; timeline logs capture all submissions and reversals.
