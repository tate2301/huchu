# Repository Guidelines


## Project Structure & Module Organization
- `app/` holds the Next.js App Router routes and feature modules (e.g., `app/shift-report`, `app/gold`).
- `components/` contains reusable UI and feature components, with primitives in `components/ui`.
- `lib/` and `hooks/` provide shared utilities and React hooks.
- `prisma/` contains the Prisma schema and database configuration.
- `scripts/` includes operational CLI scripts for admin tasks (users, inventory, equipment).
- `public/` is for static assets; `types/` holds shared TypeScript types.
- `docker/` includes container-related assets.

## Build, Test, and Development Commands
- `pnpm dev` - run the local dev server.
- `pnpm build` - build the production bundle.
- `pnpm start` - serve the production build.
- `pnpm lint` - run ESLint (Next.js core-web-vitals + TypeScript rules).
- `pnpm db:generate` - generate the Prisma client.
- `pnpm db:push` - push the schema to the database (dev workflow).
- Admin scripts (examples):
  - `pnpm create-user --email user@example.com --name "User" --password "..." --role manager --company-id <uuid>`
  - `pnpm manage-inventory list --company-id <uuid> --category consumables`

## Coding Style & Naming Conventions
- Use TypeScript for new modules and components; keep code consistent with existing 2-space indentation.
- Route and feature folders under `app/` follow kebab-case (e.g., `shift-report`, `plant-report`).
- Prefer clear, domain-oriented names (e.g., `dispatch`, `receipt`, `reconciliation`).
- Run `pnpm lint` before submitting changes; there is no formatter configured, so avoid reformat-only diffs.

## Testing Guidelines
- There is no automated test runner configured yet (`package.json` has no `test` script).
- For now, validate changes with `pnpm lint` and a manual smoke test of affected screens.
- If you add tests, use `.test.ts` or `.test.tsx` naming and colocate with the feature; add a `test` script in `package.json` and document it here.

## Commit & Pull Request Guidelines
- Recent history favors Conventional Commits (e.g., `feat: add shift report filters`). Follow that style for new commits.
- PRs should include: a concise summary, linked issue (if any), and UI screenshots when behavior or layout changes.
- Call out database changes explicitly and note whether `pnpm db:push` or migrations are required.

## Security & Configuration Tips
- Secrets belong in `.env` only; never commit credentials.
- For database and production setup, follow `DATABASE_SETUP.md` and `PRODUCTION_DEPLOYMENT.md`.
