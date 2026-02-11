# Platform Multi-Tenant Commerce Foundation (CLI-First) With Parallel-Agent Execution

## Summary
1. Add platform-level tenant commerce/config foundations while preserving existing `companyId`-scoped ERP modules.
2. Use wildcard subdomains per client organization with central login and tenant redirect.
3. Implement internal subscriptions, licensing state, feature flags, and deployed-org lifecycle management.
4. Keep phase 1 operations CLI-first (no web backoffice UI yet).

## Standards Locked
- Tenancy model: shared PostgreSQL database, strict tenant keys (`companyId`) and host-based tenant resolution.
- Domain model: wildcard subdomains on one root domain (`tenant.rootdomain.com`).
- Auth flow: central login host, then redirect users to their tenant host.
- Access enforcement: hard lockout for suspended/disabled/subscription-invalid orgs.
- Commerce model: internal/manual subscription handling, custom per-client plans/features.
- Tenant lifecycle: soft-disable only; no hard-delete.

## Git Workflow First (Required Before Implementation)
1. Check pending work and create a checkpoint commit.
2. Start implementation on a new feature branch.

Default commands:
```bash
git add -A
git commit -m "chore: checkpoint pending changes before platform tenancy work"
git switch -c feat/platform-multitenancy-commerce-foundation
```

### Agent Worktree Rules (Mandatory)
- All execution agents must work in isolated git worktrees, never the same working directory.
- One integration branch is the source of truth for final merge.
- Each agent gets its own branch and worktree path:
  - `feat/platform-multitenancy-commerce-foundation-agent-a`
  - `feat/platform-multitenancy-commerce-foundation-agent-b`
  - `feat/platform-multitenancy-commerce-foundation-agent-c`
  - `feat/platform-multitenancy-commerce-foundation-agent-d`
  - `feat/platform-multitenancy-commerce-foundation-agent-e`
- Recommended local layout:
  - `.worktrees/platform-agent-a`
  - `.worktrees/platform-agent-b`
  - `.worktrees/platform-agent-c`
  - `.worktrees/platform-agent-d`
  - `.worktrees/platform-agent-e`
- No agent may commit directly to the integration branch.
- Team Leader performs integration in controlled order and resolves cross-agent conflicts.

### Worktree Bootstrap Commands (Team Leader)
```bash
# 1) From repository root, create integration branch (once)
git switch -c feat/platform-multitenancy-commerce-foundation

# 2) Create per-agent branches from integration branch
git branch feat/platform-multitenancy-commerce-foundation-agent-a
git branch feat/platform-multitenancy-commerce-foundation-agent-b
git branch feat/platform-multitenancy-commerce-foundation-agent-c
git branch feat/platform-multitenancy-commerce-foundation-agent-d
git branch feat/platform-multitenancy-commerce-foundation-agent-e

# 3) Create per-agent worktrees
git worktree add .worktrees/platform-agent-a feat/platform-multitenancy-commerce-foundation-agent-a
git worktree add .worktrees/platform-agent-b feat/platform-multitenancy-commerce-foundation-agent-b
git worktree add .worktrees/platform-agent-c feat/platform-multitenancy-commerce-foundation-agent-c
git worktree add .worktrees/platform-agent-d feat/platform-multitenancy-commerce-foundation-agent-d
git worktree add .worktrees/platform-agent-e feat/platform-multitenancy-commerce-foundation-agent-e

# 4) Verify active worktrees
git worktree list
```

PowerShell (Windows):
```powershell
# 0) Ensure worktrees parent folder exists
New-Item -ItemType Directory -Force -Path .worktrees | Out-Null

# 1) From repository root, create integration branch (once)
git switch -c feat/platform-multitenancy-commerce-foundation

# 2) Create per-agent branches from integration branch
git branch feat/platform-multitenancy-commerce-foundation-agent-a
git branch feat/platform-multitenancy-commerce-foundation-agent-b
git branch feat/platform-multitenancy-commerce-foundation-agent-c
git branch feat/platform-multitenancy-commerce-foundation-agent-d
git branch feat/platform-multitenancy-commerce-foundation-agent-e

# 3) Create per-agent worktrees
git worktree add .worktrees/platform-agent-a feat/platform-multitenancy-commerce-foundation-agent-a
git worktree add .worktrees/platform-agent-b feat/platform-multitenancy-commerce-foundation-agent-b
git worktree add .worktrees/platform-agent-c feat/platform-multitenancy-commerce-foundation-agent-c
git worktree add .worktrees/platform-agent-d feat/platform-multitenancy-commerce-foundation-agent-d
git worktree add .worktrees/platform-agent-e feat/platform-multitenancy-commerce-foundation-agent-e

# 4) Verify active worktrees
git worktree list
```

### Worktree Cleanup Commands (After Integration)
```bash
git worktree remove .worktrees/platform-agent-a
git worktree remove .worktrees/platform-agent-b
git worktree remove .worktrees/platform-agent-c
git worktree remove .worktrees/platform-agent-d
git worktree remove .worktrees/platform-agent-e

git branch -d feat/platform-multitenancy-commerce-foundation-agent-a
git branch -d feat/platform-multitenancy-commerce-foundation-agent-b
git branch -d feat/platform-multitenancy-commerce-foundation-agent-c
git branch -d feat/platform-multitenancy-commerce-foundation-agent-d
git branch -d feat/platform-multitenancy-commerce-foundation-agent-e
```

PowerShell (Windows):
```powershell
git worktree remove .worktrees/platform-agent-a
git worktree remove .worktrees/platform-agent-b
git worktree remove .worktrees/platform-agent-c
git worktree remove .worktrees/platform-agent-d
git worktree remove .worktrees/platform-agent-e

git branch -d feat/platform-multitenancy-commerce-foundation-agent-a
git branch -d feat/platform-multitenancy-commerce-foundation-agent-b
git branch -d feat/platform-multitenancy-commerce-foundation-agent-c
git branch -d feat/platform-multitenancy-commerce-foundation-agent-d
git branch -d feat/platform-multitenancy-commerce-foundation-agent-e
```

## Parallel-Agent Execution Plan
Use multiple agents in parallel for independent workstreams, then integrate serially where files overlap.

### Team Leader (Coordinator)
- Owns execution board and task assignment.
- Creates and manages all agent worktrees/branches.
- Enforces file ownership boundaries to prevent overlap.
- Reviews each agent PR/commit before integration.
- Cherry-picks or merges agent branches into integration branch in dependency order.
- Runs final lint/smoke verification before release branch handoff.

### Agent A: Data Model + Migration
- Extend `Company` with `slug`, tenant status, provisioning/lifecycle metadata.
- Add new models: `SubscriptionPlan`, `CompanySubscription`, `PlatformFeature`, `CompanyFeatureFlag`, `ProvisioningEvent`.
- Backfill strategy for existing companies and feature defaults.

### Agent B: Auth + Middleware + Tenant Resolution
- Implement host parsing and tenant resolution from subdomain.
- Support central login + redirect to resolved tenant host.
- Enforce tenant-host/session match and lockout checks in middleware.

### Agent C: Feature Gating + App Integration
- Add feature service helpers.
- Gate nav/UX visibility by feature flags.
- Add API-level feature guards for restricted modules.

### Agent D: CLI Platform Operations
- Add scripts for provisioning, listing orgs, lifecycle state, subscription updates, and feature toggles.
- Ensure each operation emits provisioning/audit events.

### Agent E: Docs + Deployment Ops
- Document env vars, wildcard DNS/proxy requirements, and provisioning runbook.
- Add lockout behavior and recovery procedures for operations.

Parallelization rule:
- Run agents in parallel only when touching separate file sets.
- Serialize integration for shared touchpoints (`middleware.ts`, auth/session typings, shared `lib/platform/*` interfaces).
- Mandatory: each parallel stream runs in its own git worktree.

## Prisma/Data Changes
### Extend `Company`
- `slug String @unique`
- `tenantStatus TenantStatus @default(ACTIVE)` (`ACTIVE`, `SUSPENDED`, `DISABLED`)
- `isProvisioned Boolean @default(false)`
- `suspendedAt DateTime?`
- `disabledAt DateTime?`

### Add Models
- `SubscriptionPlan`: plan metadata and active state.
- `CompanySubscription`: plan assignment, lifecycle status, dates.
- `PlatformFeature`: canonical feature keys.
- `CompanyFeatureFlag`: per-org feature enablement.
- `ProvisioningEvent`: append-only operational audit log.

### Backfill Rules
- Generate unique slugs for existing companies.
- Initialize subscriptions to active/custom baseline.
- Enable baseline feature set for existing orgs.
- Mark existing orgs as provisioned and active.

## Runtime Contracts
### New Platform Services (`lib/platform/*`)
- `resolveTenantFromHost(host): TenantContext | null`
- `assertTenantAccess(session, tenantContext): AccessResult`
- `isSubscriptionActive(companyId): boolean`
- `hasFeature(companyId, featureKey): boolean`
- `getFeatureMap(companyId): Record<string, boolean>`

### Session/JWT Additions
- Add `companySlug` and `tenantStatus` to token/session payload.
- Keep existing `companyId` + `role` contracts for compatibility.

### Middleware Behavior
- Identify root/central host vs tenant host from request host.
- Central host allows login and redirects authenticated users to tenant host.
- Tenant host requires:
  - authenticated session
  - host-tenant match
  - active tenant + active subscription
- Non-compliant tenants/users redirect to `/access-blocked`.

## CLI Interfaces (Developer Backoffice)
- `platform-provision-org --name --subdomain --admin-email --admin-name --admin-password`
- `platform-list-orgs [--status --search]`
- `platform-set-subscription --company-id ...`
- `platform-set-feature --company-id --feature --enabled`
- `platform-suspend-org --company-id`
- `platform-activate-org --company-id`
- `platform-disable-org --company-id`

Provisioning defaults:
- Create organization + subdomain + tenant admin user.
- Initialize active subscription and baseline feature set.
- Record provisioning event.

## Environment and Deployment
Required env additions:
- `PLATFORM_ROOT_DOMAIN`
- `PLATFORM_APP_URL`
- `NEXTAUTH_COOKIE_DOMAIN`
- `PLATFORM_ROOT_HOSTS`

Infrastructure requirements:
- Wildcard DNS (`*.rootdomain`) to app entrypoint.
- Reverse proxy preserves `Host` header.
- Single Next.js deployment handles all tenant hosts.

## Test Cases and Scenarios
1. Provisioning creates org, slug, admin, subscription, and audit event.
2. Duplicate subdomain rejected.
3. Central login redirects to correct tenant subdomain.
4. Cross-tenant host access blocked.
5. Suspended/disabled orgs receive hard lockout.
6. Re-activation restores access.
7. Disabled feature is hidden in nav and blocked at API.
8. Existing active tenant workflows remain functional.
9. Lint/build pass after each integration batch.

## Execution Order
1. Run git checkpoint + create feature branch.
2. Team Leader creates agent branches + worktrees from integration branch.
3. Agent A + Agent D in parallel (schema and CLI scaffolding) in separate worktrees.
4. Agent B + Agent C in parallel (runtime enforcement and feature gating) in separate worktrees.
5. Agent E finalizes docs/deployment updates in separate worktree.
6. Team Leader integrates shared files serially, run `pnpm lint`, then manual smoke tests.

## Assumptions
- Phase 1 excludes a web backoffice UI.
- Billing remains internal/manual (no Stripe).
- Plans are custom per client, not fixed tier catalog.
- Data deletion is non-destructive (soft disable/archive behavior only).
