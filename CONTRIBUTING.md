# Contributing

This guide covers the contribution workflow for the Huchu platform. Keep changes small, tenant-safe, tested, and documented.

## Before You Start

1. Read `README.md` for setup and command references.
2. Read `docs/ux/platform-ux-playbook.md` before any UI work.
3. Check the relevant domain docs under `docs/`.
4. Check existing code patterns before introducing a new abstraction.
5. Confirm whether the change touches database schema, feature gating, tenancy, finance, auth, offline behavior, or public workflows. Those areas need extra care.

## Local Setup

```bash
pnpm install
cp .env.example .env
pnpm db:generate
pnpm db:push
pnpm dev
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

If pnpm reports ignored builds, review and approve/deny package build scripts using `pnpm approve-builds`, then commit the resulting `pnpm-workspace.yaml` decision.

## Branches And Commits

- Use focused branches. The default Codex branch prefix is `codex/`.
- Recent history uses Conventional Commits. Prefer examples like:
  - `feat: add school fee waiver approval flow`
  - `fix: guard gold import rollback tenant scope`
  - `docs: refresh developer setup guide`
  - `test: cover payroll run generation edge cases`
- Keep formatting-only churn out of feature/fix commits unless the formatter is part of the requested work.
- Do not commit secrets, `.env`, local uploads, generated caches, or database dumps.

## Code Ownership And Placement

| Change type | Preferred location |
| --- | --- |
| Route/page UI | `app/<domain>/...` |
| API route handlers | `app/api/<domain>/...` or `app/api/v2/<domain>/...` |
| Feature components | `components/<domain>/...` |
| Shared primitives | `components/ui/...` |
| Business/domain logic | `lib/<domain>/...` |
| Shared platform logic | `lib/platform/...` |
| Auth/session logic | `lib/auth-core/...`, `lib/auth.ts`, and NextAuth route files |
| Schema | `prisma/schema.prisma` and `prisma/migrations/...` |
| Operational scripts | `scripts/...` |
| Tests | Colocated `.test.ts` / `.test.tsx`; browser tests in `e2e/` |
| Product/system docs | `docs/...` |

Avoid duplicating domain rules in pages and API handlers. Put reusable workflow rules, calculations, validation, posting, reconciliation, imports, and tenant scoping in `lib/`.

## Module Change Checklist

When adding or extending a module:

- Add Prisma schema/migration work if persistent data changes.
- Add domain services in `lib/<domain>/`.
- Add API handlers with tenant-aware validation.
- Add route pages and feature components.
- Register feature keys and route gates.
- Add navigation/workspace/template entries where needed.
- Add notifications, audit, document output, offline support, or reporting only when the workflow requires them.
- Add targeted tests.
- Update README and domain docs when developer workflow or visible capability changes.

## Feature Gating And Navigation

New modules are not complete until their access model is registered.

Review and update:

- `lib/platform/feature-catalog.ts`
- `lib/platform/gating/route-registry.ts`
- `lib/navigation.ts`
- `lib/workspaces.ts`
- `lib/workspace-products.ts`
- `lib/platform/client-templates.ts`

Use canonical feature keys consistently across catalog, route registry, navigation, tests, docs, and admin tooling.

## Database And Migrations

- Local development can use `pnpm db:push`.
- Shared or production-bound schema changes need migrations under `prisma/migrations`.
- Run `pnpm db:generate` after schema changes.
- P0 migrations require a migration witness test in the same commit.
- Backfills belong in `scripts/backfill-*.ts` or a clearly named script.
- Document operator steps when a release requires a migration, `pnpm db:push`, backfill, or data repair command.
- Never use destructive database reset commands against shared or production databases.

## Testing And Quality Gates

Run the smallest meaningful checks while developing, then broaden before handoff.

Required for most code changes:

```bash
npx tsc --noEmit
pnpm lint
pnpm test
```

Run targeted tests first when useful:

```bash
pnpm test -- lib/gold/reconcile.test.ts
pnpm test -- app/api/payroll/periods/[id]/generate-run/route.test.ts
```

Run browser tests when route/auth/portal/UI workflow behavior changes:

```bash
pnpm test:e2e
```

Run a production build for risky framework, Next.js config, Prisma, auth, PDF rendering, or deployment changes:

```bash
pnpm build
```

If you cannot run a required check, state that in the PR and explain why.

## UI And UX Contributions

`docs/ux/platform-ux-playbook.md` is the canonical UI source of truth.

Non-negotiables:

- One table per active view.
- Use vertical tabs for multi-table contexts.
- Keep DataTable controls in one aligned row.
- Use full-bleed primary tables and progressive disclosure.
- Hide invalid workflow actions and show requirement context near the action area.
- Use canonical status labels exactly.
- Use `font-mono` for numeric and time-heavy cells.
- Preserve list context when navigating to detail views.

Use existing primitives from `components/ui` and existing domain shells before creating a new pattern.

## API And Tenant Safety

- Authenticate through existing helpers and session claims.
- Scope operational records by `companyId` unless explicitly platform-global.
- Verify ownership on nested resources before reads, writes, and workflow transitions.
- Do not trust IDs from the client without checking tenant context.
- Prefer Zod or structured validation for request payloads.
- Return consistent error shapes where surrounding APIs already establish a pattern.

## Finance, Audit, And Workflow Safety

- Finance-impacting writes must preserve traceability to source records.
- Approved/posted records should use correction or reversal flows rather than silent mutation.
- Sensitive changes should emit audit records or domain events where the domain already supports them.
- Workflow routes should only expose valid next actions.
- Avoid adding "approve now, fix later" paths that bypass existing state machines.

## Offline, Documents, And Integrations

- Offline workflows must be wired into the offline catalog/runtime and tested; do not mark a screen offline-ready because it stores temporary client state.
- Document/PDF work should use the document template/render-job system in `lib/documents` and `app/api/documents`.
- External integrations should read credentials from environment variables or database-backed provider config, never hardcoded values.

## Scope: Dropped, Parked, And Frozen Modules

The platform deliberately narrowed its scope. Three states, and they mean
different things in review. The register is
`docs/rollout/scope-trim-roadmap.md` — it is the source of truth, and this
section points at it rather than duplicating it.

**Dropped** — code and schema removed, SKU retired. CCTV (including
`cctv-server/`), Autos/car-sales, and scrap metal. Do not reintroduce them, and
do not restore a removed feature key or bundle to make an old test or doc pass;
fix the test or the doc.

**Parked** — the UI is out of the navigation, everything underneath it stays.
Banking reconciliation, financial statements, cost centers and currency rates
(ST-1.2). Their routes, APIs, models and feature keys are intact and are read by
things that are not parked: `accounting.banking` gates the executive dashboard's
cash tiles, `accounting.financial-statements` gates the general-ledger and
cash-flow report APIs, and the posting engine still writes `costCenterId`.
Removing a parked feature's *entitlement* is therefore not the same as parking
it, and breaks surfaces the trim never intended to touch.

**Frozen** — still shipping, still release-blocking, no new stories.
Maintenance (`app/maintenance`, `app/api/work-orders`, `app/api/equipment`)
is frozen: bug fixes only. It stays in the gold and retail bundles and its
`MAINTENANCE_COMPLETION` posting keeps working, so a regression there blocks a
release exactly as it did before — freezing a module retires its roadmap, not
its users. A PR adding a feature to a frozen module should be sent back with a
pointer here.

## Documentation Expectations

Update docs in the same change when you:

- add or change setup commands
- add environment variables
- add or remove module capabilities
- alter feature gating, route topology, or tenant routing
- add operational scripts, workers, or backfills
- add deployment, migration, or release steps
- change UX rules or reusable UI patterns

Use README for developer workflow, `docs/system-reference` for product/system inventory, and domain docs for detailed business behavior.

## Pull Requests

PRs should include:

- concise summary
- linked issue or ticket when available
- schema/database notes, including whether migrations/backfills are required
- test commands run and results
- screenshots or short recordings for UI changes
- rollout notes for feature flags, tenant templates, or production operations

Reviewers should prioritize bugs, regressions, missing tests, data safety, tenant isolation, workflow correctness, and operator impact.

## Gold Agent Team Workflow

Gold work follows stricter boundaries from `AGENTS.md`.

| Agent | Owns | Must not edit |
| --- | --- | --- |
| `gold-tech-lead` | planning, delegation, synthesis | source files |
| `gold-data-foundation` | Prisma schema, migrations, backfills, migration witness tests | app/UI/domain source |
| `gold-domain-backend` | `lib/gold/**`, `lib/accounting/**`, `app/api/gold/**` | Prisma schema and UI files |
| `gold-import-workflow` | gold import APIs, import libraries, worker | UI and unrelated gold APIs |
| `gold-frontend` | `app/gold/**`, `components/gold/**` | APIs, domain libs, Prisma |
| `gold-integration` | HR/disbursement seams, notifications, audit, shared commodity helpers | gold domain core files |
| `gold-reviewer` | review, gates, approval/blocking | source files |

Gold tickets need:

- identified prerequisite tests
- schema prerequisites on main
- cross-epic dependencies noted
- named reviewer who is not the implementer
- `npx tsc --noEmit`, lint, target tests, and reviewer approval before done

Forbidden gold patterns:

- source changes without paired tests for P0 migrations
- schema changes without migration witness tests
- merging on red CI
- "test will come in a follow-up"
- out-of-charter edits without explicit lead approval

## Security

- Secrets belong in `.env` or hosting environment settings only.
- Do not log passwords, tokens, magic links, or raw provider credentials.
- Keep admin and support access flows auditable.
- Treat tenant host checks, `companyId`, feature gates, and role checks as security boundaries.
- Use least privilege for database, Vercel, Blob, email, CCTV, fiscalisation, and webhook credentials.

## Handoff Standard

A change is ready to hand off when:

- code is scoped to the requested behavior
- schema and feature-gate changes are registered everywhere needed
- tests cover the risky behavior
- `npx tsc --noEmit`, `pnpm lint`, and relevant tests pass or are explicitly called out
- docs and operator notes are updated
- no unrelated user work has been reverted
