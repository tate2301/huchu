# Schools Governance Phase 4 Spec (Delivered Slice)

## Normative References
1. `docs/expansion-plan/platform-holy-grail.md`
2. `docs/ux/platform-ux-playbook.md`
3. `docs/expansion-plan/schools-pack-spec.md`
4. `docs/expansion-plan/erp-expansion-master-plan.md`

## Intent
Phase 4 hardens schools ownership and publication governance by introducing teacher assignment authority, publish-window enforcement, and stricter parent/student/teacher portal scope controls.

## Scope Delivered
1. Governance data model:
- `SchoolTeacherProfile`
- `SchoolSubject`
- `SchoolClassSubject`
- `SchoolPublishWindow`
- `SchoolResultModerationAction`
2. Governance helper service:
- assignment scope construction
- teacher profile/assignment lookup
- publish-window resolution
- moderation action writing
3. Teacher governance APIs:
- `/api/v2/schools/teachers/profiles`
- `/api/v2/schools/teachers/subjects`
- `/api/v2/schools/teachers/assignments`
- `/api/v2/schools/teachers/assignments/:id`
4. Publish-window APIs:
- `/api/v2/schools/results/publish/windows`
- `/api/v2/schools/results/publish/windows/:id`
5. Results transition guards:
- assignment checks on submit and moderation actions
- HOD checks for moderation actions
- publish requires active publish window
- unpublish transition endpoint and moderation audit entry
6. Portal and scope hardening:
- teacher portal scopes sheets by assignment ownership
- parent results list respects `canReceiveAcademicResults`
- parent child-level results endpoint with permission checks
- parent and student portal self-scope guards tightened
7. Results UI enhancement:
- publish-window tab in `/schools/results`
- publish-window summary metrics (open/scheduled/closed)
8. Dashboard governance visibility:
- counts for teacher profiles, subjects, assignments, publish windows, moderation actions

## New APIs in This Slice
1. `GET|POST /api/v2/schools/teachers/profiles`
2. `GET|POST /api/v2/schools/teachers/subjects`
3. `GET|POST /api/v2/schools/teachers/assignments`
4. `PATCH|DELETE /api/v2/schools/teachers/assignments/:id`
5. `GET|POST /api/v2/schools/results/publish/windows`
6. `PATCH /api/v2/schools/results/publish/windows/:id`
7. `POST /api/v2/schools/results/sheets/:id/unpublish`
8. `GET /api/v2/schools/portal/parent/children/:studentId/results`

## Guardrails Enforced
1. All governance entities and transitions are tenant-partitioned by `companyId`.
2. Non-privileged teacher actions are assignment-scoped (term/class/stream).
3. HOD moderation actions require active teacher profile with `isHod=true`.
4. Results publish is blocked unless an `OPEN` publish window matches scope and time.
5. Parent child result visibility requires active link and `canReceiveAcademicResults=true`.
6. Student portal blocks ad hoc `studentId`/`studentNo` override for non-privileged actors.
7. Every moderation transition writes a deterministic `SchoolResultModerationAction`.

## UI/UX Outputs
1. `/schools/results`:
- existing moderation/all/published views retained
- new publish windows view added with one-table-per-active-view pattern
- summary cards expanded to include window statuses
2. `/portal/teacher`:
- assignment coverage metrics surfaced (assignments/classes/terms)
- explicit no-profile state shown when teacher profile link is missing
3. `/schools` dashboard:
- governance counters added for operational readiness checks

## Remaining Schools Gaps After Phase 4
1. Dedicated first-class auth roles (`PARENT`, `STUDENT`, `TEACHER`) remain deferred; current controls are data-scope and feature-gate based.
2. Boarding leave/check-in/check-out lifecycle remains a separate implementation slice.
3. Teacher-side mark/attendance action endpoints under `/api/v2/schools/portal/teacher/me/*` remain to be added.
