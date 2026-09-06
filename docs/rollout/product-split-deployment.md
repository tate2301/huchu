# Product split — what changes in production, and how to set it up

**Status:** Phase 1 of `product-split-plan.md` executed in the repository. Nothing in
this document has been applied to the Vercel project or the production database yet;
every step that touches them is marked **operator** and is done by the account owner.
**Last updated:** 2026-09-06.

This is the deployment side of the split: what is different about how the platform is
built and deployed now that the repository is a workspace, the exact settings to change
before the Phase 1 pull request merges, how migrations reach production from now on, and
what a product host will need when Phase 3 cuts the first product out.

## 1. What changed, in one table

| Concern | Before | After Phase 1 | Production impact |
|---|---|---|---|
| Repository layout | The app at the repository root | The app at `apps/legacy/`; the database at `packages/db/`; workspace root holds `turbo.json`, `pnpm-workspace.yaml`, CI | None by itself — but Vercel must be told where the app now lives (§2) |
| What is deployed | The one app, from the root | The same app, from `apps/legacy` | Same code, same routes, same hosts, same env vars |
| Build | `prisma generate && next build` at the root | `apps/legacy`'s `build` script: generate the client from `packages/db`, then `next build`; Turborepo for local and CI builds | The Vercel build command stays on its default |
| Prisma client | Generated into the root's `@prisma/client` | Generated into `packages/db`'s `@prisma/client`; every import goes through `@corelithzw/db` (types) or `@corelithzw/db/client` (connection) | None at runtime — same generator, same engine, same queries |
| Schema | `prisma/schema.prisma`, one 11k-line file | `packages/db/prisma/schema/<module>.prisma`, one file per module; verified zero-diff against the old file and against the migration history | None — the database does not change |
| Migrations | Applied by an operator running `prisma migrate deploy` | Applied by the **database release** GitHub Actions job on merge to `main` (§4) — once enabled; until then, exactly as before | A one-time setup (a secret and a variable); expand-first from then on |
| Migration history | Failed on an empty database (migration 61 assumed a column that migration 63 creates) | Applies cleanly to an empty database; CI proves it on every pull request | None for the production database — the migration is already applied there, and `migrate deploy` never re-runs or re-verifies applied migrations (checked) |
| CI | None (Vercel's build was the only gate) | `.github/workflows/ci.yml`: install, Prisma dependency guard, schema validation, migrations-vs-schema drift check, typecheck, feature-gate audit, tests against a migrated Postgres, build; lint reported, not yet blocking | Pull requests get a real gate; recommend requiring it in branch protection (§5) |
| Local `.env` | Repository root | Repository root still works for everything; `apps/legacy/.env` and `packages/db/.env` are honoured first when present | None |
| Domains, DNS, TLS, tenant hosts, portal hosts, the Vercel API provisioning | — | Unchanged | None |
| Environment variables | — | Unchanged; no new variable is required | None |
| The database | — | Unchanged | None |
| Session cookies, auth, feature gates | — | Unchanged | None |
| Boot (Phase 2.2) | Nothing registered at start-up | `apps/legacy/instrumentation.ts` imports `modules.ts` once per Node.js server start, which registers NextAuth's options and the CRM's capability set with the kernel (`packages/platform`) | None: `instrumentation.ts` is a standard Next.js file, runs on every cold start of a Vercel function, and needs no configuration. If a request ever fails with `No auth options registered`, the registration did not run: check the instrumentation file is present and the runtime is `nodejs` |

Everything above the line "Domains" is a build-and-deploy concern. Nothing a tenant sees
changes.

## 2. Operator: the Vercel project, before the pull request merges

The existing project (`huchu-gel9`) keeps serving `*.apps.corelith.co.zw`, the admin host
and every tenant portal host. One setting changes: where in the repository the app lives.

Do this **before** merging, so the pull request's preview deployment proves the setup and
the merge to `main` builds first time:

1. **Root Directory.** Project → Settings → General → *Root Directory*: set to
   `apps/legacy`. Leave *Include source files outside of the Root Directory in the Build
   Step* **enabled** — the build needs `packages/db`, the lockfile and the pnpm store at
   the repository root.
2. **Framework and commands.** Framework Preset stays *Next.js* (Vercel detects it inside
   the root directory). Leave *Build Command*, *Output Directory* and *Install Command* on
   their defaults: Vercel installs the whole workspace from the repository root because it
   finds `pnpm-workspace.yaml` there, then runs the app's own `build` script, which
   generates the Prisma client and runs `next build`. In the build log expect
   `Running "pnpm run build"` inside `apps/legacy`; if it shows `next build` directly
   without the client having been generated, override *Build Command* with
   `pnpm run build`.
3. **Package manager.** The root `package.json` pins `"packageManager": "pnpm@10.33.0"`,
   which Vercel honours through Corepack. No setting to change; confirm the build log
   says pnpm 10.
4. **Node.js version.** Unchanged (20.x or 22.x; Prisma 7 needs ≥ 20.19).
5. **Ignored Build Step (optional, recommended).** Settings → Git → *Ignored Build Step*:
   `npx turbo-ignore`. Run from the root directory it works out the workspace package and
   skips the build when neither the app nor a package it depends on changed since the
   last deployment. Without it every push to any branch builds the app, as today.
6. **Environment variables.** Nothing to add or change. `PLATFORM_VERCEL_PROJECT_ID`,
   `PLATFORM_VERCEL_TEAM_ID` and `PLATFORM_VERCEL_TOKEN` keep pointing at this same
   project, so portal-host provisioning keeps attaching domains to it.
7. **Redeploy the pull request.** Vercel does not rebuild on a settings change. Trigger a
   new preview for the pull request branch (push a commit, or *Redeploy* the latest
   preview deployment) and confirm it is **Ready**. Until this setting changes, the
   preview for this branch fails, by design: there is no app at the repository root any
   more.

Between changing the setting and merging, a push to `main` would fail to build (the app
is not at `apps/legacy` on `main` yet). A failed build never replaces the production
deployment, so there is no downtime; just merge promptly, or make the change and merge in
the same sitting.

### After the merge

- Watch the production deployment for `main`; it should be **Ready** in the usual time.
- Smoke-test on the real hosts: sign in on a tenant host, open a page that reads the
  database (a dashboard, an invoice list), open the admin host, open a portal host, and
  render one document (the PDF route exercises the chromium binary, whose location changed
  with the pnpm store — the renderer now searches every ancestor of the app and of the
  workspace root).
- If anything is wrong: Deployments → the previous production deployment → **Instant
  Rollback**. That moves production traffic back without a build. Reverting the code is a
  normal `git revert` of the merge commit **plus** setting *Root Directory* back to empty.

## 3. Operator: the GitHub repository

- **Make the repository private** (Phase 0 of the plan). It currently holds the whole
  platform, including the private modules the plan expects.
- **Branch protection on `main`**: require the `lint, typecheck, test, build` check from
  `ci.yml` to pass before merging. Until lint is clean it is reported and non-blocking;
  the other steps block.
- **Optional, Turborepo remote cache**: repository secrets `TURBO_TOKEN` and `TURBO_TEAM`
  (from Vercel → Account → Tokens, and the team slug). CI and local builds then share
  cached typecheck and build outputs. Not required.

## 4. Operator: the database release job

Production migrations move from "an operator runs `prisma migrate deploy`" to a workflow
that runs it on every merge to `main` that adds a migration
(`.github/workflows/db-release.yml`). It is **off until enabled**, and it must not be
enabled before the production database is known to be on the migration history.

1. **Check the baseline.** From a machine with access to the production database:

   ```bash
   DATABASE_URL="postgresql://…direct connection, not the pooler…" pnpm db:migrate:status
   ```

   Expected: `63 migrations found` and `Database schema is up to date!`. That is the state
   this repository's `LOCAL_DEV.md` describes (production applies `prisma/migrations`).
   If instead it lists pending migrations, or reports that the migrations table does not
   exist, **stop**: the database was built by `db push` and scripts and has to be
   baselined first — mark each migration already reflected in the schema as applied with
   `pnpm --filter @corelithzw/db migrate:resolve --applied <migration-name>`, in order,
   and re-run the status check until it is up to date. Do not run `migrate deploy`
   against an un-baselined database.
2. **Add the secret.** Repository → Settings → Secrets and variables → Actions →
   *Secrets*: `PRODUCTION_DATABASE_URL`, the **direct** (non-pooled) connection string —
   migrations take locks the pooler cannot hold.
3. **Protect it (recommended).** Settings → Environments → create `production` and add
   required reviewers. The job runs in that environment, so a migration to production
   waits for an approval click.
4. **Enable the job.** Settings → Secrets and variables → Actions → *Variables*:
   `DB_RELEASE_ENABLED` = `true`.
5. **Dry run.** Actions → *Database release* → *Run workflow*. With nothing pending it
   prints the status twice and applies nothing.

From then on a pull request that adds a migration under `packages/db/prisma/migrations/`
deploys it on merge, in parallel with the Vercel build. Two rules keep that safe:

- **Expand-first.** A migration must be safe to run before *and* after the code that
  accompanies it, because the two land at slightly different times, and because six hosts
  will eventually deploy against this one database. Add columns and tables freely; drop
  or rename only in a later pull request, after every host that read the old shape has
  shipped without it.
- **A migration that needs a human** (a data decision, a long lock) is announced in its
  pull request and run by hand from `workflow_dispatch` at a chosen time, with
  `DB_RELEASE_ENABLED` briefly set to `false` if it must not auto-run on merge.

About migration `20260819090000_scope_trim_drop_dropped_module_schema`: it was edited so
that its two `StockMovement.sourceType` statements run only when that column exists. On
production the column existed when the migration ran, so behaviour there was exactly what
the file now says; on an empty database (CI, a staging clone, a new region) the column
arrives with migration 63, and the guard is what lets the history apply at all.
`migrate deploy` and `migrate status` do not re-run or re-verify an applied migration —
this was checked against a migrated database before the edit was kept.

## 5. What runs in CI, and what a red check means

| Step | Proves | If it fails |
|---|---|---|
| `pnpm db:check:deps` | Only `packages/db` depends on `@prisma/client` and `prisma` | Someone added the client to another package; move the import to `@corelithzw/db` instead (see `packages/db/README.md`) |
| `pnpm db:validate` | The multi-file schema parses | A schema edit is malformed |
| `pnpm db:check:drift` | Every migration applies to an empty Postgres, and the result equals `prisma/schema/` | A schema change without a migration, or a migration edited after the fact — run `pnpm db:migrate:dev` |
| `turbo run typecheck` | Every package type-checks (the app needs the 7 GB heap its script sets) | A type error |
| `pnpm legacy platform:audit-feature-gates` | Every gated route maps to a catalogued feature | An unmapped route or an orphan key |
| `turbo run test` | Vitest, including the database-backed suites, against the migrated service database | A failing test. Three pre-existing failures (§5a) fail today, so this step is red until they are resolved |
| `turbo run build` | `next build` of the app | A build error; also what Vercel would hit |
| `turbo run lint` | ESLint | Reported only, until the pre-existing 28 errors are cleared |

On pull requests the Turborepo steps run with `--affected`, so a documentation-only
change does not build the app. Pushes to `main` run everything.

### 5a. Pre-existing test failures the pipeline inherits

The full suite was run on `origin/main` against a freshly migrated database before the
move: 13 tests in 8 files failed there already. Ten were repaired in this branch because
they were plainly stale — three route expectations written before the school master-data
pages moved under `/management/master-data/`, four fiscal tests that fabricated a
`RetailSale` with a made-up `siteId` after `RetailSale.siteId` became a real foreign key,
and the shelf-price integrity audit, which is vacuous on an empty database and now creates
one known-good range for the run while still auditing every real row present. Three
remain, and each needs a decision rather than a mechanical fix:

| Test | What fails | The decision |
|---|---|---|
| `packages/modules/sell/fiscalisation.test.ts` (was `lib/retail/`) — "refuses an amount finer than a cent" (two tests) | `buildRetailSaleSigningInput` and `fiscaliseRetailSale` accept a `10.005` total; the test's invariant 5 says a sub-cent amount must be refused, never rounded into a signature | Money columns are `Decimal(14,2)`, so a sub-cent total cannot reach signing from the database any more; either the invariant moved upstream and the tests are retired, or the retail path must refuse instead of rounding through `money()` |
| `packages/modules/books/fiscal-drain.test.ts` (was `lib/accounting/`) — "takes the oldest due receipt first" | Order-dependent: with `batchSize: 1` the drain sometimes issues two receipts, not the oldest one. It failed in two of three local runs and passed in CI's first run | The claim query does `LIMIT batchSize`, so the second issue comes from elsewhere in the attempt loop, or from state a neighbouring test leaves behind; needs a look at the drain and the suite's isolation, not the assertion |

The test step stays blocking: a green CI that ignores tests is worse than a red one that
names three failures. Until they are resolved, `lint, typecheck, test, build` is red on
every pull request for these, and only these. The build step runs regardless of the test
result, so a run still answers whether the app builds.

## 6. Local development, what is different

- `pnpm install` at the repository root installs every package.
- `pnpm dev` generates the client and starts the app; `pnpm build`, `pnpm lint`,
  `pnpm typecheck`, `pnpm test` run across the workspace through Turborepo.
- Scripts moved with the app: `pnpm legacy <script>` (`pnpm legacy worker:pdf`,
  `pnpm legacy create-company --name Acme`, `pnpm legacy platform --actor you@corelith.co.zw`).
- `pnpm db:generate`, `pnpm db:migrate:dev`, `pnpm db:migrate:status`, `pnpm db:push`,
  `pnpm db:studio`, `pnpm db:check:drift` delegate to `packages/db`.
- The `.env` stays at the repository root and is read by the app, the scripts, the tests
  and the Prisma tooling. An `apps/legacy/.env` or `packages/db/.env` takes precedence for
  its own package when present.
- `pnpm test` needs Postgres with the migrations applied, as before:
  `pnpm db:migrate:deploy` against the test database, then `DATABASE_URL_TEST` in `.env`.
- The kernel (`packages/platform`), the design-system layer (`packages/ui`) and the database
  (`packages/db`) are workspace packages the app imports by path. Each has its own
  `typecheck`, `lint` and `test` scripts; `pnpm test` at the root runs all of them. The kernel's
  own tests need the same `DATABASE_URL_TEST` as the app's (one of them provisions a company).
- `apps/legacy` typechecks in about the same time as before; the split schema alone does
  not shrink the type-check, because the app still imports the whole client. That gain
  arrives with per-package project references as modules are extracted (Phase 2).

## 7. Phase 3 preview: what a product host will need

Each product ships as its own Vercel project on its own root, from the same repository.
This is the checklist each one will follow; none of it is needed yet.

1. **Vercel project** from this repository with *Root Directory* `apps/<product>`
   (`apps/sell`, `apps/campus`, …), *Ignored Build Step* `npx turbo-ignore`, same Node
   version.
2. **Domains**: the wildcard `*.<product>.corelith.co.zw` on the product's project. The
   bare `<product>.corelith.co.zw` is the product's landing site, which is already its own
   project. **Verify on the account that a bare host and its wildcard may sit on different
   projects** (the plan's Phase 1 check — add `*.sell.corelith.co.zw` to a project while
   `sell.corelith.co.zw` stays on the landing site's, and confirm both certificates
   issue). If Vercel refuses, the landing site moves into the product host as its root
   route instead.
3. **DNS**: `*.<product>.corelith.co.zw` → Vercel (CNAME), alongside the existing bare
   record.
4. **Environment variables** (Production, and Preview with the preview-host overrides
   from `STAGING_PREVIEW.md`):
   - `PLATFORM_ROOT_DOMAIN=<product>.corelith.co.zw` and `PLATFORM_ROOT_HOSTS` to match;
   - the **same** `NEXTAUTH_SECRET` and `DATABASE_URL` as the enterprise host — one
     database, one session token; the cookie domain becomes `.corelith.co.zw` so a sign-in
     carries across hosts (the auth factory in the plan's "Hosts, identity and sign-in");
   - `FEATURE_GATE_POLICY=deny` and its public twin, the fiscalisation and payment
     settings the product needs, `PLATFORM_VERCEL_*` for its own project if it
     provisions portal hosts.
5. **Portal hosts** on the new roots are one label (`pos-acme.sell.corelith.co.zw`), so the
   wildcard certificate covers them and self-serve signup needs no Vercel API call. The
   enterprise host keeps today's three-label pattern.
6. **The database release job stays singular.** Products share the database; migrations
   keep landing from `packages/db` through the one job, expand-first, because hosts deploy
   independently.
7. **Cut-over per tenant**: add the product host to the tenant's `allowedHosts`, 308 the
   old paths from the enterprise host, remove the module from the enterprise host's list —
   the flip described in the plan's Phase 3.

## 8. Checklist

Before merge (operator):
- [ ] Vercel *Root Directory* = `apps/legacy`; outside-root files included
- [ ] Pull request preview deployment **Ready** after the setting change
- [ ] Repository private; branch protection requires CI

After merge (operator):
- [ ] Production deployment **Ready**; smoke test on the tenant, admin and portal hosts; one PDF rendered
- [ ] `pnpm db:migrate:status` against production reports up to date
- [ ] `PRODUCTION_DATABASE_URL` secret, `production` environment, `DB_RELEASE_ENABLED=true`; dry run of *Database release*
- [ ] (Optional) `TURBO_TOKEN` / `TURBO_TEAM` for the remote cache; *Ignored Build Step* = `npx turbo-ignore`

Phase 3, per product (operator, later):
- [ ] Wildcard-on-a-different-project check on the Vercel account
- [ ] Project, domains, DNS, environment per §7
