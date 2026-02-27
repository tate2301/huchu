# Schools Portals Phase 2 Spec (Implementation Contract)

## Normative References
1. `docs/expansion-plan/platform-holy-grail.md`
2. `docs/ux/platform-ux-playbook.md`
3. `docs/expansion-plan/schools-pack-spec.md`
4. `docs/expansion-plan/erp-expansion-master-plan.md`

## Intent
Phase 2 converts Schools and portal surfaces from scaffold to usable operational views, while preserving strict tenancy and feature gating.

## API Contract (Phase 2)
### Parent Portal
1. Route: `/api/v2/portal/parent` (alias `/api/v2/schools/portal/parent`)
2. Returns:
- linked guardian context
- linked children with active enrollment context
- published result lines for linked children
- boarding allocations for linked children
3. Guardrails:
- `companyId` isolation on every query
- fallback preview mode for privileged roles only (`SUPERADMIN`, `MANAGER`, `CLERK`)

### Student Portal
1. Route: `/api/v2/portal/student` (alias `/api/v2/schools/portal/student`)
2. Returns:
- linked student context
- enrollment history
- guardians with result/finance visibility flags
- boarding history
- published result lines
3. Guardrails:
- tenant-safe student lookup
- no cross-tenant joins

### Teacher Portal
1. Route: `/api/v2/portal/teacher` (alias `/api/v2/schools/portal/teacher`)
2. Returns:
- result sheet list with pagination
- sheet-level line statistics (count + average score)
- moderation summary counts by status
3. Guardrails:
- non-privileged users are scoped to sheets where they are involved (`submittedById`, `hodApprovedById`, `publishedById`)

### Activated Schools Module APIs
1. `/api/v2/schools/boarding`:
- allocation records, hostel/room/bed context, summary metrics
2. `/api/v2/schools/results`:
- result sheet records with status counts and score stats

## UX Contract (Phase 2)
All new screens must follow the UX playbook:
1. One table per active view.
2. Multi-context pages use `VerticalDataViews`.
3. Primary tables are full-bleed (`DataTable` without card wrappers).
4. Numeric columns use mono/tabular styling.
5. Controls row uses integrated table controls.

Applied page set:
1. `/schools`
2. `/schools/boarding`
3. `/schools/results`
4. `/portal/parent`
5. `/portal/student`
6. `/portal/teacher`

## Delivered View Matrix
| Route | Views | Primary Data |
| --- | --- | --- |
| `/portal/parent` | Children, Published Results, Boarding | guardian-linked student context |
| `/portal/student` | Enrollments, Results, Boarding, Guardians | self/student context |
| `/portal/teacher` | Moderation Queue, My Sheets, Published | result sheet workflow context |
| `/schools/boarding` | Allocations, Hostels | boarding operations |
| `/schools/results` | Moderation Queue, All Sheets, Published | results pipeline |
| `/schools` | Dashboard table | module KPIs |

## Known Gaps (Planned Next)
1. Dedicated role models for `PARENT`, `STUDENT`, `TEACHER` in auth/user management (currently scoped through existing roles and data links).
2. Teacher assignment model (`SchoolTeacherProfile`, class-subject ownership) for strict teacher-only result sheet ownership.
3. Publish window model (`SchoolPublishWindow`) and UI controls for release governance.
4. Fees and finance workflows (invoicing/receipts/waivers/write-offs) with accounting event emissions.
5. Boarding leave request lifecycle and movement logs (`CHECK_OUT`/`CHECK_IN`) not yet implemented in Phase 2.

## QA Checklist for Phase 2
1. Tenancy checks: confirm every API query includes `companyId`.
2. Feature checks: confirm portal and schools routes are blocked when features are disabled.
3. UX checks: one-table-per-view, vertical tabs for multi-view pages, mono numeric cells.
4. Workflow checks: teacher portal scoped dataset for non-privileged users.
5. Regression checks: `pnpm lint` and `pnpm build` passing on branch.
