# Production Readiness Plan: CRUD Completeness + Submission UX + Action Logs

## Summary
- Goal: make active modules production-ready with consistent UX, complete lifecycle operations, and visible history of submitted records.
- Scope locked: core active modules first (`Stores`, `Gold`, `Maintenance`, `HR`, `Shift/Plant/Attendance`), shipped in phased batches.
- UX default locked: successful submit redirects to a related list/history view and highlights the newly saved record.
- Gold control locked: immutable records with corrective actions and full audit trail, not hard delete.

## Current Gaps (from repo inspection)
- `Stores Receive` and `Stores Issue` are form-only views (`app/stores/receive/page.tsx`, `app/stores/issue/page.tsx`) without dedicated submitted-record tables in those modules.
- `Work Orders` has create/list but no update/delete endpoints or UI actions (`app/api/work-orders/route.ts`, `components/maintenance/maintenance-content.tsx`).
- `Gold` forms return to menu after save (`app/gold/components/pour-form.tsx`, `app/gold/components/dispatch-form.tsx`, `app/gold/components/receipt-form.tsx`) rather than redirecting to filtered history showing saved record.
- `Compliance` is placeholder only (`app/compliance/page.tsx`) while Prisma models already exist.
- API surface is inconsistent for full lifecycle on several entities (missing `/:id` handlers and standardized mutation patterns).

## Phase Plan

## Phase 1: Shared UX and infrastructure
- Implement shared post-submit pattern:
- Add query-param convention: `?createdId=<id>&createdAt=<iso>&source=<module>`.
- Add reusable `RecordSavedBanner` component that reads query params and highlights matching row.
- Add standard list-state UX: loading skeleton, empty state, error state, retry action.
- Standardize mutation behavior:
- Disable submit while pending.
- Preserve entered data on failure.
- Toast on success/error with entity-specific text.
- Route contract rule:
- Every create flow must navigate to a canonical list/history route with filter pre-applied.

## Phase 2: Stores module completion
- Add `Stores Movements` history page (`/stores/movements`) with table for all inventory actions:
- Columns: timestamp, movement type, item, site, qty/unit, opening/closing (where derivable), actor/requester/approver, notes.
- Filters: site, type, item, date range, search.
- Row actions: view detail drawer, corrective adjustment action.
- Update submit flows:
- `Receive` and `Issue` submit -> redirect to `/stores/movements` with `createdId`.
- Keep quick links from dashboard cards to filtered movement history.
- API additions:
- Add `GET /api/inventory/movements/:id` for detail.
- Add corrective endpoint strategy for mistakes:
- Preferred: `POST /api/inventory/movements` with `movementType="ADJUSTMENT"` and `correctionOfId`.
- Optional metadata field for traceability in notes payload schema.
- Navigation update:
- Extend `components/stores/stores-shell.tsx` with `Movements` tab.

## Phase 3: Maintenance lifecycle completion
- Work orders:
- Add `PATCH /api/work-orders/[id]` for status, technician, workDone, partsUsed, downtimeEnd.
- Add cancellation endpoint behavior in same patch contract (`status="CANCELLED"`).
- Add role-gated remove/archive strategy (soft-delete preferred; if hard delete required add `DELETE /api/work-orders/[id]` with checks).
- UI upgrades in `components/maintenance/maintenance-content.tsx`:
- Add row actions on Work Orders table: `Update`, `Complete`, `Cancel`.
- Breakdown submit redirects to Work Orders table with highlighted new row.
- Add work-order detail drawer with timeline and audit metadata.
- Ensure PM schedule can deep-link to equipment edit and open work orders.

## Phase 4: Gold flow UX hardening (immutable model)
- Keep core entities immutable (`pour`, `dispatch`, `receipt`):
- No hard delete or direct overwrite of historical core fields.
- Add correction model:
- Add API for corrective entries (e.g. `POST /api/gold/corrections`) linked to original record.
- Persist correction reason, user, timestamp, before/after snapshot.
- Add list/history pages (or enhance existing `audit` view) for each stage:
- Pours list, Dispatch list, Receipts list with filters and `createdId` highlight.
- Submit behavior:
- `Pour` -> redirect to pours history.
- `Dispatch` -> redirect to dispatch history.
- `Receipt` -> redirect to receipts history.
- Audit completeness:
- Expand `app/gold/audit/page.tsx` to include correction events and chain links (pour -> dispatch -> receipt).

## Phase 5: HR and operations consistency pass
- Ensure all form modules follow same redirect/highlight pattern:
- `HR salaries`, `HR payouts`, `attendance`, `shift report`, `plant report`.
- Add missing row actions where lifecycle demands it:
- For payment records: include explicit update history and status transitions in row/detail.
- Ensure every table has fast filters and date scoping to prevent large-list UX degradation.

## Phase 6: Compliance bootstrap (next after active modules)
- Build baseline CRUD + list views for:
- Permits, inspections, incidents, training records.
- API routes to add:
- `GET/POST /api/compliance/permits`, `GET/PATCH/DELETE /api/compliance/permits/[id]`
- `GET/POST /api/compliance/inspections`, `GET/PATCH/DELETE /api/compliance/inspections/[id]`
- `GET/POST /api/compliance/incidents`, `GET/PATCH/DELETE /api/compliance/incidents/[id]`
- `GET/POST /api/compliance/training-records`, `GET/PATCH/DELETE /api/compliance/training-records/[id]`
- Replace placeholder `app/compliance/page.tsx` with tabbed list + forms + expiry/overdue indicators.

## Public API / Interface Changes
- New route handlers:
- `app/api/work-orders/[id]/route.ts` (`GET`, `PATCH`, optional `DELETE` or soft-delete behavior).
- `app/api/inventory/movements/[id]/route.ts` (`GET`).
- Gold correction endpoint(s), likely `app/api/gold/corrections/route.ts`.
- Compliance endpoints listed above.
- Extended request/response contracts:
- Add consistent metadata fields: `createdBy`, `updatedBy`, `createdAt`, `updatedAt`, optional `correctionOfId`.
- Include list payload compatibility with existing `Pagination<T>` contract in `lib/api.ts`.
- Frontend API client updates in `lib/api.ts`:
- Add fetchers for new list/detail endpoints and correction actions.
- Add typed models for work-order updates, movement detail, compliance entities, and gold corrections.

## Testing and Validation
- API tests (or scripted integration checks) for each new/changed endpoint:
- Success path, validation errors, auth/tenant isolation, forbidden cross-company access.
- Negative stock and invalid transitions (work-order state machine).
- Gold immutability rules and correction linkage integrity.
- UI acceptance scenarios:
- Submit each form -> redirected list -> new row highlighted.
- Failed submit preserves user input and shows actionable error.
- List filtering and pagination remain stable across refresh/navigation.
- Manual smoke checklist:
- `pnpm lint`
- module-by-module submit/list/edit/correct flows
- permission checks across roles (`SUPERADMIN`, `MANAGER`, `CLERK`)

## Rollout Strategy
- Ship in phased PRs:
- PR1 shared submit/list UX primitives + stores movements.
- PR2 maintenance work-order lifecycle.
- PR3 gold redirect/history + corrections + audit expansion.
- PR4 HR/operations consistency pass.
- PR5 compliance bootstrap.
- Each PR includes:
- migration notes if schema changes are introduced
- before/after UX screenshots
- explicit acceptance checklist for that phase

## Assumptions and Defaults
- Assumption: existing Prisma multi-tenant pattern (`companyId`) remains the access-control boundary.
- Default: gold records are immutable; corrections are additive and auditable.
- Default: canonical post-submit destination is list/history, not staying on form.
- Default: phased delivery over single large release.
- Default: soft-delete/archive is preferred for sensitive operational records unless legal requirements demand hard delete.
