# E2E status

**Updated 2026-09-02 (third pass).** Companion to `e2e-plan-2026-09-01.md`, which promises
this file in §7. What is green, what is red, and which reds are the product's
fault rather than the suite's.

---

## Suites

All against a production build (`pnpm start:e2e`), one worker, 2026-09-02.

| Suite | Tests | State |
|---|---|---|
| `smoke-tenants` | 2 | **Green** |
| `smoke-school` | 4 | **Green** — all three portals |
| `cross-cutting` | 6 | **Green** |
| `gold-suite` | 26 | **Green** |
| `retail-suite` | 20 | **Green** |
| `crm-suite` | 22 | **Green** |
| `schools-suite` | 29 | **Green** |
| `finance-suite` | 35 | **Green** |
| `marketing-shots` | 27 | **Green** — 68 screenshots |
| *(pre-existing)* | 185 | not re-run since the harness landed |

**139 passed in 13.0 minutes.** For comparison, the gold suite alone took 2.6
hours on the first pass.

## Triage — gold, the first vertical through

The rule from the plan: every failure is a **product bug**, a **seed gap**, or a
**test bug**. Being honest about which is the whole point of the exercise.

### Test bugs — mine, fixed

| Failure | Cause |
|---|---|
| `Shift output renders` — 404 | `/gold/shift-output` has no page; only `/gold/shift-output/new` does. The 404 is correct behaviour. My route list was wrong. |
| `Dispatches renders` — no `SEAL-` | The list shows bar, courier and destination; the seal number lives on the record. The page was working — five dispatches, all "Awaiting sale". Assertion changed to `BAR-\d{4}`. |
| `a clerk sees the ledger` — 404 | The same non-existent route. Reported as a role-gating bug at first; it was not. |
| `the till admits a cashier` — wrong URL | A cashier-role session is bounced to the POS host, where `/portal/pos` is the internal path and `/` its public form. Landing on `/` is correct. |

### Seed gaps — mine, fixed

| Failure | Cause |
|---|---|
| `Buyer receipts` — "No sales recorded" over four seeded receipts | `companyId` is denormalised onto the gold tables and the screens filter on it. It is **nullable**, so omitting it does not fail the write — it just makes the row invisible, which is worse, because the seed reports success. `scripts/backfill-gold-pour-company-id.ts` exists because this has been got wrong before. Now set on pours and receipts; verified 6/6, 5/5, 4/4. |

### Product findings — not mine, not fixed

*Superseded — see "Runtime: fixed" above.* Of the four recorded here on
2026-09-01, two (`settlement/approvals`, `reconciliation`) pass against a
production build and were dev-server artefacts; `/gold/insights` was my own bad
route (it has no index page, only `/allocations`); and `/gold/exceptions` was
the unbounded `networkidle` wait, not the page. The remaining gold failures are
the three 404s described above.

This is worth keeping as a record of how the first triage read, and how much of
it was the harness rather than the product.

### Carried, with a diagnosis

`offline-status-hydration` — `OfflineStatusButton` in the shared header hydrates
with a different status than the server rendered (client "Device sync —
preparing" against server "Device sync — ready", with the icon path differing to
match). The offline provider knows persisted bootstrap state the server cannot.
Affects every authenticated route, on the second page load of a session.
Recorded in `e2e/_support/assert.ts` as a known issue so it cannot mask new
console errors; the fix belongs in `components/providers/offline-provider.tsx`.

## Runtime: fixed

| | Before | After |
|---|---|---|
| Sign-ins per gold run | 17 (one per test) | 10, once, shared |
| `Gold overview renders` | 17.6s | **6.1s** |
| Typical route test | 20s – 3min | **3.7 – 12.9s** |
| Gold suite | **2.6 hours** | minutes |

Three changes, in the order they mattered:

1. **`e2e/auth.setup.ts` signs everyone in once** and saves `storageState` per
   tenant-and-role; the suites start from those. Sign-in was 15–25s per test.
2. **`pnpm start:e2e` builds once and serves.** `next dev` compiles each route on
   first request — for a suite that visits ~100 routes once each, the compile
   *was* the test time.
3. **`networkidle` is now time-boxed.** This was a real harness bug and the
   production build is what exposed it: the app holds an open SSE stream for
   notifications, so the network is never idle and
   `waitForLoadState("networkidle")` never resolves. Unbounded, it consumed the
   entire test budget — every page took the full 120s and failed. Under
   `next dev` the same call returned in five seconds, so the bug was invisible
   until the app behaved properly.

Two of the four "product findings" recorded below turned out to be dev-only:
`/gold/settlement/approvals` and `/gold/reconciliation` **pass against the
production build**. The 400s were an artefact of the dev server.

### The three gold 404s: not gold, not a bug

Resolved by network capture, 2026-09-02. The failing request is
**`/_vercel/insights/script.js`** — the `<Analytics />` component from
`@vercel/analytics` in `app/layout.tsx`. That path is served by Vercel's edge,
not by the app, so under `next start` it 404s.

It 404s on **every** page, including `/gold`, which this document called clean
two paragraphs above. The script is injected after hydration, so whether it
lands before the assertion runs is a race; the three "failing" routes were
simply the slower ones. Presented as a routing bug in one corner of one module
and was neither.

Two things came out of it worth keeping:

- `IGNORED` in `e2e/_support/assert.ts` now carries `/_vercel\/insights/`.
- `watchConsole` now matches patterns against **`message.location().url` as
  well as `message.text()`**. Chrome reports a failed subresource as "Failed to
  load resource: the server responded with a status of 404 (Not Found)" and
  puts the URL nowhere in that string. A suite reading only `text()` can say
  that *something* 404'd but never what — and cannot ignore one known-bad URL
  without ignoring every 404 in the app. That was a real hole in the harness.

The lesson, which is the third time this module has taught it: a failure
distributed across "some routes but not others" is more often a race than a
routing table.

## Second pass on gold, 2026-09-02

The suite went 23/26 → 25/26 → 26/26 across three runs, and the runtime came
down with it: **19.6m → 8.7m → 7.6m**. Four things were wrong, and they were
four different kinds of wrong.

### 1. A product bug — hydration mismatch in `PdfTemplate`

`components/pdf/pdf-template.tsx` rendered `new Date().toLocaleString()` in the
render body. Server and client produce different strings — different instant,
usually a different timezone and locale too — so React could not reconcile the
text and threw **#418**, which in a production build is an *uncaught error*,
not a warning.

It is on **nine pages**, not one: gold exceptions and payouts, maintenance,
school documents, stores inventory and fuel, and the shift, plant and
attendance reports. Found on `/gold/exceptions` because that is where the suite
happened to look first.

Fixed by moving the timestamp into `useEffect`. That is also the more truthful
answer — the block is captured to PDF when someone presses Export, so
"Generated" should mean when the document was produced, not when the server
rendered a shell that caching may have produced hours earlier for someone else.

### 2. A seed bug — the mine's books did not add up

69 of 154 shift allocations had `workerShareWeight + companyShareWeight`
exceeding `netWeight` by **exactly one milligram**.

`scripts/seed-gold-demo.ts` computed the split correctly in JavaScript and then
rounded `net`, `workerShare` and `companyShare` to 3dp *independently*: net
25.6953 → 25.695, each half 12.84765 → 12.848, sum 25.696. A milligram of gold
that was never poured, on 45% of shifts.

The product does not have this bug — `app/api/gold/shift-output/route.ts:132`
derives the company share by subtraction. The seed now rounds the net first and
does the same, so the demo data obeys the invariant the product enforces.

Worth saying plainly: this is the check that justifies the whole database-level
tier of the suite. No screenshot would ever have shown it.

### 3. A harness hole — the console watcher could not see URLs

Covered above under the `/_vercel/insights` finding. `watchConsole` now matches
patterns against `message.location().url` as well as `message.text()`.

### 4. Three assertions of mine that described a product that does not exist

| Assertion | Reality |
|---|---|
| `/gold/exceptions` must contain `deficit\|witness\|Milling\|Shaft 2` | Vocabulary and site names this seed never uses. The page was rendering both seeded exceptions correctly all along. Now asserts its own headings. |
| The dispatch list must contain `SEAL-\d{5}` | It shows date, bar, weight, value, courier, destination, status. The seal is on the record behind it. **Second time this spec made this exact mistake** — the sibling assertion was corrected on 2026-09-01 and this one was missed. |
| Navigate to `/gold/shift-output` | No page; only `/gold/shift-output/new`. `ROUTES` in the same file already said so and the test asked anyway. |

The last one is worth a note in its favour: a 404 page still renders, so the
navigation succeeds and only the console watcher notices. The check earned its
keep.

### A tolerance that was worse than no tolerance

The reconciliation test compared with `Math.abs(net - split) > 0.001`, meaning
to allow a milligram of rounding. The seed was out by *precisely* one
milligram, so float representation noise decided each verdict — some rows
failed and some passed on identical arithmetic. It is now `> 1e-9`. A milligram
is the column's own precision: a discrepancy of one is a real discrepancy, and
a tolerance that admits it is not a tolerance but a blindfold.

## Third pass: the other four verticals, 2026-09-02

Gold was first through and took the longest. Retail, CRM, schools, accounting,
payroll and HR followed, and the pattern held: **most red lines were the
harness, and the product bugs that did surface were all one shape.**

### Product bugs found, and fixed

| What | Where | Effect |
|---|---|---|
| Hydration mismatch on the "Generated" stamp | `components/pdf/pdf-template.tsx` | React #418, an *uncaught error*, on all nine pages with an Export PDF block |
| The till fetched before anyone signed in | `pos-portal-state.tsx`, `pos-lock-screen.tsx` | six unauthenticated requests and a console full of red on every cashier sign-in |
| Customer search asked for more than the API allows | `pos-customers-view.tsx`, `lib/offline/module-registry.ts` | `limit=40` against a `max(30)` schema → **400**. The till's customer search returned nothing at all, for everyone; and the offline warm-up failed the same way on every page of every tenant |

The `limit=40` one is the most interesting. It is a caller-contract mismatch —
zod caps `limit` at 30, both callers ask for 40 — and it fails *closed and
silently*: the screen shows "no customers" rather than an error, so it looks
like empty data rather than a broken request. The e2e suite found it not on a
retail page but on **eighteen school pages**, because the offline pre-cache runs
everywhere and drags a retail endpoint along with it.

### A product bug found and deliberately not fixed

`unentitled-accounting-api-403` in `e2e/_support/assert.ts`. Three accounting
pages call sibling-module APIs unconditionally: `/accounting/sales` and
`/accounting/purchases` call `fetchBankAccounts`, `/accounting/journals` calls
`fetchCostCenters`. A tenant entitled to those pages but not to Banking or Cost
Centres — Kariba Payroll Bureau is exactly that — takes a 403 on every load. The
picker is empty, which is the right outcome reached the wrong way.

Not fixed because there is no client-side entitlement signal to gate on:
`hasFeature` is server-only and async. It is gating plumbing through three
pages, not a one-liner, and not a change to make while getting a suite green.
Recorded with a full diagnosis so it stays visible.

### Seed bugs

- **The retail seed never voided anything.** It incremented a `voids` counter
  and printed "21 void(s) flagged" while all 5,158 sales sat at POSTED. The
  file's own docstring promised a voided sale. Same failure mode as the gold
  `companyId` bug: the seed reports success and the row is not there.
- **`passportPhotoUrl: "https://example.invalid/p.jpg"`** in the payroll seed.
  `.invalid` never resolves, so every avatar on `/people` fired a failing DNS
  lookup. Now `""`, which exercises the initials fallback — *not* `null`, which
  is a required column and makes Prisma complain that `company` is missing
  instead, an impressively misleading error for what you actually did.

### Harness bugs

- **`submitLogin` treated any `role="alert"` text as a refusal.** The login page
  put the workspace brand in an alert region, so sign-in "failed" with
  `sign-in refused for Tafadzwa Mukono: Corelith` — and because that happens in
  the `setup` project, **62 unrelated tests never ran**. A refusal is "no
  session token", full stop; the alert is now read once, afterwards, to turn a
  bare timeout into a sentence.
- **Every unbounded `waitForLoadState("networkidle")` is now time-boxed** — 14
  files. The SSE stream means it never resolves; `nav.ts` was fixed first, but
  `auth.ts`, `shots.ts` and eleven pre-existing specs still had it.
- **`clearCookies()` clears the host nomination too.** Documented at the call
  site; `nominate` is exported from `fixtures.ts` for tests that need to
  re-plant it.
- **A test cannot both provoke a refusal and assert a clean console.** The till
  test did, and the manager's correct 401s failed the cashier's assertion. Split
  in two.

### Route lists that described a product that does not exist

`/gold/shift-output`, `/gold/insights`, `/crm/lists` and `/payroll` all have
child pages and **no index**, so each 404s. Four is a pattern, not an oversight.
Either it is deliberate and should be written down, or these want index pages —
a product decision, not a test one.

### Entitlement gating is now asserted rather than assumed

`Route.blocked` in `_support/sweep.ts`. Kariba Payroll Bureau is not entitled to
Banking, Currency or Cost Centres, and being turned away is now the *pass*.
Three red lines became three meaningful green ones, and if that gate ever opens
the suite will say so.

### Flakes, named as flakes

`Companies renders` failed once with "0 of 0" and passed on re-run; the API
returns 200 and 35 rows. Recorded rather than chased, because a flake called a
bug wastes more time than a flake called a flake.

## The one that looked like flakiness and was configuration

Worth its own section, because it wasted more time than any single bug and the
symptom actively misleads.

Running the eight suites together produced **a different set of five or six
failures on every run**. Always a 25-second assertion timeout, never the same
tests twice: one run failed on People, Classes, Messages and two school checks;
the next, an hour later, failed on CRM overview, Retail overview, School
overview and a smoke test — no overlap at all. Individually every one of them
passed.

The cause was `workers`. `playwright.config.ts` set `fullyParallel: false` and
carried a comment explaining that the suites must be serial because they share
tenants — "one opens a till shift another closes". But `fullyParallel: false`
only disables parallelism **within** a file. Playwright still runs different
spec files concurrently, one per worker, and with eight spec files it chose
**six**: six Chrome instances against one server and one database, on a 16GB
machine already holding a production Next build.

So the stated intent was never enforced. `retail-suite` and `cross-cutting`
really were both signing into acme and moving the same till shift. A worker
crashed with 0xC0000374 — heap corruption — and a 71-test run took 41 minutes
instead of ten.

Now `workers: 1`.

Two things to take from it. A config comment describing a guarantee is not the
guarantee; this one had been wrong since the file was written and every run
until the suites were run *together* hid it. And **failures that move between
runs are a resource or ordering problem, not flaky tests** — the instinct to
re-run and see what sticks is exactly backwards, because it treats the one
signal that identifies the cause as noise to be averaged away.

## The unit suite has the same parallelism problem, and 14 real failures

Run while verifying the app changes, and worth writing down because it is the
same shape as the Playwright finding above.

`npx vitest run` reports **34 failed tests across 20 files**.
`npx vitest run --no-file-parallelism` reports **14 across 9**. Twenty of the
thirty-four are therefore not failures at all — they are DB-backed tests
sharing one `huchu_test` database and standing on each other. Every one of them
passes when its file is run alone.

That may be new: `vitest.setup.ts` was changed at the start of this exercise to
refuse anything but a local database, so before that the suite was pointed at
Neon and may never have run against a single local Postgres at this
concurrency.

The remaining 14 are **pre-existing and unrelated to this work** — checked by
stashing every change and re-running `lib/retail/fiscalisation.test.ts`,
`lib/inventory/shelf-price-integrity.test.ts` and `lib/crm/reports.test.ts`,
which fail identically at HEAD. They are in accounting fiscalisation, CRM
reports and rich text, inventory shelf pricing, retail fiscalisation and school
search; none is in a file this exercise touched.

Both halves want fixing and neither is e2e work: the concurrency needs either a
database per worker or `--no-file-parallelism` made the default, and the 14 want
their own pass.

## The visual log: what only a screenshot catches

**Added 2026-09-02 as a standing step.** The suite was 139/139 green while the
workspace switcher said "Retail" above every screen of every vertical. Every
page rendered, nothing threw, every number was right. A green suite says the
product works; it does not say the product looks like anything.

So: **after a screenshot pass, look at the screenshots.** Anything found goes
here with its diagnosis, and gets a test if a test could hold it.

### 1. The workspace switcher named the wrong business — fixed

"Retail" above St Mary's student roll and above Huchu Enterprises' gold
dispatch ledger. Three causes, stacked, and each was hidden by the one in front
of it:

1. `inferWorkspaceProfileFromEnabledFeatures` was an ordered chain with retail
   first, so one `retail.*` key made a school a shop. Now weighs how much of
   each vertical is switched on — a school with a tuck shop has twenty
   `schools.*` keys and two `retail.*` ones, and that is a school.
2. Every demo tenant sat at `workspaceProfile`'s GENERAL default, so all of
   them fell through to that inference. The vertical seeds now say what they
   are, and `seed-staging-tenant.ts` takes `--profile`.
3. With those two fixed the CRM tenant went from "Retail" to **"School
   Operations"** — still wrong, and the useful kind of wrong, because an answer
   that moves proves the value is computed rather than read. `GENERAL` meant
   both "not set" and "a general business", and both were handed to inference.
   Fixed in `lib/workspaces.ts` *and* in `lib/auth-core/session-claims.ts`,
   which resolves the claim into the JWT before the sidebar ever sees it —
   fixing only the first did nothing at all.

`lib/workspace-resolution.test.ts` covers it: single vertical, two verticals
each way round, payroll bureau vs school-with-payroll, service provider,
explicit-beats-inferred, unset-still-infers, and every profile having a label,
an icon and a non-empty sidebar.

### 2. The tables were unreadable — partly fixed

Measured rather than eyeballed, which changed the diagnosis:

| Screen | Columns | Table width | Space | Verdict |
|---|---|---|---|---|
| `/crm/companies` | 7 | fits | 1129px | The standard |
| `/schools/students` | 9 | 1145px | 1129px | 16px over — "Delete" cut off |
| `/people` | 13 | **1944px** | 923px | Half the row off-screen |

`overflow-x: auto` was working the whole time. This was never a CSS bug: it is
too many columns and three inline text buttons per row. Fixed by giving
`RecordActions` a `menu` layout (22 school tables switched, one component) and
`DataTable` an `initialColumnVisibility` so `/people` folds Next of Kin,
Village and National ID away — still one click from the Columns menu.

`docs/design-system/12-tables.md` names the CRM record table as the standard
and says what makes it one: a cell drawn to what the value *is* rather than to
which column it landed in, never a blank cell, figures right-aligned, identity
in the first column and only the first column clickable, and a row list instead
of a table below `md`.

### `table-scroll` — a finding that was wrong

Recorded here on 2026-09-02 as "applied in `components/ui/table.tsx`, defined
nowhere". That was wrong, and the mistake is worth keeping rather than deleting.

`.table-scroll` is defined in the design system —
`node_modules/@corelithzw/react/dist/styles.css` — and loaded by
`app/globals.css:50` via `@import "@corelithzw/react/styles.css"
layer(corelith)`. It sets `overflow-x: auto`, `min-width: 0`,
`-webkit-overflow-scrolling: touch` and `overscroll-behavior-x: contain`, plus
a sticky-first-column variant and a `.capped` max-height. The comments in
`components/ui/table.tsx` and `components/ui/table-rail.tsx` say exactly this
and were correct all along.

The error was the search, not the reading: I grepped `app/globals.css` and
`styles/` and concluded from two misses that the class did not exist anywhere.
A class can come from a package. "I could not find it" and "it is not there"
are different claims, and only the first one was earned.

## The feature catalogue in the database is missing half the product

Found while narrowing the demo tenants, and it is a platform finding rather
than a testing one.

`PlatformFeature` holds **62 rows**; `lib/platform/feature-catalog.ts` declares
**122 features**. Every `crm.*` key is absent, and all but one `schools.*`.

A `CompanyFeatureFlag` needs a `featureId`, so **a feature with no catalogue row
cannot be switched off for one tenant at all** — there is nothing to point at.
Entitlement still works, because `getCompanyFeatureMap` resolves against the
in-code catalogue; what does not work is any per-tenant override of those sixty
keys. That is a real hole in the feature-flag console, not only in a demo
script.

`scripts/platform/sync-catalog.ts` is named as though it fixes this, and its
docstring says "Idempotent upserts; safe to re-run after any deploy that changes
lib/platform/feature-catalog.ts". It does not write any feature rows.
`syncCommercialCatalog` ensures subscription *plans* and then returns
`FEATURE_CATALOG.length` — so running it prints `"features": 122` having
persisted none of them. The number it reports is the size of the array it read.

Not fixed here: creating sixty catalogue rows changes what the admin console
offers for every tenant on the platform, and that wants its own review rather
than a side effect of a screenshot pass. `scripts/demo-focus.ts` now reports
exactly which features it could not reach and why.

## One bug wearing five faces: pages fetching what they are not entitled to

Five separate 403s, found over two days, all the same shape — **a page asking
for something the signed-in session cannot have**. Worth reading as one entry,
because each was diagnosed as its own problem before the pattern showed.

| Where | Endpoint | Who it hit |
|---|---|---|
| `/accounting/sales`, `/accounting/purchases` | `/api/accounting/banking/accounts` | any tenant without Banking |
| `/accounting/journals` | `/api/accounting/cost-centers` | any tenant without Cost Centres |
| `/gold/prices` | `/api/sites` | a gold **clerk**, on a page about the gold price |
| the till, on sign-in | `/api/v2/retail/promotions` | a **cashier** |
| the till's login screen | `pos/{pin,context,current-shift}` | everybody, six times, before typing a password |

The first two were recorded on 2026-09-02 as needing "a client-side entitlement
signal that doesn't exist". That was wrong, and worth saying plainly: it exists,
`components/layout/app-sidebar.tsx` had been using it for months
(`enabled: hasTokenFeature(enabledFeatures, "stores.inventory")`), and the
session token has carried `enabledFeatures` all along. `hooks/use-entitlement.ts`
now puts it behind a name.

### The two that were not on the page at all

`/gold/prices` does not import anything that fetches sites, and neither does the
gold shell. It came from `hrWorkforceCorePreloadQueries` in the **offline module
registry** — People is foundational to every vertical, so the HR preload set
runs on a gold mine and on a school. Traced by wrapping `window.fetch` and
reading the stack, after reading the source had already been wrong twice.

`OfflinePreloadQuery` already had `enabled?: () => boolean`, honoured in
`prefetchModuleQueries`. The hook was there and nothing could answer it: the
registry is a plain module and cannot see a session. `lib/offline/entitlement.ts`
now carries the features across, and a preload declares its `featureKey`.

### What the shifting failures were telling us

For three runs a different test failed each time — the gold clerk, then the
cashier, then the gold clerk again — always on a 403, never the same one. That
is not flakiness. **A failure that moves between runs is usually one cause
firing opportunistically**, and here it was: the preloader fires a set of
prefetches and which one lands before an assertion is a race. The same reading
found the `workers: 6` problem the day before. It is the second time in this
exercise that treating a moving failure as noise would have cost the diagnosis.

## The linter was reading the wrong tree

`eslint.config.mjs` ignored `.worktrees/**`. Agent worktrees are created under
`.claude/worktrees/`, so the pattern matched nothing and eslint walked every
worktree's `.next/` output — hundreds of generated chunks, Babel complaining
about 500KB icon bundles from a checkout nobody is editing, and **the real
findings buried underneath**.

`vitest.config.ts` carries a long comment about this exact trap, ending "Both
spellings are kept — the bare one costs nothing and stops this regressing if the
layout changes." The lesson had been written down and not carried across.

With the tree corrected: **172 findings, 38 of them errors**, none of which had
been visible. After this pass, **16 errors**, all one class.

### What the 38 were

| Class | Count | Outcome |
|---|---|---|
| `set-state-in-effect` / compiler bailouts | 15 | 2 fixed, 13 recorded below |
| `no-explicit-any` in `lib/offline/**` | 10 | fixed |
| `no-require-imports` | 7 | 6 were CJS hook scripts (config); 1 was real |
| `rules-of-hooks` in `e2e/_support/fixtures.ts` | 3 | false positives (config) |
| `Cannot call impure function during render` | 1 | fixed, and it was a real defect |
| Existing memoization could not be preserved | 1 | recorded |
| anonymous default export | 1 | warning |

**The three `rules-of-hooks` were not React at all.** Playwright's fixture
callback is named `use` — `async ({ browser }, use) => { await use(ctx) }` — and
the rule saw React's `use` hook called outside a component. Renaming is not an
option; the shape is Playwright's. Scoped off for `e2e/**` only, so a typo in a
spec is still heard.

**The `require()` in `lib/offline/init-offline.ts` was the one that mattered.**
A lazy `require` inside a `try`, which reads as though it guards a circular
import — `connectivity.ts` imports nothing from there, so there is no cycle. It
hid the dependency from the bundler and turned a missing module into a silent
fall back to `navigator.onLine`. Now a static import.

**The `any` casts were defeating the narrowing they sat beside.**
`sync-engine.ts` wrote `outcome.status !== "synced" ? (outcome as any).message`
on a discriminated union that narrows perfectly well on its own — so a renamed
field would have compiled straight through into a null error message on every
failed sync. `error-handler.ts` read the same property twice through `as any`,
once to test it and once to return it, with nothing tying the two together.

### The offline preload gate, and three goes at getting it right

Worth writing down because each attempt looked finished.

**One.** Tagged the two `fetchSites` preloads with a `featureKey` and had
`prefetchModuleQueries` skip them. The 403s did not move. There are **two**
loops over `preloadQueries` in `offline-provider.tsx` — one for the warm
prefetch and one for the bootstrap — and I had gated one.

**Two.** Gated both. Still did not move. `hasOfflineFeature` delegated to
`hasTokenFeature`, and `evaluateFeature` treats an **empty** feature list as
"we do not know yet" and answers *allowed* under the platform's allow-by-default
policy (`lib/platform/gating/enforcer.ts:36`). Right for a server guard deciding
whether to serve a page before claims are enriched; wrong for a prefetch gate,
which fails open in precisely the window it exists for. My own docstring said it
should answer false before sign-in and the code did the opposite.

**Three.** Fail closed, and `/api/sites` finally went — but `/api/hr/incidents`
appeared behind it. A gold **clerk** holds `hr.employees` and `hr.attendance`,
so the HR offline module legitimately preloads for them, and then asks for
incidents, disciplinary actions and the site list, none of which they hold.

**The shape of the mistake:** a module being enabled is not the same as every
endpoint inside it being reachable. Entitlement is per feature; the preload set
was per module. Every preload now names the feature gating its endpoint, taken
from `route-registry.ts`.

### Still open: 16 React-compiler bailouts

`components/offline/{offline-banner,queue-badge,sync-toast}.tsx`,
`components/gold/forms/{pour-form,receipt-form}.tsx`,
`app/gold/shift-output/new/page.tsx`,
`app/gold/import/[id]/_components/studio/{command-palette,vim-mode}`,
`components/onboarding/onboarding-provider.tsx`,
`lib/offline/{conflict-resolver,session-manager}.ts`.

All "Calling setState synchronously within an effect can trigger cascading
renders". They are not user-visible defects — the components work — but the
compiler declines to memoize any of them, so each re-renders more than it needs
to.

Each is an animation or transition state machine (a pulse when the queue count
changes, a celebration when the device comes back online, a form syncing itself
to a prop), and each needs its own answer: some should derive during render,
some want `useSyncExternalStore`. Not fixed here because the offline banner and
the till forms are the retail safety path, and rewriting their state machines
without watching them run is how a cashier ends up with a banner that will not
go away.

Two of the class **were** fixed, because they had one clean answer between them:
`components/ui/time-ago.tsx` and `components/pdf/pdf-template.tsx` both wanted
"am I hydrated", and `components/ui/client-date.tsx` had already solved it with
`useSyncExternalStore` and lints clean. That is now `hooks/use-hydrated.ts`.

`TimeAgo` got a real fix out of it: it read `Date.now()` in its render body, so
the label was frozen at whatever render produced it and a record left open said
"just now" an hour later. It now subscribes to a shared minute clock — one
timer for the page rather than one per row.

## The 31 specs nobody had run

`playwright test --list` collects **341 tests in 42 files**. The eight suites
this exercise built are 139 of them. The other 31 specs — written before the
harness — had not been run once, and reported "10 passed" because they skip
themselves without `VISUAL_PASS=1`.

With the gate on, three environmental faults surfaced, all of which had been
hiding each other:

**Six specs hard-coded a Linux browser path.** `executablePath:
"/opt/pw-browsers/chromium"`, unconditional, in `attendance-mark`,
`crm-overlays`, `crm-shots`, `global-search-shots`, `hr-payroll-shots` and
`record-shots`. Every sibling writes
`process.env.PW_CHROMIUM ? { executablePath: ... } : {}`; these six were the
family's exceptions and could only ever run in one container. Elsewhere they
died before the first navigation with "Failed to launch chromium", which reads
as a broken install.

**Playwright's video recorder needs an ffmpeg nobody has.** This workstation
runs `E2E_BROWSER_CHANNEL=chrome` precisely because the browser download never
finished, so there is no ffmpeg either — and every genuine failure grew a
second, louder error about the recorder. Thirteen in one run. `video` is now
opt-in behind `E2E_VIDEO=1`; the trace and failure screenshot are what anybody
opens anyway.

**They target tenants that do not exist here.** `head@chisipite-demo.test` and
`crm@demo.test` — a different demo set from the five this exercise seeds. That
is 33 downstream failures in one file alone, because `visual-pass.spec.ts`
writes a shared auth file the others read and it could not sign in.
`bottlestore` and `payroll-demo` they share, so the retail and payroll specs
run today; the schools and CRM ones want either a fixture or a retro-fit onto
`_support/tenants.ts`.

### `retail-void`, and six wrong diagnoses

Worth writing out, because every wrong turn looked like the answer.

It failed with "no receipt in this cashier's history offered an enabled Void —
either every one is already reversed, or the button is gated out again". The
message names two hypotheses and the answer was a third.

1. **Not the role guard.** The comment above the buttons says `canOverride` no
   longer gates them.
2. **Not missing data.** The cashier had 1,624 posted, unreversed sales.
3. **The shift.** `pos-history-view.tsx` renders Refund and Void only when
   `currentShift` is set, and `retail-workflows.spec.ts` runs first and cashes
   up. A spec inheriting another spec's leftovers. Added a guard to open one.
4. **The guard clicked a dead button** — the dialog's confirm stays disabled
   until a float is counted in, which `retail-workflows` does and I had not.
5. **The guard was on the wrong page** — `/`, not `/shift`.
6. **The guard's navigation was being swallowed.** `goto(..., { waitUntil:
   "commit" }).catch(() => {})` on a till still settling its own client-side
   navigation: `net::ERR_ABORTED`, caught, discarded, and the spec carried on
   from the login page. The same failure `_support/nav.ts` was written for.
7. **And then the real one.** With the shift open and the page right, the top of
   the history was `RECEIPT · VOID RSL-0006`. The scan looks at
   `Math.min(rows.count(), 8)` rows, and a VOID receipt offers no buttons —
   `saleType === "SALE"` is the first half of the render condition. **Every
   passing run of this spec voids a sale and puts a VOID at the top of the
   list.** Six good runs and the window holds nothing else. It was failing
   because it had been working.

Now 11/11 from a cold start with no open shift.

**What I would do differently:** stop at step 3 and look at the screen. Steps 4
to 6 were each five minutes of guessing at a page I had not opened; one probe
that clicked the first history row and printed the dialog's buttons ended it.
That probe is what found step 7 too, in one go.

**And a measurement I got wrong for six runs.** `RetailShift` carries both a
`status` enum and a nullable `closedAt`, two fields for one fact. I queried
`closedAt: null` throughout and read "0 open shifts" while one was open. Worse,
I "closed" a shift by setting `closedAt` alone, leaving `status: OPEN` — a row
the application would never write. Repaired. The app keeps the two in step; my
script did not, and neither did my reading of them.

## The dev server ran out of memory once, and it did not look like it

125 tests
failed identically at `page.goto("/login")` with "Target page, context or browser
has been closed", and nothing was listening on 300 afterwards: one cause, 125
red lines, and none of them about the routes. `scripts/dev-e2e.mjs` now starts
Next with `--max-old-space-size=8192`, and the suite runner health-checks the
server between suites so a death stops the run instead of poisoning it.

---

# Coverage pass, 2026-09-05

The question this pass was set: how much of the product does the suite actually
reach, and can that be got above 90% without counting things that are not
tested. The platform admin portal was explicitly out of scope.

**Where it landed.** Page coverage 51% → **93%** (338 of 363), every non-admin
cluster complete. **313 tests green in 21.5 minutes** across all fifteen
suites, seven of them new.
Seven product bugs found and fixed, of which three were on the till and all
three failed silently. One harness bug found, where a failing assertion was
suppressing the console check on the same page. The known-issues list is empty,
and one of the four entries removed from it turned out to still be real — which
is the best argument in this document for not keeping such a list.

## The meter came first

`scripts/e2e-coverage.mjs`. Nothing in this repo could answer "what is
untested" before it, and every previous estimate in this document was a
guess — including the "45%" quoted at the top of the last section, which turned
out to be 51% once route groups were handled properly.

    node scripts/e2e-coverage.mjs          # pages, by cluster
    node scripts/e2e-coverage.mjs --gaps   # the uncovered ones, named
    node scripts/e2e-coverage.mjs --api    # API routes, from a recorded run

Two things about it are worth stating, because they decide what the number
means.

**Pages are counted statically** — a spec names a path, the path resolves to a
`page.tsx`, dynamic segments match anything. That is a *reachability* measure:
"would any spec notice if this page started throwing". It is not a claim about
assertion quality, and a route swept by `sweepTests` is worth more than one that
merely appears in a screenshot spec.

**Route groups are stripped.** `/portal/parent/(shell)/fees` is `/portal/parent/fees`.
Getting that wrong understates coverage by **34 pages** — every parent,
student and teacher portal screen lives inside a route group.

**API routes cannot be counted that way at all**, because no spec names an
endpoint — the pages call them. So `e2e/_support/api-coverage.ts` appends every
`/api/**` request the browser makes to `e2e-coverage/api-hits.log` while the
suite runs, and `--api` reads it back. It reports what the last recorded run
touched rather than what the suite could touch, which is the more honest of the
two questions.

The log is **not** in `e2e-results/`, and that took one run to learn.
`e2e-results/` is Playwright's `outputDir`, which it empties at the start of
every run — so the first version of this silently destroyed the previous run's
log each time, and the "several invocations are one measurement pass" note in
its own docstring was false. Caught by watching the line count reset to zero
between two consecutive runs, which is the kind of thing only a number tells
you.

## 185 → 338 of 363 pages

**51% → 93%.** The 25 that remain are the platform admin portal, held back on
instruction; every other cluster is complete.

| Cluster | Was | Now |
|---|---|---|
| `/home` — the public site | 0 of 18 | **18** |
| `/stores` | 0 of 10 | **10** |
| `/maintenance` | 0 of 5 | **5** |
| `/compliance` | 0 of 5 | **5** |
| `/reports` | 1 of 13 | **13** |
| `/preferences/**` | 0 of 15 | **15** |
| `/settings`, `/user-management` | 0 of 10 | **10** |
| `/portal/pos` | 4 of 13 | **13** |
| `/management/master-data` | 6 of 15 | **15** |
| `/schools` | 42 of 60 | **60** |
| `/crm` | 26 of 36 | **36** |
| `/gold` | 14 of 23 | **23** |
| `/retail` | 18 of 23 | **23** |
| the five public token links | 0 of 5 | **5** |

Seven new suites, chosen by tenant rather than by URL — each cluster is swept by
the fixture actually entitled to it. `mining-ops-suite` runs on the mine because
`demo-focus` leaves `stores.*`, `maintenance.*` and `reports.*` on for nobody
else; `workspace-settings-suite` runs on Hurudza Creative because it is the one
tenant with no `CompanyFeatureFlag` rows at all, so nothing there is refused for
a reason belonging to a demo script.

## The runs

**All fifteen suites together: 313 passed, 0 failed, 1 skipped, 21.5 minutes.**

Getting there took three runs, and the two that were red are the interesting
ones:

| | Tests | Time | Red |
|---|---|---|---|
| the seven new suites | 184 | 15.6m | 1 — a stale assertion of mine |
| the eight existing suites, plus one re-run | 166 | 16.7m | 2 — one product bug, on two pages |
| **all fifteen, after the fixes** | **314** | **21.5m** | **0** |

The one skip is `/gold/import/[id]`, reported as a skip rather than a pass
because the gold seed runs no ledger import — there is no record to open, and
saying so is the point of `sweepRecordTests`.

Three red lines in total, and between them they make the case for the exercise
better than the three hundred green ones do.

### The one that was mine

`/templates` asserted "Forms, quotes, invoices, receipts and emails are all
designed here" — the library's **empty state** — and it was correct right up
until, in this same pass, `seed-crm-demo.ts` learned to write a template. My
own seed falsified my own assertion. It now asserts
`TEMPLATE_KIND_DESCRIPTIONS.QUOTE`, which renders only when a quote template
exists, so it proves the library *filled* rather than that the page loaded.

That failure carried a second lesson in its output. The received string is the
whole `<body>`, and this app's sidebar lists every module in the product —
"Templates", "Intake forms", "Quotes", a hundred others — before the page
content begins. **Any `toContainText` assertion that could match a nav item
asserts nothing at all.** Three of the assertions in this pass were caught being
exactly that before they ran.

### And the one it hid — plus the harness bug that let it

The same page went red a run later for a different reason, and that one was the
product's: the template library links each intake form to
`/crm/intake-forms/<id>`, which does not exist.

Both failures were on `/templates`, and **the first was masking the second**.
`checkRoute` ran the evidence assertion and then the health check as a plain
sequence, so a failing `expect` threw and the console was never read. One bug
hiding another, in the tool whose whole job is to stop that.

The order is not simply swappable, which is the interesting part: the `expect`
is also the *wait*. It polls for 25 seconds while the page fetches, and
`expectNoBrokenValues` reads the body once — health first would read a skeleton
and pass on it. So `checkRoute` now keeps the evidence failure instead of
throwing it, runs the health check anyway, and reports whichever fired, or both
together.

## Four additions to the harness, each forced by something real

**`Route.redirectsTo`.** **Thirty-nine** of the routes swept in this pass land
somewhere other than the path asked for — twelve are the POS host rewrite,
where `/portal/pos/history` is served as `/history`, and the other twenty-seven
are aliases. `visit()` correctly treats an unexpected destination as a failure.
Naming the destination is better than exempting the route: a redirect that
quietly changed target would still be a redirect, and a test asserting only
"we moved" would stay green while the link went somewhere else. Where the
forward carries a query — `?view=refunds`, `?record=issue`, `?create=1` — the
query is asserted separately, because a forward that drops it lands you on the
right page and the wrong tab, which no route sweep can see.

**`Route.expectedConsoleError`.** A public link opened with a token nobody
issued *must* 404, and the browser logs that. Scoped to one route and one
assertion rather than added to `IGNORED`, so the same 404 anywhere else is
still a failure. It is not a place to quiet a console, and the five uses of it
all say why in a sentence.

**`sweepRecordTests`.** Detail pages were the largest gap after the admin portal
— forty-odd routes with no spec, because a spec cannot name an id a seed
generates fresh on every run. Hard-coding one survives until the next re-seed
and then fails as a 404 that reads like a routing bug. The id is now looked up
from the database when the test runs, and a record the seed never wrote is
reported as a **skip**: not a pass, which would claim coverage there is none of,
and not a failure, which would put a red line against a page that is fine.

**`_support/api-coverage.ts`.** Records every `/api/**` request any context
makes, so API coverage can be measured at all. It is the only way to count
endpoints, because no spec names one.

And one repair rather than an addition: `checkRoute` no longer lets a failing
`expect` suppress the console check on the same page. See "the harness bug that
let it" above.

## Product findings

### The till could not read three of the things it runs on

Found by sweeping the POS portal as a cashier, which nothing had done before —
nine of its thirteen screens had no spec. All three fail **closed and
silently**, which is why none had been reported by anyone using the product.

| Endpoint | Gate | What a cashier saw |
|---|---|---|
| `/portal/pos/customers` and `/api/v2/retail/customers/search` | `crm.customers` | The Customers tab sent them to `/access-blocked`; the checkout's customer picker showed an empty address book |
| `/api/v2/retail/promotions?status=ACTIVE&pos=1` | `retail.promotions` | Promotions never came off the basket. The shop had bought the feature and configured the promotion; the till charged full shelf price |
| `/api/v2/retail/setup/tender-policy` | `retail.setup` `view`, in the retail permission matrix | The offline bootstrap cached no tender policy, so a till that lost the line ran on hard-coded reference rules |

The first two are the same bug in `lib/platform/user-entitlements.ts`: the
`CASHIER` and `SHOP_MANAGER` role templates grant `retail.core`, `retail.pos`
and `retail.catalog`, and the till also needs `crm.customers` and
`retail.promotions`. A promotion the till cannot read is a promotion the shop is
not running.

The third had **already been half-fixed, and the half that was left is the one
that matters.** `pos-portal-state.tsx` carries a good comment saying the
checkout's tender-policy query was moved onto `pos/context` because
`retail.setup` is "a permission no cashier holds" — but two other callers were
left pointing at the gated endpoint: the offline preload in
`lib/offline/module-registry.ts`, and `lib/retail/offline-bootstrap.ts`. The
second is the important one. It is what fills the cache a till reads *when the
line is down*, and it is the one case where the till cannot simply ask again;
it now reads `pos/context`, which carries the same two rules and is gated on
`retail.pos`. The preload was **deleted** rather than repointed — see "A
preload cannot express 'only a cashier'" below, which is the mistake I made
first and the reason.

The permission itself was deliberately not widened. The earlier decision was
right; it had only been applied to one of three call sites.

Why it stayed hidden is the interesting part. Every other POS screen is gated on
`retail.*` or `portal.pos`, and a manager — an unrestricted template — opens
`/retail/customers` from the back office perfectly well. Only a cashier, only on
the routes that cross into another module, ever hit it. That is the fourth time
this document records a page fetching something its session is not entitled to,
and the second time in the customer picker specifically: the first was a
`limit=40` against a `max(30)` schema. Both bugs were in a screen no cashier
could open.

### The chain-of-custody report told the workers they got nothing

`/reports/gold-chain` and `/reports/gold-receipts` printed `0.000 g` under
Worker Split, Company Split and Expense Gold for every bar on the mine.

The four figures are read off `pour.goldShiftAllocation`, and the seed's pours
have `goldShiftAllocationId: null` — so the API returns null and both pages
coerced it with `?? 0`. On a chain-of-custody document that is not a
placeholder, it is a claim: the whole purpose of the report is to show what each
side took out of a bar, and it said the workers took none of it. Now an em-dash.

Behind that is a **design finding, not fixed**. `GoldPour.goldShiftAllocationId`
is a single foreign key, and `app/api/gold/shift-output/route.ts` — the only
place the product creates a pour — sets it one-to-one from the allocation being
poured. The seed models something different and more realistic: a bar gathers
roughly a fortnight, 24 allocations. Both cannot be true. Either a pour is one
shift's output, in which case the seed is wrong and a real mine cannot batch;
or a pour gathers many, in which case the schema needs a join table and the
report needs to sum it. Linking the seeded pour to one of its 24 allocations
would have made the column show a plausible wrong number instead of an obvious
missing one, which is worse. Left as an em-dash and written down.

### The offline status label was a hydration mismatch on every page

`OfflineStatusButton` sits in the shared header, so this was an **uncaught
React #418** — a production build throws rather than warns — on any
authenticated route where the offline bootstrap landed partway through
hydration.

It had been recorded as `offline-status-hydration` in `assert.ts` for four days
and diagnosed by inference. This time it was measured: fetching
`/portal/pos/offline` as a cashier and diffing the SSR HTML against the
hydrated DOM gives

    server:  Connection … Ready
    client:  CONNECTION … Preparing 50%

which names the value — `statusLabel` — in one line, and rules out the two
other candidates on that page.

The provider's state all starts static (`"booting"`, `null`, `[]`), so the
first render genuinely does agree with the server; what does not agree is the
bootstrap resolving *during* hydration and pulling the label forward.
`useHydrated` is the fix, because `useSyncExternalStore` with a server snapshot
is the one thing an effect cannot race: the hydrating render is guaranteed the
server's answer and the real one arrives in the re-render after it.

Two things follow from this that are worth more than the fix.

**It only became visible because the known-issue entry was removed.** The
pattern that had been holding it — "A tree hydrated but some attributes" — was
also holding every other hydration mismatch in the app.

**A diff beats a stack trace for hydration bugs.** The minified error carries
`args[]=text&args[]=` and names nothing. Twenty lines of "fetch the HTML, strip
the tags, compare the words" named it exactly.

### A preload cannot express "only a cashier", and one tried to

Worth recording as a mistake of mine, because it was made and caught inside one
run.

The POS offline warm-up fetched `/api/v2/retail/setup/tender-policy`, which is
gated on `retail.setup` `view` — a permission no cashier holds — so it 403'd on
every till. Pointing it at `pos/context` fixed the cashier and broke everybody
else: that route *additionally* enforces `canAccessPosPortal(role)`, so a CRM
owner whose session warms the retail module took a 403 on every page. The suite
reported it on `/crm/leads/[id]` and `/retail/shifts/[id]` within minutes.

The general point: a preload declared in a **module** runs for anybody whose
session warms that module, and `featureKey` cannot narrow it, because
`retail.pos` is a *tenant* feature that a CRM superadmin holds. A route that
also checks a role is therefore not safe to preload from a module at all.

The entry is now gone rather than re-gated. Nothing read its cache key, and the
two tender rules reach the till by two correctly-scoped paths already — live
through `pos-portal-state.tsx` off `pos/context`, and offline through
`lib/retail/offline-bootstrap.ts`. A third copy, warmed for every session in
the product, was buying nothing.

### Every gold allocation detail page white-screened

`/gold/insights/allocations/[id]` threw **"Cannot read properties of undefined
(reading 'length')"** and rendered the Next.js client-exception page. Not one
record — all 154, and every allocation there has ever been.

The page reads `data.employeePayments.length`. The API
(`/api/gold/shift-allocations/[id]`) returns the allocation plus `attendance`
and `accountingEvents`, and has never returned `employeePayments` at all. The
page's own type declared the field as required, so TypeScript was satisfied and
the browser was not — the type described a response nobody was sending.

There is nothing to fill it from, either: `EmployeePayment` has no link to an
allocation — no `goldShiftAllocationId` — and no `goldWeightGrams` column for
the shape the page expects. The Payouts queue section was written ahead of a
backend that was never built.

Fixed by marking the field optional and giving the section a **third state**:
absent is "Payouts are not yet linked to a shift allocation", empty is "No
payments scheduled". Two states would have been the same mistake in a quieter
form — telling somebody looking at what the workers are owed that the answer is
none, when the truth is that nobody has wired it up. The section is left in
place rather than deleted: removing a half-built feature is not a call to make
from a test run.

This is the strongest argument in the pass for `sweepRecordTests`. The
allocations *list* has been green in `gold-suite` since the first day; nothing
had ever opened a row.

### A fourth dead link, found by seeding the record that reveals it

The template library links every intake form to `/crm/intake-forms/<id>`. The
page is `app/crm/forms/[id]`; `intake-forms` is the **API's** name
(`/api/v2/crm/intake-forms`), and the link had taken it. Next prefetches the
href, so the 404 fired the moment the library rendered rather than when anybody
clicked.

It had been invisible for one reason: no seed wrote an intake form, so that
branch of the library never produced a row. It surfaced within minutes of
`seed-crm-demo.ts` learning to write one — which is the argument for filling
seed gaps rather than recording them. An empty state hides every bug in the
code that renders the non-empty one.

This is the fourth instance of the same shape, after the Suppliers button and
the two Scrap master-data entries that `dead-nav-links-prefetched` used to
cover. Worth saying that those three were removed rather than fixed, because
they pointed at pages nobody had built; this one pointed at a page that exists
under a different name, so it is a one-word fix.

### Redirect inventory

Twenty-seven alias routes, now named and asserted. Not a bug — most carry a
docstring explaining the move, and the school ones are unusually good about it
("it sat in the administrator's Academics page, where the people who write it
could not reach it"). Two observations came out of collecting them:

- **`/user-management/create`, `/password-reset`, `/role-change` and `/status`
  all land on the same users list.** The four actions became dialogs and the
  routes were kept as doors to the room rather than to the drawer.
  `/stores/issue` kept its `?record=issue` when it made exactly the same move;
  these did not. A bookmark to "create a user" now opens a list.
- **`/preferences/organization/*` renders under two different shells.**
  `departments`, `sites`, `users` and `billing` use the Account/Organization
  sidebar; `branding` and `templates` use the older Settings/Master Data one.
  Same URL prefix, two chromes, so moving between two items in one menu changes
  the menu.

### Seed gaps

- **The CRM had no intake form, no saved list, no document template and no work
  order.** Four record pages had nothing to open and four list pages were
  rendering an empty state that looks like a working screen. The work order is
  the one that matters: it is what a service business actually sells — a quote
  becomes a job, the job gets a crew and a site, the customer signs it off at
  `/s/<token>` — and the whole second half of the vertical was seeded as an
  empty state. Now in `scripts/seed-crm-demo.ts`.
- **The mine has no stock, no equipment, no permits and no work orders**, so
  roughly twenty of the routes in `mining-ops-suite` assert an empty state
  rather than a figure. Recorded rather than filled: the assertions there are
  honest about what they prove, and filling it is a seeding job of its own.
- **No gold ledger import and no gold purchase**, so `/gold/import/[id]` skips.

## The probe is now a tool, not a habit

`scripts/e2e-probe.mjs`. It opens a list of paths as a real signed-in user and
prints where each one landed, its title and headings, the start of its main
content, and any console errors. It asserts nothing.

It exists because the same mistake kept costing hours, and the last section of
this document already names it: **stop guessing at step three and look at the
screen.** In this pass it caught, in seconds each —

- `/portal/pos/customers` printing `->/access-blocked` for a cashier, with the
  two 403s underneath it that turned out to affect every till screen;
- three `Route.expect` patterns written against words the pages do not print
  (a CRM deal page shows `DEAL-0007`, not "Stage" or "Owner");
- one written against `Workforce c`, which is where a log line had been
  truncated;
- an assertion using an ASCII apostrophe against a page that renders `&rsquo;`
  — a failure that reads as "the page is wrong" when the page is exactly right;
- `/gold/insights/allocations/[id]` white-screening, before a single spec had
  been written for it.

Every one of those would otherwise have arrived as a red line in a
twenty-minute run, and been diagnosed by reading source rather than by looking.

## The known-issues list is empty again

`KNOWN_ISSUES` in `e2e/_support/assert.ts` carried four entries. All four were
re-checked against a fresh production build during this pass, and all four are
gone — three because they were fixed, one because it was fixed *here*:

| Entry | Why it is gone |
|---|---|
| `unentitled-accounting-api-403` | The three accounting pages gate their sibling-module queries on `useHasFeature` |
| `offline-warmup-bare-pos-paths` | The warm-up stops at the first URL that answers, so the bare POS paths no longer 404 on every tenant |
| `dead-nav-links-prefetched` | The Suppliers button and the two Scrap master-data entries were removed |
| `offline-status-hydration` | **Still real** — and the removal is what proved it. It resurfaced within one run, was measured properly for the first time, and is now fixed at the source in `components/providers/offline-provider.tsx` |

The fourth row is the argument for the whole exercise. Three of the four were
genuinely fixed; the hydration one was **not**, and taking the entry out is
what surfaced it — within one run, on a page nobody had suspected, with enough
signal to measure it properly for the first time.

Each entry is a **pattern**, and a pattern swallows the next unknown failure
that matches it as readily as the known one it was written for.
`unentitled-accounting-api-403` matched any 403 from
`/api/accounting/{banking,cost-centers}`; while it stood, a genuinely broken
banking endpoint would have passed silently on three pages. And
`offline-status-hydration` matched *"A tree hydrated but some attributes"* —
every hydration mismatch in the application, on every route. A known-issue list
that outlives its bugs is a blindfold, and it is widest exactly where the bug
is most general. Adding one back costs four lines.

## API coverage, and what the number can and cannot mean

`node scripts/e2e-coverage.mjs --api`, read off a recorded run.

The important measurement is not the percentage but this: **225 of the 647
routes (35%) export no `GET` at all.** They are POST, PATCH and DELETE — post a
payroll run, approve a settlement, raise a fee invoice, void a sale. A sweep
that loads pages cannot reach one of them, however complete its page coverage
is, so the ceiling for a suite of this shape is around 65% and no amount of
route-list work moves it.

Measured on the full fifteen-suite run — **5,409 recorded requests**:

| | Called | Total | |
|---|---|---|---|
| All API routes | 240 | 647 | **37%** |
| Routes with a `GET` | 234 | 422 | **55%** |
| Mutation-only routes | 6 | 225 | **3%** |

### The recorder sees eleven specs of forty-two, and that matters most for the third row

`recordApiCalls` is attached in the `context` fixture in `_support/fixtures.ts`,
so it only sees contexts built through it. **Thirty-one of the forty-two spec
files import `test` from `@playwright/test` directly** and build their own — and
that set includes every behavioural spec there is: `retail-workflows` trades a
day, `retail-void` reverses a sale, `attendance-mark` marks a register. Those
are precisely the specs that issue mutations.

So `6 of 225` is what the *fixture-based* suites reach, not what the suite
reaches. Verified rather than assumed: running `retail-workflows`, `retail-void`
and `offline-lifecycle` afterwards — 13 passing tests including a full trading
day — added **zero** lines to the log. The real mutation figure is higher by an
unknown amount, and it is unknown because of the harness, not the product.

Fixing it needs no new mechanism, only the migration already on the open list:
retro-fit the legacy specs onto `_support/tenants.ts` and the shared fixture,
and the recorder covers them for free. Until then the honest claim is the first
two rows, with the third read as a floor.

### What the 407 uncalled routes actually are

Splitting them by "does it have a `GET`" and "does anything in `app/`,
`components/`, `lib/` or `hooks/` reference it":

| | Referenced by the app | Referenced by nothing |
|---|---|---|
| **has a `GET`** | **159** | 29 |
| mutation only | 182 | 37 |

The **159** is the honest target. Those endpoints *are* called by the product —
just not during a route sweep, because they sit behind an interaction: a tab, a
filter, a dialog, a row expansion. Closing that bucket means interaction tests,
not more routes. It is the same gap the component measure shows between "87%
imported" and "actually exercised", and it is the real ceiling on all three
numbers.

The **182** need behavioural specs, one per write path.

The **66 referenced by nothing** (29 + 37) are the interesting ones, because
they corroborate a finding from the component side. `/api/dashboard/executive-overview`
has no caller — and the seven `components/dashboard/executive-*` files have no
importer. Five `/api/platform-admin/*` endpoints have no caller, alongside
thirteen orphaned admin-portal components. **A whole executive dashboard and
parts of the platform-admin console are dead in both directions at once**, which
neither measure could have shown alone.

#### A number I published wrong first

The first version of this split reported "120 mutation-only routes referenced by
nothing", and it was badly wrong. The matcher read `/api/…` with a character
class that stops at `$`, so every path built as a template literal —
`` `/api/v2/schools/students/${id}/attendance` `` — was truncated at the
interpolation and its suffix lost. Endpoints called from a two-line component
were classified as dead. Interpolations are now widened to `*` and matched
segment-wise, the same way the page and API matchers already worked; the figure
went from 120 to 37.

Worth recording because the wrong number was the *interesting* one — 120 dead
endpoints is a story, 37 is a footnote — and a measure that flatters your
narrative is exactly the one to re-check.

Raising the mutation row is a real project: roughly 200 write-path specs, each
of which has to create a record, assert the write landed in the database, and
leave the tenant in a state the next spec can live with. That is worth doing
and it is not an extension of a coverage pass — it is a different kind of
suite, closer to `retail-workflows` than to `sweepTests`, and it should be
scoped as such rather than smuggled in behind a percentage.

## What is still uncovered, and why

**The platform admin portal — 25 pages.** Out of scope by instruction for this
pass. It is now the entire remainder of the gap, and it is the only cluster
under 100%. Covering it needs a platform-operator fixture, which no tenant seed
produces: `/portal/admin` is not a tenant surface, so none of the five tenants
in `_support/tenants.ts` can reach it. That is a fixture to build, not a route
list to write.

**Components are counted a third way again** — `--components`. Nothing names a
component and nothing requests one over the wire; a component is reached by
being *imported*. So the meter walks the import graph out from every covered
page and the layouts above it.

| | | |
|---|---|---|
| Reachable from a **covered** page | 508 | **87%** |
| Reachable from **any** page | 534 | 92% |
| Reached by no page at all | 49 | 8% |

Read the first row as a **ceiling**, not as coverage. "Imported by a page some
spec visits" is a far weaker claim than "exercised": a dialog behind a button
nobody clicks, a tab nobody opens, an error state nothing provokes — all are
imported, all count, none is tested. The gap between 87% and the truth is
exactly the gap between a route sweep and an interaction test, which is the
same gap the API table shows between its GET and mutation rows.

The third row is the one worth acting on, and it is a real finding rather than
a measurement artefact — **49 components have no importer anywhere in `app/`,
`components/` or `lib/`**, verified by grep. They cluster:

- **13 admin-portal files** — `admin-console.tsx` and six `pages/*-page.tsx`.
  The routes that would have used them (`/portal/admin/add-ons`, `/health`,
  `/subscriptions`, `/templates`, `/audit-log`, `/feature-catalog`) are
  redirect stubs pointing at `/admin/*`, which exists as a route only for
  `login`. Out of scope for this pass, and worth a look from whoever owns that
  portal.
- **7 `dashboard/executive-*` files** — a whole executive dashboard nothing
  mounts.
- **2 `thrift/*` files** — `thrift` is retail's retired name.
- the rest are unused UI primitives (`accordion`, `kbd`, `split-button`,
  `table-rail`, `mobile-list`) and a scattering of half-finished CRM and schools
  screens.

One correction worth recording: the first version of this counted 590 files and
reported 56 unreachable. Seven of those were colocated `*.test.tsx` files, which
are *supposed* to be unreachable from a route. Excluded now — 583 components,
49 unreachable.


# Where this stops, 2026-09-07

Stated plainly, because the section above reads as finished and one part of it
is not.

## Verified and green

- **Page coverage 338 of 363 (93%)**, every non-admin cluster complete. The 25
  that remain are the platform admin portal, held back deliberately.
- **313 tests green in 21.5 minutes** across the fifteen harness suites, plus
  13 behavioural tests (a full trading day, a manager-approved void).
- **The full unit suite green** - 3,378 tests.
- **Seven product bugs fixed**, three of them on the till, all failing closed
  and silently.
- **Three coverage meters** that did not exist before: pages statically, API
  routes dynamically from recorded requests, components by import reachability.

## In flight and currently red

The legacy-spec migration. Thirty-one specs that built their own browser
contexts are now on the shared fixture - which was the point, because they were
invisible to the API recorder and signed in per test. Four fully superseded
screenshot specs were retired.

The suite went from 314 collectable tests to **500**, and when the run was
stopped **41 were failing**. They are not one thing:

| | Roughly | What it is |
|---|---|---|
| migrated legacy specs | 32 | `visual-pass`, `schools-record-shots`, the portal shot specs, `offline-lifecycle`. These never ran in this environment - skipped behind `VISUAL_PASS=1`, or pointed at tenants that do not exist. The migration moved them from silently skipped to running and failing. |
| harness suites that were green | ~6 | Shared-tenant interaction, plus a hydration fix that was committed but not rebuilt when the run started. |
| environment | 1 | A Google Fonts request refused with `ERR_NETWORK_ACCESS_DENIED`. The host answers 200 from this machine; transient, not a defect. |

### The finding worth keeping: the specs now interact

`pos-portal-suite` Checkout and `mining-ops-suite` Shift reports both failed on
`toContainText` for seeded data they had asserted successfully for three
consecutive runs. Nothing about those pages changed.

What changed is that `retail-workflows` now runs in the same invocation. It
trades a day: opens a drawer, sells, reverses, cashes up. The sweeps assert on
`/reports/shift` showing `APPROVED` rows, and on the till's checkout carrying
stock. Both move underneath a spec that is closing shifts.

`playwright.config.ts` already carries a long note about this hazard and sets
`workers: 1` because of it. Serialising is necessary and was never sufficient:
one worker still runs the mutating spec *before* the asserting one, in
alphabetical order rather than a chosen one. The honest fixes are a tenant per
behavioural spec, an explicit ordering that puts mutators last, or assertions
grounded on rows the mutators do not touch. None is a line of config.

**This hazard did not exist while the legacy specs were skipped.** Migrating
them was right - it is what makes their coverage real and their API calls
visible - and it bought a class of failure that has to be designed out.

### What to do next, in this order

1. **Rebuild.** The offline-provider hydration fix is committed but the build
   the run used predates it. Several red lines are that bug and no more.
2. **Retire rather than repair most of the shot specs.** `visual-pass`,
   `schools-record-shots` and the portal shot specs assert against a
   `chisipite-demo` school that no longer exists, and `marketing-shots.spec.ts`
   already photographs all five verticals through the fixture. The migration
   was told to bias toward MIGRATE over RETIRE - my instruction - and for this
   family that bias was wrong.
3. **Give the behavioural specs their own tenant**, so a trading day cannot move
   the ground under a route sweep.

## A note on the adversarial verifiers

The migration ran as a workflow: triage, act, then an independent agent trying
to refute each result. Three of twelve items passed verification. That number
is misleading, and the reason matters more than the number.

The flagship finding - that `test.use({ viewport })` is silently discarded by
the shared fixture, breaking every phone-width test - was **false**. Measured
with a ten-line throwaway spec: the context came up at exactly 390x844. Two
further "this test cannot pass" findings were derived from that false premise.
A third accused an agent of inventing a bug in a comment; it had diffed against
`HEAD` while the file carried uncommitted changes, so the comment was accurate
and the charge was not.

The verifiers were told to default to `ok: false` when unsure. That is the right
bias for catching real defects, and it produces confident, heavily-cited, wrong
ones too. **A cited claim from a verifier is a hypothesis, not a finding.**
Settling the viewport one cost ten lines and was worth more than the argument
it replaced.

## And a hole in my own verification

`tsc --noEmit -p tsconfig.json` was reported clean throughout this work. That
config **excludes `e2e`**. Every typecheck claim made about the spec files this
pass touched was checking a tree that did not contain them.

It surfaced the way these things do. An agent wrote a glob path inside a block
comment - `app/management/users/**/page.tsx` - and the `**/` closed the comment
early. `playwright test --list` reported **0 tests in 0 files**, the whole suite
gone, and tsc had passed it minutes before.

The config already existed: `tsconfig.scripts.json` includes `e2e/**/*.ts`. I
was running the wrong one. For spec files the cheap guard is
`npx playwright test --list`, which parses every file and fails loudly on
exactly this.

## The bleed that was clipped, 2026-09-08

Eight school screens rendered with their toolbar, pagination strip and page-nav
buttons **cut off** — `/schools/students`, `/teachers`, `/guardians`,
`/attendance`, `/results`, `/timetable`, and the class-scoped finance, results
and students pages. At 390px, at 768px, and at **1440px**. Not a phone problem.

`visual-pass.spec.ts` found it, which is the part worth sitting with. That file
was about to be retired as a superseded screenshot spec — it had been skipped
behind `VISUAL_PASS=1` for months, it targets a school tenant that no longer
exists, and `marketing-shots.spec.ts` photographs all five verticals already.
Every one of those things is true and the conclusion was still wrong: it is the
only spec in the repo that *measures laid-out geometry* rather than
photographing it, and measurement is what found this. Screenshots of these eight
pages had been taken, looked at, and shipped into `docs/screenshots/` with the
content clipped.

### The cause, and it was mine

    div.data-toolbar.table-edge-to-edge reaches 389px,
      clipped by section.card at 374px

`.table-edge-to-edge` widens by two gutters and pulls the same amount back as
negative margin. That is right for a table sitting directly in the page shell:
the bled strip is empty and the hairline reaches the full width.

The earlier table pass found the toolbar's first control being cut and fixed it
by restoring the gutter as `padding-inline`. That put the *content* back in the
right place and left the *box* two gutters wider than its parent — and `.card`
in the design system is `overflow: clip`. So the toolbar still ran past the card
edge and was still cut; only the evidence moved.

The comment written at the time states the reason exactly — *"the bleed expects
an ancestor with gutter padding to bleed into, and inside a card there is
none"* — and then does not act on it. Diagnosing correctly and fixing one layer
too shallow is its own failure mode, and it is the second time in this pass:
the offline hydration bug was patched three times, each patch correct about the
value it named and silent about its neighbours.

Inside a card the bleed is now switched off entirely. The table insets by the
gutter rather than reaching the card's edge — a visible change, and the right
one. Content that is inset reads as a margin; content that is clipped reads as
a bug.

### What it says about the suite

A route sweep asserts that a page arrived, did not throw, and shows its
evidence. All eight of these pages passed that bar on every run. Nothing in
`schools-suite` could have caught this, because the page *was* working — it was
being cropped by an ancestor after the fact.

Rendering needs a measurement, not an assertion. There is exactly one spec that
does it, and it very nearly got deleted for looking like the others.

## The suite has a half-life, 2026-09-08

`mining-ops-suite` asserted `/APPROVED/` on `/reports/shift`. It passed on
2026-09-04 and failed on 2026-09-08 with no code change of any kind in between.

The page filters by date range. The gold seed writes its shift reports across
25-31 August. Real time walked past the default window, and the page correctly
answered **"No shift reports for this range."**

I chased it twice before looking at it — first as a mutable-status problem
(other suites approve and reject, so surely one had moved it), then as a
spec-ordering problem (everything runs in one invocation now, so surely a
mutator ran first). Both were plausible, both were wrong, and one probe of the
page ended it. Third time this document records that sequence.

**The general form is the thing to carry.** Any assertion that reaches through
a default date filter has a half-life. It will go red on a morning when nothing
was touched, it will look exactly like a regression, and whoever picks it up
will start by diffing code that did not change. Screens with this shape include
`/reports/*`, the school registers and fee ledgers, and every POS "today" view.

Two durable fixes, and they are not equivalent:

- **Seed relative to now, and re-seed.** Keeps the assertions strong — they can
  name rows. Costs a re-seed in the run's setup, and makes the suite depend on
  that having happened.
- **Do not reach through the filter.** A route sweep asserts the page's own
  furniture; a spec that controls the range asserts the rows. Weaker per
  assertion, stable indefinitely, and it keeps the two kinds of test doing the
  jobs they are actually good at.

This pass took the second, because a route sweep asserting on data behind a
filter was the wrong division of labour to begin with. The first is the better
long-run answer for the suites that are *about* the data.
