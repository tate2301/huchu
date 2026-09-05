# Product Split — Decision Record and Plan

**Status:** proposal for adoption. **Date:** 2026-09-05.

This document answers one question the business has put to engineering: the platform is to
become four independent products — **Sell** (retail), **CRM**, **People** (HR & payroll) and
**Campus** (education) — each with its own landing site and its own host
(`sell.corelith.co.zw`, `campus.corelith.co.zw`, …). What is the right way to split the
codebase so the products are genuinely independent, without building stock, books,
maintenance and the rest of the shared machinery four times, and without losing the
integrations that make the products worth more together?

It is written the way `docs/rollout/master-rollout-plan.md` is written: decisions first,
evidence second, then the sequence. It carries no story table. If adopted, stories are added
to the rollout roadmaps under their house rules; this document stays the decision record.

## The answer

**One monorepo. Several deployable apps. One database. Shared capabilities as packages,
not as services and not as copies.**

- **Each product is its own Next.js app**, its own Vercel project, its own host, its own
  release cadence, its own bundle, its own owner. Sell, CRM, People, Campus, plus the
  platform admin control plane.
- **Everything the products share is a package in the same repository** — tenancy and auth,
  the ledger (Books), stock, the staff directory, documents, notifications, approvals, the
  record page, the design-system wrappers, the offline runtime, and Maintenance. A package
  ships its domain logic, its API route handlers *and* its screens; a product app mounts the
  ones it is entitled to. Nothing is written twice.
- **One PostgreSQL database and one Prisma schema, split into one file per owner.** A tenant
  is one `Company` across every product it buys. Cross-product joins that exist today —
  a POS sale to its fiscal receipt, a CRM client to its customer account, a teacher to their
  employee record — stay as foreign keys, not as API calls.
- **Integration stays in-process.** Sell posts to Books by calling the posting engine, exactly
  as it does now. The rule that keeps this honest is *direction*: products depend on
  packages, packages depend on lower packages, and **no product ever imports another
  product.** That rule is enforced by lint and by tests, not by review.
- **The monolith is not rewritten; it is strangled.** The current app becomes `apps/legacy`
  inside the monorepo on day one, unchanged and still deployed. Packages are extracted from
  it one PR at a time, then products are cut out of it one at a time. Gold and the other
  modules that are not being carried stay in `apps/legacy` until their tenants are exported
  or migrated, on the same discipline the scope trim used.

The reason, in one line: **the products are independent at the surface and interdependent
underneath, and the codebase should say exactly that.** Separate repositories would make the
shared layer drift into four versions of the ledger; keeping one deployable would leave the
products sharing a build, a blast radius and a 7 GB type-check. A monorepo of apps over a
shared kernel is the one shape where both halves of the business decision are true at once.

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

The marketing site and the design system (`@corelithzw/react`, published from
`corelith-design-docs`) stay in their own repositories: they share no runtime code with the
products and move at a different cadence. The end state is therefore **three repositories**,
not one and not six.

## Target shape

### Repository layout

```
corelith/                                   ← this repository, renamed from "huchu"
  apps/
    sell/       Next.js   *.sell.corelith.co.zw      POS, purchasing, shifts, promotions; mounts Books, Stock, Maintenance
    crm/        Next.js   *.crm.corelith.co.zw       leads, deals, quoting, intake forms, public sign-off links; mounts Books, Stock (catalogue)
    people/     Next.js   *.people.corelith.co.zw    employees, attendance, leave, payroll, disbursements, statutory; mounts Books
    campus/     Next.js   *.campus.corelith.co.zw    schools + parent/student/teacher portals; mounts Books; reads the staff directory
    admin/      Next.js   admin.corelith.co.zw       platform control plane (tenants, subscriptions, flags, domains, support, runbooks) + the Ink TUI
    legacy/     Next.js   *.apps.corelith.co.zw      the monolith as it is today, shrinking to Gold/operations/compliance, then retired
    workers/    Node      —                          PDF render loop, fiscal drain, outbox consumers
  packages/
    db/             @corelith/db             Prisma schema as one file per owner, one generated client, one migration history
    platform/       @corelith/platform       tenancy, auth, session claims, entitlements, gating, audit, api-utils, money, ids, uploads
    ui/             @corelith/ui             design-system wrappers, app shell, sidebar, record page, charts, hooks, icons, tokens
    books/          @corelith/books          posting engine, periods, AR/AP documents, tax/VAT, FDMS, payment ledger — plus /books routes and screens
    stock/          @corelith/stock          catalogue, price lists, locations, movements — plus /stock routes and screens
    people/         @corelith/people         the HR domain (lib/hr, lib/people, lib/payroll); exports a small `directory` subpath for other products
    records/        @corelith/records        record registry, tasks/comments/files on any record, the shared guard
    documents/      @corelith/documents      templates, HTML/PDF/CSV renderers, render jobs
    notifications/  @corelith/notifications  in-app + web push
    workflow/       @corelith/workflow       approvals (ApprovalAction)
    maintenance/    @corelith/maintenance    equipment and work orders — frozen, mounted where entitled
    offline/        @corelith/offline        POS offline runtime, service worker, outbox
    config/         @corelith/config         shared eslint, tsconfig, tailwind, vitest presets
  turbo.json, pnpm-workspace.yaml, .github/workflows/
```

Tooling: pnpm workspaces (already in use) plus Turborepo for the task graph and remote cache
(free on Vercel). One Vercel project per app with its Root Directory set to `apps/<name>`
and `turbo-ignore` as the ignored-build step, so a CRM-only change does not rebuild Sell.
TypeScript project references per package end the 7 GB type-check: each package checks
itself, and an app checks only what it imports.

### Layering, and the rules that keep it

```
        apps/sell   apps/crm   apps/people   apps/campus   apps/admin      (products never import each other)
              │          │          │             │            │
        ┌─────┴──────────┴──────────┴─────────────┴────────────┴──────┐
        │  books   stock   people   records   documents   notifications │   capability packages
        │  workflow   maintenance   offline                              │   (may import the row below; never a product; never each other's internals)
        └───────────────────────────────┬───────────────────────────────┘
                                        │
                              ui ─── platform ─── db                        kernel
```

1. **Dependencies point down.** An app imports packages. A capability package imports
   `ui`, `platform`, `db` and other capability packages it genuinely needs (Stock posts its
   movements to Books; Records needs nothing above the kernel). Nothing imports an app. No
   product imports another product. Enforced with `eslint-plugin-boundaries` (or
   dependency-cruiser) in CI, and by generalising `lib/hr/module-boundary.test.ts` into one
   test per package.
2. **The kernel never names a product.** Where it does today (fiscal drain → schools, sales
   receipts → CRM hooks, permission catalog → CRM permissions), the product registers a
   handler at boot and the kernel calls the registry. This is the same move the repo already
   made for record types (`lib/records/registry.ts`).
3. **A product owns its tables and writes shared tables only through the owning package.**
   Sell may read `Customer`; it creates one through `@corelith/books`. Campus may read
   `Employee`; it links a teacher through `@corelith/people/directory`. A grep-based test —
   the same shape as the boundary test — asserts a package's `prisma.<model>` calls stay
   within its own schema file plus the kernel's.
4. **Cross-product reactions go through the outbox, never through an import.** If a Campus
   event must ever cause something in CRM, it is written as an integration event and consumed
   by a worker. `AccountingIntegrationEvent` is that pattern already; generalise it when the
   first real case arrives, not before.
5. **Schema changes are expand-first.** Five apps deploy independently against one database,
   so a column is dropped only after every app that read it has shipped without it. Migrations
   run from one place (a release job on `packages/db`), never from an app's build.

### One database, schema by owner

`packages/db/prisma/schema/` holds one `.prisma` file per owner — `platform.prisma`,
`books.prisma`, `stock.prisma`, `people.prisma`, `records.prisma`, `sell.prisma`,
`crm.prisma`, `campus.prisma`, `maintenance.prisma`, `documents.prisma`,
`notifications.prisma`, `workflow.prisma`, and `legacy.prisma` for gold/operations/compliance
until they go. Prisma's multi-file schema keeps one generated client and one migration
history, so relations across files are ordinary relations and the split is a zero-diff
refactor (`prisma migrate diff` must be empty in both directions, the check ST-3 already
uses). CODEOWNERS per file gives each product a reviewer on its own tables and the platform a
reviewer on the kernel's.

Three ownership moves come out of the audit:

- **The staff directory is kernel, the People product is not.** `Employee`, `Department`,
  `JobGrade` are read by Campus and Maintenance and will be read by anything that ever pays
  or rosters a person. They stay in the People package but are exposed through a narrow
  `@corelith/people/directory` subpath — list, read, link a user — that other products may
  import. Attendance, leave, compensation, payroll, disbursements and statutory are the
  product and are not importable from outside `apps/people`. This preserves the asymmetry the
  HR boundary test already enforces: verticals may reach into HR's shape; HR never reaches
  into a vertical.
- **Collaboration tables move to Records.** `CrmTask`, `CrmComment`, `CrmRecordFile`,
  `CrmMention`, `CrmFollower` already serve Campus through `(subjectType, subjectId)`. They
  are owned by `@corelith/records`; the `Crm` prefix is renamed when convenient, not on the
  critical path.
- **`AccountingSourceType` and the posting rules are owned by Books.** A product that needs a
  new posting source adds the enum value and its seeded rule through a Books PR, which is
  what happens today in practice.

### How the integrations keep working

| Integration | Today | After the split |
|---|---|---|
| A POS sale posts to the ledger and fiscalises | `app/api/v2/retail` → `captureAccountingEvent`; `RetailSale.fiscalReceiptId` | Identical call into `@corelith/books`; same FK; Sell registers its fiscal issuer with Books at boot |
| A school fee receipt posts and fiscalises | `api/v2/schools/fees/_helpers.ts` → posting engine; `lib/schools/fiscalisation.ts` | Identical; Campus registers its issuer; the drain worker in `apps/workers` calls the registry |
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
Gating is unchanged: feature keys, the route registry, `FEATURE_GATE_POLICY=deny`. Each app
carries only the registry slice for the routes it serves, and the gate audit runs per app.

The one thing the code cannot decide is the commercial model — see **Decisions needed**.

### The control plane

`apps/admin` is the one place a tenant is created, entitled, billed, supported and
observed, for every product. It is the current `app/portal/admin`, `app/api/platform-admin`,
`components/admin-portal` and the `scripts/platform` TUI, moved as they are. Provisioning
(`lib/platform/provision.ts`) moves here from the tenancy package, because it orchestrates
every product's bootstrap and the tenancy package must sit below them all. It becomes
product-aware: provisioning a Campus tenant runs Campus's `provision.ts`, a Sell tenant runs
Sell's, and both run Books' bootstrap because both post to a ledger.

## What moves where

Line counts are from the current checkout (TypeScript and TSX only) and are there to size the
work, not to be exact.

| Destination | From | Approx. lines |
|---|---|---|
| `apps/campus` | `app/schools`, `app/portal/{parent,student,teacher}`, `app/api/v2/schools`, `app/api/v2/portal`, `lib/schools`, `components/schools` | 128k |
| `apps/crm` | `app/crm`, `app/api/v2/crm`, `app/api/public/crm`, `app/{a,c,f,s,v}/[token]`, `lib/crm`, `components/crm` | 76k |
| `apps/sell` | `app/retail`, `app/portal/pos`, `app/api/v2/retail`, `app/api/v2/pos`, `lib/retail`, `components/retail`, `components/thrift` (the retail module's former name) | 50k |
| `apps/people` | `app/people`, `app/payroll`, `app/api/{payroll,hr,people,employees,departments,job-grades,compensation,disbursements,employee-payments,adjustments,approvals}`, `components/{people,payroll}` (screens and routes only; the domain is the package below) | 25k |
| `packages/people` | `lib/hr`, `lib/people`, `lib/payroll`, `lib/payroll-periods.ts` | 9k |
| `packages/books` | `lib/accounting`, `app/api/accounting`, `app/accounting`, `components/accounting`, `lib/commodity-billing.ts` if anything still needs it | 42k |
| `packages/stock` | `lib/inventory`, `app/api/inventory`, `app/api/v2/inventory`, `app/api/stock-locations`, `app/stores`, `components/{inventory,stores}` | 8k |
| `packages/platform` | `lib/platform` (minus `provision.ts`, which goes to the control plane), `lib/auth-core`, `lib/auth.ts`, `lib/admin-portal*`, `proxy.ts` (as a factory), `lib/{roles,public-routes,api-utils,api-response,api-client,audit,logging,observability,id-generator,money,serialize-decimals,uploads,preferences,settings,user-management-api,site-url,prisma}`, `app/api/{auth,users,settings,preferences,sites,sections,uploads,ids,onboarding,webhooks,workspace-app-icon}`, `app/{login,access-blocked,preview-host,preferences,user-management,management,status}`, `components/{settings,preferences,user-management,management,status,onboarding}` | 32k |
| `apps/admin` | `app/admin`, `app/portal/admin`, `app/api/platform-admin`, `components/admin-portal`, `scripts/platform`, `lib/platform/provision.ts` | 33k |
| `packages/ui` | `components/{ui,layout,shared,charts,providers,auth,corelith}`, `hooks`, `lib/{icons,ui,utils,animation,charts,data-table-adapter,navigation,workspaces,workspace-products,primary-actions,saved-record}`, `lib/platform/gating/nav-filter.ts`, `app/globals.css`, `app/styles`, plus the strays: `RecordDialog`, `PersonAvatar`, `SearchableOption`, the navbar's `crm-members` | 23k |
| `packages/records` | `lib/records`, `components/records`, `app/api/v2/records`, the collaboration tables, and from the CRM: `custom-fields`, `record-ref`, `collections-client`, the search aggregation | 6k plus the CRM pieces |
| `packages/documents` | `lib/documents`, `lib/pdf.ts`, `app/api/{documents,document-templates}`, `components/{pdf,templates}`, `app/templates`, and from the CRM: `blocks`, `starter-templates`, `templates/attribute-header` | 7k plus the CRM pieces |
| `packages/notifications` | `lib/notifications.ts`, `app/api/notifications`, `components/notifications`, web push | 2k |
| `packages/workflow` | `lib/workflow` | <1k |
| `packages/maintenance` | `app/maintenance`, `app/api/{work-orders,equipment}`, `components/maintenance` | 4k |
| `packages/offline` | `lib/offline`, `public/sw.js`, `app/offline` | 8k |
| `apps/workers` | `scripts/pdf-worker.ts`, `scripts/fiscal-worker.ts` | <1k |
| stays in `apps/legacy` until retired | `app/gold`, `app/api/gold`, `lib/gold`, `components/gold`, `app/api/settlements`, `lib/settlements`, `app/{shift-report,plant-report}`, `app/api/{shift-reports,plant-reports,downtime-codes,analytics}`, `lib/operations`, `app/compliance`, `app/api/compliance`, `components/compliance`, the gold/ops/compliance pages under `app/reports`, and the cross-module executive dashboard (`app/dashboard`, `app/api/dashboard`, `lib/dashboard`, `components/dashboard`) — each product gets its own home instead | ~50k |
| leaves the repo | `app/home`, `lib/marketing`, `lib/marketing-site.ts` — superseded by `corelith.co.zw`; `/home/*` becomes a redirect | 9k |

## What is not carried

The business decision names four products. That leaves **Gold** (and the settlements engine
built for it), **Operations** (shift and plant reports), **Compliance** (permits,
inspections, incidents, training) and the mine-shaped reports and executive dashboard
outside every product. This document does not delete them; it puts them where the scope trim
put CCTV and Autos before their tables went: in the shrinking legacy app, behind the same
standing instruction — *nothing is dropped while a tenant has it enabled, until its export
story is done.* The pilot mine tenants are real customers on those modules and need an exit
that is decided by the business, not by a refactor.

Two consequences worth stating plainly:

- `docs/rollout/master-rollout-plan.md` names gold operations as a beachhead and prices a
  Gold Edition. This plan contradicts that, on the business's instruction. The master plan
  needs a changelog row recording the reversal when this document is adopted.
- The `Employee` model is mine-shaped (`villageOfOrigin`, `nextOfKinName`, `passportPhotoUrl`
  are required). The People product will want those relaxed. That is a People story, not a
  split story, and it is cheap once People owns the file.

**Maintenance** stays frozen (bug fixes only, per ST-4.1) and becomes a package because it
is mounted by Sell and posts `MAINTENANCE_COMPLETION` to Books. It is not a product, and the
CRM's `CrmWorkOrder` (a field-service job card) is a different thing and stays in CRM.

## Sequence

Each phase leaves production identical or better. Nothing waits on a big-bang. Effort is an
estimate for a small team working on this alongside product work; the kernel extraction is
the bulk and is deliberately sliced so any PR can ship alone.

### Phase 0 — Decide (1 week)

Adopt this document. Settle the decisions in the next section. Write CODEOWNERS for the
target layout. Record the gold reversal in the master plan's changelog.

*Exit:* the target layout, the drop list and the host model are written down and agreed.

### Phase 1 — The monorepo around the monolith (1–2 weeks)

- `git mv` the current app to `apps/legacy` (history is preserved). Add `pnpm-workspace.yaml`
  packages, `turbo.json`, `packages/config`.
- Extract `packages/db`: split `schema.prisma` into one file per owner; `prisma migrate diff`
  empty both ways; migrations run from a release job, not from `next build`.
- Add GitHub Actions: lint, typecheck, vitest, `next build`, `pnpm platform:audit-feature-gates`,
  affected-only via Turborepo. Vercel keeps deploying `apps/legacy` from its new root
  directory; confirm on the account that a bare host and its wildcard may sit on different
  projects, which Phase 3 relies on.

*Exit:* production unchanged; CI green on every PR; the compile problem measurably smaller
from the schema split alone.

### Phase 2 — Extract the kernel (3–5 weeks, one package per PR)

In dependency order: `ui` (taking `RecordDialog`, `PersonAvatar`, `SearchableOption` and
the nav filter with it), `platform` (with the proxy and the auth options as factories, and
the POS host descriptor turned into a per-app portal config), `workflow`, `notifications`,
`documents` (taking the template library, blocks and starter templates out of the CRM),
`records` (taking custom fields, record refs and the search aggregation out of the CRM, with
search arms registered by their modules), `stock`, `books` (fiscal issuers and accounting
hooks as registrations), `people` (with the `directory` subpath; nav and offline workflow
catalogs register their tab configs rather than being imported), `maintenance`, `offline`.
Each PR is a move plus an alias change plus a boundary rule. `apps/legacy` keeps importing
from the packages and keeps shipping throughout.

*Exit:* `apps/legacy` contains only routes and screens; every `lib/*` it used is a package;
the boundary lint passes with the product-never-imports-product rule on.

### Phase 3 — Cut the products out, one at a time (2–3 weeks each)

Order: **Campus, Sell, CRM, People.** Campus first because it is the most self-contained
(three imports into accounting, five into CRM that are the record UI), the largest (so the
legacy app shrinks the most), founder-managed, and already priced and provisioned on its
own. Sell second because it exercises every kernel mount — Books, Stock, Maintenance,
Offline, fiscalisation — and is the commercial priority. CRM third (records, public intake,
token pages). People last; its domain package has been in the kernel since Phase 2, so the
app is screens and routes.

Per product: create `apps/<product>`, move its folders, mount the kernel route groups it is
entitled to, give it its proxy config, nav, route-registry slice, `vercel.json` and Vercel
project on `*.<product>.corelith.co.zw`. Dark-launch with one pilot tenant on the new host
with `apps/legacy` still serving the old one. Flip: add the product host to the tenant's
`allowedHosts`, 308 `<slug>.apps.corelith.co.zw/<product>/*` → `<slug>.<product>.corelith.co.zw/*`
from legacy, delete the product's folders from legacy.

*Exit per product:* the product serves only from its own app; legacy has no code for it;
the legacy gate audit shows its routes gone.

### Phase 4 — Retire legacy (business-paced)

What remains is Gold, operations, compliance and the mine dashboard for the mine tenants.
Export and sunset on the ST-0.2 pattern, or keep it running frozen and unsold; either way it
is a business call with a date. Delete `app/home` once `corelith.co.zw` carries every page it
did, with redirects. Retire the `.claude/agents/gold-*` roster and the gold backfill scripts
with the module.

## Decisions needed from the business

1. **Gold and the mine tenants.** Confirm Gold, settlements, operations and compliance are
   outside every product, and decide the exit for the tenants on them: migrate to a frozen
   legacy host with a sunset date, or export. The repo is named after one of those tenants;
   this is not a small decision and it must be made explicitly.
2. **Commercial model.** `corelith.co.zw` as pushed on 2 September sells Start / Grow / Scale
   plans that bundle Sell + Stock + Books at US$39 and add CRM and People at Grow.
   "Independent products" implies each product is bought on its own. Both can be expressed by
   the catalog; the entitlement, signup and switcher work in Phase 3 needs to know which. If
   a business can buy CRM without Sell, the answer also settles whether Books and Stock are
   visible in a CRM-only tenant.
3. **Host model.** Confirm `<slug>.<product>.corelith.co.zw` for workspaces and the bare
   product host for the landing site, and choose between the current three-label portal
   pattern and the flattened one-label pattern for the new products.
4. **Names.** Sell and Campus are given; `crm.` and `people.` are proposed from the marketing
   catalogue.
5. **Ownership.** Who owns each app and each kernel package in CODEOWNERS. A package with
   no owner is the one that drifts.

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

## What this plan refuses to do

- Separate repositories per product, for the reasons in option A.
- A database per product now, for the reasons in option D.
- HTTP services for Books or Stock.
- A rewrite of anything. Every step is `git mv`, an alias change and a rule.
- Deleting Gold, operations or compliance ahead of their tenants' exit.

## Changelog

| Date | Commit | Description |
|---|---|---|
| 2026-09-05 | — | Document created: the split decision, the evidence it rests on, the target shape, the sequence, and the decisions the business still owes. |
