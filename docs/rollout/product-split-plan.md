# Product Split — Decision Record and Plan

**Status:** decided; proposed for adoption. **Date:** 2026-09-05 (third revision — see the
changelog).

The business has decided that the platform becomes four products marketed separately —
**Sell** (retail), **CRM**, **People** (HR & payroll) and **Campus** (education) — each with
its own landing site and host (`sell.corelith.co.zw`, `campus.corelith.co.zw`, …). It wants the
shared machinery (stock, books, maintenance, compliance, documents, identity) built once, a
base that enterprise customisation and future modules can plug into, **Gold** kept as an
unmarketed enterprise-only product, and **Compliance** available to every product.

Those are the inputs. Everything below is the engineering decision on how to get there,
made on the evidence in the repository. Where an earlier draft of this document carried a
mechanism as a given — modules distributed from npm, Gold in a separate repository, a
published SDK, build-time composition — this revision decides against it and says why.
The decisions are listed together in *Decisions* near the end; the rest of the document is
the reasoning and the plan.

It is written the way `docs/rollout/master-rollout-plan.md` is written: decisions first,
evidence second, then the sequence. It carries no story table. If adopted, stories are added
to the rollout roadmaps under their house rules; this document stays the decision record.

## The setup, in one page

**One private monorepo. One Next.js host per product, each on its own domain. One
database. Everything above the kernel is a module — a workspace package with a manifest —
and a host is a small app that composes modules. Nothing is published, nothing is generated,
nothing runs as a service.**

- **Products are hosts.** `apps/sell`, `apps/crm`, `apps/people`, `apps/campus` are Next.js
  apps with their own pages, their own Vercel project, their own wildcard domain, their own
  release cadence and their own bundle. A host's pages are thin: they import screens from
  modules. The pages of Books, Stock, Compliance and Maintenance are re-exported into every
  host that mounts them.
- **Capabilities are modules in the same repo.** Books (the ledger, AR/AP, tax, FDMS), Stock,
  the staff directory, Records, Documents, Notifications, Workflow, Maintenance, Compliance and
  the offline runtime are packages under `packages/modules/`. So are the four products. So is
  Gold. One contract for all of them: a manifest that contributes routes' feature keys,
  navigation, catalog entries, permissions, record types, a search arm, document sources,
  posting sources, notification types, offline workflows and a provisioning step. The kernel
  iterates those registrations and never names a module.
- **One database, one Prisma schema in one file per module, ordinary relations.** Because
  every module lives in the same repository, tables keep real Prisma relations and real
  foreign keys. The schema split is a zero-diff refactor. One migration history, run from a
  release job, expand-first because hosts deploy independently.
- **Integration stays in-process.** Sell posts to Books by calling the posting engine, exactly
  as today. The rule that keeps it honest is direction: modules import the kernel's public
  entrypoints and the public subpaths of modules they declare; the four marketed products
  declare no dependency on one another; the kernel depends on nothing above it. Enforced by
  lint and by the boundary tests the repo already has.
- **Gold stays, delisted.** Gold, settlements and the mine's operations remain modules in this
  repository, composed only into `apps/enterprise` — which is today's monolith, renamed, on
  today's host. The mine tenants do not move. Gold leaves the catalog, the templates and the
  marketing site; it does not leave the codebase.
- **Compliance is an add-on** module composed into every host and granted per tenant.
- **Extensibility now is configuration and the API; custom code comes when a contract pays
  for it.** Custom fields, automations, templates, document layouts, permissions and widgets
  already exist in the CRM and generalise to every product through the Records and Documents
  modules. API keys and webhooks from the outbox let any developer integrate from outside the
  process. When an enterprise client needs custom code, it is a private module in this
  private repository composed into a dedicated host. Publishing to npm happens only if a
  party without repository access must build a module, and there is no such party today.
- **The monolith is not rewritten; it is strangled.** It becomes `apps/legacy` on day one,
  packages are extracted from it one PR at a time, products are cut out one at a time, and
  what remains is renamed `apps/enterprise` and keeps serving.

## What the codebase says

The recommendation is read off the repository, not off taste. The facts that decided it:

**Size.** 503k lines of TypeScript in one Next.js 16 app: 273 pages, 449 route handlers,
295 Prisma models and 175 enums in one 11k-line schema, 64 migrations, 192 test files. The
`Company` model carries roughly 250 back-relations — every table in every module hangs off
it. `pnpm typecheck` needs a 7 GB heap; the plain compiler dies at exit 134.

**Team.** The commit history and the roadmaps show one founder-engineer plus assistants.
Every mechanism in this plan is weighed against that: a framework that would take a team of
five a quarter takes this team a year, during which the products do not improve.

**The repository is public.** `tate2301/huchu` is a public GitHub repository holding the
entire multi-tenant platform, its data model and its operator tooling. That is a decision to
revisit regardless of the split; it also rules out enterprise-private code living here until
it changes.

**The products are already modules.** Feature keys are namespaced by domain (`retail.*`,
`crm.*`, `hr.*`, `schools.*`); the route registry gates URL prefixes on those keys;
`lib/workspace-products.ts` already defines the vertical bundles; `client-templates.ts`
provisions each vertical with its own bundle set; each vertical has its own `provision.ts`,
its own permission matrix and its own `api/v2/<module>` tree. The HR module has a
mechanically enforced boundary test (`lib/hr/module-boundary.test.ts`) that forbids it
importing any vertical. The pages are already thin: `app/crm` is 700 lines across 37 files
and `app/schools` 1,300 across 60, each page a wrapper around components. This repo is
unusually well prepared for a split.

**The shared layer is real and load-bearing.** Measured consumers, by import:

| Shared capability | Who calls it | How |
|---|---|---|
| Posting engine (`lib/accounting/posting.ts`, `integration.ts`) | Retail, Schools fees, Payroll, Disbursements, CRM, Maintenance, Stores, Gold | `captureAccountingEvent` / `createJournalEntryFromSource` — one seam, 30 call sites |
| AR/AP documents (`Customer`, `SalesInvoice`, `SalesReceipt`, `PurchaseBill`…) | CRM (`accounting-bridge.ts`), Sell, Schools, document rendering | Direct Prisma reads/writes on shared models |
| Fiscalisation (`FiscalReceipt`, FDMS connector) | Sell (`RetailSale.fiscalReceipt`), Campus (`SchoolFeeReceipt.fiscalReceipt`) | FK on the product side, drain worker in accounting |
| Stock (`lib/inventory`) | Sell (heavy), CRM (quoting from the catalogue), Books (COGS), Maintenance (`Equipment.location`) | `recordStockMovement`, `priceProducts` |
| Staff directory (`Employee`, `Department`, `JobGrade`) | People (owner), Campus (`SchoolTeacherProfile.employee`), Maintenance (`WorkOrder.technician`), Gold | FK from the module to `Employee` |
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
move to the Records module (custom fields, record refs, search aggregation), the Documents
module (blocks, starter templates, the template library) and the UI package (the dialog,
`PersonAvatar` from `components/schools/common`, the `SearchableOption` type from
`app/gold/types` that retail and four admin wizards import).

*The kernel calling up into products.* `lib/records/search.ts` imports six module search
arms (`crm`, `gold`, `operations`, `people`, `retail`, `schools`); `lib/navigation.ts` and
`lib/offline/workflow-catalog.ts` import the people and payroll tab configs;
`lib/platform/permission-catalog.ts` imports `lib/crm/permissions`;
`lib/documents/schools-sources.ts` imports `lib/schools/permissions`;
`lib/accounting/fiscal-drain.ts` and the fiscalisation replay route import
`lib/schools/fiscalisation`; `app/api/accounting/sales/*` imports `lib/crm/accounting-hooks`;
`lib/accounting/defaults.ts` seeds gold's chart of accounts and posting rules; and
`proxy.ts`, `lib/auth.ts` and `lib/workspaces.ts` import `lib/retail/pos-host`. Each of these
becomes a registration: the module contributes its search arm, its nav, its permission
matrix, its document sources, its fiscal issuer, its accounting hooks, its default accounts
and its portal-host descriptor in its manifest, and the kernel iterates a registry it does
not populate. The repo already does this for record types (`lib/records/registry.ts`); the
pattern is being applied, not invented.

*Things in the wrong layer.* `lib/platform/provision.ts` imports Books' bootstrap —
provisioning orchestrates every module and belongs in the control plane, not in the tenancy
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

**The out-of-process surfaces exist too, in embryo.** `CrmApiKey` is a hashed, revocable,
per-company API key; `app/api/public/crm/{intake,webhook,sign-off,approvals,visits}` are
unauthenticated-by-design public routes; there are 330 `api/v2` route files behind session
auth; and `AccountingIntegrationEvent` is an outbox with retry and a drain worker. Those are
the bones of integration by any developer without running their code in our process.

**What Gold is coupled to.** Gold reaches deeper into what stays than any other module:
seven back-relations on `Employee`, `Attendance.goldLedgerEntry`, two on `ShiftGroup`, two on
`AdjustmentEntry` (a gold correction creates a payroll adjustment), one on `ShiftReport`;
gold chart-of-accounts and posting rules seeded from `lib/accounting/defaults.ts`; six
`GOLD_*` values in `AccountingSourceType`; three gold notification emitters in
`lib/notifications.ts`; gold arms in global search; gold handling in the feature catalog,
templates, vertical roles and workspace products. Nine gold routes capture accounting events
*inside* a Prisma `$transaction`. Severing all of that to move Gold to another repository
is weeks of work whose only output is that the same code runs from a different folder; it is
the strongest single argument for keeping Gold where it is.

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
| **A. Four repositories, four databases** ("truly independent") | No | Every row of the shared-capability table above becomes a network integration with its own API, auth, retries and eventual consistency; identity, billing, fiscalisation and the ledger get copied four times and drift on the first hotfix. For this team it is a year of plumbing before a single product improves. |
| **B. Keep one app, add product hosts and branding** | No | Cheapest, but it is a skin, not a split. One build, one bundle, one blast radius, one release train; the compile problem gets worse, not better; a Campus deploy can take the POS down. |
| **C. One monorepo, one host per product, shared modules, one database** | **Adopted** | Independence where the business feels it (hosts, brands, releases, bundles) and sharing where the code needs it (ledger, stock, identity, records, UI). Extraction is `git mv`, not rewriting. |
| **D. Option C with a database per product** | Not now | Splitting the database is the expensive half of option A with none of the upside today. Schema-by-module is the preparation; the split is deferred until a product needs to scale or be sold separately. |
| **E. Books and Stock as services** (HTTP APIs between apps) | No | They are libraries with a database, not services. In-process calls are simpler, transactional, and what the code already does. |
| **F. Modules as npm packages composed into hosts at build time, with a published SDK** | Not now | It is the right shape for a platform with outside developers and it is what an earlier draft of this document proposed. It also costs a published, semver-governed API, a codegen step, schema composition without foreign keys, and a versioning discipline — all before a single outside developer exists. The module boundary is built now inside the repo; publishing is a later step that the boundary makes possible and a customer makes worthwhile. |
| **G. Run-time plugin loading** | No | A Next.js app is bundled at build and Vercel runs the bundle; untrusted code in the product's process is a boundary that cannot be held whatever the loader. |
| **H. Gold in its own repository** | No | It gains no secrecy (the repository is public today and becomes private under this plan either way), it forces option F's costs immediately, and it spends weeks severing the deepest coupling in the tree to end up running the same code from another folder. Delisting is a catalog change; it does not need a repository. |

The marketing site and the design system (`@corelithzw/react`, published from
`corelith-design-docs`) stay in their own repositories: they share no runtime code with the
products and move at a different cadence. The end state is **three repositories**, exactly as
today.

## Target shape

### Repository layout

```
corelith/  (this repository, renamed from "huchu", made private)
  apps/                                 hosts: pages, a config listing modules, branding, vercel.json
    sell/        *.sell.corelith.co.zw       sell + books + stock + maintenance + compliance
    crm/         *.crm.corelith.co.zw        crm + books + stock (catalogue) + compliance
    people/      *.people.corelith.co.zw     people + books + compliance
    campus/      *.campus.corelith.co.zw     campus + books + compliance; reads the staff directory
    enterprise/  *.apps.corelith.co.zw       everything, including gold — today's monolith, renamed; the mine tenants stay here
    admin/       admin.corelith.co.zw        the control plane: tenants, subscriptions, flags, domains, support, runbooks + the Ink TUI
    workers/     —                           PDF render loop, fiscal drain, outbox consumers
  packages/
    db/            composed Prisma schema (one file per module), one client, one migration history
    platform/      tenancy, auth, session claims, entitlements, gating, audit, api-utils, money, ids, uploads
    ui/            design-system wrappers, app shell, sidebar, product switcher, record page, charts, hooks, icons
    modules/
      books/  stock/  people/  records/  documents/  notifications/  workflow/  maintenance/  compliance/  offline/
      sell/   crm/    campus/  gold/
    config/        shared eslint, tsconfig, tailwind, vitest presets
  turbo.json, pnpm-workspace.yaml, .github/workflows/
```

Tooling: pnpm workspaces (already in use) plus Turborepo for the task graph and remote cache
(free on Vercel). One Vercel project per host with its Root Directory set to `apps/<name>`
and `turbo-ignore` as the ignored-build step, so a CRM-only change does not rebuild Sell.
TypeScript project references per package end the 7 GB type-check: each package checks
itself, and a host checks only what it composes. Every package is a workspace link; nothing
is versioned or published.

### Layering, and the rules that keep it

```
   apps/sell   apps/crm   apps/people   apps/campus   apps/enterprise   apps/admin      hosts
        │          │           │             │              │              │
   ┌────┴──────────┴───────────┴─────────────┴──────────────┴──────────────┴─────┐
   │  sell   crm   people   campus   gold                                        │  modules
   │  books  stock  records  documents  notifications  workflow                  │  (one manifest each; import the
   │  maintenance  compliance  offline                                           │   kernel's public entrypoints and
   └───────────────────────────────────┬───────────────────────────────────────┘   declared modules' public subpaths)
                                       │
                              ui ─── platform ─── db                                kernel
```

1. **Dependencies point down and are declared.** A host composes modules. A module imports
   the kernel packages' public entrypoints and the public subpaths of modules it names in its
   manifest (`requires: ["books", "stock"]`); Stock posts its movements to Books, Campus reads
   People's `directory`, Gold requires People, Books and Stock. The graph is acyclic. Nothing
   imports a host, nothing deep-imports another package's internals, and **the four marketed
   products declare no dependency on one another.** Enforced with `eslint-plugin-boundaries`
   (or dependency-cruiser) in CI, and by generalising `lib/hr/module-boundary.test.ts` into
   one test per package.
2. **The kernel never names a module.** Where it does today (the list above), the module
   contributes the entry in its manifest and the kernel iterates a registry it does not
   populate — the move the repo already made for record types.
3. **A module owns its tables and writes another module's tables only through that module's
   public subpath.** Sell may read `Customer`; it creates one through Books. Campus may read
   `Employee`; it links a teacher through People's `directory`. A grep-based test — the same
   shape as the boundary test — asserts a module's `prisma.<model>` calls stay within its own
   schema file plus the kernel's.
4. **Cross-product reactions go through the outbox, never through an import.** If a Campus
   event must ever cause something in CRM, it is written as an integration event and consumed
   by a worker. `AccountingIntegrationEvent` is that pattern already; generalise it when the
   first real case arrives, not before.
5. **Schema changes are expand-first.** Six hosts deploy independently against one database,
   so a column is dropped only after every host that read it has shipped without it.
   Migrations run from one place (a release job on `packages/db`), never from a host's build.

### Modules and the manifest

A module is a workspace package exporting three things: its **domain** (what was `lib/<x>`),
its **screens and components** (what was `components/<x>` and the fat parts of `app/<x>`), and
a **manifest** — a data-only entrypoint (`@corelithzw/module-sell/manifest`) that declares
what the module contributes:

| Manifest section | What the module contributes | Where the kernel keeps it today |
|---|---|---|
| `id`, `requires` | Identity and declared dependencies on other modules | — |
| `routes` | URL prefixes with their feature keys and roles | `route-registry.ts` |
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
| `hosts` | Portal-host descriptors (the POS host, the parent/student/teacher portals) | `lib/retail/pos-host.ts`, `portal-hosts.ts` |

A host lists its modules in one file and hands their manifests to the kernel at boot
(`registerModules([sell, books, stock, maintenance, compliance])`). The admin host imports
every module's manifest — data only, so no module code enters its bundle — and therefore
knows the whole catalog without any sync step. Enums that modules extend
(`AccountingSourceType` and the like) stay ordinary Prisma enums edited in the module's own
schema file; there is no composition step to work around because there is one repository.

**How a host mounts a module's screens and routes.** No code generation.

- A product's own pages live in its host: `apps/campus/app/schools/**` are the same thin
  wrappers `app/schools/**` is today, importing from the Campus module.
- A shared module's pages are re-exported by hand: `apps/sell/app/books/invoices/page.tsx` is
  `export { default, metadata } from "@corelithzw/module-books/screens/invoices"`. Books has
  17 pages and Stock 10; four hosts of one-line files is boilerplate a reviewer can read.
- A shared module's API is mounted through one catch-all route per module per host
  (`apps/sell/app/api/books/[[...path]]/route.ts`) that hands the request to the module's
  router. Books has 90 handlers; nobody writes 360 re-export files. The route registry still
  gates by prefix, so nothing about gating changes.
- `transpilePackages` in each host's config, so modules ship source and client/server
  boundaries are preserved.

### One database, schema by module

`packages/db/prisma/schema/` holds one `.prisma` file per module plus the kernel's
(`platform`, `auth`, `documents`, `notifications`, `workflow`). Prisma's multi-file schema
keeps one generated client and one migration history, relations across files are ordinary
relations, and the split is a zero-diff refactor (`prisma migrate diff` must be empty in both
directions, the check ST-3 already uses). Because everything is one repository, **tables keep
their relations and their foreign keys** — the column-only rule an npm-composed schema would
have forced is not needed and not adopted.

Three ownership moves come out of the audit:

- **The staff directory is shared, the People product is not.** `Employee`, `Department`,
  `JobGrade` are read by Campus, Maintenance and Gold. They stay in the People module but are
  exposed through a narrow `directory` subpath — list, read, link a user — that other modules
  may declare and import. Attendance, leave, compensation, payroll, disbursements and
  statutory are the product and are not importable from outside `packages/modules/people`.
  This preserves the asymmetry the HR boundary test already enforces.
- **Collaboration tables move to Records.** `CrmTask`, `CrmComment`, `CrmRecordFile`,
  `CrmMention`, `CrmFollower` already serve Campus through `(subjectType, subjectId)`. They are
  owned by the Records module; the `Crm` prefix is renamed when convenient.
- **Books owns the posting enums and defaults; modules contribute rows.** A module's source
  types, default accounts and seeded rules are declared in its manifest and its schema file,
  which is how six `GOLD_*` values and a gold chart of accounts stop living inside the ledger.

### How the integrations keep working

| Integration | Today | After the split |
|---|---|---|
| A POS sale posts to the ledger and fiscalises | `app/api/v2/retail` → `captureAccountingEvent`; `RetailSale.fiscalReceiptId` | Identical call into Books; same FK; Sell's manifest declares its posting sources and fiscal issuer |
| A school fee receipt posts and fiscalises | `api/v2/schools/fees/_helpers.ts` → posting engine; `lib/schools/fiscalisation.ts` | Identical; Campus's manifest declares its issuer; the drain worker iterates the registry |
| CRM quotes from the catalogue and turns a won deal into an invoice | `lib/crm/stock.ts`, `lib/crm/accounting-bridge.ts` | Identical calls into Stock and Books; the "on invoice created" hook is a manifest entry |
| Payroll posts a run | `lib/hr/payroll/posting.ts` | Identical |
| A gold correction creates a payroll adjustment | direct Prisma writes on `AdjustmentEntry` | Through People's public subpath, which Gold declares |
| A teacher is linked to an employee | `lib/schools/teacher-identity.ts` reads `Employee` | Through People's `directory` |
| Tasks, comments and files on a student or a lead | `api/v2/records/*` with a per-subject guard | Same routes, mounted in both the CRM and Campus hosts from the Records module |
| Invoices, customers, bank, VAT screens | `app/accounting/*` in the one app | Books' screens re-exported under `/books` in each host, so an invoice link from a CRM deal stays in the app the user is in |
| Stock screens | `app/stores/*` | Sell mounts everything, CRM the catalogue and price lists, Campus nothing |
| Moving between products | One sidebar | A product switcher in the shared shell lists the products the tenant is entitled to and links to their hosts |

### Hosts, identity and sign-in

Each product host is deployed with its own root: `PLATFORM_ROOT_DOMAIN=sell.corelith.co.zw`
for Sell, `campus.corelith.co.zw` for Campus, and so on. A tenant is then
`acme.sell.corelith.co.zw` and `acme.campus.corelith.co.zw` — the same `Company`, the same
slug, different products. The bare product host is the product's landing site, exactly as
`corelith.co.zw` is the platform's today, and the proxy already treats a bare root as
marketing and a tenant host as a workspace. Vercel must confirm that a bare host and its
wildcard may sit on different projects; that is a Phase 1 check.

**Portal hosts flatten to one label** on the new product roots — `pos-acme.sell.corelith.co.zw`,
`parent-acme.campus.corelith.co.zw` — so a product's single wildcard certificate covers every
portal and self-serve signup no longer depends on a per-tenant Vercel API call. The isolation
the POS spec relies on is a distinct origin per surface, and a distinct label is a distinct
origin. `apps/enterprise` keeps the current three-label pattern; nothing there changes.

Sign-in once, everywhere: every host shares `NEXTAUTH_SECRET` and issues the same JWT with the
session cookie scoped to `.corelith.co.zw`. The `allowedHosts` claim gains the tenant's host
on every product it is entitled to, and the existing `isAllowedHost` check keeps a token
minted for one company off another company's host. Two caveats, recorded so they are not
rediscovered: a parent-domain cookie is sent to every host under `corelith.co.zw`, so every
such host must be one we run; and when a product gets its own domain the cookie no longer
reaches it. The seam for that day is a `createAuthOptions({ product })` factory in
`platform`; sign-in then moves to an `id.corelith.co.zw` hub with redirect-based login, and
no module code changes.

### Entitlements and billing

A tenant subscribes to products; a product grants a bundle set; a bundle grants feature keys.
This is the catalog that already exists — `ADDON_RETAIL_SUITE`, `ADDON_CRM_SUITE`,
`ADDON_WORKFORCE_CORE` + `ADDON_ZIMBABWE_PAYROLL`, `ADDON_SCHOOLS_SUITE` — with a `product`
dimension added so the admin console and the switcher can answer "which products does this
company have". **Every product is purchasable on its own**; that is the mechanism the split
exists for. Packaging above it — the Start / Grow / Scale plans the marketing site sells
today, where Sell arrives with Stock and Books and CRM and People arrive at Grow — is a
bundle of products in the same catalog, so the site does not have to change on the day the
products do. Compliance and Maintenance are add-on bundles any product's template may carry.
Gating is unchanged: feature keys, the route registry, `FEATURE_GATE_POLICY=deny`. Each host
carries the registry slice its modules contribute, and the gate audit runs per host.

### The control plane

`apps/admin` is the one place a tenant is created, entitled, billed, supported and
observed, for every product. It is the current `app/portal/admin`, `app/api/platform-admin`,
`components/admin-portal` and the `scripts/platform` TUI, moved as they are. Provisioning
(`lib/platform/provision.ts`) moves here from the tenancy package, because it orchestrates
every module and the tenancy package must sit below them all. It becomes module-aware:
provisioning a tenant runs the provisioning step of every module the tenant is entitled to,
in dependency order.

### Extensibility, now and later

**Now, and for every product:** the extension surface that already exists in the CRM —
custom fields, automations, saved views, dashboard widgets, intake forms, document templates
and blocks, branding — generalises through the Records and Documents modules, because that
is what enterprise customisation almost always turns out to be. Alongside it, API keys
generalised from `CrmApiKey` to every module with scopes, and outbound webhooks from the
outbox. Any developer can integrate with any product from outside the process, with no review
and no code of theirs in our runtime.

**When a contract pays for custom code:** a private module under `packages/modules/private/`
in this private repository, composed into a dedicated host (`apps/enterprise-<client>`)
whose module list names it. A private module never enters a public product's build because
no public host lists it. The client's developers get access to their folder through CODEOWNERS
and branch protection, or the module lives in their own repository and is pulled in as a git
dependency — either works without publishing anything.

**Later, if ever:** publishing the kernel and the module contract to npm under the
`@corelithzw` scope, for developers who must build without repository access. The manifest,
the public entrypoints and the boundary lint are the preparation; the trigger is a real
outside developer, not a plan.

## What moves where

Line counts are from the current checkout (TypeScript and TSX only) and are there to size the
work, not to be exact.

| Destination | From | Approx. lines |
|---|---|---|
| `packages/modules/campus` + `apps/campus` | `app/schools`, `app/portal/{parent,student,teacher}`, `app/api/v2/schools`, `app/api/v2/portal`, `lib/schools`, `components/schools` | 128k |
| `packages/modules/crm` + `apps/crm` | `app/crm`, `app/api/v2/crm`, `app/api/public/crm`, `app/{a,c,f,s,v}/[token]`, `lib/crm`, `components/crm` | 76k |
| `packages/modules/sell` + `apps/sell` | `app/retail`, `app/portal/pos`, `app/api/v2/retail`, `app/api/v2/pos`, `lib/retail`, `components/retail`, `components/thrift` | 50k |
| `packages/modules/people` + `apps/people` | `app/people`, `app/payroll`, `app/api/{payroll,hr,people,employees,departments,job-grades,compensation,disbursements,employee-payments,adjustments,approvals}`, `components/{people,payroll}`, `lib/hr`, `lib/people`, `lib/payroll`, `lib/payroll-periods.ts`; exports `directory` | 34k |
| `packages/modules/gold` (composed only into `apps/enterprise`) | `app/gold`, `app/api/gold`, `lib/gold`, `components/gold`, `app/api/settlements`, `lib/settlements`, `app/{shift-report,plant-report}`, `app/api/{shift-reports,plant-reports,downtime-codes,analytics}`, `lib/operations`, the gold/ops pages under `app/reports`, the mine's executive dashboard (`app/dashboard`, `app/api/dashboard`, `lib/dashboard`, `components/dashboard`), `lib/commodity-billing.ts`, `scripts/backfill-gold-*`, and the gold rows pulled out of `accounting/defaults.ts`, `notifications.ts`, `source-types.ts`, the catalog, templates and vertical roles | ~50k |
| `packages/modules/compliance` (add-on) | `app/compliance`, `app/api/compliance`, `components/compliance`, `app/reports/compliance-incidents`, the two compliance notification emitters | 3k |
| `packages/modules/books` | `lib/accounting`, `app/api/accounting`, `app/accounting`, `components/accounting` | 42k |
| `packages/modules/stock` | `lib/inventory`, `app/api/inventory`, `app/api/v2/inventory`, `app/api/stock-locations`, `app/stores`, `components/{inventory,stores}` | 8k |
| `packages/platform` | `lib/platform` (minus `provision.ts`), `lib/auth-core`, `lib/auth.ts`, `lib/admin-portal*`, `proxy.ts` (as a factory), `lib/{roles,public-routes,api-utils,api-response,api-client,audit,logging,observability,id-generator,money,serialize-decimals,uploads,preferences,settings,user-management-api,site-url}`, `app/api/{auth,users,settings,preferences,sites,sections,uploads,ids,onboarding,webhooks,workspace-app-icon}`, `app/{login,access-blocked,preview-host,preferences,user-management,management,status}`, `components/{settings,preferences,user-management,management,status,onboarding}` | 32k |
| `apps/admin` | `app/admin`, `app/portal/admin`, `app/api/platform-admin`, `components/admin-portal`, `scripts/platform`, `lib/platform/provision.ts` | 33k |
| `packages/ui` | `components/{ui,layout,shared,charts,providers,auth,corelith}`, `hooks`, `lib/{icons,ui,utils,animation,charts,data-table-adapter,navigation,workspaces,workspace-products,primary-actions,saved-record}`, `lib/platform/gating/nav-filter.ts`, `app/globals.css`, `app/styles`, plus the strays: `RecordDialog`, `PersonAvatar`, `SearchableOption`, the navbar's `crm-members` | 23k |
| `packages/modules/records` | `lib/records`, `components/records`, `app/api/v2/records`, the collaboration tables, and from the CRM: `custom-fields`, `record-ref`, `collections-client`, the search aggregation | 6k plus the CRM pieces |
| `packages/modules/documents` | `lib/documents`, `lib/pdf.ts`, `app/api/{documents,document-templates}`, `components/{pdf,templates}`, `app/templates`, and from the CRM: `blocks`, `starter-templates`, `templates/attribute-header` | 7k plus the CRM pieces |
| `packages/modules/notifications` | `lib/notifications.ts`, `app/api/notifications`, `components/notifications`, web push | 2k |
| `packages/modules/workflow` | `lib/workflow` | <1k |
| `packages/modules/maintenance` (add-on) | `app/maintenance`, `app/api/{work-orders,equipment}`, `components/maintenance` | 4k |
| `packages/modules/offline` | `lib/offline`, `public/sw.js`, `app/offline` | 8k |
| `apps/workers` | `scripts/pdf-worker.ts`, `scripts/fiscal-worker.ts` | <1k |
| `apps/enterprise` | `apps/legacy`, renamed once the products have left; composes every module including gold; serves the mine tenants on `*.apps.corelith.co.zw` unchanged | the host's pages |
| leaves the repo | `app/home`, `lib/marketing`, `lib/marketing-site.ts` — superseded by `corelith.co.zw`; `/home/*` becomes a redirect | 9k |

## Gold, Compliance and Maintenance

**Gold is a shadow product and stays home.** It is offered to enterprise tenants only and
never marketed. Delisting is done in the catalog, the templates, the vertical roles and the
marketing site — and in the four product hosts, none of which composes it. It is *not* done
by moving the code: Gold becomes `packages/modules/gold` with the same manifest as every
other module, composed only into `apps/enterprise`, which is the current monolith renamed on
the current host. The mine tenants do not migrate, their hosts do not change, and the deepest
coupling in the tree is turned into declared dependencies (`requires: ["people", "books",
"stock"]`) rather than severed. Settlements and the mine's operations (shift and plant
reports, downtime codes, the executive dashboard) go into the same module. If a day comes
when Gold must live in another repository — a sale, a partner — the module boundary makes
that a move; it is not a move worth making for its own sake.

**Compliance is an add-on for every product.** Permits, inspections, incidents and training
records become `packages/modules/compliance`, composed into every host and granted per tenant
by a bundle. Its one link into People (an operational incident spawning an HR incident) is a
declared optional dependency.

**Maintenance** stays frozen (bug fixes only, per ST-4.1) and becomes an add-on module by the
same mechanism, because Sell mounts it and it posts `MAINTENANCE_COMPLETION` to Books. The
CRM's `CrmWorkOrder` (a field-service job card) is a different thing and stays in CRM.

Two consequences worth stating plainly:

- `docs/rollout/master-rollout-plan.md` names gold operations as a beachhead and prices a
  Gold Edition. Gold is now unmarketed and enterprise-only; the master plan needs a changelog
  row recording that when this document is adopted.
- The `Employee` model is mine-shaped (`villageOfOrigin`, `nextOfKinName`, `passportPhotoUrl`
  are required). The People product will want those relaxed. That is a People story, not a
  split story, and it is cheap once People owns the file.

## Sequence

Each phase leaves production identical or better. Nothing waits on a big-bang. Effort is an
estimate for one engineer working on this alongside product work.

### Phase 0 — Decide (days, not weeks)

Adopt this document. Make the repository private. Record the Gold reversal in the master
plan's changelog. Confirm the host names.

### Phase 1 — The monorepo around the monolith (1–2 weeks)

*Executed 2026-09-06 (this branch): the move, `packages/db` with the split schema, Turborepo,
CI and the database release job are in the repository. The Vercel root-directory change and
the release-job secrets are operator steps; see `product-split-deployment.md`. The
`@corelithzw/db` package also owns the client singleton (`lib/prisma.ts` moved there), so the
"What moves where" row for `platform` no longer lists `prisma`. Two findings from executing it:
the migration history did not apply to an empty database (fixed, guarded, verified), and
`pnpm lint` carries 28 pre-existing errors, so lint reports in CI without blocking yet.*

- `git mv` the current app to `apps/legacy` (history is preserved). Add `pnpm-workspace.yaml`
  packages, `turbo.json`, `packages/config`.
- Extract `packages/db`: split `schema.prisma` into one file per future module;
  `prisma migrate diff` empty both ways; migrations run from a release job, not from
  `next build`.
- Add GitHub Actions: lint, typecheck, vitest, `next build`, `pnpm platform:audit-feature-gates`,
  affected-only via Turborepo. Vercel keeps deploying `apps/legacy` from its new root
  directory; confirm on the account that a bare host and its wildcard may sit on different
  projects.

*Exit:* production unchanged; CI green on every PR; the compile problem measurably smaller
from the schema split alone.

### Phase 2 — Extract the kernel and the modules (3–5 weeks, one package per PR)

In dependency order: `ui` (taking `RecordDialog`, `PersonAvatar`, `SearchableOption` and the
nav filter with it), `platform` (with the proxy and the auth options as factories, and the
POS host descriptor as a manifest entry), then the modules against the manifest: `workflow`,
`notifications`, `documents` (taking the template library, blocks and starter templates out
of the CRM), `records` (taking custom fields, record refs and the search aggregation out of
the CRM, with search arms as manifest entries), `stock`, `books` (fiscal issuers, accounting
hooks, default accounts and posting rules as manifest entries), `people` (with the `directory`
subpath), `maintenance`, `compliance`, `offline`, and `gold` (the coupling listed above
turned into declared dependencies). Each PR is a move, an alias change, a manifest and a
boundary rule. `apps/legacy` becomes the first host — it composes every module — and keeps
shipping throughout.

*Exit:* `apps/legacy` is a host that composes modules; every `lib/*` it used is a package;
the boundary lint passes with the declared-dependencies rule on.

### Phase 3 — Cut the products out, one at a time (2–3 weeks each)

Order: **Campus, Sell, CRM, People.** Campus first because it is the most self-contained
(three imports into accounting, five into CRM that are the record UI), the largest (so the
legacy host shrinks the most), founder-managed, and already priced and provisioned on its
own. Sell second because it exercises every mount — Books, Stock, Maintenance, Compliance,
Offline, fiscalisation — and is the commercial priority. CRM third (records, public intake,
token pages). People last; its module has been in the dependency graph since Phase 2, so the
cut is a host and a module list.

Per product: create `apps/<product>` with its pages, its module list, its branding and its
Vercel project on `*.<product>.corelith.co.zw`; re-export the shared screens; add the
catch-all API routes for the shared modules. Dark-launch with one pilot tenant on the new
host with `apps/legacy` still serving the old one. Flip: add the product host to the tenant's
`allowedHosts`, 308 `<slug>.apps.corelith.co.zw/<product>/*` → `<slug>.<product>.corelith.co.zw/*`
from legacy, drop the module from legacy's list.

*Exit per product:* the product serves only from its own host; legacy's list no longer names
it; the legacy gate audit shows its routes gone.

### Phase 4 — Legacy becomes Enterprise (1 week)

Rename `apps/legacy` to `apps/enterprise`. Its module list is everything, including Gold; its
host is unchanged; the mine tenants notice nothing. Delist Gold from the catalog, templates,
vertical roles and `corelith.co.zw`. Delete `app/home` with redirects once the marketing site
carries every page it did. Retire the `.claude/agents/gold-*` roster with the module's move.

*Exit:* six hosts, one repository, no product host composes Gold, nothing in a public build
mentions it.

### Phase 5 — Extensibility, as customers ask for it

Generalise custom fields, automations, templates and widgets to every product through
Records and Documents (a story per product, when that product's customers need it). Scoped
API keys for every module and outbound webhooks from the outbox (one story; cheap; do it
early in Phase 3 if a customer asks). The first enterprise custom module, when a contract
pays for it, on the private-module mechanism above. Publishing to npm only when an outside
developer needs it.

## Decisions

Made here, on the evidence above. Each is reversible; each is written down so that reversing
it is a decision rather than drift.

1. **Products are separate hosts in one private monorepo.** Not separate repositories, not
   one app with product skins. The repository goes private in Phase 0.
2. **Gold stays in this repository** as a module composed only into `apps/enterprise`, which
   is the monolith renamed on its current host. It is delisted, not moved. The mine tenants
   do not migrate.
3. **Modules are workspace packages, not npm packages.** The manifest, public entrypoints and
   boundary lint give the module contract now; publishing, versioning and codegen are not
   built until an outside developer needs them. No `sdk` package, no `corelith sync`.
4. **One database, ordinary relations, one migration history, expand-first.**
5. **Shared screens are re-exported by hand; shared APIs mount through one catch-all route
   per module per host.** No generated files.
6. **Compliance and Maintenance are add-on modules** composed into every host and granted per
   tenant by bundles. Maintenance stays frozen.
7. **Hosts:** `<slug>.<product>.corelith.co.zw` for workspaces, the bare product host for the
   landing site, one-label portal hosts on the new roots, `.corelith.co.zw` session cookie for
   single sign-on, an `id.` hub only when a product leaves the shared parent domain. Names:
   `sell`, `crm`, `people`, `campus`, `admin`, and `apps` stays for enterprise.
8. **Every product is purchasable on its own** in the catalog; the marketing site's plans are
   bundles of products above that and need not change on the day the products split.
9. **Extensibility is configuration and the API first, private modules when paid for,
   publishing last.** Third-party review, signing and a marketplace are not on this plan.
10. **Order:** Campus, Sell, CRM, People; then Enterprise.

What remains the business's, and only because it is not engineering: the prices of the
Compliance and Maintenance add-ons, and which enterprise tenants get a dedicated host rather
than `apps/enterprise` when the first private module is written.

## Risks

| Risk | Mitigation |
|---|---|
| Kernel drift by another route — a product copies a kernel function "just for now" | The boundary lint and the table-ownership test fail the PR; both are Phase 1/2 deliverables, not follow-ups |
| One migration history for six hosts means a module schema change needs a `packages/db` review | That is the price of one database and it is small; expand-first keeps deploys independent |
| Shared session cookie across `*.corelith.co.zw` | Every host under the parent is one we run; the auth factory is the seam to an `id.` hub when a product gets its own domain |
| Vercel build minutes and project sprawl (six projects) | `turbo-ignore` builds only what changed; remote cache; the marketing site is already a separate project |
| Extraction regressions | Every phase ships behind the existing tests plus the boundary tests; products dark-launch on their new host before the flip; legacy keeps serving until the flip |
| The record UI and collaboration tables straddle CRM and Campus | They move into Records in Phase 2 before either product is cut, so neither cut has to touch them |
| Books screens mounted in four hosts look like four Books | They are one package; a fix lands once. Product-specific theming is a prop, not a fork |
| Hand-written re-exports and catch-all routes drift from the module | A test per host asserts every screen the module exports is mounted and every mounted path exists; it is one loop |
| A private module leaks into a public bundle | Private modules are listed only by dedicated hosts; CI refuses a public host whose list names a private package |
| "Everything is a module" becomes abstraction for its own sake | Nothing is published, versioned or generated; a module is a folder with a manifest, and the manifest is the registries the repo already has |
| The repository stays public by inertia | Phase 0, one click, before any private module exists |

## What this plan refuses to do

- Separate repositories per product, or a separate repository for Gold.
- A database per product now.
- HTTP services for Books or Stock.
- Publishing an SDK, composing schemas from packages, or generating route files before an
  outside developer exists.
- Loading third-party code into the product's process at run time.
- A rewrite of anything. Every step is `git mv`, an alias change and a rule.

## Changelog

| Date | Commit | Description |
|---|---|---|
| 2026-09-06 | — | **Phase 2.3g executed: `packages/modules/books`.** `lib/accounting` and `components/accounting` as `@corelithzw/module-books`, requiring documents and notifications. Two seams, both hooks the host fills from `modules.ts`: the fiscal drain's issuer for a school's fee receipt (`registerFiscalDrainIssuer`) and what happens when a tenant's receipts have been stuck for a while (`onFiscalBacklog`; the compliance emitter raises the incident) — books names neither. The accounting API client left `lib/api.ts` for the module's own `api-client.ts`, and the kernel got its own browser clients (`client/sites`, `client/ids`) and the reserved-id hook, which every module's forms use; `lib/api.ts` re-exports all of it. The report table, domain-free, went to `ui`. The books manifest written ahead of the move came home. The default accounts and source types that name gold and retail stay in the module as data until those modules move. |
| 2026-09-06 | — | **Phase 2.3f executed: `packages/shell`.** A refinement of the layering: the plan put the app shell in `ui`, but `ui` depends on nothing in the workspace and the module shell reads roles and features from the kernel. So the chrome that knows about roles and features is its own package, `@corelithzw/shell`, depending on `ui` and `platform`: the navigation registry the host fills on every side (`manifests.ts`, so the browser and the server read the same sections) with the role filter, and `ModuleShell` out of `components/shared` — the rail every module's screens sit in, which the people, payroll and accounting shells import from the package. The navigation model itself (`lib/navigation.ts`) stays the host's data until the manifests carry navigation; the sidebar, navbar and command bar follow in 2.3j. The Management area's chrome came with it — the management shell, the master-data page and shell, and a registry for the management navigation (modules, areas, labels) the host fills the same way — because the compliance and maintenance screens sit inside it. |
| 2026-09-06 | — | **Phase 2.3e executed: `packages/modules/documents`.** The render pipeline (sources, branded templates, PDF/HTML/CSV, the export client), `lib/pdf.ts`, the PDF viewer, and from the CRM the block templates, starter templates, template variables, the template editor and the template library, as `@corelithzw/module-documents`; `RecordDialog` to `ui`. Two seams: the source registry imported the school's and payroll's resolvers and switched on the accounting, report and dashboard keys — sources are a registry the host wires from `modules.ts` (`registerDocumentSource`), the school and payroll resolvers moved next to their modules and the rest to `lib/host/document-sources.ts` until books, gold and people move; the default template catalogue named every module's documents — the module keeps its one table template and reads the rest from the manifests (`documents.templates`, data built with the module's schema helpers), declared by books (a manifest ahead of its move), gold, people and schools. Because the template studio reads the catalogue in the browser, this is also why manifests are imported on every side. The CRM manifest declares that it requires documents. |
| 2026-09-06 | — | **Phase 2.3d executed: `packages/modules/records`.** `lib/records`, `components/records`, and from the CRM `custom-fields` and `record-ref`, as `@corelithzw/module-records`. Two seams: the record-type registry named the CRM's and the school's types with their hrefs and query keys — they are manifest data now (`records.types`, templates with `{id}`), declared by the CRM and by the schools module ahead of its move, and the registry turns them into the functions the screens call; the search aggregation imported six modules' arms — the arms are a registry the host wires from `modules.ts`, one lazy line per module, and `SearchScope` is keyed by arm id. The CRM's field-definition API shape lives with custom fields as `FieldDefinitionRecord`; the CRM client aliases it. The vocabulary of record types stays the schema's `CrmFieldEntity` enum, which modules extend in their own schema files. The school's own list of types moved to `lib/schools/record-types.ts`. |
| 2026-09-06 | — | **Phase 2.3c executed: `packages/modules/notifications`.** The generic service (write a notice, fan it out by preference, turn a stored notice into the actions the centre renders), the centre, its stream hook and its API client as `@corelithzw/module-notifications`. The service names no module: where a notice about a payroll run opens and what an approver may do from it are manifest data (`notifications.viewPaths`, `notifications.approvalActions`, templates with `{id}`), declared by people, gold, compliance and maintenance — four more manifests ahead of their moves. The emitters that know those entities stay in the host's `lib/notifications.ts` until their modules move. The host's composition split in two: `manifests.ts` (data, imported at boot, by the providers in the browser and by the proxy on the edge, so a registry reads the same on every side) and `modules.ts` (server wiring). `lib/host/manifests.test.ts` fails the moment a manifest reaches the database client. The kernel's `api-client` gained `buildQuery` and the pagination types every module's client needs; `lib/api.ts` re-exports what moved, so nothing else changed. |
| 2026-09-06 | — | **Phase 2.3b executed: `packages/modules/workflow`.** The first module package, and the template the rest follow (`package.json`, tsconfig, vitest with the shared `.env` handling, eslint, `manifest.ts`, `index.ts`, `module-boundary.test.ts`). `lib/workflow` → `@corelithzw/module-workflow`, 68 app files rewritten. One seam: recording an approval action also emitted a notification, which made approvals import the notifications file and, through it, the payroll, gold and settlement entities it describes. The module now records and fires `onApprovalAction` listeners, inside the caller's transaction; the host registers the notifications emitter from `modules.ts`, importing it on first use. The enum-retirement test greps the whole workspace from the repository root rather than the host it used to live in. The module requires nothing. |
| 2026-09-06 | — | **Phase 2.3a executed: the manifest contract, and the page chrome to `ui`.** `ModuleManifest` in `packages/platform/manifest.ts` (`id`, `requires`, `routes`, `permissions.capabilities` to start; the other sections of the table above arrive with the modules that need them), `registerModules` filling a registry the route registry and the permission catalog now read, and `unmetModuleRequirements` the host asserts empty at boot. The boundary rule generalised from `lib/hr/module-boundary.test.ts` into `@corelithzw/platform/testing/module-boundary`: a package has a root, so there is nowhere to move a file to. The CRM's manifest exists ahead of its move (`apps/legacy/lib/crm/manifest.ts`, carrying the capability set split out of `permissions.ts` into data-only `capabilities.ts`), so the host composes by manifests from today. The page chrome (`page-chrome`, `page-heading`, `page-actions`, the list and detail shells), the shared screen furniture (`components/shared` minus `module-shell`, which reads the host's navigation), `saved-record` and `use-guided-mode` moved to `packages/ui` so module components can leave the host without dragging the shell with them. |
| 2026-09-06 | — | **Phase 2.2 executed: `packages/platform`.** The kernel as `@corelithzw/platform`, imported by path: `lib/platform`, `lib/auth-core`, `lib/admin-portal*`, `lib/preferences`, `lib/uploads`, `lib/observability`, `lib/audit/platform.ts` and the twelve kernel files at the top of `lib/`. Three seams broken, all the same way — the kernel keeps a registry the host fills at boot (`modules.ts`, imported from `instrumentation.ts`, stored on `globalThis` like the Prisma client): NextAuth's options (`registerAuthOptions`; the guards, the admin magic link and the preferences gate read them through it, so `guards.ts` moved after all), the permission catalog's capability sets (`registerCapabilities`; the CRM contributes `CRM_CAPABILITY_SET` and the kernel no longer imports `lib/crm`), and the nav filter, which now reads a structural section type instead of the host's `NavSection`. Three departures from the table above, with reasons: `lib/auth.ts` stays in the host because one callback asks the retail module a question (the `createAuthOptions` factory waits for the second host); `proxy.ts` stays as it is for the same reason; `lib/settings/management-nav.ts` stays because it is navigation content that names modules. `provision.ts` and the tests that read the host's composition (its proxy, its scripts, its navigation, its registered modules) moved to `apps/legacy/lib/host/`. The package depends on `packages/db` alone — not on `ui`. |
| 2026-09-06 | — | **Phase 2.1 executed: `packages/ui`.** The domain-free layer first — `components/ui`, charts, `corelith`, icons, `cn`, `lib/ui`, animation, chart theming, the two generic hooks, and the person avatar — as `@corelithzw/ui`, imported by path. The app shell (`components/layout`, `providers`, `shared`, `auth`) and the navigation model (`navigation.ts`, `workspaces.ts`) stay in the host for now: they name modules, so they move once the manifests' `navigation` registry exists (2.3), not before. One seam broken: `DataTable` exported through the Documents client; it now takes a `TableExporter` from context, the host provides Documents' implementation, and the menu hides without one. |
| 2026-09-06 | — | **Phase 1 executed.** The app moved to `apps/legacy`, the database to `packages/db` with the schema split one file per module (zero-diff both against the old file and against the migration history), Turborepo and the workspace root added, GitHub Actions CI and the database release workflow added, `docs/rollout/product-split-deployment.md` written for the operator steps. The client singleton lives in `packages/db` (`@corelithzw/db/client`), not in `platform`. Migration 61 guarded so the history applies to an empty database. |
| 2026-09-05 | — | **Third revision: the mechanisms are decided, not deferred to the business.** The earlier proposals — modules distributed from npm with a published SDK and a `corelith sync` codegen step, Gold moved to its own repository, a column-only schema rule to make packages composable — are reversed with reasons (options F and H). Decided instead: one private monorepo; workspace modules with manifests and public entrypoints, nothing published or generated; ordinary Prisma relations kept; shared screens re-exported by hand and shared APIs mounted through catch-all routes; Gold stays as a module composed only into `apps/enterprise`, the monolith renamed on its current host, so the mine tenants never migrate; Compliance and Maintenance as add-on modules; extensibility through configuration and the API first, private modules when paid for, publishing last; every product purchasable alone with the marketing plans as bundles above. The evidence sections are unchanged. |
| 2026-09-05 | — | Second revision for the follow-up decisions: Gold as a shadow product in its own repository, Compliance as an add-on, a module contract with npm distribution and two extension tiers. Superseded by the third revision. |
| 2026-09-05 | — | Document created: the split decision, the evidence it rests on, the target shape, the sequence, and the decisions the business still owes. |
