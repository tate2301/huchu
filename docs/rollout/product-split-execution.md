# The product split, executed: what was done and how to do it again

This is the execution record of the split described in
[`product-split-plan.md`](./product-split-plan.md) (the decision record) and
[`product-split-deployment.md`](./product-split-deployment.md) (the operator runbook). The
plan says what and why; the runbook says what production needs; this document says what was
actually done, in what order, with what checks, at what cost in time — and how to run the same
programme again on another codebase, or on this one for the next module.

Primary sources, in order of authority: the commit log of pull request #159 (45 commits of code and runbook from
`0781287` to `18980a9`, one increment each), the plan's changelog (one row per increment, with the
commit), the pull request body (the verification table), and the tooling and time ledger kept
under [`tooling/`](./tooling/README.md). Where this document and those disagree, they win.

## 1. The outcome

**Before.** One Next.js 16 application at the repository root, about 503,000 lines: every product
(the school, the till, the CRM, the mine, HR and payroll, the books, stock, maintenance,
compliance) in one `app/` tree, one `lib/`, one `components/`, one 11,000-line Prisma schema,
no CI, deployed as one Vercel project.

**After.** A pnpm workspace with Turborepo:

| Layer | Packages | What it is |
|---|---|---|
| Hosts | `apps/enterprise`, `apps/campus`, `apps/sell`, `apps/crm`, `apps/people` | One Next.js app each. A host is a module list, its own data (navigation, management areas, workspace catalogue, offline scope), the kernel's proxy and auth, and an `app/` tree generated from the packages it composes. |
| Modules | `packages/modules/{workflow, notifications, records, documents, books, people, stock, maintenance, compliance, offline, gold, campus, sell, crm}` and `packages/modules/private/example` | Each a package with its domain, screens, route handlers, pages, a data-only `manifest.ts`, and a boundary test. |
| Shell | `packages/shell` | The workspace chrome: navigation and management registries, the app shell with slots, the sidebar model builder, the workspace pages. |
| Kernel | `packages/platform` | Tenancy, auth core, entitlements and gating, roles, API utilities, money, ids, uploads, preferences, the manifest contract, the registries a host fills at boot, API keys, the outbox. |
| Design system | `packages/ui` | Components, charts, icons, layout chrome; imports nothing from the workspace. |
| Database | `packages/db` | The schema, one file per module; migrations; the Prisma client. |
| Config | `packages/config` | Shared TypeScript presets. |

The dependency rule, enforced by a test in every module: `ui` → `platform` → `shell` → modules →
hosts. A module imports the kernel, npm, and the modules its manifest declares in `requires`,
and nothing else. The shell never imports a module. A host imports anything.

What the hosts compose today, as generated files under each `app/`:

| Host | Composed route and page files | Modules |
|---|---|---|
| `apps/enterprise` | 957 | every module, Gold included |
| `apps/campus` | 582 | the school, books, compliance, people, documents, notifications, records, workflow, offline |
| `apps/sell` | 409 | the till, stock, maintenance, compliance, books, people, documents, notifications, records, workflow, offline |
| `apps/crm` | 457 | the CRM, stock, books, people, documents, notifications, records, workflow, offline |
| `apps/people` | 292 | people, compliance, books, documents, notifications, records, workflow, offline |

Each product host writes by hand 46 files of its own; everything else under its `app/` is a
one-line re-export written by `scripts/compose-host.mjs`.

**What did not change.** Nothing a tenant sees. Same URLs, same hosts, same environment
variables, same database, same proxy branches in the same order. Production kept serving from
the enterprise host throughout, and still does.

**What is not done, and whose it is.** The runbook's §7 lists it: the project owner sets the
Vercel Root Directory to `apps/enterprise`, creates one Vercel project per product host with its
wildcard domain and `PLATFORM_PORTAL_HOSTS=flat`, enables the database release job, flips
tenants one at a time, runs the webhook worker, and decides the sub-cent fiscalisation pair
(runbook §5a). Four decisions are recorded for later in the plan's changelog: a module's tiers,
bundles and templates in its manifest; `app/home` deleted once the marketing site carries every
page; which routes accept an API key, per module; publishing the kernel to npm only when an
outside developer needs it.

## 2. The increments, in order

Every row is one commit on the branch, verified locally before the next began (§4.3 says how).
Minutes are wall-clock from the ledger, which started at Phase 2.1; the decision record and
Phase 1 are dated from their commits.

| Increment | Commit | Minutes | Commit subject |
|---|---|---|---|
| 0 decision record, three revisions | `0781287`, `91bf4de`, `f96a6ce` | 5 Sept | docs(rollout): product split decision record and plan … docs(rollout): decide the split setup; reverse npm modules and the Gold repo |
| 1 workspace, `packages/db`, CI, runbook | `2ea2259` … `2244abc` | 6 Sept, morning | chore(workspace): move the app to apps/legacy and put the database in packages/db … ci: give next build the heap its type check needs |
| 2.1 `packages/ui` | `f8a8432` | 21 | feat(ui): extract packages/ui, the design-system layer, as a workspace package |
| 2.2 `packages/platform` | `faa1715` | 23 | feat(platform): extract packages/platform, the kernel, as a workspace package |
| 2.3a manifest contract, page chrome | `d76f826` | 15 | feat(platform): the module manifest contract; page chrome to packages/ui |
| 2.3b workflow | `e17733c` | 11 | feat(workflow): extract packages/modules/workflow, the first module package |
| 2.3c notifications | `6e846d1` | 13 | feat(notifications): extract packages/modules/notifications; manifests carry what a notice opens |
| 2.3d records | `e8721da` | 14 | feat(records): extract packages/modules/records; record types as manifest data, search arms as a registry |
| 2.3e documents | `43da924` | 13 | feat(documents): extract packages/modules/documents; sources as a registry, default templates as manifest data |
| 2.3f shell | `232439f` | 9 | feat(shell): packages/shell — the navigation registry and the module shell |
| 2.3g books | `31c47f4` | 20 | feat(books): extract packages/modules/books; the fiscal drain's issuers and backlog alert as hooks |
| 2.3h people | `59ec1d8` (+ `f4cffa9`, CI `--concurrency=1`) | 18 | feat(people): extract packages/modules/people with a directory subpath |
| 2.3i stock | `9f98979` | 9 | feat(stock): extract packages/modules/stock; the CRM pieces it borrowed go to records and ui |
| 2.3i maintenance, compliance | `1e60e9c` | 11 | feat(maintenance, compliance): extract the two add-on modules; the users client to the kernel |
| 2.3i offline | `4a489ee` | 15 | feat(offline): extract packages/modules/offline; the definitions and the catalogue become registries |
| 2.3i gold | `cde03e8` | 12 | feat(gold): extract packages/modules/gold, composed only into the enterprise host |
| 2.3j app shell | `0a9e23d` | 14 | feat(shell): the app shell in packages/shell, with slots the host fills as props |
| 3.0a campus module | `9af552f` | 16 | feat(campus): extract packages/modules/campus, the school's module; import-core to the kernel |
| 3.0b sell module | `9d74097` | 14 | feat(sell): extract packages/modules/sell, the till's module; the transaction engine out of the route directory |
| 3.0c crm module | `91eeca3` | 13 | feat(crm): extract packages/modules/crm; its notices out of the host's notifications file |
| 3.1a campus routes and pages; the composer | `6718920` | 23 | feat(campus): routes and pages in the module, composed into the host (3.1a) |
| 3.1b-1 owners of the API client and emitters | `159f094` | 19 | refactor(host): the API client barrel and the notification emitters go to their owners (3.1b-1) |
| 3.1b-2 every module's routes and pages | `5114ef1` (+ `541e96b`, CI `--continue`) | 33 | feat(modules): every shared module's routes and pages in its package; the host composed from thirteen (3.1b-2) |
| 3.1b-3 kernel routes, auth, proxy; shell pages | `938118c` | 25 | feat(platform, shell): the kernel's routes, auth options and proxy in the kernel; the workspace pages in the shell (3.1b-3) |
| 3.1c-prep catalogue builder, quick actions, books documents | `38b4e9a` | 11 | refactor(shell, books): the sidebar model builder and the quick actions in the shell; the books' documents in books (3.1c-prep) |
| 3.1c `apps/campus` | `4d006cc` | 12 | feat(campus): the Campus host — apps/campus composed from the school module and what it requires (3.1c) |
| 3.2a `apps/sell` | `56bd61a` | 14 | feat(sell): the Sell host — apps/sell composed from the till and what it requires (3.2a) |
| 3.2b `apps/crm` | `564acec` | 6 | feat(crm): the CRM host — apps/crm composed from the CRM module and what it requires (3.2b) |
| 3.2c `apps/people` | `0c05e19` | 5 | feat(people): the People host — apps/people composed from the people module and what it requires (3.2c) |
| 3.3 flat portal hosts | `273a385` | 9 | feat(platform): portal hosts one label on product roots, behind PLATFORM_PORTAL_HOSTS=flat (3.3) |
| 4a `apps/enterprise` | `b3259d1` | 12 | refactor(enterprise): apps/legacy is apps/enterprise (4a) |
| 4b Gold delisted, roster retired | `27933cb` | 10 | feat(platform): Gold delisted from the catalogue and the marketing site; the Gold agent roster retired (4b) |
| 5a private modules | `7065901` | 4 | feat(platform): the private-module mechanism — a client's own module, composed only into its host (5a) |
| 5b scoped API keys | `3763d26` | 24 | feat(platform): scoped API keys for every module (5b) |
| 5c outbound webhooks | `18980a9` | 17 | feat(platform): outbound webhooks from an outbox (5c) |

Ledgered total: 33 increments in 465 minutes of wall clock, from 16:37 UTC on 6 September to
00:48 UTC on 7 September, in one continuous session. The decision record took the 5th (three
revisions); Phase 1 took the morning of the 6th.

## 3. The mechanisms the increments built

### 3.1 The manifest contract

`packages/platform/manifest.ts` defines `ModuleManifest`. A manifest is data: it may be imported
in the browser and on the edge, so nothing in it may reach a database client, and every host has
a test (`lib/host/manifests.test.ts`) that imports the manifests under a mock that throws if the
Prisma client is touched. The sections, and the increment that added each:

| Section | Carries | Added in |
|---|---|---|
| `id`, `requires` | The module's name; the modules it needs composed beside it | 2.3a |
| `routes` | The route prefixes and the feature keys that gate them; the route registry reads these | 2.3a |
| `permissions.capabilities` | The capability set the permission catalogue reads | 2.3a |
| `notifications` | The paths a notice opens, per notification type | 2.3c |
| `records.types` | Record types: label, list and page hrefs, API path, query key | 2.3d |
| `documents.templates` | Default document templates | 2.3e |
| `portals` | Portal hosts: key, home roles, sign-in roles, public paths, pinning | 3.1b-3 |
| `roleRestrictedRoutes` | Path prefixes only some roles may reach; the proxy checks them | 3.1b-3 |
| `outbox.events` | The event types the module announces to webhook subscribers | 5c |

`registerModules` fills a registry; `unmetModuleRequirements()` is asserted empty by every host
at boot, so a host that composes a module without its requirements fails to start rather than
failing on the first request.

### 3.2 Registries the kernel keeps and never fills

`packages/platform/registry.ts` stores registries on `globalThis` under a symbol, for the reason
the Prisma client does: a hot reload re-evaluates the declaring module, and a bundle carrying a
second copy must still see the one set of registrations. A host fills them once per server start
from `instrumentation.ts`, which imports the host's `modules.ts`. Every seam where the kernel or
a shared module needed something only a module or a host knows became a registry or a hook:

| Seam | Registry or hook | Who registers |
|---|---|---|
| NextAuth's options | `registerAuthOptions` | the host's `lib/auth.ts` via `modules.ts` |
| Capability sets | the manifest's `permissions.capabilities` | the manifests |
| Navigation sections, management areas | `registerNavigationSections`, `registerManagementNavigation` (shell) | the host's `manifests.ts` |
| Search arms | `registerSearchArm` (records) | the host, one per module with records worth typing at |
| Who may file against a shared record | `registerRecordSubjectGuard` (records) | the host, per owning module |
| Printable document sources | `registerDocumentSource` with `access`, `authorize`, `resolve` (documents) | the host, per owning module |
| The fiscal drain's issuers and sweeps | `registerFiscalDrainIssuer`, `registerFiscalDrainSweep` (books) | the host, for the school's fee receipts |
| A stuck fiscal drain | `onFiscalBacklog` (books) | the host, to the compliance module's incident |
| Sales documents created | `onSalesInvoiceCreated`, `onSalesReceiptCreated` (books) | the host, to the CRM's accounting hooks |
| Approval actions | `onApprovalAction` (workflow) | the host, to the people (and gold) notices |
| Offline modules and workflows | `registerOfflineModules`, `registerOfflineWorkflows` (offline) | the host's `modules.client.ts`, on both sides |
| Outbox events | `emitOutboxEvent` in the transaction; the host bridges its hooks | every module that announces |

The composition is split in two files on purpose: `manifests.ts` is data and is imported by
the providers in the browser and by the proxy on the edge; `modules.ts` is server code and is
imported once at boot. `modules.client.ts` is the browser-side registration (offline scope) that
both import.

### 3.3 Routes and pages in the packages; the host composed

A module keeps its route handlers under `packages/modules/<id>/api/**/route.ts` and its screens
under `packages/modules/<id>/pages/**/{page,layout,loading,error,not-found,template,default}.tsx`,
on the relative paths a host serves them at. The kernel's routes live under
`packages/platform/api`; the workspace pages under `packages/shell/pages`.

`scripts/compose-host.mjs` (`pnpm compose <host dir> <ids…>`, ids `platform`, `shell`, or a
module) writes into the host's `app/` one file per route or page that re-exports exactly the
names the module's file exports. Three rules it learned the hard way: it preserves the
`"use client"` directive; it copies route segment config literals (`dynamic`, `runtime`,
`maxDuration`, …) into the host file because Next reads them statically and refuses a re-export;
and it is idempotent, so it is run again after a module gains a route.

The enterprise host still writes by hand what is genuinely its own: the marketing site, the
operator console and its API, the executive dashboard, the payment webhooks, the cross-module
search route, the report hub and audit trails, the root layout and page.

### 3.4 A host is a module list and its own data

`apps/campus` was written first (3.1c), from the enterprise host, as the proof of the shape. The
other three were generated from a spec (`tooling/scaffold_host.py`): for each host, the module
list; from it, everything else is derived — which navigation sections and report links to keep
(by the module that owns each), which management items, which catalogue modules and workspace
profiles, which offline modules and workflows, which search arms, document sources and hooks
`modules.ts` wires, which portal paths the app shell recognises, which API prefixes the proxy
matcher names. The proof that a host is nothing but a module list and its data: the spec
reproduces the hand-written `apps/campus` byte for byte, which was checked before it generated
`apps/sell`, `apps/crm` and `apps/people`.

Before the hosts could be generated, 3.1c-prep moved three things a second host would otherwise
copy: the sidebar model builder (to the shell, taking the host's arrangement as a
`WorkspaceCatalogue`), the quick actions (to the shell), and the books' printable documents (to
the books module).

### 3.5 Portal hosts on product roots (3.3)

The kernel spelled a portal host `<prefix>.<slug>.<root>`: two labels under a product root, which
one wildcard certificate does not cover. `PLATFORM_PORTAL_HOSTS=flat` makes the kernel spell
and read `<prefix>-<slug>.<root>` instead, splitting at the first hyphen only when the head is a
portal prefix or alias, so a hyphenated tenant slug stays a tenant. Unset, nothing changes, and
the enterprise host keeps the old pattern. Every place that names a portal host goes through
`buildPortalHost`, so the proxy's allowed hosts, its redirects, the till's host and the school's
portal links all follow the switch.

### 3.6 Enterprise, and Gold delisted (Phase 4)

`apps/legacy` became `apps/enterprise`: the package, the root scripts, CI, the lockfile, every
document, and the module boundary's list of hosts. Gold was delisted, not deleted: the edition,
the four gold bundles and the mine's template carry `delisted: true`, stay resolvable for the
tenants on them, and are absent from the marketing site, the add-on list, the comparison table
and the operator's new-tenant wizard through `LISTED_TIERS`, `LISTED_FEATURE_BUNDLES` and
`LISTED_CLIENT_BUNDLE_TEMPLATES`.

### 3.7 Extensibility (Phase 5)

- **Private modules.** `packages/modules/private/<id>` (`@corelithzw/private-<id>`, manifest id
  `private-<id>`) is a client's own module, composed only into that client's host, held to the
  same boundary, owned through CODEOWNERS. `private/example` is the shape and the proof.
- **Scoped API keys.** `PlatformApiKey` generalises the CRM's intake keys to every module: minted
  at `/preferences/organization/api-keys`, carrying the feature keys it may reach and never more
  than the workspace holds, sent as `Authorization: Bearer cz_…`, shown once, stored as a hash.
  `authenticateApiKey(request, scope)` is the gate a public route stands behind.
- **Outbound webhooks from an outbox.** `emitOutboxEvent(tx, …)` writes the event in the
  transaction that made the change; a lease-based worker (`pnpm enterprise worker:webhooks`)
  fans it out to the endpoints that subscribe (`*`, `books.*`, or a type), signed
  (`X-Corelith-Signature: t=…,v1=hmac-sha256`), with exponential backoff. Endpoints are
  registered at `/preferences/organization/webhooks`.

## 4. The method

### 4.1 The rules the work was done under

1. **One verified increment per commit.** An increment is applied, verified in full, documented,
   then committed and pushed. Nothing is pushed on the strength of a partial check. The commit
   message says what moved, what seam was broken and how, and what verification ran.
2. **Scripts, not hand edits.** Every bulk change is a driver script whose edits assert their
   preconditions: `edit(path, old, new, count)` fails if the old text does not occur exactly
   `count` times. A driver that fails halfway is fixed and re-run; it must be idempotent enough
   to resume. The drivers are the record of what changed.
3. **Parity proofs where the change is mechanical.** The schema split was verified zero-diff
   against the old file and against the migration history. The host spec was verified to
   reproduce the hand-written host byte for byte. A refactor that should not change behaviour is
   proven not to by a diff, not by reading.
4. **Docs in the same commit.** The plan's changelog gets a row per increment (with the commit);
   the runbook, README, AGENTS.md and the package READMEs are edited by the same driver that
   changed the code (`docs-<phase>.py`), so they cannot drift.
5. **Measure.** A ledger (`tooling/ledger.txt`) records `START` and `END` per increment; the
   pull request body carries the verification and time tables.
6. **Known red stays red.** A failing test that needs a product decision (the till's sub-cent
   refusal) is documented and left blocking, not skipped, disabled or "fixed" to pass.
7. **Nothing production-facing without the owner.** Vercel settings, the database release job
   and per-tenant flips are written up in the runbook for the owner to do; the session had no
   credentials and asked for none.

### 4.2 The tooling

Everything under [`tooling/`](./tooling/README.md) was written during the migration and is kept as
the record. The reusable pieces:

| Tool | What it does |
|---|---|
| `tsslice.mjs`, `tsslice_any.mjs` | Print the exact source ranges of named top-level exports, via the TypeScript parser, so a driver moves a declaration whole rather than by regex. |
| `tsdeps.mjs` | For each top-level declaration of a file: its name, whether it is exported, its kind, and the other top-level names it references — the dependency graph inside one file, used to decide what moves together. |
| `apislice.py` | Slices named exports out of the host's API-client barrel into a module's `api-client.ts`, leaving re-exports. |
| `importgraph.py`, `prismagraph.py` | Bucket the monolith's files and Prisma models by domain and count the imports between buckets: the numbers the decision record's "what the codebase says" section is made of. |
| `split_schema.py` | Split one Prisma schema into one file per module, zero-diff, keeping every comment with the block it belongs to. |
| `new_module.py` | Create `packages/modules/<name>` from the template (package.json, tsconfig, vitest, eslint, README, boundary test) and wire the host. |
| `extract_<module>.py` | One per module: the driver that moved the files (`git mv`), rewrote the imports, broke the seams into registries or hooks, and wired the host. |
| `restructure_manifests.py` | Split the host's composition into `manifests.ts` (data) and `modules.ts` (server wiring). |
| `scripts/compose-host.mjs` (in the repository proper) | The host composer, §3.3. |
| `scaffold_campus.py`, `scaffold_host.py` | The first host by hand from the enterprise host; then the spec that generates any host from its module list, with the parity check against the first. |
| `patch_<phase>.py`, `docs-<phase>.py` | The code and the documentation edits of the later phases, each with asserted preconditions. |
| `verify-<phase>.sh` | The verification chain per increment (§4.3). |
| `smoke-boot.sh` | Boots the host and checks that a guarded page redirects (the registries were filled at boot) rather than failing with "No auth options registered". |
| `refcheck.js` | For a set of declarations, which imports they reference — what an extracted slice needs to bring with it. |
| `ledger.txt` | The time record. |

The drivers hard-code the container paths they ran under (`/home/user/huchu` and the session's
scratch directory); a reader replicating a step edits those constants first. They are kept as
they ran, not tidied, because a tidied copy would be a copy nobody has run.

### 4.3 The verification stack

Every increment ran, in this order, before its commit:

1. The changed package's typecheck, lint and tests (`pnpm typecheck`, `pnpm exec eslint .`,
   `pnpm exec vitest run` in the package).
2. The app's typecheck, with the heap it needs (`NODE_OPTIONS=--max-old-space-size=7168`), and
   the scripts tsconfig.
3. The app's tests against a freshly migrated Postgres 16 on port 5433
   (`DATABASE_URL=postgresql://postgres@localhost:5433/huchu_test`, and `DATABASE_URL_TEST` the
   same, exported in every shell — the repository has no root `.env` in CI or in the session).
4. `next build` for the host that changed.

Timings on the session's container: the enterprise typecheck about 4 minutes, its tests about
2, its build about 7; a product host's build 6 to 7. Four rules kept the machine honest: never
a typecheck and a build at the same time (memory); never two database suites at the same time;
never tests while a build runs; never a source edit while a build runs (a Markdown edit is fine).
A chain is a shell script writing to one log with sentinel lines (`TC_EXIT=0`, `BUILD_EXIT=0`,
`ALL_DONE`); it runs in the background and a waiter polls the log, so the next increment's driver
is written while the previous one verifies. The verification logs are in the ledger's
directory, one per step per increment: 173 of them.

The two products of a verification failure were fixes to the drivers, never to the checks: a
regex that joined lines, a `git mv` into a directory that did not exist, a composed route whose
segment config Turbopack refused, a manifest helper block duplicated by a re-run driver, a
package that declared `@corelithzw/react` as `workspace:*` when it is an npm package.

### 4.4 CI

`.github/workflows/ci.yml` runs on every pull request: install, a guard that Prisma dependencies
are declared once, schema validation, a migrations-versus-schema drift check on a service
Postgres, the Prisma client, lint (reported, not blocking, until the pre-existing errors are
cleared), typecheck, the feature-gate audit, tests, build. Three settings came from watching it
fail: `--concurrency=1` for typecheck, test and build (the runner's memory), `--continue` for the
test step (so every suite is reported even after the known pair fails), and the build heap
(`NODE_OPTIONS=--max-old-space-size=7168`, because `next build` type-checks in-process). On a
pull request every step takes `--affected`, so a push touching one package runs that package's
checks. `db-release.yml` applies migrations on merge to `main` once the owner adds the
production URL and enables it; until then it is a no-op.

### 4.5 The documentation discipline

Four documents moved with every increment: the plan's changelog (a row per increment: what,
how, the seams, the commit), the runbook (what production needs, kept true — including the
correction in 3.2a that the kernel's portal hosts were two labels under a product root, which the
one-label switch in 3.3 then fixed), the repository README and AGENTS.md (the layout and the
rules), and each package's README (what it holds, its `api/` and `pages/`, its `requires`). The
pull request body carried the summary, the "hosts, now" list, the verification table, the time
table, the owner's list, the known red, and what is left.

### 4.6 The pull request loop

The branch is one draft pull request. The session subscribed to its events, read every CI
failure to its root cause (all were the known pair or the by-design Vercel failure), and kept an
hourly check-in scheduled that re-reads the head, CI and review threads, acts on anything new,
and re-arms silently otherwise. Comments were reserved for something new; the known items live in
the pull request body, where a reader looks.

### 4.7 Time and cost

Wall clock, from the ledger: 465 minutes across 33 increments (7 hours 45 minutes), between
16:37 UTC and 00:48 UTC, plus the decision record on the 5th and Phase 1 on the morning of the
6th. The longest increments were the ones that broke the most seams (2.3a–2.3f as one stretch,
74 minutes; 3.1b-2, 33 minutes); the shortest were generated from a spec (3.2b, 6 minutes;
3.2c, 5; 5a, 4). 173 local verification runs. The session ran on a Claude Max plan, which is a
flat monthly price rather than a per-token bill, and the session cannot read its own token
count, so the honest cost figures are the ones above: hours of wall clock, and a number of
builds and test runs that a person would have had to sit through.

## 5. Replicating it

The programme below is the one that was run, generalised. Each step names what to write, what
proves it, and what the runbook needs.

### Step 0 — The decision record

Write it before touching code. Measure the codebase (`importgraph.py`, `prismagraph.py`): which
directories import which, which Prisma models belong to which domain, where the cross-domain
imports are and how many. List the options with the mechanisms each needs. Decide the target
shape (layout, layering rule, manifest, database policy, hosts and identity, entitlements,
extensibility), the sequence, and the decisions, and write the risks. Keep a changelog table at
the end; every later increment adds a row. The plan was revised three times on its first day
before Phase 1 began; the revisions are cheaper than a wrong extraction.

### Step 1 — The workspace around the monolith

Move the app to `apps/<name>` and the database to `packages/db` (`git mv`, so history follows).
Split the schema one file per module with `split_schema.py` and prove zero-diff both ways.
Check the migration history applies to an empty database (it did not; one migration assumed a
later column). Add the workspace root (`pnpm-workspace.yaml`, `turbo.json`), CI, and the
database release job (disabled until the owner enables it). Write the runbook's §1 table: what
changed, and what production needs. Done means: install, generate, typecheck, lint, tests and
`next build` pass from the new layout, and CI is green on the pull request except what you have
documented as known red.

### Step 2 — The kernel and the modules

Extract in dependency order, leaf first, one package per commit:

1. `ui` — the domain-free layer. Break the one seam that names a module (the table exporter)
   with a context the host fills.
2. `platform` — the kernel. Every place it needs a module or the host becomes a registry filled
   at boot (`instrumentation.ts` → `modules.ts`).
3. The manifest contract and the boundary helper, and the page chrome to `ui`.
4. Modules, leaf first: workflow (a leaf with one hook), notifications, records, documents, the
   shell, books, people, stock, the add-ons, offline, then the product modules (campus, sell,
   crm). For each: `new_module.py <id> <requires>`; a driver that moves the files, rewrites the
   imports (package root is the source root; deep imports by path; relative imports inside the
   package), turns each seam into a registry or hook, wires the host; the boundary test; the
   README; the plan row; the verification chain; the commit.

Done, per module: its own typecheck, lint and tests pass; the boundary test passes; the host
still typechecks, tests and builds; the plan has the row.

### Step 3 — Routes and pages into the packages; the composer; the hosts

1. Move one module's routes and pages first (the school), write the composer, and prove the
   host builds from the composed tree. The composer's three rules (§3.3) came from this step.
2. Move every shared module's routes and pages; then the kernel's routes, the auth options and
   the proxy into the kernel, and the workspace pages into the shell, with what a module
   contributed to them (portals, role-restricted routes) as manifest data.
3. Prepare the second host: whatever the first host would otherwise copy (the sidebar builder,
   the quick actions, the books' documents) moves to the shell or the owning module.
4. Write the first product host by hand from the enterprise host: module list, own data, kernel
   proxy and auth, composed tree, the search route with the arms of the modules it runs.
5. Generalise the hand-written host into a spec (`scaffold_host.py`), prove the spec reproduces
   the hand-written host byte for byte, then generate the rest.
6. Fix what the hosts reveal about the kernel (the portal-host label switch).

Done, per host: typecheck, lint with zero errors, the manifests test, `next build`; the
enterprise host unchanged (its typecheck and host tests); the runbook's §7 row.

### Step 4 — Rename and delist

Rename the legacy host to what it is. Delist rather than delete what leaves the public
catalogue, so existing tenants keep resolving.

### Step 5 — Extensibility, as customers ask

Private modules as the same contract in a reserved directory; scoped API keys generalised from
the one module that had them; outbound webhooks from an outbox written in the transaction.
Each ships with its migration proven by the drift check on a scratch database.

### The per-increment loop, verbatim

```
START <increment>            # ledger
write the driver             # extract/move/patch + docs, with asserted preconditions
run it; fix it; re-run it    # until it applies cleanly from a clean tree
verify-<increment>.sh &      # package checks, app typecheck, app tests, build; sentinel lines
  (write the next driver while it runs)
read the log                 # every EXIT=0, tests green except the known red, BUILD_EXIT=0
git add -A && git commit -F commit-<increment>.txt && git push -u origin <branch>
END <increment> <commit>     # ledger
update the pull request body # verification row, time row
```

## 6. What to watch for

- **A re-run driver duplicates what it added.** Guard every insertion with "skip if the new text
  is already present".
- **A regex cut that joins lines** shows up as a TypeScript syntax error a few files away from
  the edit. Slice by the parser (`tsslice.mjs`), not by regex, wherever a declaration moves.
- **`git mv` needs the destination directory.** Create it first; make the move idempotent.
- **Segment config cannot be re-exported.** The composer copies the literal.
- **A package self-import fails.** Inside a package, import relatively; only other packages by
  name.
- **`workspace:*` is only for workspace packages.** A package that happens to share the scope
  (`@corelithzw/react` is on npm) keeps its semver range.
- **A test that scans the host's directory from `process.cwd()`** breaks the moment its code
  moves into a package; split it into a package test and a host coverage test.
- **The kernel's assumptions are the runbook's claims.** Check what the code does (the portal
  host pattern) before writing that a wildcard covers it.
- **Killing a chain with `pkill -f` on a pattern that matches your own shell** kills the shell.
