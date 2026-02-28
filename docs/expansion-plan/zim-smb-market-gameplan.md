# Huchu Zimbabwe SMB Expansion Gameplan

## Objectives
- Become a configurable business platform, not a bespoke ERP clone: thin sector packs atop shared finance/inventory/posting rails.
- Ship ERP-grade integrity with SMB-friendly UX (no accountant jargon in primary flows).
- Standardize how new modules are built: documents → lifecycle → postings → ledgers → audit.

## Platform Contract (applies to every module)
- **Document lifecycle:** Draft → Submitted → Approved (optional) → Posted → Reversed/Cancelled. No deletes after post; reversals create counter-entries.
- **Posting pipeline outputs:** GL (double entry), AR/AP sub-ledgers, stock ledger, compliance events, notifications; idempotent source keys + retry/dead-letter.
- **Configuration-first:** sector templates predefine CoA, taxes, numbering, roles, approvals, reports, and enabled feature bundles.
- **Role modes:** default hides accountant tools; “Accountant mode” reveals journals, reconciliation, period closing.

## Accounting Modes
- **Accounting Lite (default):** CoA templates/import, opening balances, AR/AP basics (invoices, receipts, credit notes, bills, payments), cashbook view, VAT profiles, period locks, reversal-only corrections, overpayments carried as credits/advance liability.
- **Accounting Pro (opt-in):** manual journals, bank reconciliation (manual first), fixed assets/depreciation, budgeting/dimensions when demanded.

## Sector Packs (depth targets)
- **Schools (fees-first wedge):** student/guardian profiles, enrollment per term, fee structures per grade/term, bulk invoicing, receipts with allocations/overpayment carry-forward, statements/arrears dashboards. Optional waves: portals (parent/student/teacher/HOD), academics (subjects, assessments, moderation, publish rules with fee-threshold gate), boarding (hostels→rooms→beds, leave logs, roll call).
- **Retail/Thrift POS:** barcode/unique-item inventory (serialized), intake with tagging, markdown rules, POS with cash/card/mobile money, returns/exchanges, shift close + cash-up/recon, optional consignment (owner splits, payouts, statements).
- **Generic SMB:** quotes→invoices→receipts, bills→payments, simple inventory, optional payroll, lightweight reporting (cash, debtors, creditors, stock alerts).

## UX & Portal Principles
- One purpose per screen; use tabs for multi-surface flows. Portal users land in standalone shells (no main dashboard access).
- POS portal: Frappe-style pane layout for catalog/search, cart, customer, payments, shift/recon; fully mobile-first.
- Apply typographic hierarchy and numeric font-mono; keep tables full-bleed with unified controls.

## Packaging & Pricing (directional)
- Layered model: Platform plan → add-ons (Accounting Pro, Payroll, Inventory, POS, Compliance, Messaging) → industry packs (Schools, Retail/Thrift, Workshop, Mining).
- Entry-tier pricing low-friction for micro SMBs; upsell via packs/templates and paid onboarding/training/data migration.
- Partner program early (accountants, school admins, POS hardware, IT shops) with referral/implementation margins.

## Execution Sequence
1) Finalize lifecycle + reversal rules; onboarding wizard for CoA import/opening balances/period closing habits; role modes.
2) Deliver Schools Fees Pack + parent portal MVP; arrears dashboards + overpayment credits.
3) Deliver Retail/Thrift POS (mobile-first) + unique-item inventory and shift close.
4) Expand ecosystem: partner enablement kit, payments/messaging connectors, analytics pack.

## Detailed Build & Delivery Plan (verbose, no stone unturned)
### Cross-cutting foundations (Week 0–1)
- Document lifecycle enforcement: shared service to gate transitions, emit reversal docs, block deletes on posted state.
- Posting engine extensions: unify GL/AR/AP/stock/compliance event writers with idempotent source keys, retries, DLQ, and audit log entries; add hooks for non-accounting sources (teacher→employee sync, POS sale→inventory/shift/accounting).
- Role modes + feature flags: expand route registry + nav gating so portals are isolated shells; toggle Accountant mode to reveal journals/recon/closing tools.
- Onboarding wizard: CoA template selection/import, opening balances, tax profiles, numbering series, period lock schedule.

### Schools Pack (fees-first, Week 1–3)
- Data: student/guardian/teacher/HOD entities, enrollment per term, fee structures per grade/term with optional components (boarding/transport/levies), overpayment credit bucket.
- Workflows: bulk invoicing per term, receipts with allocation rules, credit/overpayment carry-forward, refunds/waivers, statements and arrears dashboards (list + detail with filters).
- Portals: parent portal (balances, statements, receipts, notices); teacher portal for attendance/marks capture; student portal for timetable/results/fees; HOD workflows piggyback on teacher profile with extra actions.
- Academics (optional wave after fees): subjects/assessments/templates, moderation chain, publish windows with fee-threshold gate.
- Boarding (optional wave): hostels→rooms→beds (code fields), allocations per term, leave/outing logs, roll calls.
- UX: list/detail shells with tabs (Identity, Finance, Academics, Boarding, Documents, Audit); full-bleed tables; font-mono numerics.

### Retail/Thrift POS Pack (Week 3–5)
- Inventory: unique-item (serialized) intake with donor/owner, condition, category, initial price, barcode tag; markdown rules (time-based price drops).
- POS portal: Frappe-style panes/tabs (catalog/search, cart, customer, payments, shift/reconciliation, returns), mobile-first controls, barcode + quick-add, offline-safe state cues.
- Payments/tenders: cash/card/mobile money; change logic; over/short tracking.
- Shift close: opening float, takings by tender, variance, cash-up export; link to posting engine.
- Consignment (optional add-on): consignor records, split rules, payout batches, statements, disputes.

### Auto Pack hardening (Week 5–6)
- Detail pages: leads, customers, vehicles, deals, payments, deliveries with tabs (Overview, Financials, Documents, Approvals, Audit).
- Workflows: lead qualification, vehicle costing/pricing floors, deal status transitions with approval gates, payment posting, delivery checklist.
- Reporting: funnel, stock aging, margin, salesperson performance (reuse DataTable + chart patterns).

### Platform polish and ecosystem (Week 6–7)
- Messaging connectors (SMS/WhatsApp abstraction) for notices/receipts.
- Compliance outputs: fiscal/audit export hooks in posting engine.
- Partner toolkit: template library, onboarding scripts/checklists, demo tenant presets.

### Quality, rollout, and guardrails
- Lint + targeted smoke tests per module; seed data for demo flows (schools term fees, thrift items, POS shift).
- Tenancy and authorization checks on every new API; feature-flag bundles per pack; portal isolation (no main dashboard for portal roles).
- Immutable behavior validation: reversal documents instead of destructive edits; period locks honored across modules.
