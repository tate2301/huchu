# Scrap Module Implementation Tracker

Last updated: 2026-04-08

## Completed
- Scrap ticket compliance rules page and API wiring (`/scrap-metal/compliance-rules`, `/api/scrap-metal/compliance-rules/resolve`).
- Compliance validation hooks enforced in purchase and sale create/update APIs.
- Ticket UX baseline updates (hold/finalize + keyboard shortcuts in tickets page).
- Role alignment for Scrap onboarding and user management:
  - Scrap role options are now `SUPERADMIN`, `MANAGER`, `OPERATOR`.
  - User management create/change/filter flows now use `SUPERADMIN`, `MANAGER`, `OPERATOR`.
  - API enforcement updated to the same role set.
- Operator entitlement template added to avoid cross-module leakage.
- Workspace-profile normalization now falls back to feature-based inference in HR employee surfaces to reduce wrong-module display (for example Gold in Scrap contexts).

## In Progress
- Validate full sign-in and navigation behavior for new `OPERATOR` role across Scrap pages.
- Run lint/build and resolve any type/runtime regressions after role schema changes.

## Pending
- Apply Prisma schema changes to database environments (`UserRole.OPERATOR`).
- End-to-end role QA matrix:
  - Superadmin in Scrap.
  - Manager in Scrap.
  - Operator in Scrap.
- Confirm employee creation wizard + user management UX copy on all affected screens.
- Re-check reporting/dashboard visibility with operator role.

## Notes
- Current implementation prioritizes low complexity and strict Scrap role clarity.
- Extensibility remains open by expanding role maps in:
  - `app/api/employees/route.ts`
  - `components/human-resources/employee-wizard.tsx`
  - `app/api/users/_helpers.ts`
  - `components/user-management/user-management-console.tsx`
  - `lib/platform/user-entitlements.ts`
