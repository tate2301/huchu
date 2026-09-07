# The migration tooling

The scripts written during the product split, kept as they ran, and the time ledger. They are
the record of *how* each increment changed the code, and the starting point for the next
module or host. They are not a maintained tool: nothing under `docs/` belongs to a workspace
package, so CI neither lints, typechecks, tests nor builds anything here. The composer that
the hosts are built with is code proper: `scripts/compose-host.mjs` at the repository root.

The execution record that explains the increments is [`../product-split-execution.md`](../product-split-execution.md).

## Before running anything here

- Every script hard-codes the container paths it ran under: the repository at `/home/user/huchu`
  and the scratchpad at `/tmp/claude-0/-home-user-huchu/eafc178b-2c3f-5a7f-bcbb-c8e593fa6116/scratchpad`.
  Replace both before running (`sed -i 's#/home/user/huchu#/path/to/checkout#g; s#/tmp/claude-0/[^"'"'"' ]*/scratchpad#/path/to/scratch#g' *.py *.mjs *.js *.sh`).
- The extraction and move drivers targeted the tree *as it was at their increment*. Those from
  before Phase 4 address the host as `apps/legacy`, which is now `apps/enterprise`; each also
  asserts the pre-state it expected (a file exists, a string occurs exactly once), so against
  the current tree they stop at the first assertion rather than doing harm. Read them as the
  pattern for the next extraction, not as commands to re-run.
- `scaffold_host.py`, `new_module.py` and the `verify-*.sh` chains are current in shape and
  usable with the path edits above. `scaffold_host.py` reads `apps/enterprise` and writes a host
  from its spec; `--out` writes elsewhere for a parity check.
- The verification chains expect the local Postgres on port 5433 described in
  [`../product-split-execution.md`](../product-split-execution.md#43-the-verification-stack)
  and the heap setting the build needs.

## Index, by purpose

### Measuring the monolith (Phase 0, the decision record)

| File | What it does |
|---|---|
| `importgraph.py` | Buckets the monolith's source files by domain and counts imports between buckets. |
| `prismagraph.py` | Buckets the Prisma models by domain and counts relations between buckets. |

### Slicing declarations by the parser, not by regex

| File | What it does |
|---|---|
| `tsslice.mjs` | Prints the exact source ranges of named top-level exports of one file (TypeScript parser). |
| `tsslice_any.mjs` | The same for any top-level declaration, exported or not. |
| `tsdeps.mjs` | For each top-level declaration: name, exported or not, kind, and the other top-level names it references. |
| `refcheck.js` | For sets of declarations in the API-client barrel, which of the file's imports they reference. |
| `apislice.py` | Moves named exports out of the host's API-client barrel into a module's `api-client.ts`, leaving re-exports. |

### Schema and module scaffolding

| File | What it does |
|---|---|
| `split_schema.py` | Splits one Prisma schema into one file per module, zero-diff, every comment staying with its block. |
| `new_module.py` | Creates `packages/modules/<name>` from the template (package.json, tsconfig, vitest, eslint, README, boundary test) and wires the host. Usage: `new_module.py <name> [requires,...]`. |
| `restructure_manifests.py` | Splits the host's composition into `manifests.ts` (data) and `modules.ts` (server wiring). |

### Extraction drivers, Phase 2 (one per package or module)

Each moves files with `git mv`, rewrites imports, breaks the seams it meets into registries or
hooks, and wires the host. In the order they ran:

| File | Increment |
|---|---|
| `extract_ui.py`, `extract_ui_tail.py`, `extract_ui_tail2.py` | 2.1 `packages/ui` (the driver and its two continuations) |
| `extract_platform.py` | 2.2 `packages/platform` |
| `move_chrome.py` | 2.3a page chrome and shared components to `packages/ui` |
| `extract_workflow.py` | 2.3b workflow |
| `extract_notifications.py` | 2.3c notifications |
| `extract_records.py` | 2.3d records |
| `extract_documents.py` | 2.3e documents |
| `extract_books.py` | 2.3g books |
| `extract_people.py` | 2.3h people |
| `extract_stock.py` | 2.3i stock |
| `extract_maintenance_compliance.py` | 2.3i maintenance and compliance |
| `extract_offline.py` | 2.3i offline |
| `extract_gold.py` | 2.3i gold |
| `extract_shell.py` | 2.3j the app shell to `packages/shell`, with slots the host fills |
| `extract_campus.py` | 3.0a campus module |
| `extract_sell.py` | 3.0b sell module |
| `extract_crm.py` | 3.0c crm module |

Increment 2.3f (`packages/shell` itself: the navigation registry and the module shell) was
scaffolded with `new_module.py` and inline moves; only its documentation script is here, and
its commit `232439f` is the record.

### Routes and pages into the packages, Phase 3.1

Most take step names as arguments (each docstring lists its own, for example `plan seams move
rewrite compose deps check`; default all), so a failed step can be re-run alone.

| File | Increment |
|---|---|
| `extract_campus_routes.py` | 3.1a the campus module's routes and pages; the first composition |
| `slice_31b1.py` | 3.1b-1 the API-client barrel and the notification emitters to their owners |
| `move_31b2.py` | 3.1b-2 every shared module's routes and pages; the host composed from thirteen |
| `move_31b3.py`, `move_31b4.py` | 3.1b-3, in two runs and one commit: the kernel's routes, auth options and proxy into the kernel; then the workspace pages and their components into the shell and the two module-owned preference screens into their modules |
| `prep_31c.py` | 3.1c-prep the sidebar model builder and quick actions to the shell; the books' document sources |

### Hosts

| File | What it does |
|---|---|
| `scaffold_campus.py` | 3.1c: the first product host, `apps/campus`, derived by hand from the enterprise host. |
| `scaffold_host.py` | 3.2a–c: the spec (`HOSTS`) that generates any host from its module list, with the transforms of each host-owned file. Usage: `scaffold_host.py <campus|sell|crm|people> [--out <dir>]`. Byte-parity against `scaffold_campus.py`'s output was the proof of the spec. |

### The later phases' code edits

Each is a list of `edit(path, old, new, count)` calls that assert the exact number of
occurrences before replacing, plus the new files the increment adds.

| File | Increment |
|---|---|
| `patch_33.py` | 3.3 flat portal hosts (`PLATFORM_PORTAL_HOSTS=flat`) |
| `patch_4b.py` | 4b Gold delisted; the Gold agent roster retired |
| `patch_5a.py` | 5a private modules |
| `patch_5b.py` | 5b scoped API keys |
| `patch_5c.py` | 5c the outbox and outbound webhooks |

Increment 4a (the rename of `apps/legacy` to `apps/enterprise`) was a `git mv` and a
path rewrite run inline; its commit is the record.

### Documentation edits, per increment

`docs-<increment>.py` applies the README, runbook and decision-record edits of that increment
with the same asserted-count `edit` helper, so the documents changed in the same commit as the
code. `docs-3.2bc.py` takes the host id as its argument.

### Verification chains

| File | What it does |
|---|---|
| `verify-<increment>.sh` | The chain run in the background per increment: package checks, the app typecheck, the app tests, the build; each stage prints a sentinel line (`TC_EXIT=`, `BUILD_EXIT=`, `ALL_DONE`) that a waiter greps for. |
| `smoke-boot.sh` | Boots the host in production mode and probes guarded routes: a redirect proves the registries were filled at boot; a 500 with "No auth options registered" proves they were not. |

### The ledger

`ledger.txt`: one `START <increment> <utc>` and one `END <increment> <utc> commit=<sha>` per
increment, from 2.1 to 5c. The increments table in the execution record is generated from it
and the commit log.
