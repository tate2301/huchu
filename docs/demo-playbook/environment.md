# Standing up a demo

From nothing to five tenants you can demo, on one machine.

## What you need

| | |
|---|---|
| PostgreSQL 16 | on port **54329**, database `huchu_e2e` |
| Node | 20.19+ / 22.12+ / 24+ |
| Chrome | any recent one; the suite drives the installed browser |

Postgres goes in with one command. The port is deliberate — it keeps the demo
database well away from any other Postgres on the machine:

```bash
winget install --id PostgreSQL.PostgreSQL.16 --exact --accept-package-agreements --accept-source-agreements --custom "--mode unattended --unattendedmodeui minimal --serverport 54329 --superpassword postgres --disable-components stackbuilder"
```

Docker would also work in principle and does not here: Docker Desktop needs
WSL2, which needs the *Virtual Machine Platform* Windows feature, which is off
on this workstation. A native Postgres does the same job with no reboot.

## Build the databases

```bash
pnpm e2e:bootstrap
```

Creates the `huchu` role and both databases (`huchu_e2e` for demos and tests,
`huchu_test` for the unit suite), applies all 63 migrations, and syncs the
feature catalogue. `--check` dry-runs it.

The two databases are separate on purpose: `pnpm test` creates and drops tenants
constantly, and sharing one would have the unit suite quietly delete the shop
you are about to demo.

## Seed the five tenants

Each is two or three commands, all idempotent, all re-runnable. Full list with
credentials in [tenants.md](tenants.md).

```bash
npx tsx scripts/seed-retail-demo.ts --slug acme --days 180 --reset
npx tsx scripts/seed-payroll-demo.ts
npx tsx scripts/seed-crm-year.ts --slug hurudza-creative
npx tsx scripts/seed-school-demo.ts --slug stmarys --reset
npx tsx scripts/seed-gold-demo.ts --slug huchu-enterprises --reset
```

Each takes 15–40 seconds. Resetting a tenant mid-demo-prep is cheap, which is
the whole reason to demo from seeds.

## Run it

Two ways, and the choice matters.

```bash
pnpm start:e2e     # build once, serve fast — for demos and full test sweeps
pnpm dev:e2e       # hot reload — for when you are changing the app
```

**Use `start:e2e` for a demo.** `next dev` compiles each page the first time
someone asks for it, which on a cold route measured anywhere from 20 seconds to
two minutes. That is survivable in development and unwatchable in front of a
client. A production build pays that cost once, up front.

Both read `.env.e2e` and serve on **port 300**, leaving 3000 free.

## Signing in

Every tenant is reached from **one origin** — `http://acme.apps.pagka.local:300` —
and the tenant is chosen by nomination rather than by hostname, because tenant
subdomains would each need a hosts-file entry and admin rights we do not have.

Switch tenant by visiting any path with `?__tenant=`:

```
http://acme.apps.pagka.local:300/login?__tenant=stmarys
```

The server stores it in a cookie and redirects to a clean URL, so the parameter
never shows up in the address bar during a demo. `/preview-host` shows and
changes the current nomination.

This is not a bypass: sign-in is still scoped to the tenant the nominated host
resolves to, enforcement still runs against it, and an inactive tenant is still
refused. See `docs/_start-here/STAGING_PREVIEW.md`.

> Do not demo from `localhost` — `lib/platform/preview-host.ts` relaxes strict
> host enforcement for loopback, so you would be showing a code path production
> never takes.

## Narrow a tenant before you demo it

`seed-staging-tenant.ts` grants the whole product — 120 features — which is
right for a preview build and wrong in front of a client. A gold mine opens its
sidebar and finds Students, Attendance, Academics, Results and Boarding under
"More"; a school finds Run the Floor and Range & Stock.

```bash
npx tsx scripts/demo-focus.ts --slug huchu-enterprises --profile GOLD_MINE
npx tsx scripts/demo-focus.ts --slug stmarys --profile SCHOOLS
npx tsx scripts/demo-focus.ts --slug acme --profile RETAIL
```

It sets two switches, because either alone is wrong: the **workspace profile**
(what the sidebar is arranged as, and what the switcher is named) and the
**entitlements** (which modules exist at all). The keep list is derived from
each vertical's `primaryModules` and `foundationalModules` in
`VERTICAL_PRODUCT_BUNDLES`, so it cannot drift from the product definition.

Reversible, and it touches no data:

```bash
npx tsx scripts/demo-focus.ts --slug huchu-enterprises --restore
```

**Sign in again afterwards.** Entitlements ride in the session token, so an
open session keeps the old sidebar until it is reissued.

Leave `payroll-demo` and `hurudza-creative` alone: the finance suite asserts
that Banking, Currency and Cost Centres are *blocked* for the bureau, and
narrowing it would change what those assertions mean.
