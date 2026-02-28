# Auto Implementation Plan

## Goals
- Stand up automotive sales pack with lead→deal workflow, inventory, pricing controls, financing, and posting-safe payments.
- Provide executive visibility through dashboards and exports.

## Phases
1. **Foundation & Roles**
   - Enable automotive feature gates; roles for sales rep, sales manager, finance, inventory clerk.
   - Navigation entries for leads, inventory, deals, payments, delivery.
2. **Lead Management**
   - Intake (web/phone/showroom), assignment, qualification stages, reminders.
   - Source tags, trade-in interest, preferred vehicle metadata.
3. **Inventory & Pricing**
   - Vehicle stock with VIN, trim, options, cost basis, floor price, reconditioning costs.
   - Pricing rules (floor, target, promo), hold flags, photo/docs upload.
4. **Deals & Financing**
   - Deal creation from lead or inventory; status machine (draft → quoted → approved → delivered).
   - Financing options, deposits, trade-in valuation, taxes/fees breakdown.
5. **Payments & Posting**
   - Accept deposits and settlements by tender; overpayment blocks; balance tracking.
   - Posting through accounting rules with idempotent source keys and reconciliation reports.
6. **Delivery & Handover**
   - Delivery checklist (insurance, registration, PDI, plate, keys); sign-off capture.
   - Title/registration document generation and storage.
7. **After-Sales & Service Hooks**
   - Service appointment capture, warranty/recall flags, follow-up reminders.
8. **Reporting & Exports**
   - Pipeline dashboards, margin analysis (cost vs. deal), payment status, delivery throughput.
   - CSV/PDF exports for deals and payments.

## Acceptance Criteria
- Role-based navigation surfaces leads, inventory, deals, payments, delivery with vertical tabs where multiple contexts exist.
- Leads track source, assignment, stage history, and reminders; conversions create deals preserving lineage.
- Inventory records include VIN/options, cost basis, floor/target price, and hold status; photos/docs attach successfully.
- Deals enforce status transitions; financing, taxes, fees, and trade-ins compute balances accurately.
- Payments are posted via accounting with idempotent keys; overpayments blocked; balances visible per deal.
- Delivery checklist completion is required before marking delivered; signed artifacts stored.
- Dashboards show pipeline, margin, payment, and delivery metrics; exports run without errors.
