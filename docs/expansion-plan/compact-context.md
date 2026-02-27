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

## Current Slice
1. Branch: `feat/schools-portals-phase2-v1`
2. Objective: convert Schools and portal routes from scaffold to working API + UI flows.
3. Core outputs:
- Real portal APIs: `/api/v2/portal/{parent,student,teacher}`
- Schools-prefixed aliases: `/api/v2/schools/portal/{parent,student,teacher}`
- Activated schools data APIs: `/api/v2/schools/boarding`, `/api/v2/schools/results`
- Real data-table surfaces on `/schools`, `/schools/boarding`, `/schools/results`, `/portal/*`

## Invariants (Never Drift)
1. Keep one runtime and strict tenant partition by `companyId`.
2. Every new route/API must map in `lib/platform/gating/route-registry.ts`.
3. Every active table view follows playbook rules: one table per active panel, unified controls row, mono numeric cells.
4. Workflow transitions stay server-enforced and auditable.
5. Finance-impacting flows must publish deterministic accounting events.

## Next Planned Slices
1. Schools fees lifecycle (invoice, receipt, allocation, waiver, write-off, statements, accounting events).
2. Schools teacher assignment and publish-window controls (`SchoolTeacherProfile`, `SchoolPublishWindow`) to tighten portal scoping.
3. Car sales phase 1 domain model and lead-to-deal APIs.
4. Thrift phase 1 intake/grading/lot lifecycle and POS transaction object.
