# Local development

From nothing to a running app with a tenant you can sign into. Everything here is
read off the repo as it stands, not from memory — versions come from the installed
packages, credentials from the seed script that creates them.

For deeper database detail see `DATABASE_SETUP.md`; for tenant-host theory see the
README's routing section. This page is the shortest path that works.

---

## 1. Prerequisites

| What | Version | Where the floor comes from |
|---|---|---|
| Node | **20.19+, 22.12+, or 24+** | `prisma@7.2.0` engines: `^20.19 \|\| ^22.12 \|\| >=24.0`. `next@16.1.1` wants `>=20.9`, so Prisma is the binding constraint. |
| pnpm | **9+** | `pnpm-lock.yaml` is `lockfileVersion: 9.0` |
| PostgreSQL | **14+**, developed against **16** | `DATABASE_SETUP.md` claims 14; 16 is what this branch is tested on |

> `DATABASE_SETUP.md` says "Node.js 18 or later". That is stale — Prisma 7 will not
> run on 18. Use Node 22 if you have no reason to prefer another.

Check what you have:

```bash
node -v      # v22.x
pnpm -v      # 9.x or 10.x
psql --version
```

## 2. Install

```bash
git clone https://github.com/tate2301/huchu.git
cd huchu
pnpm install
```

There is **no `postinstall` hook**, so the Prisma client does not exist yet and
`npx tsc --noEmit` will fail on missing `@prisma/client` types until step 5. That is
expected, not a broken install.

## 3. Database

Create a database and a role. The connection string in `.env.example` assumes a
database named `huchu_mines`.

**Linux / macOS**

```bash
sudo -u postgres psql -c "CREATE DATABASE huchu_mines;"
sudo -u postgres psql -c "CREATE USER huchu WITH PASSWORD 'huchu';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE huchu_mines TO huchu;"
sudo -u postgres psql -d huchu_mines -c "GRANT ALL ON SCHEMA public TO huchu;"
```

**Windows** — from an elevated *SQL Shell (psql)*, or with `psql` on PATH:

```powershell
psql -U postgres -c "CREATE DATABASE huchu_mines;"
psql -U postgres -c "CREATE USER huchu WITH PASSWORD 'huchu';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE huchu_mines TO huchu;"
psql -U postgres -d huchu_mines -c "GRANT ALL ON SCHEMA public TO huchu;"
```

The last `GRANT ON SCHEMA public` is not optional on PostgreSQL 15+, which
revoked public schema creation rights from non-owners. Without it `db push`
fails with `permission denied for schema public`.

## 4. `.env`

```bash
cp .env.example .env
```

Three values matter to start. Everything else in the file is optional and
documented inline.

```env
DATABASE_URL="postgresql://huchu:huchu@localhost:5432/huchu_mines?schema=public"
NEXTAUTH_SECRET="<paste output of: openssl rand -base64 32>"
NEXTAUTH_URL="http://localhost:3000"
```

Leave `PLATFORM_ROOT_DOMAIN` **empty** for now. Empty means localhost is the
central host and tenant subdomains are not enforced — which is what you want
until §7.

On Windows without `openssl`, PowerShell will do:

```powershell
[Convert]::ToBase64String((1..32 | % { Get-Random -Max 256 } | % { [byte]$_ }))
```

## 5. Schema

```bash
pnpm db:push        # creates every table from prisma/schema.prisma
pnpm db:generate    # regenerate the typed client
```

**On a fresh, empty database that is all you need.** `db push` creates the
`AttendanceStatus` enum, `Attendance.companyId` and the nullable `Attendance.siteId`
in one go.

**On a database that already has data**, `db push` refuses two of the changes and
tells you so:

```text
• Added the required column `companyId` to the `Attendance` table without a
  default value. There are N rows in this table, it is not possible to execute
  this step.
• Changed the type of `status` on the `Attendance` table. No cast exists, the
  column would be dropped and recreated, which cannot be done since the column
  is required and there is data in the table.
```

Neither needs a drop. Run the data migrations first, then push:

```bash
pnpm db:migrate:data
pnpm db:push
```

`db:migrate:data` chains the two scripts in order and stops on the first failure.
Both are idempotent, both refuse rather than guess — an attendance value outside
the enum, or one person marked twice for a single shift, stops the run with the
rows listed and nothing changed — and afterwards `db push` should report *"The
database is already in sync"*. If it still wants to make changes, stop and read
them.

Ignore the `--force-reset` that Prisma suggests in that message. It drops the
database.

A third failure can appear on a database old enough to hold approvals from before
the settlement tables landed:

```text
ERROR: invalid input value for enum "ApprovalTargetType_new": "IRREGULAR_PAYOUT_BATCH"
```

That one needs no script and no data change — it was a schema bug, fixed by keeping
the retired value declared. If you see it, you are on a commit older than that fix;
pull and push again. `ApprovalTargetType` may gain values and must never lose one,
because `ApprovalAction` is an append-only audit trail and Postgres will not drop a
value that existing rows still hold. `lib/workflow/approvals.test.ts` enforces it.

## 6. Seed a tenant and run

```bash
npx tsx scripts/seed-payroll-demo.ts
pnpm dev
```

The seed is re-runnable. It creates a provisioned payroll-bureau tenant with a
subscription, a dual-currency workforce, an approved August 2026 run with a posted
journal, leave balances, and one employee deliberately missing a BP number so the
blocker path renders.

| | |
|---|---|
| URL | http://localhost:3000/login |
| Email | `rudo.chirwa@payroll-demo.test` |
| Password | `Password123!` |
| Tenant slug | `payroll-demo` |

Other seeds: `scripts/provision-school.ts` for a school, and
`scripts/seed-staging-tenant.ts --slug <slug>` for an arbitrary tenant from a
template.

That is a working local dev environment. Stop here unless you need tenant hosts.

---

## 7. Tenant and portal hosts

Only needed to work on **host-based routing, the admin portal, or any of the
portals** (student, parent, teacher, POS). Plain `localhost:3000` covers the
admin app for a single tenant.

Two halves have to agree: hosts-file entries so the names resolve, and `.env` so
the app enforces them.

### 7a. Windows hosts file

`C:\Windows\System32\drivers\etc\hosts` — **editing it requires administrator
rights.** Notepad opened normally will silently fail to save.

Open it elevated:

```powershell
Start-Process notepad "C:\Windows\System32\drivers\etc\hosts" -Verb RunAs
```

Add:

```text
127.0.0.1 apps.pagka.local
127.0.0.1 payroll-demo.apps.pagka.local
127.0.0.1 acme.apps.pagka.local
127.0.0.1 pos.acme.apps.pagka.local
127.0.0.1 parents.acme.apps.pagka.local
127.0.0.1 students.acme.apps.pagka.local
127.0.0.1 staff.acme.apps.pagka.local
127.0.0.1 admin.pagka.local
127.0.0.1 portal.admin.pagka.local
```

Or append them without opening an editor, from an **elevated** PowerShell:

```powershell
$hosts = "$env:SystemRoot\System32\drivers\etc\hosts"
@(
  '127.0.0.1 apps.pagka.local'
  '127.0.0.1 payroll-demo.apps.pagka.local'
  '127.0.0.1 acme.apps.pagka.local'
  '127.0.0.1 pos.acme.apps.pagka.local'
  '127.0.0.1 parents.acme.apps.pagka.local'
  '127.0.0.1 students.acme.apps.pagka.local'
  '127.0.0.1 staff.acme.apps.pagka.local'
  '127.0.0.1 admin.pagka.local'
  '127.0.0.1 portal.admin.pagka.local'
) | % { if (-not (Select-String -Path $hosts -SimpleMatch $_ -Quiet)) { Add-Content $hosts $_ } }
ipconfig /flushdns
```

The `Select-String` guard makes it safe to run twice. `ipconfig /flushdns` matters
— Windows caches negative DNS answers, so a name you just added can keep failing
for a while without it.

**Wildcards do not work in a hosts file.** `127.0.0.1 *.apps.pagka.local` is not a
thing on any OS; every tenant and portal subdomain needs its own line. Add a line
per tenant slug as you create tenants.

> **`staff.` is the *teacher* portal today**, not a staff portal. The staff portal
> is planned but unbuilt (slice P-10 moves teachers to `teachers.` so `staff.` can
> be reused). Prefixes come from `lib/platform/portal-hosts.ts`: `students`,
> `parents`, `staff`, `pos` — plus `guardian` as an alias for `parents`.

### 7b. Linux / macOS

Same names, in `/etc/hosts`:

```bash
sudo tee -a /etc/hosts <<'EOF'
127.0.0.1 apps.pagka.local
127.0.0.1 payroll-demo.apps.pagka.local
127.0.0.1 acme.apps.pagka.local
127.0.0.1 pos.acme.apps.pagka.local
127.0.0.1 parents.acme.apps.pagka.local
127.0.0.1 students.acme.apps.pagka.local
127.0.0.1 staff.acme.apps.pagka.local
127.0.0.1 admin.pagka.local
127.0.0.1 portal.admin.pagka.local
EOF
```

### 7c. `.env` for strict hosts

```env
NEXTAUTH_URL="http://apps.pagka.local:3000"
PLATFORM_ROOT_DOMAIN="apps.pagka.local"
PLATFORM_ROOT_HOSTS="apps.pagka.local,apps.pagka.local:3000"
ADMIN_ROOT_DOMAIN="admin.pagka.local"
```

Restart `pnpm dev` after changing these — they are read at boot.

With this on, `localhost:3000` becomes the *central* host: tenant paths served
there redirect to `/admin`. Sign in at the tenant host instead:

- http://payroll-demo.apps.pagka.local:3000/login
- http://students.acme.apps.pagka.local:3000/login
- http://parents.acme.apps.pagka.local:3000/login
- http://staff.acme.apps.pagka.local:3000/login — teacher portal
- http://pos.acme.apps.pagka.local:3000/login
- http://portal.admin.pagka.local:3000/admin/login

---

## 8. Checks

```bash
npx tsc --noEmit
pnpm lint      # 250 problems / 48 errors is the current baseline, not a failure
pnpm test      # 151 files / 2259 tests
```

**`pnpm test` needs Postgres running.** A large share of the suite is DB-backed on
purpose — a mocked Prisma client cannot tell you what a column did with your
number. Around fifty files failing at once almost always means the database is
down, not that you broke fifty things:

```bash
pg_isready || sudo pg_ctlcluster 16 main start      # Linux (16 = your cluster version)
# Windows: check the service name first, it carries the major version
#   Get-Service *postgres*    then    Start-Service postgresql-x64-16
```

`pnpm lint` exits non-zero at the baseline. Compare the count, not the exit code.

## 9. Things that will bite you

**A stale Prisma client after a schema change.** `pnpm db:push && pnpm db:generate`
does not reload a dev server that is already running. The app keeps using the old
client and API routes 500 while `tsc` and `db push` both look perfectly happy.
**Restart `pnpm dev` after any `db:generate`.**

**`NEXTAUTH_URL` decides where login redirects you.** If it names a host your
machine cannot resolve, sign-in still *works* — the session cookie is issued for
the host the form posted to — but the redirect lands nowhere. When that happens
look at the cookie, not the URL bar.

**e2e specs need the hosts entry.** `e2e/*.spec.ts` default to
`http://payroll-demo.apps.pagka.local:3000`, which is a real hostname your machine
must resolve. Without the entry every screenshot spec fails at the first
navigation:

```bash
E2E_BASE_URL=http://payroll-demo.apps.pagka.local:3000 npx playwright test e2e/attendance-mark.spec.ts
```

**`prisma/migrations` IS the source of truth.** *(Corrected 2026-08-24 — this section
previously said "never `prisma migrate deploy`" and that migrations were not authoritative.
That stopped being true in August 2026.)*

The history was reconciled with the schema over commits `08aa5197` (recovered the orphan
migration that blocked `migrate deploy`), `84444c2c` (history caught up with the scripts)
and `eb0c8fd9` (pending migrations deployed). There are now 63 migrations and a
`migration_lock.toml`, and `prisma/migrations` is what production applies.

Use `prisma migrate dev` for a schema change that is going to production — see
`.claude/agents/gold-data-foundation.md`, which requires it and requires a migration
witness test. `prisma db push` is for throwaway local databases only; using it against a
shared database is what caused the drift post-mortem in
`docs/gold-prod-recovery-2026-05-10.md`.

**Never `db push --force-reset`** on a database you care about. It is the remedy
Prisma suggests for the two changes in §5 and it drops everything.
