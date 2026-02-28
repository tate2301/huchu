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
