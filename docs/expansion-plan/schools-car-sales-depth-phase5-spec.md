# Schools + Car Sales Depth Phase 5 Spec (Delivered Slice)

## Normative References
1. `docs/expansion-plan/platform-holy-grail.md`
2. `docs/ux/platform-ux-playbook.md`
3. `docs/expansion-plan/schools-pack-spec.md`
4. `docs/expansion-plan/car-sales-pack-spec.md`
5. `docs/expansion-plan/erp-expansion-master-plan.md`

## Intent
Close the implementation-depth gaps that remained after Schools Phase 4 and Car Sales Phase 1, focusing on real route-level UX surfaces and operational lifecycle coverage.

## Scope Delivered
1. Car Sales route-depth:
- Converted `/car-sales/leads`, `/car-sales/inventory`, `/car-sales/deals`, and `/car-sales/financing` from redirects into real pages.
- Added dedicated financing/payments table surface (`CarSalesFinancingContent`) with deal-linked payment visibility.
2. Schools route-depth:
- Added real pages and UI content for `/schools/students`, `/schools/admissions`, `/schools/attendance`, and `/schools/teachers`.
- Added `/api/v2/schools/attendance` roster endpoint and admin client fetch layer for student/admissions/attendance/teacher views.
3. Schools boarding lifecycle depth:
- Added schema entities:
  - `SchoolLeaveRequest`
  - `SchoolBoardingMovementLog`
  - related enums for request type/status and movement type
- Added boarding lifecycle APIs:
  - `GET|POST /api/v2/schools/boarding/leave-requests`
  - `POST /api/v2/schools/boarding/leave-requests/:id/approve`
  - `POST /api/v2/schools/boarding/leave-requests/:id/check-out`
  - `POST /api/v2/schools/boarding/leave-requests/:id/check-in`
- Extended Boarding UI with a dedicated `Leave / Outing Requests` table view.
4. Schools portal specificity:
- Extended parent/student/teacher portal APIs and UI to include:
  - attendance summary tables
  - notices table (from recipient-scoped notification stream)
- Added summary metrics for unread notices and attendance profiles.
5. Platform hardening:
- Added feature key `schools.teachers` and aligned schools teacher route/API gating.
- Expanded ventures navigation to expose new schools pages and car-sales subpages directly.

## API Surface Added
1. `GET /api/v2/schools/attendance`
2. `GET|POST /api/v2/schools/boarding/leave-requests`
3. `POST /api/v2/schools/boarding/leave-requests/:id/approve`
4. `POST /api/v2/schools/boarding/leave-requests/:id/check-out`
5. `POST /api/v2/schools/boarding/leave-requests/:id/check-in`

## Guardrails Enforced
1. `companyId` tenancy enforcement on all new leave/movement and attendance queries.
2. Boarding leave requests require active boarding allocation for the same student.
3. Leave lifecycle transitions are server-guarded:
- `SUBMITTED -> APPROVED|REJECTED`
- `APPROVED -> CHECKED_OUT`
- `CHECKED_OUT -> CHECKED_IN`
4. Checkout/check-in writes movement-log records for auditability.
5. Portal notices are recipient-scoped via `NotificationRecipient.userId`.

## UX Compliance Notes
1. Multi-context screens continue using `VerticalDataViews` with one table per active panel.
2. All new table views use integrated DataTable controls.
3. Numeric/time values continue to use `NumericCell` mono formatting.

## Remaining Gaps After Phase 5
1. Teacher portal write endpoints for marks and attendance capture are still pending.
2. Car sales delivery object/checklist flow remains pending.
3. Car sales accounting integration events remain pending.
4. Thrift pack implementation has not started in this slice.
