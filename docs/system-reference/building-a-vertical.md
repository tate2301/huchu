# Building a vertical module — the method the schools pack was built with

Schools is the most complete vertical in this repo: 69 files in `lib/schools/`, 145
route files under `app/api/v2/schools/`, three portals, and 32 test files. It got there in a particular order, and the order is the transferable part.

This is written to be used, not admired. Every claim below was read off the
repository; where schools did something and a newer module has not, that is said
plainly rather than smoothed over.

**Read `AGENTS.md` first** — it holds the engineering principles, and this document
does not restate them. What follows is the vertical-specific sequence that sits on
top.

---

## 0. The one-paragraph version

Write the schema, then a pure domain library, then guarded APIs, then screens that
compose blocks from the design system, then a provisioning entry point, then a demo
seed, then screenshots. Gate every route on a feature key, check a role inside every
handler, and pin both with coverage tests that fail when somebody adds a file and
forgets. Portals come last and are built against a downloaded demo, not a
description.

The order matters because each layer is the thing the next one is tested against. A
screen built before the domain library has nowhere to put its rules, and they end up
in the component.

---

## 1. Layers, in build order

### 1a. Schema (`prisma/schema/core.prisma`)

Everything is `companyId`-scoped **on the row**, not through a relation. Schools
learned this the easy way; `Attendance` learned it the hard way — it was scoped
through `Site`, so making the site optional would have removed the tenant boundary
along with it. If a table can be reached by a query, it carries its own `companyId`.

Money is `Decimal`, never `Float`, via `lib/money.ts`. Rates `Decimal(12,4)`,
amounts `Decimal(14,2)`. `lib/schools/fee-money.test.ts` and
`lib/hr/schema-migration.test.ts` exist because a `Float` column silently disagreed
with a bursar's tin.

Statuses are enums, not `String` with a comment listing the values. A comment is not
enforced by the database — `Attendance.status` carried `// PRESENT, ABSENT, LATE` for
a year while nothing stopped a caller writing `"present"`.

Anything approvable reuses the workflow triple (`createdById` / `submittedById` +
`submittedAt` / `approvedById` + `approvedAt`, `workflowStatus`) and writes audit
through `ApprovalAction`.

**Enums that audit rows hold may gain values and must never lose one.** Postgres
refuses to drop a value any row still uses, and the alternatives — rewriting rows,
or deleting them — falsify or destroy the trail. `lib/workflow/approvals.test.ts`
enforces this.

### 1b. Domain library (`lib/<module>/**`)

Pure where it can be. The pattern worth copying is the payroll engine split:
`lib/hr/payroll/engine.ts` is pure arithmetic and knows nothing about the database;
`assemble.ts` is the seam that reads rows and shapes them into engine input. That is
what lets the arithmetic be tested against a hand-worked payslip.

Schools files that are worth reading as models:

| File | Why |
|---|---|
| `lib/schools/permissions.ts` | Resource × action × role matrix, default deny |
| `lib/schools/provision.ts` | One idempotent call that makes a tenant usable |
| `lib/schools/portal-identity.ts` | Resolves "who is this, and whose records may they see" |
| `lib/schools/search.ts` | One arm of global search, per-type feature keys |
| `lib/schools/money.ts` | Module-local money helpers over `lib/money.ts` |

The `*-v2.ts` files (`schools-v2.ts`, `fees-v2.ts`, `admin-v2.ts`, `portal-v2.ts`)
are **client-side fetchers**, not a second version of the domain. They wrap
`fetchJson` with typed helpers per surface. Newer modules put these in `lib/api.ts`
instead; either is fine, but do not mix within a module.

### 1c. Permissions — a matrix, defaulting to deny

```ts
export const SCHOOL_RESOURCES = [
  "schools.academics", "schools.admissions", "schools.students",
  "schools.teachers", "schools.attendance", "schools.fees",
  "schools.boarding", "schools.results", "schools.reports",
] as const;
```

Two shapes exist in the repo and they answer inversely — know which you are using:

- `canSchoolRoleDo(role, resource, action)` returns **true when allowed**
- `hrPermissionDenial(session, resource, action)` returns **a message when refused,
  null when allowed**

The HR shape is better for route handlers, because every route already returns
through `errorResponse` and a thrown error would surface as a 500 — telling the
caller the server is broken when they simply may not.

Default deny. `lib/hr/permissions.ts` grants a role nothing unless the matrix says
otherwise, and `permissions.test.ts` asserts the negatives: a teacher, a parent and
a student must reach nothing in payroll, because they share the `UserRole` enum with
the roles that may.

### 1d. API (`app/api/v2/<module>/**`)

Two independent gates, and both are needed:

1. **The feature gate** — `lib/platform/gating/route-registry.ts`, one key per URL
   prefix. Answers "did this tenant buy it". Runs automatically for `/api/v2/**`
   via `requireApiAuth`.
2. **The role check** — inside the handler. Answers "may this person". The registry
   cannot do this, so a route that forgets it is open to every signed-in user in a
   tenant that has the module on.

First match wins in the registry, so a longer prefix listed after a shorter one is
dead. `/people/attendance` has to precede `/people`.

A prefix carries exactly one key, which is why the module-neutral record routes live
under `/api/v2/records/**` and gate themselves: one endpoint serving several modules
cannot be described by a single key. See `app/api/v2/records/_guard.ts`.

### 1e. Screens (`app/<module>/**`, `components/<module>/**`)

`docs/design-system/04-composition.md` is the contract. Its six-step recipe, in
brief: pick a shell, one page header with at most three actions and exactly one
primary, **one** body block chosen by content type, wire empty/loading/error before
shipping, put each action in exactly one place, and wire keyboard and a11y.

The body-block choice is the step most often got wrong:

| Content | Block |
|---|---|
| List of records | List page shell — `PageHeader` + `DataToolbar` + `DataTable` + `Pagination` |
| One record | Detail page shell |
| Create / edit form | Form shell — or a `Dialog` if it is a short job done while reading a list |
| Executive overview | `StatCard` grid + module matrix |
| Reference data editor | Master data shell |

Forms that interrupt a list belong in a `Dialog`, which owns the focus trap and
Escape order. Inside one, use `FormShell variant="bare"` — a `Card` inside a modal
is two borders saying the same thing. `components/stores/stock-movement-dialog.tsx`
is the reference.

`StatCard` is the block for one number. Do not wrap tables or stat grids in a
`Card`: a card holding cards reads as two panels.

### 1f. Provisioning (`lib/<module>/provision.ts`)

The step most likely to be skipped, and the one that decides whether a sold tenant
is usable on the first morning. Before `provisionSchool` existed, provisioning made
a company, an administrator, a tier, a bundle and a subdomain — **and no school**,
so the first screen a registrar opened could not be used, because every term-scoped
record needs a term and nothing created one.

It creates the smallest set of records that makes the pack usable: the current year
and its terms, the class ladder, a subject catalogue, one fee structure to invoice
against. Defensible defaults a customer will edit, not guesses they must unpick.

**Idempotent by code**, so an operator who runs it twice, or after the customer has
started editing, does no damage.

### 1g. Demo seed and screenshots

A seed is not a fixture. `scripts/seed-payroll-demo.ts` builds a tenant with enough
shape that screens show real numbers — including *one employee deliberately missing
a BP number so the blocker path renders*. Seed the unhappy row on purpose; it is the
only way the exception state is ever looked at.

Then photograph it. `e2e/hr-payroll-shots.spec.ts` is the harness: a `SCREENS` array,
viewport legs, `SHOT_ONLY`/`SHOT_VIEWPORTS` filters for a fast loop, and — worth
copying — a check that `console.error`s when a screen photographs its own error
banner. Six pictures of "Failed to fetch payroll periods" once shipped as evidence
of working software.

### 1h. Portals, last

The method is recorded in `docs/design-system/portals/README.md` and it works:

1. **Download the demo** to `docs/design-system/portals/<name>.html`. It is the
   build contract — every feature in it is required.
2. **Extract a feature inventory** into that README, and **tag anything with no
   backing table `(no model)`**. That list is the schema work the portal implies,
   made visible before anybody starts building screens.
3. Host prefix in `lib/platform/portal-hosts.ts`; identity in
   `lib/<module>/portal-identity.ts`; guard in the `(shell)` layout so a new screen
   cannot ship unguarded.
4. Register the portal feature key **twice** — page and api — and **above** the
   `/portal` → `portal.core` catch-all, which otherwise swallows it.
5. Bundle `portal.core` with the portal feature, or every portal route redirects to
   `/access-blocked`.

Portal identity returns a **five-variant union**, not a nullable record:

```ts
| { kind: "self"; … } | { kind: "oversight"; … } | { kind: "unlinked"; … }
| { kind: "not-found"; … } | { kind: "forbidden"; … }
```

`forbidden` rather than an empty result, so a probing request is a 403 and not an
account that looks empty. Load portal data **on the server** and hand it down — a
client query mounted in a layout was observed not to re-render when it resolved.

---

## 2. Productisation — a module is a thing you can sell

Four files, in this order:

1. `lib/platform/feature-catalog.ts` — `FEATURE_CATALOG` (one entry per key) then
   `FEATURE_BUNDLES` (the sellable grouping, e.g. `ADDON_SCHOOLS_SUITE`).
2. `lib/platform/gating/feature-dependencies.ts` — edges like
   `schools.portal.parent → portal.core`.
3. `lib/platform/client-templates.ts` — which bundles a template grants, and which
   keys it explicitly disables.
4. `lib/platform/gating/route-registry.ts` — prefixes to keys.

Two traps:

- **A `CompanyFeatureFlag` on a billable feature that no tier or bundle entitles is
  ignored.** Enabling a flag is not enough; the bundle has to carry it.
- **Feature keys are persisted data.** `hr.*` keys kept their namespace through the
  People rename because `CompanyFeatureFlag` and `UserFeatureFlag` rows hold them,
  and `FeatureBundle.code` is joined on by `CompanySubscriptionAddon`. Renaming a key
  is a data migration, not a refactor.

An IA change must not reprice anybody. When attendance moved into People it took a
new key at **non-billable, £0**, matching the key it replaced, so no tenant's bill
or access changed.

---

## 3. Tests that make the pattern hold

Behaviour tests are per-feature and unremarkable. These four are structural, and
they are what stops a module rotting as it grows:

| Test | What it prevents |
|---|---|
| `lib/<module>/route-guard-coverage.test.ts` | A route file added without a role check |
| `lib/<module>/permissions.test.ts` | The matrix quietly widening; asserts the negatives |
| `lib/workspace-feature-resolution.test.ts` | A vertical's surfaces leaking into another vertical's workspace |
| `lib/hr/productisation.test.ts` | A bundle that no longer resolves to a coherent workspace |

The guard-coverage test earns its place. Adding `app/api/people` to the HR one
immediately failed — the attendance API had **no role check at all**, so any
signed-in user on a tenant with the feature could create and amend attendance, and
`Attendance.overtime` feeds a payroll run. A path from "can sign in" to "can pay
myself for hours I did not work", found by a test that only counts files.

Two rules for these:

- **Assert the count is non-zero.** A coverage test whose glob matches nothing
  passes vacuously. The HR one asserts `files.length > 50`.
- **Prove the negative case fails.** After writing a guard test, break the thing on
  purpose and watch it go red. `lib/workflow/approvals.test.ts` was checked that way;
  a passing grep proves nothing about a grep that can never fail.

Most tests here run against **a real Postgres**, deliberately. A mocked Prisma client
tells you the shape of the mock. It cannot tell you what a `numeric(14,2)` column did
with your third decimal, whether a `where` clause actually crossed a tenant boundary,
or that `position` is an enum and your `contains` query throws.

---

## 4. Retail: what exists, and what the schools pattern says is missing

Retail is not a blank page. As of `main` it has 33 route files under
`app/api/v2/retail` plus the `/api/v2/pos` collection route, 16 screen
directories, a POS portal at `app/portal/pos`, an offline runtime, a ten-tab
`tab-config.ts`, and a global-search arm.

Mapped against the layers above:

| Layer | Schools | Retail today |
|---|---|---|
| Schema | ✅ | ✅ `RetailSale`, `RetailRegister`, `RetailShift`, `RetailPurchaseOrder`, `RetailCatalogItem`, promotions, held carts |
| Domain library | ✅ 69 files | ✅ checkout, tender policy, loyalty, POS offline runtime |
| **Permissions matrix** | ✅ `permissions.ts` + test | ⚠️ role-set gates, no resource × action matrix |
| Feature gates | ✅ | ✅ `retail.core/pos/catalog/purchasing/shifts/promotions/reports` |
| **Role checks in handlers** | ✅ | ⚠️ **25 of 34 routes** — real gates, no coverage test |
| Screens | ✅ | ✅ |
| **Provisioning** | ✅ `provisionSchool` | ❌ **none** |
| **Demo seed** | ✅ | ❌ **none** — no tenant in the dev database has retail on |
| Screenshots | ✅ | ❌ none |
| Portal | ✅ ×3 | ✅ POS portal exists |
| Global search arm | ✅ | ✅ `lib/retail/search.ts` |
| **Structural tests** | ✅ 32 files | ❌ **one** (`search.test.ts`) |

### What retail's gates actually look like

Retail did not skip authorisation. It has a working gate layer — it just is not the
shape schools and HR use, and it is spread across two modules under five names:

| Gate | Where | Roles |
|---|---|---|
| `requireRetailManager` | `app/api/v2/retail/_helpers.ts` | `SUPERADMIN`, `MANAGER`, `SHOP_MANAGER` |
| `requireRetailStock` | same | manager set + `STOCK_CLERK` |
| `requireRetailPos` | same | manager set + `CASHIER` |
| `canManageRetailTransactions` | same | manager set, as a boolean |
| `canAccessPosPortal` | `lib/retail/pos-host.ts` | POS-capable roles |

**25 of the 34 route files call one of them.** The nine that do not are all `GET`
only, and all of them still go through `requireRetailSession` and scope every query
to `session.user.companyId`, so none of them is a tenant leak:

```
app/api/v2/retail/route.ts                        ← dashboard, aggregate trading figures
app/api/v2/retail/setup/overview/route.ts
app/api/v2/retail/customers/search/route.ts
app/api/v2/retail/customers/[id]/loyalty/route.ts
app/api/v2/retail/pos/catalog/route.ts
app/api/v2/retail/pos/catalog/categories/route.ts
app/api/v2/retail/pos/sales/[id]/route.ts
app/api/v2/retail/pos/current-shift/route.ts
app/api/v2/pos/route.ts
```

No unguarded writes: shift open and shift close both check `canAccessPosPortal`.

So the gap is not missing gates, it is two narrower things:

- **A role set is not a matrix.** `requireRetailStock` answers "is this person a
  stock person"; it cannot express "a cashier may read the catalogue but not its cost
  price". Every read above is currently open to any role in a retail tenant — a stock
  clerk can pull the trading dashboard. Whether that is wrong is a product decision,
  and a matrix is what makes it a decision rather than an accident.
- **Nothing pins it.** With no coverage test, the 26th route ships unguarded and
  nothing says so.

### The order I would work in

1. **`lib/retail/route-guard-coverage.test.ts` first**, before touching the
   permissions shape. Give it the canonical list of gate names above and expect a
   non-zero file count. It will go red on the nine reads immediately — that is the
   point, and it stops the number drifting while step 2 is in progress.
2. **`lib/retail/permissions.ts` + `permissions.test.ts`.** Define resources
   (`retail.sell`, `retail.catalog`, `retail.purchasing`, `retail.cash-control`,
   `retail.reports`) against `CASHIER`, `SHOP_MANAGER`, `STOCK_CLERK` — roles that
   already exist in `UserRole`. Assert the negatives: a cashier must not reach
   purchasing or cash control. Then express the five existing gates in terms of it so
   there is one answer rather than five, and delete the duplicates.
3. **Decide each of the nine reads** — grant it in the matrix or gate it. Do not gate
   them blind; `pos/catalog` being open to a cashier is correct, and
   `setup/overview` being open to one probably is not.
4. **`lib/retail/provision.ts`.** A shop that opens with no register, no tender
   configuration and no catalogue cannot take a sale. Idempotent, defensible
   Zimbabwean defaults.
5. **`scripts/seed-retail-demo.ts`.** A shop with a shift open, a held cart, a
   posted sale, a refund against it, a promotion, a purchase order part-received,
   and one deliberately broken row so the blocker path renders.
6. **Screenshots**, extending the shots harness. This is also the first time
   anybody will have *looked* at the stores dialogs and the POS screens on a real
   tenant — they are currently correct by code reading only.
7. **Composition audit** of the sixteen retail screen directories against
   `04-composition.md`: one body block each, forms in dialogs, no card-in-card.

### Retail-specific things schools never had to solve

- **Offline is a first-class concern.** `lib/retail/offline-*.ts` and
  `pos-offline-queue.ts` already exist. The queue, sync and conflict-resolution
  contract is the `x-offline-runtime` pattern in `04-composition.md`; a till that
  cannot sell when the line drops is not a till.
- **The register is money.** Cash-control and shift reconciliation are the retail
  equivalent of a payroll run: two-step, audited, and the place to put the
  `ApprovalAction` triple.
- **Fiscalisation.** `docs/accounting/zimra-fiscalisation.md` and
  `lib/schools/fiscalisation.ts` exist; a Zimbabwean retail receipt has statutory
  obligations a school invoice does not.

---

## 5. The mistakes worth not repeating

Every one of these actually happened.

**Verify in the environment the user is in.** Two migration scripts shipped broken
because I always had `DATABASE_URL` exported and always ran them as a second pass.
Neither loaded `.env`, and the first-run branch had never executed.

**A green `db push` is not evidence the schema changed.** `prisma db push` will not
cast text to an enum, and will not add a required column to a populated table. It
refuses, and the only remedy it suggests drops the database. Data migrations are
scripts (`pnpm db:migrate:data`), and witness tests read `information_schema` rather
than the schema file.

**Restart the dev server after `db:generate`.** It holds the old client; routes 500
while `tsc` and `db push` both look perfectly healthy.

**Photograph the screen.** `/people` crashed client-side on a field the API no
longer returned. Typecheck was clean. It was found by taking a picture.

**Do not gate a lookup on a narrowing field.** The crew query was gated on a site,
so a tenant with no sites was offered no crews and the screen was unusable. A site
narrows a register; it is not a prerequisite for having one.

**A grep for the guard you know is not an audit.** Auditing retail's role checks with
the schools and HR marker names returned "1 of 34 routes guarded" — an alarming
finding that was simply wrong. Retail's gates live under different names in a
different file. Correcting for one name gave 23, then a second gave 25. Three passes,
three numbers, and only the last one true. The lesson is not "grep more carefully":
it is that the canonical list of gate names has to live in the coverage test, where a
new one has to be added deliberately, rather than being reinvented by whoever is
looking. A module with five gate names and no such list cannot be audited by reading.

**Search boxes must not surface state identity numbers.** Employee national ID and
tax number, and scrap sellers' national IDs, are deliberately unsearchable — a box
in the app bar that turns one into a name and an address is the register leaked to
anyone signed in. That rule is a test, not a comment, because a comment does not
fail.
