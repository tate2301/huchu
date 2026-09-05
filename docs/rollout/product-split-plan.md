# Product Split — Decision Record and Plan

**Status:** proposal for adoption. **Date:** 2026-09-05 (revised the same day — see the changelog).

This document answers one question the business has put to engineering: the platform is to
become four independent products — **Sell** (retail), **CRM**, **People** (HR & payroll) and
**Campus** (education) — each with its own landing site and its own host
(`sell.corelith.co.zw`, `campus.corelith.co.zw`, …). What is the right way to split the
codebase so the products are genuinely independent, without building stock, books,
maintenance and the rest of the shared machinery four times, and without losing the
integrations that make the products worth more together?

The follow-up decisions widen the question. The split is also meant to be the base that
**extensions and modules plug into** — ours, an enterprise client's, and other developers' —
with modules distributed as npm packages. **Compliance** is an add-on every product can
carry. **Gold** is a shadow product: still offered, enterprise-only, never marketed, and
moving to its own repository. So the codebase has to become something a module can be
written *against*, not only something that can be cut into products.

It is written the way `docs/rollout/master-rollout-plan.md` is written: decisions first,
evidence second, then the sequence. It carries no story table. If adopted, stories are added
to the rollout roadmaps under their house rules; this document stays the decision record.

## The answer

**One monorepo. Several deployable apps. One database. A module contract that every product,
add-on and extension implements. Shared capabilities as packages, not as services and not
as copies.**

- **Everything above the kernel is a module, and a product is a module with a host.** Sell,
  CRM, People and Campus are modules that ship with a host app on their own domain. Books,
  Stock, Maintenance and Compliance are modules that other modules mount. Gold is a module
  that lives in another repository. An enterprise client's customisation is a module in
  their repository. A third-party extension is a module in someone else's. **All of them
  implement one manifest** — tables, routes, screens, navigation, feature keys, permissions,
  posting sources, record types, search, documents, notifications, offline workflows,
  provisioning — and the kernel iterates those registrations instead of knowing any module
  by name.
- **Each product is its own Next.js app**, its own Vercel project, its own host, its own
  release cadence, its own bundle, its own owner. The app is a thin host instance: a config
  naming the modules it composes, its branding, and route files generated from the modules'
  manifests.
- **Modules are npm packages composed at build time, not plugins loaded at run time.**
  Next.js bundles at build and Vercel runs the bundle; there is no honest way to load
  server code into that process afterwards, and no safe way to run untrusted code inside it
  at all. So trusted modules (ours, reviewed partners', an enterprise's own) are installed
  from npm and compiled into a host, and untrusted third parties extend the products from
  *outside* the process through the public API, API keys, webhooks and embedded panels.
  Two tiers, one contract each; the second is how every platform with an app store does it.
- **Everything the modules share is a package in the same repository** — tenancy and auth,
  the design-system wrappers, the record page, and the SDK that is the only thing a module
  may import. A module ships its domain logic, its API route handlers *and* its screens; a
  host mounts the ones the tenant is entitled to. Nothing is written twice.
- **One PostgreSQL database and one Prisma schema, composed from one fragment per module.**
  A tenant is one `Company` across every product it buys. Cross-module joins that exist
  today — a POS sale to its fiscal receipt, a CRM client to its customer account, a teacher
  to their employee record — stay in the database, not behind API calls.
- **Integration stays in-process.** Sell posts to Books by calling the posting engine,
  exactly as it does now. The rule that keeps this honest is *direction*: modules depend on
  the kernel and on modules they declare, dependencies are acyclic, and the four marketed
  products declare no dependency on one another. The rule is enforced by lint and by tests,
  not by review.
- **The monolith is not rewritten; it is strangled.** The current app becomes `apps/legacy`
  inside the monorepo on day one, unchanged and still deployed. Packages are extracted from
  it one PR at a time, products are cut out of it one at a time, and Gold leaves last, into
  its own repository, as the proof that an external module can be built against the
  published SDK.

The reason, in one line: **the products are independent at the surface and interdependent
underneath, and the codebase should say exactly that.** Separate repositories would make the
shared layer drift into four versions of the ledger; keeping one deployable would leave the
products sharing a build, a blast radius and a 7 GB type-check. A monorepo of hosts over a
shared kernel, with one module contract for everything above it, is the one shape where
independence, sharing and extensibility are all true at once.

## What the codebase says

The recommendation is read off the repository, not off taste. The facts that decided it:

**Size.** 503k lines of TypeScript in one Next.js 16 app: 273 pages, 449 route handlers,
295 Prisma models and 175 enums in one 11k-line schema, 64 migrations, 192 test files. The
`Company` model carries roughly 250 back-relations — every table in every module hangs off
it. `pnpm typecheck` needs a 7 GB heap; the plain compiler dies at exit 134.

**The products are already modules.** Feature keys are namespaced by domain (`retail.*`,
`crm.*`, `hr.*`, `schools.*`); the route registry gates URL prefixes on those keys;
`lib/workspace-products.ts` already defines the vertical bundles; `client-templates.ts`
provisions each vertical with its own bundle set; each vertical has its own `provision.ts`,
its own permission matrix and its own `api/v2/<module>` tree. The HR module has a
mechanically enforced boundary test (`lib/hr/module-boundary.test.ts`) that forbids it
importing any vertical. This repo is unusually well prepared for a split.

**The shared layer is real and load-bearing.** Measured consumers, by import:

| Shared capability | Who calls it | How |
|---|---|---|
| Posting engine (`lib/accounting/posting.ts`, `integration.ts`) | Retail, Schools fees, Payroll, Disbursements, CRM, Maintenance, Stores (and Gold) | `captureAccountingEvent` / `createJournalEntryFromSource` — one seam, 30 call sites |
| AR/AP documents (`Customer`, `SalesInvoice`, `SalesReceipt`, `PurchaseBill`…) | CRM (`accounting-bridge.ts`), Sell, Schools, document rendering | Direct Prisma reads/writes on shared models |
| Fiscalisation (`FiscalReceipt`, FDMS connector) | Sell (`RetailSale.fiscalReceipt`), Campus (`SchoolFeeReceipt.fiscalReceipt`) | FK on the product side, drain worker in accounting |
| Stock (`lib/inventory`) | Sell (heavy), CRM (quoting from the catalogue), Books (COGS), Maintenance (`Equipment.location`) | `recordStockMovement`, `priceProducts` |
| Staff directory (`Employee`, `Department`, `JobGrade`) | People (owner), Campus (`SchoolTeacherProfile.employee`), Maintenance (`WorkOrder.technician`) | FK from the product to `Employee` |
| Record page + collaboration (`components/records`, `lib/records`, `CrmTask`/`CrmComment`/`CrmRecordFile`) | CRM and Campus | Registry keyed by `(subjectType, subjectId)`; `api/v2/records/_guard.ts` gates per subject |
| Documents, notifications, approvals (`lib/documents`, `lib/notifications`, `lib/workflow`) | Every module | Package functions |
| Design-system wrappers (`components/ui`, `components/layout`, `@corelithzw/react`) | Everything — 284 files import the design system directly | Components |

**Where a vertical has grown into a shared thing without anyone deciding it.** The split has
to untangle these first, and the complete list is short — every kernel-to-product import in
the tree, read off the imports rather than remembered:

*Shared UI and shared record machinery that lives inside the CRM.* `components/schools`
imports the CRM's `RecordDialog` **58 times**; the template library, the navbar and the
sidebar import `components/crm/{records/record-dialog,templates/attribute-header,crm-members}`
and `lib/crm/{collections-client,blocks,starter-templates}`; `components/records` imports
`lib/crm/{custom-fields,crm-v2,record-ref}`. Custom fields, record references, blocks,
starter templates and the form dialog are platform concerns that were born in the CRM. They
move to `@corelith/records` (custom fields, record refs, search aggregation) and
`@corelith/documents` (blocks, starter templates, the template library) and `@corelith/ui`
(the dialog, `PersonAvatar` from `components/schools/common`, the `SearchableOption` type
from `app/gold/types` that retail imports).

*The kernel calling up into products.* `lib/records/search.ts` imports six module search
arms (`crm`, `gold`, `operations`, `people`, `retail`, `schools`); `lib/navigation.ts` and
`lib/offline/workflow-catalog.ts` import the people and payroll tab configs;
`lib/platform/permission-catalog.ts` imports `lib/crm/permissions`;
`lib/documents/schools-sources.ts` imports `lib/schools/permissions`;
`lib/accounting/fiscal-drain.ts` and the fiscalisation replay route import
`lib/schools/fiscalisation`; `app/api/accounting/sales/*` imports `lib/crm/accounting-hooks`;
and `proxy.ts`, `lib/auth.ts` and `lib/workspaces.ts` import `lib/retail/pos-host`. Each of
these becomes a registration: a product registers its search arm, its nav, its permission
matrix, its document sources, its fiscal issuer, its accounting hooks and its portal-host
descriptor with the kernel at boot, and the kernel iterates a registry it does not populate.
The repo already does this for record types (`lib/records/registry.ts`); the pattern is being
applied, not invented.

*Things in the wrong layer.* `lib/platform/provision.ts` imports Books' bootstrap —
provisioning orchestrates every product and belongs in the control plane, not in the tenancy
package. `lib/platform/gating/nav-filter.ts` imports the navigation model — it is a UI
concern and moves with it.

Everything else already points the right way: products import the kernel, and no product
imports another product. `lib/hr` touches `lib/workspaces` only in a test.

**The extension points already exist — as registries.** The module contract does not have
to be invented; it is the union of what the repo's registries already accept:
`lib/platform/gating/route-registry.ts` (526 lines, route prefix → feature key),
`lib/platform/feature-catalog.ts` and `client-templates.ts` (features, bundles, tiers,
templates), `lib/platform/permission-catalog.ts` and `vertical-role-registry.ts` (roles and
permissions), `lib/records/registry.ts` (record types), `lib/documents/source-registry.ts`
(document sources), `lib/offline/module-registry.ts` and `workflow-catalog.ts` (offline
workflows), `lib/auth-core/strategy-registry.ts` (sign-in strategies), the CRM's
`views-registry.ts`, custom-field entities, widget catalogue and automation triggers, and
`lib/accounting/source-types.ts` (posting sources). Today each is a hand-maintained array
that names every module; the change is that a module *contributes* its rows instead.
`scripts/platform/sync-catalog.ts` already upserts the code catalog into `PlatformFeature`
and `FeatureBundle`, which is exactly how an npm module's features will reach the admin
console without the admin app compiling the module.

**The third-party surfaces exist too, in embryo.** `CrmApiKey` is a hashed, revocable,
per-company API key; `app/api/public/crm/{intake,webhook,sign-off,approvals,visits}` are
unauthenticated-by-design public routes; there are 330 `api/v2` route files behind session
auth; and `AccountingIntegrationEvent` is an outbox with retry and a drain worker. Those are
the bones of the out-of-process tier.

**What Gold is coupled to.** Gold is the module with the deepest reach into what stays:
seven back-relations on `Employee`, `Attendance.goldLedgerEntry`, two on `ShiftGroup`, two
on `AdjustmentEntry` (a gold correction creates a payroll adjustment), one on `ShiftReport`;
gold chart-of-accounts and posting rules seeded from `lib/accounting/defaults.ts`; six
`GOLD_*` values in `AccountingSourceType`; three gold notification emitters in
`lib/notifications.ts`; gold arms in global search; gold handling in the feature catalog,
templates, vertical roles and workspace products; and four admin-portal wizards that import
a type from `app/gold/types`. Nine gold routes capture accounting events *inside* a Prisma
`$transaction`, which is the fact that decides how the schema is composed (below).
Settlements (quantity-based pay) and Operations (shift and plant reports, downtime codes)
exist for the mine and go where Gold goes.

**What Compliance is coupled to.** Very little: notifications (four emitters), the
master-data page shell, `Site`, and one link into People — `Incident.linkedHrIncidents` ↔
`HrIncident.sourceIncident`. It is already shaped like an add-on.

**Hosts and identity are already per-deployment configuration.** `PLATFORM_ROOT_DOMAIN` is
an environment variable, not a constant; tenant hosts are `<slug>.<root>`; portal hosts are
`<portal>.<slug>.<root>`; the proxy already treats the bare root as marketing and the tenant
host as the workspace. The session is a JWT carrying `companyId`, `companySlug`,
`enabledFeatures` and `allowedHosts`. A second product host is a second root domain and one
more entry in `allowedHosts` — the model does not have to change, only its inputs.

**The landing sites are already a separate repository.** `tate2301/corelith.co.zw` is a
plain Next.js site with no database; it delivers leads to the CRM through a CRM API key.
That is the right relationship and it stays. Its catalogue names the products — Corelith
Sell, Corelith CRM, Corelith People, Corelith Campus — and those names are used below.

**There is no CI.** The repository has no `.github/`. Vercel's build is the only gate. That
is survivable for one deployable and not for five; a test-and-typecheck pipeline per package
is a prerequisite of the split, not a nicety.

## Options considered

| Option | Verdict | Why |
|---|---|---|
| **A. Four repositories, four databases** ("truly independent") | No | Every row of the shared-capability table above becomes a network integration with its own API, auth, retries and eventual consistency; identity, billing, fiscalisation and the ledger get copied four times and drift on the first hotfix. This is precisely the "develop the same thing twice" the business wants to avoid, and for a team this size it is a year of plumbing before a single product improves. |
| **B. Keep one app, add product hosts and branding** | No | Cheapest, but it is a skin, not a split. One build, one bundle, one blast radius, one release train; the compile problem gets worse, not better; nobody can own or ship a product independently. |
| **C. One monorepo, one app per product, shared packages, one database** | **Adopted** | Independence where the business feels it (hosts, brands, releases, ownership, bundle size) and sharing where the code needs it (ledger, stock, identity, records, UI). Extraction is `git mv`, not rewriting. Table ownership plus lint rules give a defined path to spin any product out later, if that ever becomes worth doing. |
| **D. Option C with a database per product** | Not now | Splitting the database is the expensive half of option A with none of the upside today. The schema-per-owner layout in option C is the preparation; the split itself is deferred until a product needs to scale or be sold separately, and at that point it is a project with a known perimeter rather than archaeology. |
| **E. Books and Stock as services** (HTTP APIs between apps) | No | They are libraries with a database, not services. In-process calls are simpler, transactional, and what the code already does. An outbox already exists (`AccountingIntegrationEvent`) for the one case that needs asynchrony. |
| **F. Run-time plugin loading** (modules fetched and executed by a running host) | No | A Next.js app is bundled at build and Vercel runs the bundle; server code cannot be loaded into it afterwards without abandoning the platform's own tooling, and untrusted code in the product's process is a boundary that cannot be held whatever the loader. Modules are composed at build time from npm; third parties who are not reviewed extend the products from outside the process. |

The marketing site and the design system (`@corelithzw/react`, published from
`corelith-design-docs`) stay in their own repositories: they share no runtime code with the
products and move at a different cadence. The end state is therefore **three repositories**,
not one and not six.

## Target shape

### Repository layout

```
corelith/                                     ← this repository, renamed from "huchu"
  apps/                                        host instances: a config, branding, generated route files
    sell/       *.sell.corelith.co.zw          modules: sell, books, stock, maintenance, compliance*
    crm/        *.crm.corelith.co.zw           modules: crm, books, stock (catalogue), compliance*
    people/     *.people.corelith.co.zw        modules: people, books, compliance*
    campus/     *.campus.corelith.co.zw        modules: campus, books, compliance*; reads the staff directory
    admin/      admin.corelith.co.zw           platform control plane (tenants, subscriptions, flags, domains, support, runbooks) + the Ink TUI
    workers/    —                              PDF render loop, fiscal drain, outbox consumers, module workers
    legacy/     *.apps.corelith.co.zw          the monolith as it is today, shrinking, deleted when Gold's repo builds
  packages/
    sdk/            @corelithzw/sdk            the module contract: manifest types, registration API, a typed facade over kernel services, a test harness
    host/           @corelithzw/host           the shell every app is an instance of: proxy, auth, layout, product switcher, module loader
    cli/            @corelithzw/cli            `corelith sync` — composes a host's modules: route files, schema fragments, migrations, catalog
    db/             @corelithzw/db             composed Prisma schema, one generated client, one migration history per deployment
    platform/       @corelithzw/platform       tenancy, auth, session claims, entitlements, gating, audit, api-utils, money, ids, uploads
    ui/             @corelithzw/ui             design-system wrappers, app shell, record page, charts, hooks, icons, tokens
    modules/                                   everything above the kernel — one contract, first-party copies live here
      books/  stock/  people/  records/  documents/  notifications/  workflow/  maintenance/  offline/  compliance/
      sell/   crm/    campus/                  the product modules: domain, routes, screens
    config/         shared eslint, tsconfig, tailwind, vitest presets
  turbo.json, pnpm-workspace.yaml, .github/workflows/, .changeset/

corelith-gold/                                 ← Gold's own repository (Phase 4)
  packages/gold/                               the module: domain, routes, screens, schema fragment, migrations, catalog entries
  apps/gold/                                   an enterprise host instance; depends on @corelithzw/* from npm
```

\* Compliance is an add-on: installed in every host, granted per tenant by entitlement.

Tooling: pnpm workspaces (already in use) plus Turborepo for the task graph and remote cache
(free on Vercel). One Vercel project per host with its Root Directory set to `apps/<name>`
and `turbo-ignore` as the ignored-build step, so a CRM-only change does not rebuild Sell.
TypeScript project references per package end the 7 GB type-check: each package checks
itself, and a host checks only what it composes. Changesets version the published packages.
The npm scope is `@corelithzw`, which already publishes the design system; the short names
elsewhere in this document are workspace names.

### Layering, and the rules that keep it

```
   apps/sell   apps/crm   apps/people   apps/campus   apps/admin   apps/gold (other repo)   hosts: a config + generated files
        │          │           │             │            │              │
   ┌────┴──────────┴───────────┴─────────────┴────────────┴──────────────┴─────┐
   │  sell   crm   people   campus   gold   <enterprise-x>   <partner-y>       │  modules, one contract each
   │  books  stock  records  documents  notifications  workflow                │  (import the SDK and the public
   │  maintenance  compliance  offline                                         │   subpaths of declared dependencies)
   └───────────────────────────────────┬───────────────────────────────────────┘
                                       │
                               @corelithzw/sdk                                   the facade — the only import a module makes
                                       │
                              ui ─── platform ─── db                             kernel
```

1. **Dependencies point down and are declared.** A host composes modules. A module imports
   `@corelithzw/sdk` and the *public* subpaths of modules it names in its manifest
   (`requires: ["books", "stock"]`); Stock posts its movements to Books, Campus reads
   People's `directory`, Gold requires People, Books and Stock. The graph is acyclic.
   Nothing imports a host, nothing imports another module's internals, and **the four
   marketed products declare no dependency on one another**. Enforced with
   `eslint-plugin-boundaries` (or dependency-cruiser) in CI, and by generalising
   `lib/hr/module-boundary.test.ts` into one test per package.
2. **The kernel never names a module.** Where it does today (fiscal drain → schools, sales
   receipts → CRM hooks, permission catalog → CRM permissions, global search → six arms,
   accounting defaults → gold's chart and rules), the module contributes the entry in its
   manifest and the kernel iterates a registry it does not populate. This is the same move
   the repo already made for record types (`lib/records/registry.ts`).
3. **A module owns its tables and writes another module's tables only through that
   module's public subpath.** Sell may read `Customer`; it creates one through
   `@corelith/books`. Campus may read `Employee`; it links a teacher through
   `@corelith/people/directory`. A grep-based test — the same shape as the boundary test —
   asserts a module's `prisma.<model>` calls stay within its own fragment plus the kernel's.
4. **Cross-product reactions go through the outbox, never through an import.** If a Campus
   event must ever cause something in CRM, it is written as an integration event and consumed
   by a worker. `AccountingIntegrationEvent` is that pattern already; generalise it when the
   first real case arrives, not before.
5. **Schema changes are expand-first.** Five apps deploy independently against one database,
   so a column is dropped only after every app that read it has shipped without it. Migrations
   run from one place (a release job on `packages/db`), never from an app's build.

### Modules and the SDK

A module is an npm package with a manifest. The manifest is the whole of the contract:

| Manifest section | What the module contributes | Where the kernel puts it today |
|---|---|---|
| `id`, `version`, `requires` | Identity and declared dependencies on other modules | — |
| `schema` | A Prisma fragment and timestamped migrations | `prisma/schema.prisma` |
| `routes` | Page components and API handlers keyed by path, each with its feature key | `app/**`, `route-registry.ts` |
| `navigation` | Sections, items, quick actions, the product's home | `navigation.ts`, `workspaces.ts` |
| `catalog` | Feature keys, bundles, template contributions, feature dependencies | `feature-catalog.ts`, `client-templates.ts`, `feature-dependencies.ts` |
| `permissions` | Resource × action × role matrix, vertical roles | `permission-catalog.ts`, `vertical-role-registry.ts` |
| `records` | Record types, custom-field entities, views | `lib/records/registry.ts`, CRM custom fields and views |
| `search` | A search arm | `lib/records/search.ts` |
| `documents` | Document sources and default templates | `lib/documents/source-registry.ts` |
| `posting` | Accounting source types, default accounts, seeded posting rules, fiscal issuers | `source-types.ts`, `accounting/defaults.ts`, `fiscal-drain.ts` |
| `notifications` | Notification types and emitters | `lib/notifications.ts` |
| `offline` | Offline workflows and mutation adapters | `lib/offline/module-registry.ts` |
| `provisioning` | The idempotent step that makes a tenant usable | `lib/<module>/provision.ts` |
| `workers` | Background jobs for `apps/workers` | `scripts/*-worker.ts` |
| `settings`, `widgets`, `imports` | Settings pages, dashboard widgets, import definitions | preferences, CRM widgets, `import-core` |

A module may import only `@corelithzw/sdk` and the public subpaths of the modules it
requires. The SDK is a facade: it re-exports the stable surface of `platform`, `ui`, `db`
and the kernel services (tenancy, session, entitlements, audit, money, ids, uploads,
notifications, documents, the posting engine, stock movements, the record shell). Internals
behind the facade may churn; the facade is versioned with semver and changesets, and a
module pins a major (`peerDependencies: { "@corelithzw/sdk": "^1" }`). The SDK ships a test
harness with in-memory fakes so a module's tests run without the kernel's database.

**Composition** is a build step, `corelith sync`, run by each host: it reads the manifests
of the modules in `corelith.config.ts` and writes the generated files — one-line route
re-exports under `app/`, the schema fragments into `packages/db`'s schema folder, the
migrations into one ordered history, and a `modules.generated.ts` that hands every
registration to the kernel. Generated files are committed, so a reviewer sees the surface a
host exposes, and CI fails if they are stale. A first-party module in the monorepo is a
workspace link; an external one is an npm dependency; the host cannot tell the difference,
which is the point.

**Schema rules for a module**, and why:

- A module owns its tables, prefixed with its id, each carrying `companyId` on the row with
  an index — the house rule from `building-a-vertical.md`.
- A module declares **no Prisma relation into kernel models or another module's models**;
  it stores their ids as columns. Prisma requires both sides of a relation, so a relation
  from a module table to `Company` would mean editing `Company` — which is what makes the
  `Company` model's 250 back-relations impossible to compose from packages. The cost is
  that those columns carry no database foreign key (Prisma would remove any it did not
  create). Kernel rows are never hard-deleted — tenants are suspended, employees deactivated
  — so the constraint would never have fired; the tenancy guard that scopes every query by
  `companyId` is the integrity mechanism the platform already relies on, and an integrity
  check script joins module tables against the kernel on a schedule.
- **One composed Prisma client per host, not one client per module.** Nine gold routes and
  every payroll and disbursement route capture the accounting event *inside* the same
  `$transaction` as the domain write. Separate clients cannot share a transaction, so the
  fragments are composed into one schema and one client. A module develops and tests
  against the same composition: `@corelithzw/db` publishes the kernel fragments, the module
  adds its own, and `corelith sync` generates a client for it.
- **Enums that modules extend become registrations.** `AccountingSourceType` cannot take
  values from a package at compose time without a migration per module; a module's posting
  sources are declared in its manifest and the composed enum is generated. Existing enum
  values are never removed, per `lib/workflow/approvals.test.ts`.

**Catalog and entitlements.** A module's feature keys and bundles are data in its manifest.
The host syncs them into `PlatformFeature` and `FeatureBundle` on deploy — the existing
`sync-catalog` mechanism — and the admin console reads the database. That is how the admin
app entitles a tenant to Gold without compiling Gold.

**Two tiers of extension:**

| | Native modules | Apps |
|---|---|---|
| Who | Us, reviewed partners, an enterprise's own developers | Anyone |
| Where it runs | In the host's process, composed at build from npm | Outside, in the developer's infrastructure |
| What it can touch | Everything the SDK exposes, its own tables, the shared transaction | The public API with scoped keys, webhooks from the outbox, custom fields, automations, embedded panels on record pages |
| Trust | Reviewed and signed before it enters a host | None required; scopes and rate limits bound it |
| Exists today as | The registries above, `lib/<module>` | `CrmApiKey`, `app/api/public/*`, `api/v2/*`, `AccountingIntegrationEvent` |

**Enterprise customisation** is a native module in the client's private repository,
composed into a **dedicated host instance** — a Vercel project (or a container) whose
`corelith.config.ts` lists the public modules plus theirs. A private module is never
compiled into a public product build: client components would ship its code to every
tenant. The dedicated host runs against the shared database by default; a client who needs
their own database gets one, which the schema-by-module layout allows without code changes.

### One database, schema by owner

`packages/db/prisma/schema/` holds the kernel's fragments (`platform.prisma`, `auth`,
`documents`, `notifications`, `workflow`) and, after `corelith sync`, one fragment per
composed module — `books`, `stock`, `people`, `records`, `sell`, `crm`, `campus`,
`maintenance`, `compliance`, and in the legacy host `gold` until it leaves. Prisma's
multi-file schema keeps one generated client and one migration history per deployment, so
the first split is a zero-diff refactor (`prisma migrate diff` must be empty in both
directions, the check ST-3 already uses). CODEOWNERS per fragment gives each module a
reviewer on its own tables and the platform a reviewer on the kernel's. Relations *within*
a fragment stay ordinary relations; relations *into* the kernel or another module are the
columns described above.

Three ownership moves come out of the audit:

- **The staff directory is kernel, the People product is not.** `Employee`, `Department`,
  `JobGrade` are read by Campus and Maintenance and will be read by anything that ever pays
  or rosters a person. They stay in the People module but are exposed through a narrow
  `@corelith/people/directory` subpath — list, read, link a user — that other modules may
  declare and import. Attendance, leave, compensation, payroll, disbursements and statutory
  are the product and are not importable from outside `packages/modules/people`. This preserves the asymmetry the
  HR boundary test already enforces: verticals may reach into HR's shape; HR never reaches
  into a vertical.
- **Collaboration tables move to Records.** `CrmTask`, `CrmComment`, `CrmRecordFile`,
  `CrmMention`, `CrmFollower` already serve Campus through `(subjectType, subjectId)`. They
  are owned by `@corelith/records`; the `Crm` prefix is renamed when convenient, not on the
  critical path.
- **`AccountingSourceType`, the default accounts and the posting rules are owned by Books,
  and contributed by modules.** Today a new posting source is a Books PR that edits the enum
  and `defaults.ts` by hand — which is how six `GOLD_*` values and a gold chart of accounts
  ended up inside the ledger. A module declares its source types, accounts and seeded rules
  in its manifest; the composed enum and defaults are generated; Books reviews nothing
  module-specific.

### How the integrations keep working

| Integration | Today | After the split |
|---|---|---|
| A POS sale posts to the ledger and fiscalises | `app/api/v2/retail` → `captureAccountingEvent`; `RetailSale.fiscalReceiptId` | Identical call into `@corelith/books`; same column; Sell's manifest declares its posting sources and fiscal issuer |
| A school fee receipt posts and fiscalises | `api/v2/schools/fees/_helpers.ts` → posting engine; `lib/schools/fiscalisation.ts` | Identical; Campus's manifest declares its issuer; the drain worker in `apps/workers` iterates the registry |
| CRM quotes from the catalogue and turns a won deal into an invoice | `lib/crm/stock.ts`, `lib/crm/accounting-bridge.ts` | Identical calls into `@corelith/stock` and `@corelith/books`; the "on invoice created" hook becomes a registration |
| Payroll posts a run | `lib/hr/payroll/posting.ts` | Identical |
| A teacher is linked to an employee | `lib/schools/teacher-identity.ts` reads `Employee` | Reads through `@corelith/people/directory` |
| Tasks, comments and files on a student or a lead | `api/v2/records/*` with a per-subject guard | Same routes, mounted in both `apps/crm` and `apps/campus` from `@corelith/records` |
| Invoices, customers, bank, VAT screens | `app/accounting/*` in the one app | `@corelith/books` exports the screens and handlers; each product app mounts them under `/books` with one-line re-exports, so an invoice link from a CRM deal stays in the app the user is in |
| Stock screens | `app/stores/*` | `@corelith/stock` exports them; Sell mounts everything, CRM mounts the catalogue and price lists, Campus mounts nothing |
| Moving between products | One sidebar | A product switcher in the shared shell lists the products the tenant is entitled to and links to their hosts; deep links use `<slug>.<product>.corelith.co.zw/<path>` |

Mounting a package's screens is a Next.js re-export (`export { default } from
"@corelith/books/screens/invoices"`; `export { GET, POST } from
"@corelith/books/api/invoices"`) with `transpilePackages` in each app's config. The
package ships source, so client/server boundaries are preserved.

### Hosts, identity and sign-in

Each product app is deployed with its own root: `PLATFORM_ROOT_DOMAIN=sell.corelith.co.zw`
for Sell, `campus.corelith.co.zw` for Campus, and so on. A tenant is then
`acme.sell.corelith.co.zw` and `acme.campus.corelith.co.zw` — the same `Company`, the same
slug, different products. The bare product host is the product's landing site, exactly as
`corelith.co.zw` is the platform's today, and the proxy already knows to treat a bare root as
marketing and a tenant host as a workspace.

Portals keep their pattern, `<portal>.<slug>.<root>`, provisioned per tenant through the
Vercel API as today (`docs/build-plan/multitenancy/tenant-surface-domain-provisioning.md`).
An optional simplification worth taking for the new hosts: flatten to one label
(`pos-acme.sell.corelith.co.zw`, `parent-acme.campus.corelith.co.zw`) so the product's single
wildcard certificate covers every portal and self-serve signup no longer depends on a
per-tenant Vercel call. It is a change to `buildPortalHost` and to the POS isolation
document; the isolation itself (a different origin per surface) is unchanged.

Sign-in once, everywhere: every app shares `NEXTAUTH_SECRET` and issues the same JWT with the
session cookie scoped to `.corelith.co.zw`. The `allowedHosts` claim gains the tenant's host
on every product it is entitled to, and the existing `isAllowedHost` check in the proxy keeps
a token minted for one company off another company's host. Two caveats are recorded here so
they are not rediscovered: a parent-domain cookie is sent to every host under
`corelith.co.zw`, so every such host must be one we run; and the moment a product gets its
own domain (`corelithsell.com`) the cookie no longer reaches it. The seam for that day is a
`createAuthOptions({ product })` factory in `@corelith/platform`; when a product leaves the
shared parent, sign-in moves to an `id.corelith.co.zw` hub with redirect-based login, and no
product code changes.

### Entitlements and billing

A tenant subscribes to products; a product grants a bundle set; a bundle grants feature keys.
This is the catalog that already exists — `ADDON_RETAIL_SUITE`, `ADDON_CRM_SUITE`,
`ADDON_WORKFORCE_CORE` + `ADDON_ZIMBABWE_PAYROLL`, `ADDON_SCHOOLS_SUITE` — with a `product`
dimension added so the admin console and the switcher can answer "which products does this
company have". Books and Stock are capabilities that arrive with whichever product includes
them, which is how the marketing site already describes them ("included in every plan").
Gating is unchanged: feature keys, the route registry, `FEATURE_GATE_POLICY=deny`. Each host
carries the registry slice its modules contribute, the gate audit runs per host, and a
module's catalog entries reach the database through the sync described above. Compliance
is priced as an add-on bundle that every product's template may carry.

The one thing the code cannot decide is the commercial model — see **Decisions needed**.

### The control plane

`apps/admin` is the one place a tenant is created, entitled, billed, supported and
observed, for every product. It is the current `app/portal/admin`, `app/api/platform-admin`,
`components/admin-portal` and the `scripts/platform` TUI, moved as they are. Provisioning
(`lib/platform/provision.ts`) moves here from the tenancy package, because it orchestrates
every product's bootstrap and the tenancy package must sit below them all. It becomes
module-aware: provisioning a tenant runs the provisioning step of every module the tenant is
entitled to, in dependency order, so a Campus tenant runs Campus's step and Books' bootstrap
because Campus posts to a ledger. The admin app compiles no product module; it reads the
composed catalog from the database and calls provisioning through the workers.

## What moves where

Line counts are from the current checkout (TypeScript and TSX only) and are there to size the
work, not to be exact.

| Destination | From | Approx. lines |
|---|---|---|
| `packages/modules/campus` (+ host `apps/campus`) | `app/schools`, `app/portal/{parent,student,teacher}`, `app/api/v2/schools`, `app/api/v2/portal`, `lib/schools`, `components/schools` | 128k |
| `packages/modules/crm` (+ host `apps/crm`) | `app/crm`, `app/api/v2/crm`, `app/api/public/crm`, `app/{a,c,f,s,v}/[token]`, `lib/crm`, `components/crm` | 76k |
| `packages/modules/sell` (+ host `apps/sell`) | `app/retail`, `app/portal/pos`, `app/api/v2/retail`, `app/api/v2/pos`, `lib/retail`, `components/retail`, `components/thrift` (the retail module's former name) | 50k |
| `packages/modules/people` (+ host `apps/people`) | `app/people`, `app/payroll`, `app/api/{payroll,hr,people,employees,departments,job-grades,compensation,disbursements,employee-payments,adjustments,approvals}`, `components/{people,payroll}`, `lib/hr`, `lib/people`, `lib/payroll`, `lib/payroll-periods.ts`; exports the `directory` subpath | 34k |
| `packages/modules/compliance` (add-on) | `app/compliance`, `app/api/compliance`, `components/compliance`, `app/reports/compliance-incidents`, the two compliance notification emitters | 3k |
| `packages/modules/books` | `lib/accounting`, `app/api/accounting`, `app/accounting`, `components/accounting`, `lib/commodity-billing.ts` if anything still needs it | 42k |
| `packages/modules/stock` | `lib/inventory`, `app/api/inventory`, `app/api/v2/inventory`, `app/api/stock-locations`, `app/stores`, `components/{inventory,stores}` | 8k |
| `packages/platform` | `lib/platform` (minus `provision.ts`, which goes to the control plane), `lib/auth-core`, `lib/auth.ts`, `lib/admin-portal*`, `proxy.ts` (as a factory), `lib/{roles,public-routes,api-utils,api-response,api-client,audit,logging,observability,id-generator,money,serialize-decimals,uploads,preferences,settings,user-management-api,site-url,prisma}`, `app/api/{auth,users,settings,preferences,sites,sections,uploads,ids,onboarding,webhooks,workspace-app-icon}`, `app/{login,access-blocked,preview-host,preferences,user-management,management,status}`, `components/{settings,preferences,user-management,management,status,onboarding}` | 32k |
| `apps/admin` | `app/admin`, `app/portal/admin`, `app/api/platform-admin`, `components/admin-portal`, `scripts/platform`, `lib/platform/provision.ts` | 33k |
| `packages/ui` | `components/{ui,layout,shared,charts,providers,auth,corelith}`, `hooks`, `lib/{icons,ui,utils,animation,charts,data-table-adapter,navigation,workspaces,workspace-products,primary-actions,saved-record}`, `lib/platform/gating/nav-filter.ts`, `app/globals.css`, `app/styles`, plus the strays: `RecordDialog`, `PersonAvatar`, `SearchableOption`, the navbar's `crm-members` | 23k |
| `packages/modules/records` | `lib/records`, `components/records`, `app/api/v2/records`, the collaboration tables, and from the CRM: `custom-fields`, `record-ref`, `collections-client`, the search aggregation | 6k plus the CRM pieces |
| `packages/modules/documents` | `lib/documents`, `lib/pdf.ts`, `app/api/{documents,document-templates}`, `components/{pdf,templates}`, `app/templates`, and from the CRM: `blocks`, `starter-templates`, `templates/attribute-header` | 7k plus the CRM pieces |
| `packages/modules/notifications` | `lib/notifications.ts`, `app/api/notifications`, `components/notifications`, web push | 2k |
| `packages/modules/workflow` | `lib/workflow` | <1k |
| `packages/modules/maintenance` (add-on) | `app/maintenance`, `app/api/{work-orders,equipment}`, `components/maintenance` | 4k |
| `packages/modules/offline` | `lib/offline`, `public/sw.js`, `app/offline` | 8k |
| `apps/workers` | `scripts/pdf-worker.ts`, `scripts/fiscal-worker.ts` | <1k |
| `packages/{sdk,host,cli}` | New: the manifest types and facade, the shell factory (`proxy.ts`, `lib/auth.ts`, layout, product switcher), and `corelith sync` | new, small |
| the Gold repository (`packages/gold`, `apps/gold`) | `app/gold`, `app/api/gold`, `lib/gold`, `components/gold`, `app/api/settlements`, `lib/settlements`, `app/{shift-report,plant-report}`, `app/api/{shift-reports,plant-reports,downtime-codes,analytics}`, `lib/operations`, the gold/ops pages under `app/reports`, the mine's executive dashboard (`app/dashboard`, `app/api/dashboard`, `lib/dashboard`, `components/dashboard`), `lib/commodity-billing.ts`, `scripts/backfill-gold-*`, and the gold rows pulled out of `accounting/defaults.ts`, `notifications.ts`, `source-types.ts`, the catalog, templates and vertical roles | ~50k |
| `apps/legacy` | Holds whatever has not yet moved; deleted when the Gold repository builds and the mine tenants are on its host | shrinking to 0 |
| leaves the repo | `app/home`, `lib/marketing`, `lib/marketing-site.ts` — superseded by `corelith.co.zw`; `/home/*` becomes a redirect | 9k |

## Gold, Compliance and the enterprise tier

**Gold is a shadow product.** It is still offered, only to enterprise tenants, and never
marketed. That makes it the first external module rather than something to retire: it moves
to its own repository as a module built against the published SDK, with an enterprise host
instance the mine tenants move onto. Nothing is exported or sunset; the pilot mine tenants
keep their product on a host that is simply not on any landing page. Settlements
(quantity-based pay built for gold) and Operations (shift and plant reports, downtime
codes, the mine's executive dashboard) are the mine's operations and go with it.

The work that move implies is the list under *What Gold is coupled to*: seven back-relations
on `Employee` and the ones on `Attendance`, `ShiftGroup`, `AdjustmentEntry` and
`ShiftReport` become columns on the gold side; gold's chart of accounts, posting rules,
source types, notification emitters, search arm, catalog rows, templates and vertical roles
become manifest contributions; the admin wizards stop importing a type from `app/gold`. A
gold correction that creates a payroll adjustment goes through People's public subpath,
which is a declared dependency (`requires: ["people", "books", "stock"]`) and is allowed
precisely because Gold is not one of the four marketed products.

**Compliance is an add-on for every product.** Permits, inspections, incidents and training
records become `packages/modules/compliance`, installed in every host and granted per tenant
by an add-on bundle. Its one link into People (an operational incident spawning an HR
incident) becomes an optional dependency: present when People is composed, a plain reference
otherwise.

**Maintenance** stays frozen (bug fixes only, per ST-4.1) and becomes an add-on module by
the same mechanism, because Sell mounts it and it posts `MAINTENANCE_COMPLETION` to Books.
It is not a product, and the CRM's `CrmWorkOrder` (a field-service job card) is a different
thing and stays in CRM.

Two consequences worth stating plainly:

- `docs/rollout/master-rollout-plan.md` names gold operations as a beachhead and prices a
  Gold Edition. Gold is now unmarketed and enterprise-only; the master plan needs a changelog
  row recording that when this document is adopted.
- The `Employee` model is mine-shaped (`villageOfOrigin`, `nextOfKinName`, `passportPhotoUrl`
  are required). The People product will want those relaxed. That is a People story, not a
  split story, and it is cheap once People owns the fragment.

## Sequence

Each phase leaves production identical or better. Nothing waits on a big-bang. Effort is an
estimate for a small team working on this alongside product work; the kernel extraction is
the bulk and is deliberately sliced so any PR can ship alone. Publishing to npm waits until
Phase 4 — first-party modules are workspace links until an external consumer exists, because
a published API is a promise and there is no reason to make it early.

### Phase 0 — Decide (1 week)

Adopt this document. Settle the decisions in the next section. Write CODEOWNERS for the
target layout. Record the Gold reversal in the master plan's changelog.

*Exit:* the target layout, the module contract's shape, the host model and the enterprise
deployment model are written down and agreed.

### Phase 1 — The monorepo around the monolith (1–2 weeks)

- `git mv` the current app to `apps/legacy` (history is preserved). Add `pnpm-workspace.yaml`
  packages, `turbo.json`, `packages/config`, `.changeset/`.
- Extract `packages/db`: split `schema.prisma` into one fragment per future module;
  `prisma migrate diff` empty both ways; migrations run from a release job, not from
  `next build`.
- Add GitHub Actions: lint, typecheck, vitest, `next build`, `pnpm platform:audit-feature-gates`,
  affected-only via Turborepo. Vercel keeps deploying `apps/legacy` from its new root
  directory; confirm on the account that a bare host and its wildcard may sit on different
  projects, which Phase 3 relies on.

*Exit:* production unchanged; CI green on every PR; the compile problem measurably smaller
from the schema split alone.

### Phase 2 — Extract the kernel and define the contract (4–6 weeks, one package per PR)

In dependency order: `ui` (taking `RecordDialog`, `PersonAvatar`, `SearchableOption` and
the nav filter with it), `platform`, then **`sdk`, `host` and `cli`** — the manifest types,
the facade, the shell as a factory (the proxy, the auth options, the POS host descriptor as
per-host portal config), and `corelith sync` generating route files from manifests. Then the
capability modules against the contract: `workflow`, `notifications`, `documents` (taking
the template library, blocks and starter templates out of the CRM), `records` (taking custom
fields, record refs and the search aggregation out of the CRM, with search arms as manifest
entries), `stock`, `books` (fiscal issuers, accounting hooks, default accounts and posting
rules as manifest entries), `people` (with the `directory` subpath; nav and offline workflow
catalogs as manifest entries), `maintenance`, `compliance`, `offline`. Each PR is a move, an
alias change, a manifest and a boundary rule. `apps/legacy` becomes the first host instance
— it composes every module — and keeps shipping throughout.

*Exit:* `apps/legacy` is a host that composes modules; every `lib/*` it used is a package;
the boundary lint passes with the declared-dependencies rule on; `corelith sync` is what
produces its route files.

### Phase 3 — Cut the products out, one at a time (2–3 weeks each)

Order: **Campus, Sell, CRM, People.** Campus first because it is the most self-contained
(three imports into accounting, five into CRM that are the record UI), the largest (so the
legacy host shrinks the most), founder-managed, and already priced and provisioned on its
own. Sell second because it exercises every kernel mount — Books, Stock, Maintenance,
Compliance, Offline, fiscalisation — and is the commercial priority. CRM third (records,
public intake, token pages). People last; its module has been in the kernel's dependency
graph since Phase 2, so the cut is a host instance and a manifest.

Per product: move its code into `packages/modules/<product>` with a manifest, create the
host `apps/<product>` (config, branding, `corelith sync`), give it its Vercel project on
`*.<product>.corelith.co.zw`. Dark-launch with one pilot tenant on the new host with
`apps/legacy` still serving the old one. Flip: add the product host to the tenant's
`allowedHosts`, 308 `<slug>.apps.corelith.co.zw/<product>/*` → `<slug>.<product>.corelith.co.zw/*`
from legacy, drop the module from legacy's config.

*Exit per product:* the product serves only from its own host; legacy's config no longer
lists it; the legacy gate audit shows its routes gone.

### Phase 4 — Gold leaves, and the SDK is published (3–4 weeks)

Publish `@corelithzw/sdk`, `host`, `cli`, `db`, `platform`, `ui` and the capability modules
with changesets — public for the SDK, UI and types, private for the rest. Create the Gold
repository: `packages/gold` (the module, with the severed relations and manifest
contributions listed above) and `apps/gold` (an enterprise host depending on the published
packages). Build it in CI against the published versions, not workspace links — that is the
test. Move the mine tenants to the Gold host; delete `apps/legacy`. Delete `app/home` once
`corelith.co.zw` carries every page it did, with redirects; retire the `.claude/agents/gold-*`
roster with the module.

*Exit:* a module built outside the monorepo, against npm, runs in production; nothing in the
monorepo mentions gold.

### Phase 5 — The extension programme (business-paced)

Native tier: SDK documentation, a `create-corelith-module` template, the review-and-sign
gate for partner modules, a compatibility matrix in CI (each published module against the
SDK majors it claims). App tier: scoped API keys generalised from `CrmApiKey` to every
module, outbound webhooks from the outbox, embedded panels on record pages, and a listing.
The first enterprise custom module is the pilot for both.

## Decisions needed from the business

1. **Gold's enterprise tenants.** Gold is settled as a shadow product in its own repository.
   Decide which tenants move to its host, whether that host runs on the shared database or a
   dedicated one, and who owns the Gold repository once it is separate.
2. **Commercial model.** `corelith.co.zw` as pushed on 2 September sells Start / Grow / Scale
   plans that bundle Sell + Stock + Books at US$39 and add CRM and People at Grow.
   "Independent products" implies each product is bought on its own. Both can be expressed by
   the catalog; the entitlement, signup and switcher work in Phase 3 needs to know which.
   Compliance as an add-on and Maintenance as an add-on need a price and a place in the
   bundles.
3. **Host model.** Confirm `<slug>.<product>.corelith.co.zw` for workspaces and the bare
   product host for the landing site, and choose between the current three-label portal
   pattern and the flattened one-label pattern for the new products.
4. **Names.** Sell and Campus are given; `crm.` and `people.` are proposed from the marketing
   catalogue.
5. **Distribution.** What is public on npm (the SDK, UI and types are proposed) and what is
   private; whether private packages live on npm's private tier or GitHub Packages; who may
   publish to the `@corelithzw` scope.
6. **The extension programme's rules.** Who may ship a native module (reviewed and signed),
   what an app may reach through the public API, and whether enterprise modules are built by
   us, by the client, or by partners — each answer changes who the SDK is documented for.
7. **Ownership.** Who owns each host and each package in CODEOWNERS, including the SDK, which
   is the one package whose changes reach every module. A package with no owner is the one
   that drifts.

## Risks

| Risk | Mitigation |
|---|---|
| Kernel drift by another route — a product copies a kernel function "just for now" | The boundary lint and the table-ownership test fail the PR; both are Phase 1/2 deliverables, not follow-ups |
| One migration history for five apps means a product schema change needs a `packages/db` review | That is the price of one database and it is small; CODEOWNERS per schema file keeps the review to the right people; expand-first keeps deploys independent |
| Shared session cookie across `*.corelith.co.zw` | Every host under the parent is one we run; the auth factory is the seam to an `id.` hub when a product gets its own domain |
| Vercel build minutes and project sprawl (six projects) | `turbo-ignore` builds only what changed; remote cache; the marketing site is already a separate project so this is four new ones |
| Extraction regressions | Every phase ships behind the existing tests plus the boundary tests; products dark-launch on their new host before the flip; legacy keeps serving until the flip |
| The record UI and collaboration tables straddle CRM and Campus | They are moved into `records` in Phase 2 before either product is cut, so neither cut has to touch them |
| Books screens mounted in four apps look like four Books | They are one package; a fix lands once. Product-specific theming is a prop, not a fork |
| A published SDK is a promise: every kernel change becomes a compatibility question | The facade is the only public surface, so internals churn freely; semver with changesets; a compatibility matrix in CI; publishing waits until Gold needs it (Phase 4) |
| Composition machinery grows into a framework of its own | `corelith sync` is codegen, not a runtime: it writes plain files a reviewer can read, and the generated files are committed and diffed in CI |
| Module tables carry no database foreign key into the kernel | Kernel rows are never hard-deleted; every query is tenant-scoped by the guard the platform already relies on; a scheduled integrity check joins module tables against the kernel and reports orphans |
| A private enterprise module leaks into a public bundle | Private modules are composed only into dedicated host instances; CI refuses a public host whose config names a private package |
| "Everything is a module" becomes abstraction for its own sake | First-party modules are workspace links, get no version, and pay no publishing cost until an external consumer exists |

## What this plan refuses to do

- Separate repositories per product, for the reasons in option A.
- A database per product now, for the reasons in option D.
- HTTP services for Books or Stock.
- A rewrite of anything. Every step is `git mv`, an alias change and a rule.
- Deleting Gold, operations or compliance: Gold leaves as a module with its tenants, and
  Compliance stays as an add-on.
- Loading third-party code into the product's process at run time.

## Changelog

| Date | Commit | Description |
|---|---|---|
| 2026-09-05 | — | **Revised for the follow-up decisions.** Gold is a shadow product — offered, enterprise-only, unmarketed — and moves to its own repository as the first external module, so nothing is exported or sunset. Compliance is an add-on every product carries. Everything above the kernel now implements one module contract (the manifest), products are modules with thin host instances, and modules are npm packages composed at build time by `corelith sync`; run-time plugin loading is rejected with the reason. Two extension tiers (native modules, apps). Schema rules for composable modules: no Prisma relation into the kernel, one composed client so posting stays transactional, enum contributions as registrations. Publishing waits until Phase 4. Layout, what-moves-where, sequence, decisions and risks updated. |
| 2026-09-05 | — | Document created: the split decision, the evidence it rests on, the target shape, the sequence, and the decisions the business still owes. |
