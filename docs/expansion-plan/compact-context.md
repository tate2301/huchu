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

## Current Slice
1. Branch: `feat/schools-governance-phase4-v1`
2. Objective: deliver Schools governance controls for teacher ownership and publish governance (`SchoolTeacherProfile`, `SchoolClassSubject`, `SchoolPublishWindow`) and enforce teacher portal scoping from assignments.
3. Core outputs:
- Teacher profile and class-subject assignment APIs with tenant-safe guards
- Publish-window APIs and status controls for results release governance
- Teacher portal reads and actions scoped by assignment ownership
- Schools dashboard governance metrics for assignment and publish-window coverage

## Invariants (Never Drift)
1. Keep one runtime and strict tenant partition by `companyId`.
2. Every new route/API must map in `lib/platform/gating/route-registry.ts`.
3. Every active table view follows playbook rules: one table per active panel, unified controls row, mono numeric cells.
4. Workflow transitions stay server-enforced and auditable.
5. Finance-impacting flows must publish deterministic accounting events.

## Next Planned Slices
1. Car sales phase 1 domain model and lead-to-deal APIs.
2. Thrift phase 1 intake/grading/lot lifecycle and POS transaction object.
3. Cross-pack POS/outbox hardening for offline capture and reconciliation safety.
