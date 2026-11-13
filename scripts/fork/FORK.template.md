# {{FORK_REPO}}: the {{FLAVOUR}} fork of Corelith

This repository is **core ({{CORE_REPO}}) plus the {{FLAVOUR}} vertical**. Core
code is never edited here. Every core improvement arrives through the sync,
and every {{FLAVOUR}} change stays inside the boundary below, so the two never
collide.

## What this fork may change

{{ALLOWED_PATHS}}

`fork-checks.yml` fails any PR that changes a path outside this list. Sync PRs
(`sync/*`) are exempt, because they carry core changes on purpose.

## Changes the vertical needs from core

Make them in {{CORE_REPO}}:

1. Open a PR there, generic enough for any vertical.
2. Release core with `pnpm release:promote`.
3. Merge the sync PR that arrives here.

This applies even to one-line fixes.

**Emergency hotfix.** A maintainer adds the `core-hotfix-approved` label to the
PR. The boundary check then passes, and the workflow opens an issue to move the
change upstream. The next core release must carry the change, so the
difference disappears at the next sync.

## How core reaches this fork

1. Core cuts a release with `pnpm release:promote`. That tags `vYYYY.MM.N` and
   moves core's `stable`.
2. Core's `release.yml` sends `core-release` to this repository.
3. `fork-upstream-sync.yml` merges the tag into `sync/<tag>` and opens
   **chore(sync): core <tag>**. The PR lists the core release notes and the new
   core migrations.
4. The checks run on that PR:
   - typecheck
   - lint
   - tests
   - the from-scratch migration build
   - the fork boundary
   - a **migration rehearsal**: `prisma migrate deploy` and the drift check
     against a throwaway Neon branch of the cell's production database
5. A person merges the PR. Then `pnpm release:promote` tags
   `<core tag>-{{FLAVOUR}}.<n>` and moves this repository's `stable`. Each cell
   deploys `stable`, and its build applies the migrations.

The sync also runs weekly and can be started by hand ("Fork · upstream sync").

- **Conflicts:** if a merge conflicts, nothing is pushed. A `sync-conflict`
  issue names the files instead.
- **Falling behind:** if this fork falls more than two core releases behind, a
  `fork-behind` issue is opened.

**Service levels:**
- Merge a core release within 5 working days.
- Merge a security release within 1 working day.

## Database rules

- Tables for the vertical live in `prisma/schema/{{FLAVOUR}}.prisma`.
- They point at core tables by id columns only, such as `companyId`, `siteId`
  and `productId`. They never declare a Prisma relation that would need a field
  on a core model.
- Foreign keys are written in the migration SQL.
- Migration folders are named `<timestamp>_{{FLAVOUR}}_<name>`.
- Never run `prisma db push` against a cell.
- A migration that has merged is never edited.

## Releasing

```bash
pnpm release:promote --dry-run
```

```bash
pnpm release:promote
```

`promote` reads the flavour from this file's first line, so it cuts fork
versions (`<core tag>-{{FLAVOUR}}.<n>`) without any setting.
