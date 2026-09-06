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
- `apps/legacy/` is the application as it ships today: one Next.js host composing every module.
  - `app/` holds the App Router routes and feature modules (e.g., `app/shift-report`, `app/gold`).
  - `components/` contains reusable UI and feature components, with primitives in `components/ui`.
  - `lib/` and `hooks/` provide shared utilities and React hooks.
  - `scripts/` includes operational CLI scripts for admin tasks (users, inventory, equipment).
  - `public/` is for static assets; `types/` holds shared TypeScript types.
- `packages/db/` owns the Prisma schema (`prisma/schema/<module>.prisma`), the migrations, the config and the client.
  Import `@corelithzw/db` for types and enums, `@corelithzw/db/client` for `prisma`. Only this package depends on `@prisma/client`.
- `packages/ui/` is the design-system layer (what was `components/ui`, `components/charts`, `lib/icons`, `lib/utils`, …): import `@corelithzw/ui/components/<name>`, `@corelithzw/ui/lib/utils`, `@corelithzw/ui/lib/icons`. It depends on nothing in the workspace; never import a module or the app from it.
- `packages/config/` holds shared TypeScript presets; `packages/modules/` receives modules as they are extracted.
- `scripts/` at the root holds the agent guardrail hooks only.
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
| `gold-data-foundation` | `packages/db/prisma/schema/gold.prisma`, `packages/db/prisma/migrations/`, `scripts/backfill-*.ts`, migration witness tests | `app/`, `components/`, `lib/gold/*.ts` source |
| `gold-domain-backend` | `lib/gold/**`, `lib/accounting/**`, `app/api/gold/**` | `packages/db/prisma/`, UI files |
| `gold-import-workflow` | `app/api/gold/imports/**`, `lib/gold/import-*`, worker | UI, other Gold APIs |
| `gold-frontend` | `app/gold/**`, `components/gold/**` | `app/api/**`, `lib/**`, `packages/db/prisma/` |
| `gold-integration` | HR/disbursement seams, notifications, audit, shared commodity helpers | Domain core files |
| `gold-reviewer` | Reads diffs, runs gates, approves/blocks — no code | All source files |

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
