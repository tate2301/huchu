# ERP Expansion Compact Context (Persistent)

## Normative References
1. `docs/expansion-plan/platform-holy-grail.md`
2. `docs/ux/platform-ux-playbook.md`
3. `docs/expansion-plan/erp-expansion-master-plan.md`

## Program Scope (Locked Order)
1. Schools pack first (including boarding, results, and parent/student/teacher portals).
2. Car sales pack second (Zimbabwe-ready sales/deals/payments workflow).
3. Thrift pack third (intake/grading/lots/sales, POS-first operation).

## Completed Slices
1. `feat/platform-expansion-foundation-v1`
2. `feat/schools-core-phase1-v1`
3. `feat/schools-portals-phase2-v1`
4. `feat/schools-fees-phase3-v1`
5. `feat/schools-governance-phase4-v1`
6. `feat/car-sales-core-phase1-v1`
7. `feat/schools-car-sales-depth-phase5-v1`

## Current Slice
1. Branch: `feat/thrift-core-phase1-v1`
2. Objective: close schools + car-sales depth gaps discovered during implementation hardening (real sub-pages, boarding leave lifecycle, richer portal views).
3. Core outputs:
- Real car-sales route-level pages for leads, inventory, deals, and financing
- Schools boarding leave/outing APIs with approve/check-out/check-in lifecycle and movement logs
- Parent/student/teacher portal attendance + notices tables and navigation/gating hardening

## Invariants (Never Drift)
1. Keep one runtime and strict tenant partition by `companyId`.
2. Every new route/API must map in `lib/platform/gating/route-registry.ts`.
3. Every active table view follows playbook rules: one table per active panel, unified controls row, mono numeric cells.
4. Workflow transitions stay server-enforced and auditable.
5. Finance-impacting flows must publish deterministic accounting events.

## Next Planned Slices
1. Car sales delivery workflow and accounting integration events.
2. Thrift core intake/grading/lot lifecycle and POS foundation.
3. Cross-pack POS/outbox hardening for offline capture and reconciliation safety.
