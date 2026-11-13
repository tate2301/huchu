# Releases and industry forks

Corelith ships from one repository, **core** (`tate2301/huchu`). It reaches
customers in two ways:

| Where it runs | What it deploys | Who it is for |
| --- | --- | --- |
| Shared cell (`huchu-gel9` on Vercel, one Neon database) | core `main`, on every merge (unchanged) | Every SaaS tenant |
| Dedicated cell (its own Vercel project, Neon and domain) | `stable` of core, or of an **industry fork** | Enterprise clients |

An **industry fork** is core plus one vertical that does not belong in core,
for example `corelith-milling`. A second client of the same industry is a
second cell built from the same fork, not a new fork. Per-client differences
are tenant configuration, never code.

## Releasing core

```bash
pnpm release:promote --dry-run
```

```bash
pnpm release:promote
```

`scripts/release/promote.mjs` works like this:

- It runs on a clean `main` that matches `origin/main`.
- It tags `vYYYY.MM.N`, with the release notes grouped by Conventional Commit type in the annotated tag.
- It **fast-forwards** `stable` to that commit. If `stable` has a commit that `main` lacks, the push is refused and nothing is released.
- No commit is made, so `main`'s protection is untouched.

Pushing the tag runs `.github/workflows/release.yml`:

- It turns the tag into a GitHub Release.
- For a core tag, it sends `core-release` to every repository listed in the `FORK_REPOS` variable, using the `FORK_DISPATCH_TOKEN` secret.

**Cadence:** every two weeks, plus hotfixes. Cut a release from a `main` that
has already run well on the shared cell.

## How a fork stays current

The fork workflows live in core. That way every fork gets fixes to them
through the same sync. In core they do nothing, because each job needs the
repository variable `FORK_FLAVOUR`.

| Workflow | What it does in a fork |
| --- | --- |
| `fork-upstream-sync.yml` | On `core-release`, every Monday, or by hand, `scripts/fork/sync.mjs` merges the newest core release on core's `stable` into `sync/<tag>`. On a clean merge, it opens **chore(sync): core <tag>** with the core notes and the new core migrations. On a conflict, it pushes nothing and opens a `sync-conflict` issue naming the files. More than two releases behind opens a `fork-behind` issue. |
| `fork-checks.yml` | **Boundary:** the PR touches only the fork's paths (`scripts/fork/boundary-lib.mjs`). `sync/*` PRs are exempt, and the `core-hotfix-approved` label lets a change through but opens an issue to move it to core. **Migration rehearsal:** `prisma migrate deploy` and `scripts/check-schema-drift.mjs` run against a throwaway Neon branch of the cell's production database. |
| `checks.yml` | Same as core: typecheck, the from-scratch migration build, and the tooling tests. |
| `release.yml` | Publishes the fork's own `v…-<flavour>.N` releases. A fork never dispatches. |

After a sync PR is merged, run `pnpm release:promote` in the fork. It reads the
flavour from `FORK.md` and tags `<core tag>-<flavour>.<n>`, for example
`v2026.12.1-milling.2`, so a cell's version always names the core it runs.
Moving the fork's `stable` deploys every cell built from it.

### What a fork may change

These are the only paths a fork may change (enforced by `boundary-lib.mjs`):

- `FORK.md`
- `extensions/index.ts`
- `extensions/<flavour>/**`
- `lib/<flavour>/**`
- `app/<flavour>/**`
- `app/api/<flavour>/**`
- `components/<flavour>/**`
- `prisma/schema/<flavour>.prisma`
- `prisma/migrations/<timestamp>_<flavour>_<name>/migration.sql`
- `docs/<flavour>/**`

Anything else is a core change:
1. Make a PR to core.
2. Release core.
3. Sync it into the fork.

The schema is a folder (`prisma.config.ts` points at `prisma/schema`). Core's
models live in `prisma/schema/core.prisma`, and a fork adds
`prisma/schema/<flavour>.prisma` beside it. Anything that reads the schema as
text goes through `readPrismaSchema()` in `lib/prisma-schema-source.ts`, so it
sees a fork's tables too. The `extensions/` registry lands in a later change.

## Creating a fork

1. Create an empty GitHub repository, for example `tate2301/corelith-milling`.
2. From a clean core `main`, run:

   ```bash
   pnpm fork:bootstrap --repo tate2301/corelith-milling --flavour milling
   ```

   This pushes core's full history plus a `FORK.md` to the fork's `main` and
   `stable`, then prints the variables and secrets that switch on the
   workflows. `--dry-run` shows the `FORK.md` without pushing.
3. Set those variables and secrets. In the fork: `FORK_FLAVOUR`,
   `UPSTREAM_REPO`, `FORK_SYNC_TOKEN`, and for the rehearsal `NEON_PROJECT_ID`,
   `NEON_PARENT_BRANCH` and `NEON_API_KEY`. In core: add the fork to
   `FORK_REPOS` and set `FORK_DISPATCH_TOKEN`.
4. Run **Fork · upstream sync** once by hand to prove the loop.

`FORK_SYNC_TOKEN` has to be a fine-grained token or an app token, not the
default `GITHUB_TOKEN`. It reads core, and a PR opened with `GITHUB_TOKEN`
would not start the fork's checks.

## Database rules (core and forks)

- Never run `db push` against a cell.
- Every schema change is a migration, and `pnpm verify:migrations` (in CI)
  rebuilds the schema from an empty database on every PR.
- Make schema changes in two steps across releases: add the new shape first,
  remove the old one in a later release. A cell can be a release or two
  behind and must catch up in one deploy.
- A migration is never edited once merged.
- Fork tables point at core tables by id columns only. Their foreign keys are
  written in the migration SQL, and core models never gain a back-relation
  for a fork.

## Rehearsing locally

To exercise the whole loop without GitHub:
- `scripts/fork/bootstrap.mjs --url <path>` pushes to a local bare repository.
- `UPSTREAM_GIT_URL=<path>` makes `scripts/fork/sync.mjs` fetch from one.
- Put a stub `gh` on `PATH` to record the PR and issue calls.
