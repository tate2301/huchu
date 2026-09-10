# The test data

Every tenant the suite signs into, what is actually in it, and how to rebuild
it. Counts are measured off `huchu_e2e` on 2026-09-10, not estimated.

Two rules that are not negotiable and exist because they were broken once:

- **The e2e database is `huchu_e2e` on local Postgres.** Never Neon. The shared
  Neon instance holds tenants we demo to clients, and a silent fallback once put
  ~390 junk test tenants on it. `vitest.setup.ts` refuses any non-loopback
  `DATABASE_URL_TEST`; `_support/db.ts` refuses a non-loopback
  `E2E_DATABASE_URL` and has deliberately no fallback to `DATABASE_URL`.
- **A credential appears in `e2e/_support/tenants.ts` or nowhere.** Specs name a
  person, never a password. Four specs each carried their own copy before that
  rule, which is four chances for a re-seed to leave one behind — and the
  failure reads as "sign-in refused" rather than "you changed the seed".

---

## The five tenants

| Slug | Name | Vertical | Profile |
|---|---|---|---|
| `acme` | ACME Inc | retail | `THRIFT` (retail's stored enum name) |
| `stmarys` | St Marys High School | schools | `SCHOOLS` |
| `huchu-enterprises` | Huchu Enterprises | gold | `GOLD_MINE` |
| `hurudza-creative` | Hurudza Creative | CRM / services | `GENERAL` |
| `payroll-demo` | Kariba Payroll Bureau | payroll + accounting | `PAYROLL` |

`hurudza-creative` is the only one with **no `CompanyFeatureFlag` rows at all**.
It runs on its subscription alone, which is why `workspace-settings-suite`
sweeps there: nothing it hits can be refused for a reason belonging to a demo
script rather than to the product.

---

## What is in each

### `acme` — a Harare bottle store

| | |
|---|---|
| Sales | **5,018** |
| Shifts | **246** |
| Catalogue products | **15** |

180 days of trading, tills, registers, held carts, cash movements, Z-reports and
a fiscalisation trail. Named customers with loyalty tiers. At least one voided
sale and one refund, which took two attempts to get right — the seed used to
increment a `voids` counter and print "21 void(s) flagged" while all 5,158 sales
sat at `POSTED`.

    npx tsx scripts/seed-retail-demo.ts --slug acme --days 180 --reset

**Logins:** `owner` (SUPERADMIN), `manager`, `cashier`, `cashier2`,
`stock` (STOCK_CLERK). The two cashiers matter: a till test that needs an
override needs a second person to approve it.

### `stmarys` — a 120-pupil secondary school

| | |
|---|---|
| Students | **120** |
| Guardians | **119** |
| Fee invoices | **120** |

Six classes, eight teachers, a term of attendance registers, two papers per
class-subject, and fees in a mix of paid, part-paid and overdue. Three portals
have real people behind them.

    npx tsx scripts/seed-staging-tenant.ts --slug stmarys --email head@stmarys.test \
      --password 'SchoolDemo123!' --name 'St Marys High School' \
      --user-name 'Head Teacher' --profile SCHOOLS
    npx tsx scripts/seed-school-demo.ts --slug stmarys --reset

**Logins:** `head` (SUPERADMIN), `teacher` (HOD), `student`, `parent`. The last
three are the reason `seed-school-demo.ts` had to exist — `provisionSchool`
creates no people, so before it there was nobody to sign into a portal *as*.

### `huchu-enterprises` — a gold mine

| | |
|---|---|
| Shift allocations | **154** |
| Pours | **6** |
| Dispatches | **5** |
| Buyer receipts | 4 |

A quarter of trading across three shafts, 931 worker shares, 90 daily gold
prices, a closed period. Roles matter more here than anywhere else: settlement
approval is gated, so the clerk raises and the manager approves.

    npx tsx scripts/seed-staging-tenant.ts --slug huchu-enterprises \
      --email mine@huchu-enterprises.test --password 'GoldDemo123!' \
      --name 'Huchu Enterprises' --user-name 'Mine Manager' --profile GOLD_MINE
    npx tsx scripts/seed-gold-demo.ts --slug huchu-enterprises --reset

**Logins:** `admin` (SUPERADMIN), `manager`, `clerk`.

**Two seed bugs this tenant has taught, both worth remembering.** `companyId` is
denormalised onto the gold tables and the screens filter on it — but it is
*nullable*, so omitting it does not fail the write, it just makes the row
invisible while the seed reports success. And the shift split was rounded three
ways independently, so 69 of 154 allocations had worker + company share exceed
net weight by exactly one milligram: gold that was never poured, on 45% of
shifts. The product derives the company share by subtraction; the seed now does
the same.

### `hurudza-creative` — a creative agency

| | |
|---|---|
| Leads | **180** |
| Deals | **90** |
| Companies | **35** |
| Work orders | **3** |

A year of trading: 1,165 activities, 57 quotations, 22 invoices, 20 receipts.
Plus an intake form, a saved list, a quote template and three jobs — added in
this pass, because without them four record pages had nothing to open and four
list pages rendered an empty state that reads as a working screen.

    npx tsx scripts/seed-staging-tenant.ts --slug hurudza-creative \
      --email tafadzwa@hurudza.test --password 'Password123!' \
      --name 'Hurudza Creative' --user-name 'Tafadzwa Mukono' --profile GENERAL
    npx tsx scripts/seed-crm-demo.ts --slug hurudza-creative
    npx tsx scripts/seed-crm-year.ts --slug hurudza-creative

Three scripts in order, because neither CRM seed creates a tenant or a user —
they fill a module on a tenant that already exists, and `seed-crm-demo` looks up
an owner with `user.findFirst`.

**Logins:** `owner` (SUPERADMIN).

### `payroll-demo` — a payroll bureau

| | |
|---|---|
| Employees | **6** |

Payroll runs, salaries, compensation, disbursements, statutory returns, and a
full set of books: chart of accounts, journals, trial balance, financial
statements, receivables and payables.

    npx tsx scripts/seed-payroll-demo.ts

**Logins:** `admin` (SUPERADMIN).

**Deliberately not entitled to Banking, Currency or Cost Centres.** That is not
an oversight — `finance-suite.spec.ts` asserts those three routes land on
`/access-blocked`, so the paywall is proved rather than assumed. If that gate
ever opens, three green tests go red.

---

## Signing in

`e2e/auth.setup.ts` signs everybody in once and writes a `storageState` per
tenant-and-role into `e2e/.auth/`. Every suite starts from those.

This is the difference between a suite that runs in minutes and one that runs in
hours: sign-in costs 15–25 seconds, and the 17-test gold suite once spent **2.6
hours** on it — the tests were about fifteen minutes of that.

The saved state carries **two** cookies that matter, not one: the session token
and `__huchu_preview_host`. That is why there is a file per tenant *and* per
role — the host nomination is part of the session. A test that calls
`context.clearCookies()` loses the nomination in the same breath and starts
talking to the central host, which serves pages and refuses the tenant's APIs.
`nominate()` is exported from `fixtures.ts` to re-plant it.

---

## One origin, many hosts

Tenant and portal hosts would each need a line in the machine's hosts file, and
on this workstation we cannot add them — no admin rights, and the router's
DNS-rebind protection hijacks `*.localtest.me`.

So the browser talks to a single origin and *tells* the server which host to
behave as, via the `__huchu_preview_host` cookie. **Not a bypass:** sign-in is
still scoped to the tenant the nominated host resolves to, the session still
carries that tenant's `allowedHosts`, enforcement still runs, and an inactive
tenant is still refused. Only the hostname arrives by a different route.

The origin is deliberately **not** localhost — `lib/platform/preview-host.ts`
relaxes strict enforcement for loopback, and a suite running with enforcement
off would not be testing the paths production takes.

The cookie rather than the `x-huchu-preview-host` header, even though
`STAGING_PREVIEW.md` names the header for the e2e suite. The header is right for
curl and wrong in a browser: Playwright applies `extraHTTPHeaders` to *every*
request the context makes, cross-origin ones included, and a custom header on a
cross-origin request triggers a CORS preflight. The first run of this suite
failed on exactly that — Google Fonts blocked by CORS policy, the harness
breaking the page it was meant to photograph.

---

## Narrowing a tenant for demos

`seed-staging-tenant.ts` grants every feature in the catalogue, which is right
for a preview build and wrong for a demo — a gold mine opens its sidebar and
finds Students, Attendance and Boarding.

    npx tsx scripts/demo-focus.ts --slug huchu-enterprises --profile GOLD_MINE
    npx tsx scripts/demo-focus.ts --slug acme --restore

**Two switches, not one.** The sidebar is built from the tenant's *enabled
features* and then arranged by the *workspace profile* recipe. Set only the
profile and you reorder the noise; disable only the features and the workspace
is labelled General. Both, always.

Reversible: `--restore` clears every disable-row and hands the tenant back to
its subscription.

---

## The data has a half-life

**Seeded rows age out of date-filtered screens.** `/reports/shift` passed on
2026-09-04 and failed on 2026-09-08 with no code change: the page filters by
date range, the gold seed writes its reports across 25–31 August, and real time
walked past the default window.

Any assertion that reaches through a default date filter will eventually go red
on a morning when nothing was touched, and it will look exactly like a
regression. Screens with this shape include `/reports/*`, the school registers
and fee ledgers, and every POS "today" view.

Two answers, and they are not equivalent. **Re-seed** before a run and keep the
assertions strong enough to name rows — that is right for suites that are
*about* the data. Or **do not reach through the filter**: a route sweep asserts
the page's own furniture and a spec that controls the range asserts the rows.
This pass took the second, because a route sweep asserting on filtered data was
the wrong division of labour to begin with.

---

## State carries between runs

Specs that write do not reset the world, and a run inherits whatever the last
one left. Two live examples:

- **`retail-workflows` ends its trading day by cashing up**, so the next run
  starts with a closed drawer. `retail-void` opens a shift itself for that
  reason — including counting a float in, because the confirm button stays
  disabled until one is. `retail-catalog-image` does not, and is skipped.
- **`attendance-mark` marks a register**, and the `[date, shift, employeeId]`
  unique key means a second run on the same day is a 409. It used to draw a
  random day from fifty-four and call that repeatable; the birthday paradox
  caught up. It now owns one day and clears it first.

The rule the second one is an instance of: **a spec that writes should own what
it writes.** Randomness is not a substitute for cleanup.

---

## Rebuilding from nothing

    createdb huchu_e2e                              # or via the compose Postgres on 54329
    pnpm dlx dotenv-cli -e .env.e2e -- npx prisma migrate deploy
    # then each tenant's seed block above, in the order given
    npx playwright test auth.setup.ts               # writes e2e/.auth/

`.env.e2e` is gitignored and holds the database URL, `NEXTAUTH_SECRET`, the
port (300) and the preview-host flags. Both seed scripts and `demo-focus` refuse
a `DATABASE_URL` matching `/\bprod(uction)?\b/`.
