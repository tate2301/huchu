# Known issues

**Updated 2026-09-02 (late).** What to avoid in front of a client, and what is safe.

Everything here was found by the end-to-end suite. As each is fixed it moves out
of this file and into a passing test — that is the intended direction of travel.
See `docs/testing/e2e-status.md` for the engineering view.

---

## Avoid on stage

**Nothing, in gold.** As of 2026-09-02 the gold suite is 26/26 green against a
production build, and the three screens this section used to warn about are
among the passes.

The earlier warnings were wrong, and how they were wrong is worth keeping:

- `/gold/settlement/approvals` and `/gold/reconciliation` "returning 400" was an
  artefact of the **dev server**. Both are clean under `next build`.
- `/gold/exceptions` "taking over 30 seconds" was the suite waiting on an event
  stream that never closes, not the page being slow.

Demo from a production build (`pnpm start:e2e`) and none of it applies. Demoing
from `next dev` is what produced all three, and is slow enough on first visit to
each screen to look broken on its own.

## Cosmetic, harmless, worth knowing

**A hydration warning on every authenticated page.** The device-sync button in
the header renders one state on the server and a different one in the browser
("Device sync — ready" against "Device sync — preparing"). Nothing visibly
breaks; it appears in the browser console on the second page load of a session.
If a client has dev tools open, this is what they will see. The fix belongs in
`components/providers/offline-provider.tsx`.

## Not bugs, though they look like them

**Some routes have no index page.** `/gold/shift-output` and `/gold/insights`
both 404 — each has a child page (`/new`, `/allocations`) and no page of its
own. Navigate to the child. Worth checking before adding a third.

**A cashier cannot leave the till.** Signing in as a cashier bounces you to the
POS host from wherever you were, and `/portal/pos` shows as `/`. That is
deliberate: a cashier has no business anywhere else in the workspace.

**The parent portal shows one child.** The seeded parent is the guardian of one
pupil. Not a limitation of the product — a property of the fixture.

## Fixed, recorded because they will be asked about

**The migration history could not rebuild the schema.** `prisma migrate deploy`
against an empty database died 59 migrations in: `20260819090000` referenced
`StockMovement."sourceType"` a step before the migration that creates it.
Existing databases were fine — the column had been added by script — so only a
from-scratch build failed, which is why nobody had hit it. Fixed 2026-09-01,
with `pnpm verify:migrations` as the guard. Full account in
`docs/testing/e2e-plan-2026-09-01.md` §10.

**Gold rows were invisible to their own screens.** `companyId` is denormalised
onto the gold tables and the pages filter on it, but the column is nullable — so
a row written without it saves happily and never appears. Four seeded buyer
receipts showed as "No sales recorded". Fixed in the seed; worth remembering if
gold data is ever loaded by another route.

**Every "Export PDF" page threw an uncaught error in the console.**
`components/pdf/pdf-template.tsx` stamped its "Generated" time during render,
so the server and the browser disagreed about the text and React threw #418.
Nine screens carried it — gold exceptions and payouts, maintenance, school
documents, stores inventory and fuel, and the shift, plant and attendance
reports. Nothing visibly broke, but a client with dev tools open would have
seen a red error on all of them. Fixed 2026-09-02: the timestamp is now stamped
on the client, which also makes it mean what it says.

**The demo mine's gold did not add up.** 69 of 154 shifts had the crew's share
plus the company's share exceeding the shift's net weight by exactly one
milligram — the seed rounded the whole and both halves separately. The product
was never wrong; only the demo data was. If anyone asks whether the numbers on
the shift ledger are real: they are, and there is a test that fails if they
stop being. Fixed 2026-09-02.

**The till's customer search returned nothing, for everyone.** It asked the API
for 40 results; the API caps the parameter at 30 and rejected the request
outright. The screen showed "no customers" rather than an error, so it looked
like empty data. The same call in the offline warm-up failed the same way on
every page of every tenant. Fixed 2026-09-02.

**Six unauthenticated requests on every cashier sign-in.** The till's data
providers wrap its login screen too, so they started fetching before anybody had
typed a password. All correctly refused, all pointless. Fixed 2026-09-02.

**The workspace switcher named the wrong business, on every screen.** Top-left,
above the sidebar: it read "Retail" on St Mary's student roll and on the mine's
dispatch ledger, and the sidebar under it led with Run the Floor and Range &
Stock on a school. Three layers of one mistake — an inference chain with retail
first, demo tenants with no profile set, and `GENERAL` meaning both "not set"
and "a general business" in four separate places. Fixed 2026-09-02 and covered
by `lib/workspace-resolution.test.ts`. **The screenshots no longer need
cropping.**

**Three accounting screens asked for data their tenant is not entitled to.**
`/accounting/sales` and `/accounting/purchases` requested bank accounts,
`/accounting/journals` requested cost centres, and a tenant without those
modules got a 403 on every load. The client-side entitlement signal turned out
to exist already — the sidebar had been using it for months. Fixed 2026-09-02;
`hooks/use-entitlement.ts`.

**The offline warm-up 404'd six times on every page of every tenant.** It
fetched both forms of each till route, so whichever form did not apply to the
current host always failed. It now stops at the first one that works, which
needs no knowledge of hosts at all. Fixed 2026-09-02.

**The offline preloader fetched things the signed-in person could not have.**
A gold clerk opening the price board took two 403s on `/api/sites`; a cashier
signing into the till took one on promotions. Neither page mentions the
endpoint — the preload set belongs to HR, and HR is foundational to every
vertical, so it ran everywhere. A preload now declares what entitles it and is
skipped when the session lacks it. Fixed 2026-09-02.

**Three links went nowhere.** A "Suppliers" button on retail purchase orders,
and "Scrap Materials" and "Scrap Sellers" in management master data. Removed:
there is no supplier record to link to (a purchase order carries a free-text
name), and scrap is a retired profile with no module and no feature keys.
Fixed 2026-09-02.

**The tables.** `/schools/students` was 16px too wide and cut "Delete" off;
`/people` was 1,944px of columns in 923px of space. Both now fit exactly. Row
verbs are a `⋯` menu instead of two or three buttons, `/people` folds six
record-detail columns behind the Columns control, and the toolbar no longer
clips its own first button. The CRM record table is now the documented standard
— `docs/design-system/12-tables.md`. Fixed 2026-09-02.
