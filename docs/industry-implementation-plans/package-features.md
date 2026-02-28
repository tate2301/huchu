# Package Feature Inventory (Granular)

## School Pack
- Tenant setup: schools/branches, terms/years, classes/streams, subjects, timetables.
- Roles/portals: admin, registrar, bursar, teacher, guardian; permissions and approvals; audit timeline on every document.
- Student/guardian records: enrollment, prior school, medical/consent flags, documents, IDs; duplicate detection.
- Fees/billing: fee templates, discounts/scholarships, waivers/refunds, payment plans, invoices by term; late fee rules and dunning.
- Receipts: multi-tender intake, arrears tracking, statements, posting to accounting with source keys; gateway integration hooks.
- Hostels: hostels/rooms/beds, gender policy, allocations, occupancy dashboards, check-in/out logs.
- Attendance: daily roll call, reasons, notifications, attendance analytics.
- Assessments: score entry/import, gradebook, term reports, publish controls, teacher comments.
- Discipline/incidents: recording, actions, resolutions, guardian comms.
- Transport hooks: routes/stops, rider eligibility, billing if enabled.
- Reporting: collections, arrears aging, enrollment, hostel occupancy, exports (CSV/PDF); scheduled report emails with permissions.

## Auto Pack
- Leads: capture (web/phone/showroom), assignment, stages, reminders, source tags, trade-in interest.
- Inventory: VIN/trim/options, cost basis, reconditioning, floor/target price, hold flags, media/docs; status (inbound/available/held/sold).
- Pricing: rules per model/trim, promos, taxes/fees templates, discounts approvals; floor/margin guardrails.
- Deals: status machine, quotes, financing options, deposits, trade-in valuation, balances; revision history and approvals.
- Payments: deposits/settlements by tender, overpayment blocks, receipts, ledger postings; refunds and chargebacks.
- Delivery: checklist (insurance/registration/PDI/plates/keys), signatures, document storage; delivery blocking if balance or checklist missing.
- After-sales: service appointments, warranty/recall flags, follow-ups; campaign hooks and reminders.
- Analytics: pipeline, win/loss, margin, payment status, delivery throughput; exports; scheduled KPI emails.

## Retail Pack
- Catalog: items, variants/SKUs, barcodes, tax categories, units, images, attributes.
- Pricing/promotions: price lists per store/channel, BOGO/percent/amount-off, bundles, vouchers, stacking rules; approval for overrides.
- POS: scan/search, quick cart, holds/recalls, refunds/exchanges, tender mix (cash/card/mobile), receipts print/email, manager override log; offline queue with idempotency.
- Orders/postings: sales, discounts, taxes, tenders, COGS posting with idempotent keys; shift-based context; customer/loyalty capture.
- Inventory: reorder points, stock counts, adjustments with reasons, transfers, lot/serial tracking, shrinkage; stock ledger parity checks.
- Purchasing/receiving: POs, expected dates, partial receipts, supplier returns, landed cost allocation; three-way match variance handling.
- Cash-up: shift open/close, counted vs system cash, variances, deposit prep, audit log; register lock after close.
- Reporting: sales by item/store/tender, margin, promo effectiveness, shrinkage, on-hand valuation; CSV/PDF exports; scheduled digests.
