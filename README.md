# Huchu Operations Platform

Huchu is a multi-tenant operations and ERP platform built on Next.js, Prisma, PostgreSQL, and feature-gated workspace modules. The same runtime powers tenant workspaces, external portals, platform administration, industry packs, reporting, document output, and operator tooling.

This README is the developer entry point. For deeper product context, start with `docs/system-reference/README.md`, then use this file for day-to-day setup, commands, and contribution workflow.

## Current Checkout Footprint

This repository is broad. In the current checkout:

- `273` App Router page files live under `app/`.
- `449` API route handlers live under `app/api/`.
- `295` Prisma models live in `packages/db/prisma/schema/`, one file per module.
- `31` Vitest files and `1` Playwright spec are present.
- Core workspace families include gold, scrap metal, schools, retail/POS, auto sales, accounting, HR/payroll, stores, maintenance, compliance, CCTV, reports, admin, and platform management.

## Stack

- Next.js 16 App Router
- React 19
- TypeScript 5.9
- Prisma 7 with `@prisma/adapter-pg`
- PostgreSQL
- NextAuth 4
- Tailwind CSS 4
- Radix UI, Base UI, and shared custom UI primitives
- React Query, React Hook Form, Zod
- Vitest for unit/integration tests
- Playwright for browser smoke/e2e tests
- Ink and `vite-node` for the platform operator TUI

Use Node.js 20+; Node 24 is known to work in this workspace. Use pnpm through Corepack.

## Workspace Layout

This is a pnpm workspace with Turborepo. The platform is being split into products that
share one kernel (`docs/rollout/product-split-plan.md`); Phase 1 put the monorepo around
the monolith without changing what runs in production.

| Path | Purpose |
| --- | --- |
| `apps/legacy/` | The application as it ships today — every module in one Next.js host. Renamed to `apps/enterprise` once the products have their own hosts. |
| `packages/db/` | The database: one Prisma schema split one file per module, one generated client, one migration history. Import `@corelithzw/db` for types and enums, `@corelithzw/db/client` for the connection. |
| `packages/ui/` | The design-system layer: wrappers around `@corelithzw/react`, charts, icons, hooks, `cn`, the page chrome (`layout/`) and shared screen furniture (`shared/`). Domain-free. Import by path: `@corelithzw/ui/components/button`. |
| `packages/platform/` | The kernel: tenancy and entitlements, feature gating, the auth core and guards, roles, API utilities, money, ids, uploads, preferences. Depends on `packages/db` only. Import by path: `@corelithzw/platform/api-utils`. The host fills its registries at boot in `apps/legacy/modules.ts`. |
| `packages/config/` | Shared TypeScript presets. |
| `packages/shell/` | The workspace chrome that knows about roles and features: the navigation registry the host fills, and the module shell every module's screens sit in. Depends on `ui` and `platform`. Import by path: `@corelithzw/shell/module-shell`. |
| `packages/modules/` | The modules, one package each (`@corelithzw/module-<id>`), each with a data-only manifest the host composes with. So far: `workflow`, `notifications`, `records`, `documents`, `books`, `people`. |
| `scripts/` | Repository-level tooling: the agent guardrail hooks. Operational scripts live in `apps/legacy/scripts/`. |
| `docs/`, `design/`, `docker/` | Documentation, design assets, container assets. |
| `.github/workflows/` | CI on every pull request; the database release job for production migrations. |

Run everything from the repository root: `pnpm dev`, `pnpm build`, `pnpm lint`,
`pnpm typecheck`, `pnpm test` go through Turborepo; `pnpm db:*` delegates to the database
package; `pnpm legacy <script>` runs any script of the application package
(for example `pnpm legacy worker:pdf`, `pnpm legacy create-company --name Acme`).

## Application Map (`apps/legacy/`)

| Path | Purpose |
| --- | --- |
| `app/` | Next.js App Router pages, layouts, and API routes. Feature modules are grouped by route family. |
| `app/api/` | Route handlers. Newer industry and portal APIs often use `app/api/v2`. |
| `components/` | Reusable UI and feature components. Base primitives live in `components/ui`. |
| `lib/` | Domain services, shared utilities, auth, platform gating, offline runtime, accounting, and vertical business logic. |
| `hooks/` | Shared React hooks. |
| `scripts/` | Operational CLI scripts, platform TUI, backfills, and worker scripts. |
| `e2e/` | Playwright tests. |
| `public/` | Static assets, PWA assets, service worker, fonts, and uploads used in local/dev flows. |
| `types/` | Shared TypeScript declaration files. |

## Quick Start

1. Enable Corepack if needed:

```bash
corepack enable
```

2. Install dependencies:

```bash
pnpm install
```

3. Create local environment variables:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

4. Set at least these values in `.env`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/huchu_mines?schema=public"
NEXTAUTH_SECRET="replace-with-a-long-random-secret"
NEXTAUTH_URL="http://localhost:3000"
PLATFORM_ROOT_DOMAIN=""
PLATFORM_ROOT_HOSTS="localhost:3000"
ADMIN_ROOT_DOMAIN=""
```

5. Generate Prisma Client:

```bash
pnpm db:generate
```

6. Push the schema to a local development database:

```bash
pnpm db:push
```

`db:push` mutates the target database and does not create a migration. Use it for local development databases. For shared environments and production-intended schema work, create/review migrations and follow the database workflow below.

7. Create minimum tenant data:

```bash
pnpm create-company --name "Acme Mine" --slug acme
pnpm create-site --name "Main Site" --code MAIN
pnpm create-user --email admin@example.com --name "Admin User" --password "change-me" --role superadmin
pnpm templates:seed-defaults
```

If more than one company exists, pass `--company-id <uuid>` to scripts that support it.

8. Start development:

```bash
pnpm dev
```

Open `http://localhost:3000/login`.

## Fixing `pnpm db:push` Ignored Builds

If `pnpm db:push` fails with:

```text
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: @prisma/engines, prisma, esbuild, sharp, unrs-resolver, ...
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
```

The failure is from pnpm's dependency build approval gate, not from Prisma or PostgreSQL. Prisma commands trigger pnpm's dependency status check, and pnpm stops when packages with lifecycle scripts are still undecided.

This repo tracks build-script decisions in `pnpm-workspace.yaml`:

- approved: `@prisma/engines`, `prisma`, `esbuild`, `sharp`, `unrs-resolver`
- denied: `core-js`

After a fresh clone or after changing the approval file, run:

```bash
pnpm install
pnpm db:generate
pnpm db:push
```

If new packages appear in the ignored-builds error, review them and record explicit decisions. For example:

```bash
pnpm approve-builds @prisma/engines prisma esbuild sharp unrs-resolver '!core-js'
pnpm install
```

Commit the resulting `pnpm-workspace.yaml` change so other developers do not hit the same blocker.

## Day-To-Day Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Generate the Prisma client, then start the Next.js dev server for `apps/legacy`. |
| `pnpm build` | Build every package: generate the client, then the production bundle. |
| `pnpm legacy start` | Start the built production app. |
| `pnpm lint` | Run ESLint. |
| `pnpm typecheck` | Run the TypeScript compiler check (the app needs a 7 GB heap; the script sets it). |
| `pnpm test` | Run Vitest once. Needs Postgres — see `docs/_start-here/LOCAL_DEV.md`. |
| `pnpm legacy test:watch` | Run Vitest in watch mode. |
| `pnpm test:e2e` | Run Playwright tests. Starts the dev server unless `E2E_BASE_URL` is set. |
| `pnpm db:generate` | Generate the Prisma client. |
| `pnpm db:migrate:dev` | Create a migration from a schema change. |
| `pnpm db:migrate:status` | Applied and pending migrations for `DATABASE_URL`. |
| `pnpm db:check:drift` | Prove the migrations produce the schema (scratch database). |
| `pnpm db:push` | Push the schema to a throwaway local database. |
| `pnpm legacy db:prepare:platform` | Backfill legacy company rows for platform tenancy fields. |
| `pnpm legacy templates:seed-defaults` | Seed or update default document templates. |
| `pnpm legacy worker:pdf` | Run the PDF render worker loop. |

## Operational CLI Scripts

Scripts live in `apps/legacy/scripts/` and run through `pnpm legacy <script>`. They read the
repository-root `.env` (or `apps/legacy/.env`), connect to `DATABASE_URL`, and use the Prisma
PostgreSQL adapter.

| Command | Purpose |
| --- | --- |
| `pnpm legacy create-company --name <name> [--slug <slug>]` | Create a tenant company. |
| `pnpm legacy create-site --name <name> --code <code> [--company-id <uuid>]` | Create a site. |
| `pnpm legacy create-user --email <email> --name <name> --password <password> --role <superadmin|manager|clerk> [--company-id <uuid>]` | Create an app user. |
| `pnpm legacy create-employee --name <name> --phone <phone> ...` | Create an employee record. |
| `pnpm legacy manage-employees ...` | List, show, update, activate, deactivate, or delete employees. |
| `pnpm legacy manage-inventory ...` | List, show, create, update, or delete inventory items. |
| `pnpm legacy manage-equipment ...` | List, show, create, update, activate, deactivate, or delete equipment. |
| `pnpm legacy platform --actor <email>` | Start the Ink platform operator TUI. |
| `pnpm legacy platform --actor <email> --read-only` | Start the platform TUI in read-only mode. |
| `pnpm legacy manage-platform ...` | Legacy/automation-friendly platform admin command mode. |
| `pnpm legacy platform:audit-feature-gates` | Audit platform feature-gate configuration. |
| `pnpm legacy platform:accounting-replay` | Replay accounting integration events. |
| `pnpm legacy platform:accounting-backfill-events` | Backfill accounting integration events. |
| `pnpm legacy backfill:gold-valuations` | Backfill gold valuation data. |
| `pnpm legacy backfill:gold-accounting-usd` | Backfill gold accounting USD values. |

Run any script with `--help` for exact flags when available.

## After Adding A Module

When a new module, vertical, or major surface is added, update all relevant layers instead of only adding pages:

1. Data model:
   - Add or update Prisma models in `prisma/schema.prisma`.
   - Add a migration under `prisma/migrations` for shared/prod-bound schema work.
   - Run `pnpm db:generate`.
   - Use `pnpm db:push` only against local development databases.
   - P0 migrations must ship with a migration witness test.

2. Domain logic:
   - Put reusable business rules in `lib/<domain>/`.
   - Keep API handlers thin; validation, calculations, posting, reconciliation, and workflow transitions belong in domain services where possible.
   - Add targeted `.test.ts` or `.test.tsx` files beside the risky logic.

3. API routes:
   - Add route handlers under `app/api/<domain>/` or `app/api/v2/<domain>/`.
   - Use existing shared API helpers and auth/session utilities.
   - Include tenant scoping through `companyId` unless the model is explicitly platform-global.

4. UI routes and components:
   - Add pages under `app/<module>/`.
   - Put reusable feature UI in `components/<module>/`.
   - Follow `docs/ux/platform-ux-playbook.md`.

5. Feature and navigation registration:
   - Update `lib/platform/feature-catalog.ts` for feature keys, bundles, or tier exposure.
   - Update route mapping in `lib/platform/gating/route-registry.ts`.
   - Update workspace routing/navigation where relevant: `lib/navigation.ts`, `lib/workspaces.ts`, and `lib/workspace-products.ts`.
   - Update client templates in `lib/platform/client-templates.ts` if the module should be enabled by tenant profile.

6. Cross-cutting integration:
   - Add notifications in `lib/notifications.ts` when users need workflow feedback.
   - Add audit/event records for sensitive operations.
   - Add document templates/rendering support if the module produces official PDFs.
   - Add offline catalog/runtime support only when the workflow has explicit offline requirements.

7. Validation:
   - Run `npx tsc --noEmit`.
   - Run `pnpm lint`.
   - Run targeted tests, then `pnpm test` when the change touches shared logic.
   - Run `pnpm test:e2e` for browser-critical flows or when route/auth/portal behavior changes.
   - Run `pnpm build` before release or for risky framework/config changes.

8. Documentation:
   - Update this README if the setup or command surface changes.
   - Update `CONTRIBUTING.md` if the workflow changes.
   - Update `docs/system-reference/*` when route/API/product capabilities change materially.
   - Update relevant domain docs under `docs/`.

## Architecture Notes Developers Should Know

- `Company` is the main tenant boundary. Most operational records should be scoped by `companyId`.
- Host-based routing and tenant enforcement live in `proxy.ts` and `lib/platform/tenant.ts`.
- Feature access is cataloged in `lib/platform/feature-catalog.ts` and enforced through platform gating utilities plus route registry mappings.
- Navigation is feature-aware. Adding a page usually also means updating navigation and route gating.
- Auth uses NextAuth with credentials for tenant users and admin email-link flow for the platform admin host.
- Prisma 7 is configured with `@prisma/adapter-pg`; use `lib/prisma.ts` instead of creating ad hoc Prisma clients in app code.
- Document rendering uses Chromium and Vercel Blob-aware artifact storage. See `lib/documents/*`, `app/api/documents/*`, and `pnpm worker:pdf`.
- Offline support exists in `lib/offline/*` and some vertical runtimes; do not claim a new workflow is offline-ready unless it is wired into the offline catalog/runtime and tested.
- CCTV has app APIs plus separate conversion/gateway context in `cctv-server/`.
- Accounting/fiscalisation flows are event and posting oriented. Preserve source traceability for finance-impacting writes.

## Domain Surface Map

- Platform core: tenancy, feature gating, subscriptions, bundles, branding, admin portal, support access, runbooks, audit, health, and commercial controls.
- Operations: shift reports, attendance, plant reports, dashboards, and operational reporting.
- Gold: pours, purchases, dispatches, receipts, payouts, shift allocations, imports, corrections, reconciliation, period close, valuation, and audit.
- Scrap metal: materials, sellers, pricing, purchases, batches, sales, settlements, offline ticketing, scale integration, and compliance.
- HR/payroll: employees, departments, job grades, shift groups, incidents, disciplinary actions, compensation, payroll, disbursements, and approvals.
- Stores/maintenance/compliance: inventory, stock movements, fuel ledger, equipment, work orders, downtime, permits, inspections, incidents, and training records.
- Accounting: chart of accounts, journals, posting rules, periods, AR/AP, banking, tax, VAT, fiscalisation, assets, budgets, cost centers, currency, and reports.
- Schools: students, guardians, teachers, classes, subjects, attendance, results, fees, boarding, notices, reports, and parent/student/teacher portals.
- Retail/POS/thrift-facing surfaces: catalog, purchasing, goods receipts, promotions, POS, shifts, sales, refunds, voids, held carts, and POS portal.
- Auto sales: leads, vehicle inventory, deals, reservation/contract transitions, financing, and payments.
- CCTV: cameras, NVRs, live streams, playback, events, access logs, stream tokens, and gateway integration.

## UX Rules

All UX/UI work must follow `docs/ux/platform-ux-playbook.md`.

Key rules:

- One table per active view.
- Use vertical tabs for multi-table contexts.
- Keep DataTable search, submit, filters, rows-per-page, and pagination in one aligned row.
- Prefer full-bleed primary tables and progressive disclosure.
- Use expandable parent rows for parent-child workflows where appropriate.
- Use the canonical status vocabulary from the playbook.
- Use `font-mono` for numeric and time-heavy values.
- Keep operational screens dense, calm, and scannable.

## Testing

There is now a configured automated test surface:

- Unit/integration tests: `pnpm test`
- Watch mode: `pnpm test:watch`
- Browser tests: `pnpm test:e2e`
- Type checking: `npx tsc --noEmit`
- Linting: `pnpm lint`

Tests are colocated as `.test.ts` or `.test.tsx`. Existing coverage is concentrated in gold, offline runtime, accounting-adjacent utilities, platform entitlements, notifications, marketing pricing, and selected API routes.

When adding code:

- Add targeted tests for domain rules, workflow transitions, calculations, imports, posting, offline logic, auth/gating, and API behavior.
- Add Playwright coverage for critical login, route, portal, and browser workflow changes.
- Do not defer a required test to a follow-up.

## Database Workflow

Local-only schema experimentation can use:

```bash
pnpm db:generate
pnpm db:push
```

For shared, production-bound, or risky schema work:

1. Update `prisma/schema.prisma`.
2. Add a migration in `prisma/migrations`.
3. Add or update paired tests.
4. Run `pnpm db:generate`.
5. Run `npx tsc --noEmit`, `pnpm lint`, and target tests.
6. Document whether operators must run `pnpm db:push`, a migration command, or a backfill.

Use the existing backfill scripts as references for production data repair and historical data enrichment. Gold P0 migrations require witness tests in the same commit.

## Environment Variables

See `.env.example` for a copyable template. Important variables include:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string used by Prisma, scripts, and workers. |
| `DATABASE_URL_LOCAL` | Optional convenience connection string for local workflows. |
| `NEXTAUTH_SECRET` | Required secret for NextAuth JWT/session signing. |
| `NEXTAUTH_URL` | Public app URL for auth callbacks. |
| `PLATFORM_ROOT_DOMAIN` | Enables strict tenant subdomain routing when set. |
| `PLATFORM_ROOT_HOSTS` | Comma-separated central/root hosts allowed for the platform. |
| `ADMIN_ROOT_DOMAIN` | Admin wildcard/root domain. |
| `ADMIN_PORTAL_HOST` | Optional exact admin portal host override. |
| `ADMIN_PORTAL_EMAIL` / `ADMIN_PORTAL_ALLOWED_EMAILS` | Admin magic-link allowlist. |
| `ADMIN_MAGIC_LINK_RESEND_API_KEY` / `ADMIN_MAGIC_LINK_WEBHOOK_URL` | Admin magic-link delivery. |
| `BLOB_READ_WRITE_TOKEN` | Required for Vercel Blob uploads/artifacts. |
| `PDF_INLINE_BATCH_LIMIT` | Inline PDF render route batch limit. |
| `PDF_WORKER_INTERVAL_MS` / `PDF_WORKER_IDLE_MS` | PDF worker polling controls. |
| `PG_POOL_MAX`, `PG_POOL_IDLE_MS`, `PG_POOL_CONN_MS` | PostgreSQL pool tuning. |
| `PRISMA_TX_MAX_WAIT_MS`, `PRISMA_TX_TIMEOUT_MS` | Prisma transaction tuning. |
| `PRISMA_PROVISION_TX_*` | Platform provisioning transaction tuning. |
| `CCTV_GATEWAY_URL`, `CCTV_WEBRTC_URL`, `CCTV_HLS_BASE_URL`, `GATEWAY_KEY` | CCTV gateway and stream integration. |
| `SCRAP_SCALE_HELPER_URL` | Optional scrap metal scale helper integration. |
| `NEXT_PUBLIC_MARKETING_SITE_URL` | Canonical marketing site origin. |
| `MARKETING_DEMO_WEBHOOK_URL` | Optional demo request webhook. |
| `FEATURE_GATE_POLICY`, `NEXT_PUBLIC_FEATURE_GATE_POLICY` | Feature-gate policy selection. |
| `FEATURE_GATES_BYPASS`, `FEATURE_GATES_BYPASS_KEYS` | Break-glass feature-gate bypass controls. |
| `PLATFORM_VERCEL_PROJECT_ID`, `PLATFORM_VERCEL_TEAM_ID`, `PLATFORM_VERCEL_TOKEN` | Tenant domain provisioning on Vercel. |

Never commit `.env` or real credentials.

## Local DNS And Portals

Plain `localhost:3000` is enough for many local flows. To test strict tenant and portal host behavior, use local DNS entries.

Example `.env` shape:

```env
NEXTAUTH_URL="http://apps.pagka.local:3000"
PLATFORM_ROOT_DOMAIN="apps.pagka.local"
PLATFORM_ROOT_HOSTS="apps.pagka.local,apps.pagka.local:3000"
ADMIN_ROOT_DOMAIN="admin.pagka.local"
```

Example Windows hosts entries in `C:\Windows\System32\drivers\etc\hosts`:

```text
127.0.0.1 apps.pagka.local
127.0.0.1 acme.apps.pagka.local
127.0.0.1 pos.acme.apps.pagka.local
127.0.0.1 parents.acme.apps.pagka.local
127.0.0.1 students.acme.apps.pagka.local
127.0.0.1 staff.acme.apps.pagka.local
127.0.0.1 portal.admin.pagka.local
```

Useful local URLs:

- `http://acme.apps.pagka.local:3000/login`
- `http://pos.acme.apps.pagka.local:3000/login`
- `http://parents.acme.apps.pagka.local:3000/login`
- `http://students.acme.apps.pagka.local:3000/login`
- `http://staff.acme.apps.pagka.local:3000/login`
- `http://portal.admin.pagka.local:3000/admin/login`

If `.local` clashes with mDNS on a machine, switch to a `.test` or `.localhost` convention and update env/hosts consistently.

## Documentation Map

- `CONTRIBUTING.md` - contribution workflow, quality gates, PR expectations, and gold agent boundaries.
- `docs/system-reference/README.md` - product/system handbook entry point.
- `docs/system-reference/live-capabilities.md` - capability inventory, useful for product and QA context.
- `docs/system-reference/route-and-surface-inventory.md` - route/API footprint snapshot. Refresh when major surfaces change.
- `docs/ux/platform-ux-playbook.md` - canonical UX/UI rules.
- `docs/_start-here/LOCAL_DEV.md` - clone to signed-in tenant, plus Windows/macOS/Linux hosts config for tenant and portal hosts.
- `docs/_start-here/DATABASE_SETUP.md` - detailed PostgreSQL setup notes.
- `docs/_start-here/PRODUCTION_DEPLOYMENT.md` - deployment setup notes.
- `docs/accounting/zimra-fiscalisation.md` - accounting fiscalisation notes.
- `cctv-server/*.md` - CCTV gateway/conversion setup notes.

## Deployment Notes

Production is designed around PostgreSQL, NextAuth, tenant root/wildcard domains, admin wildcard domains, and Vercel-compatible hosting.

Before production deployment:

1. Configure PostgreSQL and secure `DATABASE_URL`.
2. Set `NEXTAUTH_SECRET` and production `NEXTAUTH_URL`.
3. Configure tenant root and wildcard domains.
4. Configure admin root/wildcard domains.
5. Configure Blob, PDF, CCTV, fiscalisation, email-link, and webhook integrations as needed.
6. Run migrations/backfills required for the release.
7. Verify tenant login, cross-tenant blocking, admin login, portal routing, feature gating, and key reports.

See `docs/_start-here/PRODUCTION_DEPLOYMENT.md` for the longer checklist.

## Troubleshooting

### `pnpm db:push` fails with ignored builds

Run `pnpm install` after confirming `pnpm-workspace.yaml` has explicit `allowBuilds` booleans. See the ignored-builds section above.

### Prisma Client not found or stale

```bash
pnpm db:generate
```

### Database connection fails

Check `DATABASE_URL`, verify PostgreSQL is running, and confirm the database exists.

### Tenant login redirects unexpectedly

Check `PLATFORM_ROOT_DOMAIN`, `PLATFORM_ROOT_HOSTS`, `NEXTAUTH_URL`, hosts-file entries, and the company slug/allowed hosts.

### Admin portal is blocked

Use the admin host configured by `ADMIN_ROOT_DOMAIN` or `ADMIN_PORTAL_HOST`, and confirm the email is allowed by `ADMIN_PORTAL_EMAIL` or `ADMIN_PORTAL_ALLOWED_EMAILS`.

### PDF rendering fails

Run `pnpm db:generate`, confirm `BLOB_READ_WRITE_TOKEN` when artifact storage is required, and check Chromium output tracing in `next.config.ts`.

## License

Copyright 2026 Huchu Enterprises. All rights reserved.
