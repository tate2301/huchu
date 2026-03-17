# Auth System Audit - March 2026

## Scope
This audit covers the platform authentication surface across `next-auth`, middleware, server guards, tenant-aware route enforcement, portal login flows, and admin portal access.

## Baseline Findings
- The previous auth implementation concentrated provider logic, session policy, claim enrichment, and redirect handling inside [`lib/auth.ts`](/C:/Users/Atipamara/work/huchu/lib/auth.ts), which made strategy changes risky and easy to regress.
- Route protection was fragmented across middleware, direct `getServerSession(authOptions)` calls, `validateSession`, and admin-only helpers.
- Login continuation behavior was inconsistent. Some surfaces preserved destination paths, while others forced fixed landings.
- Session lifetime rules were implicit. The JWT lifetime, the intended business lifetime, and the UI’s expectation of “still signed in” were not consistently modeled in one place.
- Admin portal behavior was especially brittle because host enforcement, role enforcement, and re-auth routing were split across middleware, page logic, and client-side fetch calls.

## Inventory Snapshot
- Direct `getServerSession(authOptions)` call sites discovered: `72`
- `validateSession(...)` call sites discovered: `469`
- Admin access helper usages discovered: `16`
- Client session consumers (`SessionProvider` / `useSession`) discovered: `32`

## Hardening Implemented
- Introduced an internal auth-core layer under [`lib/auth-core`](/C:/Users/Atipamara/work/huchu/lib/auth-core):
  - typed session claims
  - explicit session policies
  - redirect sanitization
  - strategy registry
  - guard APIs for pages and APIs
  - auth event logging
  - rate-limiting hooks
- Refactored [`lib/auth.ts`](/C:/Users/Atipamara/work/huchu/lib/auth.ts) into a wiring module that consumes auth-core helpers instead of owning all policy directly.
- Standardized strategy metadata for:
  - `credentials`
  - `admin-email-link`
  - dark-launch placeholders for `email-link` and `otp`
- Standardized claim fields across JWTs and sessions:
  - `authStrategy`
  - `sessionPolicy`
  - `authExpiresAt`
  - `rememberMe`
- Added credential sign-in rate limiting keyed by host, email, and client address.
- Added admin magic-link rate limiting and structured auth audit logging for success, failure, rejection, and guard denials.
- Centralized callback sanitization and callback-preserving login redirects.
- Migrated shared API/page guard entrypoints to auth-core:
  - [`lib/api-utils.ts`](/C:/Users/Atipamara/work/huchu/lib/api-utils.ts)
  - [`lib/admin-portal/server.ts`](/C:/Users/Atipamara/work/huchu/lib/admin-portal/server.ts)
  - [`app/api/platform-admin/_auth.ts`](/C:/Users/Atipamara/work/huchu/app/api/platform-admin/_auth.ts)
- Updated primary, portal, and admin login surfaces to resolve enabled strategies from the registry and preserve callback URLs.
- Restored server-side admin shell protection in [`app/portal/admin/layout.tsx`](/C:/Users/Atipamara/work/huchu/app/portal/admin/layout.tsx).
- Added client-side admin API re-auth redirection when the server returns `401` with auth-loss reasons.
- Configured the shared [`SessionProvider`](/C:/Users/Atipamara/work/huchu/components/providers/app-providers.tsx) to refetch periodically and on focus so browser state tracks session expiry more predictably.

## Extensibility Direction
- New strategies can now be introduced by extending the strategy registry and plugging provider verification into the existing claim/session pipeline.
- Session policy is strategy-aware instead of being coupled directly to a specific login form.
- Shared guards make authorization behavior reusable across pages, APIs, and future login surfaces.
- Dark-launch strategy flags (`AUTH_ENABLE_EMAIL_LINK`, `AUTH_ENABLE_OTP`) provide a controlled path for incremental rollout without changing the live credentials/admin behavior.

## Remaining Follow-up
- Migrate the remaining direct `getServerSession(authOptions)` call sites onto `getCurrentAuthSession` or `requirePageAuth` where appropriate.
- Continue consolidating page-specific and feature-specific auth decisions behind the shared guard layer.
- Introduce persistent or distributed rate limiting if multi-instance deployments make the in-memory limiter insufficient.
- Expand audit logging dashboards or alerting on top of `PlatformAuditEvent` for operational visibility.
- Add automated integration tests around login, expiry, callback preservation, and admin host/role enforcement.
