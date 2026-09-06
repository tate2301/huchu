# Repository Guidelines

## Engineering Principles (Read First)
- Do not preserve backward compatibility. Remove obsolete paths instead of adding compatibility layers, fallbacks, or migrations.
- Choose the simplest implementation that fully meets the current requirements. Avoid speculative abstractions, configuration, and indirection.
- Grow the system in layers. Start from the smallest version that works end to end, and add each new capability on top of a product that already works. Never trade a working product for unfinished complexity.
- Keep components modular and concerns clearly separated.
- Prefer established, well-maintained libraries when they reduce overall complexity or improve reliability. Do not reimplement common functionality without a clear reason.
- Lean on the dependencies already in the project before writing your own implementation or adding packages. Do not assume a library lacks a capability without checking its documentation and types.
- Make architectural decisions for the long term. Do not accept a stopgap that only works for now and is meant to be replaced later.

## Project Structure & Module Organization
This is a pnpm workspace (Turborepo). The split into products is described in
`docs/rollout/product-split-plan.md`; the deployment side in `docs/rollout/product-split-deployment.md`.
- `apps/legacy/` is the application as it ships today: one Next.js host composing every module. `apps/campus/` and `apps/sell/` are product hosts: the same shape with a shorter module list — each its own `manifests.ts`, `modules.ts`, `modules.client.ts`, navigation, management data, workspace catalogue and offline scope, the kernel's `createProxy()` and `createAuthOptions()`, a search route with the arms of the modules it runs, and an `app/` tree that is composed (`pnpm compose apps/<host> platform shell <modules…>`; the command is in each host's README). A change that touches host composition is made in every host; a module change reaches them all through the packages.
  - `app/` holds the App Router routes and feature modules (e.g., `app/shift-report`, `app/gold`).
  - `components/` contains reusable UI and feature components, with primitives in `components/ui`.
  - `lib/` and `hooks/` provide shared utilities and React hooks.
  - `scripts/` includes operational CLI scripts for admin tasks (users, inventory, equipment).
  - `public/` is for static assets; `types/` holds shared TypeScript types.
- `packages/db/` owns the Prisma schema (`prisma/schema/<module>.prisma`), the migrations, the config and the client.
  Import `@corelithzw/db` for types and enums, `@corelithzw/db/client` for `prisma`. Only this package depends on `@prisma/client`.
- `packages/ui/` is the design-system layer (what was `components/ui`, `components/charts`, `lib/icons`, `lib/utils`, …): import `@corelithzw/ui/components/<name>`, `@corelithzw/ui/lib/utils`, `@corelithzw/ui/lib/icons`. It depends on nothing in the workspace; never import a module or the app from it.
- `packages/platform/` is the kernel (what was `lib/platform`, `lib/auth-core`, `lib/admin-portal*`, `lib/preferences`, `lib/uploads`, `lib/api-utils`, `lib/money`, `lib/roles`, …): import `@corelithzw/platform/api-utils`, `@corelithzw/platform/auth-core/guards`, `@corelithzw/platform/tenant`. It depends on `packages/db` only and never names a module or a host: where it needs what only they know it keeps a registry (`registerAuthOptions`, `registerCapabilities`) that the host fills. A host composes itself in two files: `apps/legacy/manifests.ts` (data — the manifests, registered; imported at boot, by the providers in the browser and by the proxy on the edge, so a registry reads the same on every side) `apps/legacy/modules.ts` (server only — the code hooks modules fill for each other: auth options, approval listeners, search arms, document sources; imported from `instrumentation.ts`) and `apps/legacy/modules.client.ts` (both sides — what the offline runtime warms and syncs, which carries sync adapters, so it is code rather than a manifest; imported by the providers in the browser and by `modules.ts`). A test that reads a registry imports `@/manifests`, `@/modules` or `@/modules.client` accordingly. Host-only leftovers live in `apps/legacy/lib/host/` (tenant provisioning, the tests that read the host's composition). The session's shape is the kernel's too: `@corelithzw/platform/auth-core/session-shape` augments next-auth's `Session`, `User` and `JWT` from `AuthSessionClaims`; a host references it from `types/next-auth.d.ts`, and a package whose screens read `session.user` references it the same way from a `next-auth.d.ts` at its root (or a component imports it by path).
- `packages/shell/` is the workspace chrome that knows about roles and features (`@corelithzw/shell/module-shell`, `@corelithzw/shell/navigation`): it depends on `ui` and `platform`, and a module depends on it for its shell. The host registers its navigation model there on every side (`manifests.ts`). The app shell lives there too — `@corelithzw/shell/app-sidebar`, `@corelithzw/shell/navbar`, the command palette, breadcrumbs, the session and appearance providers, the login forms — with slots as props: the host's `components/layout/app-shell.tsx` renders them and passes what names a module (the sidebar model resolver, the CRM's shelves, the navbar's tools and members). The shell never imports a module. The sidebar model is built by the shell (`@corelithzw/shell/workspace-model`) from a host's `WorkspaceCatalogue` — the host's `lib/workspaces.ts` is that catalogue (its modules, profiles and arrangement) and a one-line `getWorkspaceSidebarModel`; a new host writes its own catalogue, never a second builder.
- `packages/modules/<id>/` is a module (`@corelithzw/module-<id>`): its domain, its screens and components, and a data-only `manifest.ts` (`ModuleManifest` from `@corelithzw/platform/manifest`) declaring what it contributes — `requires`, gated `routes`, `permissions.capabilities`, `records.types`, `documents.templates`, `notifications`, `portals` (a portal host the module serves: the roles whose home it is, the roles it admits at sign-in, the paths it serves bare, whether its roles are pinned to it) and `roleRestrictedRoutes` (paths only some roles may reach); the kernel's proxy and auth options read the last two from the registry, so a host's `proxy.ts` is `createProxy()` over its manifests and its `lib/auth.ts` is `createAuthOptions()`. A module imports the kernel packages, npm, and only the modules its manifest requires; `module-boundary.test.ts` in each package holds it to that (helper: `@corelithzw/platform/testing/module-boundary`). A module that has not moved yet still has its manifest in the host (`apps/legacy/lib/<id>/manifest.ts`), so the host composes by manifests today (`registerModules` in `apps/legacy/manifests.ts`). Manifests are data: never import a database client or server code from one (`lib/host/manifests.test.ts` checks), and `manifests.ts` imports a module's manifest by its own path (`@corelithzw/module-<id>/manifest`), never the package entry, which may carry server hooks.
- A module's route handlers live under `packages/modules/<id>/api/**/route.ts` and its screens under `packages/modules/<id>/pages/**/{page,layout,loading,…}.tsx`, on the relative paths a host serves them at. A host's `app/` tree holds one thin file per route and page, re-exporting the module's — generated, never written by hand: `pnpm compose apps/legacy campus` (`scripts/compose-host.mjs`) rewrites them from what each module file exports. Add or change a route in the module, then run it again; a file under a composed directory that is not a re-export is a bug. A route or page in a package reads the session through `@corelithzw/platform/auth-core/session` (`getCurrentAuthSession`), never through a host's `authOptions`. The kernel's routes live in `packages/platform/api/**` and the workspace pages (sign-in, preferences, the users console, the master-data hub, help, status, access blocked, the preview-host page) in `packages/shell/pages/**`, composed the same way (`pnpm compose apps/legacy platform shell …`); what `apps/legacy/app/` holds by hand is the marketing site, the operator console, the executive dashboard, the payment webhooks, the cross-module search, the report hub, and the root layout and page. When a route needs another module's code, it goes through a registry the host fills (`sales-hooks`, `registerFiscalDrainSweep`, `registerRecordSubjectGuard`, a document source's `access`/`authorize`), never a direct import — the boundary test holds each package to its manifest.
- Page chrome and the shared screen furniture live in `packages/ui/layout/*` and `packages/ui/shared/*` (`@corelithzw/ui/layout/page-chrome`, `@corelithzw/ui/shared/status-state`, …); import them from there, never from `apps/legacy/components/layout`, which is the app shell and stays in the host until navigation is data.
- `packages/config/` holds shared TypeScript presets; `packages/modules/` receives modules as they are extracted.
- `scripts/` at the root holds the agent guardrail hooks and `compose-host.mjs`, the host composer.
- `docker/` includes container-related assets.

## Build, Test, and Development Commands
Run from the repository root.
- `pnpm dev` - generate the client and run the local dev server.
- `pnpm build` - build every package (the client, then the production bundle).
- `pnpm legacy start` - serve the production build.
- `pnpm lint` - run ESLint (Next.js core-web-vitals + TypeScript rules).
- `pnpm typecheck` - run `tsc --noEmit` for every package (the app script sets the 7 GB heap it needs).
- `pnpm test` - run Vitest (needs Postgres; `DATABASE_URL_TEST`).
- `pnpm db:generate` - generate the Prisma client.
- `pnpm db:migrate:dev --name <change>` - create a migration from a schema change.
- `pnpm db:push` - push the schema to a throwaway local database only.
- `pnpm legacy <script>` - run any script of the application package. Admin scripts (examples):
  - `pnpm legacy create-user --email user@example.com --name "User" --password "..." --role manager --company-id <uuid>`
  - `pnpm legacy manage-inventory list --company-id <uuid> --category consumables`

## Coding Style & Naming Conventions
- Use TypeScript for new modules and components; keep code consistent with existing 2-space indentation.
- Route and feature folders under `app/` follow kebab-case (e.g., `shift-report`, `plant-report`).
- Prefer clear, domain-oriented names (e.g., `dispatch`, `receipt`, `reconciliation`).
- Run `pnpm lint` before submitting changes; there is no formatter configured, so avoid reformat-only diffs.

## Design System & UX Playbook (Required)
- For every implementation, read `docs/design-system/README.md` first, then read the relevant files in `docs/design-system/` before changing code. These docs contain the canonical design-system setup, tokens, components, composition patterns, rules, reference URLs, and repo migration guidance.
- Follow `docs/ux/platform-ux-playbook.md` for all UX/UI changes.
- `docs/design-system/08-cookbook-patterns.md` carries the distilled cookbook recipes — dashboards, kanban, filterable tables, command palette, grouped lists, save bar, and the table→cards rule for mobile. Read it before building any of those shapes; it saves fetching the site.
- Treat design-system and playbook rules as default system behavior unless a task explicitly overrides them.
- Key non-negotiables:
  - One table per active view; use vertical tabs for multi-table contexts.
  - Keep DataTable controls in one row (search + submit, filters, pagination).
  - Use full-bleed primary tables and progressive disclosure patterns.
  - Use expandable parent rows for parent-child workflows when applicable.
  - Apply typographic hierarchy and `font-mono` for numeric/time values.

## Testing Guidelines
- `pnpm test` runs Vitest across the workspace; CI (`.github/workflows/ci.yml`) runs lint, typecheck, the tests against a migrated Postgres, the feature-gate audit, the schema drift check and the build on every pull request.
- Use `.test.ts` or `.test.tsx` naming and colocate tests with the feature.
- Tests that need a database say so in their header and use the `DATABASE_URL_TEST` database, which must have the migrations applied.

## Commit & Pull Request Guidelines
- Recent history favors Conventional Commits (e.g., `feat: add shift report filters`). Follow that style for new commits.
- PRs should include: a concise summary, linked issue (if any), and UI screenshots when behavior or layout changes.
- Call out database changes explicitly. A schema change ships with its migration under `packages/db/prisma/migrations/`; production applies it through the database release workflow, expand-first.

## Security & Configuration Tips
- Secrets belong in `.env` only; never commit credentials.
- For database and production setup, follow `docs/_start-here/DATABASE_SETUP.md`, `docs/_start-here/PRODUCTION_DEPLOYMENT.md` and `docs/rollout/product-split-deployment.md`.

---

## Gold Agent Team

### Agent roster

Paths below are relative to `apps/legacy/` unless they start with `packages/`.

| Agent | Charter (owns) | Forbidden from |
|---|---|---|
| `gold-tech-lead` | Plans, delegates, synthesises — no code | All source files |
| `gold-data-foundation` | `packages/db/prisma/schema/gold.prisma`, `packages/db/prisma/migrations/`, `scripts/backfill-*.ts`, migration witness tests | `app/`, `components/`, `packages/modules/gold/gold/*.ts` source |
| `gold-domain-backend` | `packages/modules/gold/gold/**`, `packages/modules/books/**`, `app/api/gold/**` | `packages/db/prisma/`, UI files |
| `gold-import-workflow` | `app/api/gold/imports/**`, `packages/modules/gold/gold/import-*`, worker | UI, other Gold APIs |
| `gold-frontend` | `app/gold/**`, `packages/modules/gold/components/gold/**` | `app/api/**`, `lib/**`, `packages/db/prisma/` |
| `gold-integration` | HR/disbursement seams, notifications, audit, shared commodity helpers | Domain core files |
| `gold-reviewer` | Reads diffs, runs gates, approves/blocks — no code | All source files |

Since Phase 2.3i the Gold domain and screens live in `packages/modules/gold` (`gold/`, `settlements/`, `operations/`, `dashboard/`, `components/`), the ledger in `packages/modules/books`; the API routes under `apps/legacy/app/api/gold` and the pages under `apps/legacy/app/gold` stay in the host. The charters above name the new paths.

### Workflow per ticket

1. **Lead** verifies Definition-of-Ready (test prereqs named, schema deps clear, reviewer assigned).
2. **Lead** spawns the specialist in a worktree (`isolation: "worktree"`) with a precise prompt: file paths, API contracts, DoD from the epic, reviewer name.
3. **Specialist** works. Charter hook warns on out-of-zone edits. Paired-test hook warns on source-without-test.
4. **Specialist** messages lead when done with a summary.
5. **Lead** invokes `gold-reviewer` against the diff.
6. **Reviewer** runs `tsc --noEmit`, lint, target tests, checks DoD checklist. Blocks or approves.
7. **Human** merges.

### Definition-of-Ready (DoR)

A ticket cannot start until:
- The relevant test in Epic 5a/5b is identified (if none exists, that test ticket goes first)
- Schema prerequisites are on `main`
- Cross-epic dependencies are noted as Jira "blocked by" links
- A reviewer is named who is not the implementer

### Definition-of-Done (DoD)

A ticket is done when:
- `pnpm typecheck` passes (plain `npx tsc --noEmit` dies at exit 134 — Node's
  default 4GB heap is not enough for this project, even on an idle machine)
- `npx eslint <changed files>` produces zero new errors
- Target tests pass
- If a P0 migration: migration witness test ships in the same commit
- `gold-reviewer` has approved

### Forbidden patterns

- Source change without a paired test (for P0 migrations — no exceptions)
- Schema change without a migration witness test
- Merging on red CI
- "I'll add the test in a follow-up"
- Any agent editing files outside its charter without explicit lead approval
