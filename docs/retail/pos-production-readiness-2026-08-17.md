# The POS surface: what exists, what is missing, what is unproven

**Date:** 2026-08-17 · **Contract:** `docs/design-system/portals/pos.html`
**Governs:** `docs/retail/retail-stock-consolidation-plan-2026-08-13.md` §1.6

Written as a stock-take, not a status report. Everything below was read off the
repository and the database, not remembered. Where something is asserted rather
than proven, it says so.

---

## 0. The one-line answer

**The POS is not production-ready, and the gap is not mostly code.** Nine of the
sixteen surfaces the contract names are built and wired; three exist but cannot
be reached; two are not built; and — the part that matters most — **not one POS
screen has ever been opened in a browser.** Every claim of "working" on this
surface currently rests on typecheck, unit tests and reading the code.

For a till that two cashiers will run for a full trading day, that is the wrong
kind of confidence.

---

## 1. Screen by screen, against the contract

`docs/design-system/portals/README.md` states the rule for these prototypes:
*every feature in a demo is required*. Measured against `portals/pos.html`:

| # | Contract surface | Route | State |
|---|---|---|---|
| 1 | Sell / cart / search / discount / split tender | `/` | built, wired, **unverified** |
| 2 | Saved sales | `/held` | built, wired, **unverified** |
| 3 | Sales history | `/history` | built, wired, **unverified** |
| 4 | Refund a sale | in `/history` | built, wired, **unverified** |
| 5 | Void receipt | in `/history` | built, wired, **unverified** |
| 6 | Open till & start shift | `/shift` | built, wired, **unverified** |
| 7 | End shift (cash-up) | `/shift` | built, wired, **unverified** |
| 8 | **Cash drop / pickup** | in `/shift` | built, wired, **unverified** |
| 9 | **Z-report** | in `/reports` | built, wired, **unverified** |
| 10 | **Offline queue** | `/offline` | built; **wired 2026-08-17**, was orphaned |
| 11 | **PIN unlock** | portal-wide | built; **wired 2026-08-17**, was orphaned |
| 12 | Find an item (price check) | `/price-check` | built, **not in the nav rail** |
| 13 | Customers + add new | `/customers` | built, **not in the nav rail** |
| 14 | Till dashboard (top items, hour by hour, tender mix) | `/overview` | built, **not in the nav rail** |
| 15 | **Till settings** — identity, currency & tax, discount limits, PINs, printer, receipt template | — | **API only. No UI exists.** |
| 16 | **Audit log** | — | **not built** |
| 17 | **Help & keyboard shortcuts** | — | **not built** |

### 1.1 Three screens a cashier cannot reach

`POS_PORTAL_LINKS` in `components/retail/portal/pos-portal-layout-frame.tsx`
carries six entries: Checkout, Held, History, Reports, Shift, Offline.

`/overview`, `/customers` and `/price-check` have routes, components and data —
and no way in. Price check in particular is a counter tool: a customer asks what
something costs and the cashier has no button for it. This is a nav omission,
not missing work, and it is the cheapest thing on this page to fix.

### 1.2 Two surfaces were orphaned until today

`pos-offline-queue-view.tsx` and `pos-lock-screen.tsx` were fully written and
imported by nothing. The agent building them dropped on a connection error at
the exact moment it reported starting the offline queue view, and the work was
committed without the gates being run. They are wired now — a route plus a rail
entry for the queue, and the lock provider wrapped around the portal layout —
but wiring is not verification.

### 1.3 Till settings has an API and no screen

`app/api/v2/retail/pos/till-settings/route.ts` exists. Nothing in
`components/` or `app/` references it. The contract puts six settings groups on
the till; today all six live only in the back office at `/retail/setup/**`,
which a cashier on a tablet cannot open and should not be able to.

Worth stating plainly: **this is the one place where "reuse the back office"
was the right instinct and produced nothing usable.** The endpoint was built to
serve a screen that was never started.

---

## 2. What is genuinely proven

Not everything here is soft. The following are backed by tests that fail when
the behaviour breaks:

| Area | Evidence |
|---|---|
| Cash-up arithmetic incl. drops | `lib/retail/cash-up.test.ts` — hand-worked Friday, 21 assertions, exact `Decimal` |
| Multi-currency drawer | same file — a ZWG tender counts at $200, not 5,500 |
| VAT-inclusive checkout | `lib/retail/checkout.test.ts` — $1.20 tag = $1.04 + $0.16 |
| Refund/ledger identity | `lib/retail/sale-totals.test.ts` — 5 cases incl. part-refunds |
| Z-report figures + immutability | `z-report.test.ts`, `z-report-rerun.test.ts` |
| Offline replay verdicts | `offline-queue-verdict.test.ts`, `replay-price-review.test.ts` |
| PIN lockout | `till-pin.test.ts` |
| Every write is gated | `route-guard-coverage.test.ts` |
| Schema matches the database | `schema-migration.test.ts` (caught two enums reverting to `text`) |

466 tests green, typecheck 0, lint 0 across the four retail paths.

**What that does not cover:** whether a page renders, whether a button is
reachable, whether the till can complete a sale. No test in this repo drives the
POS through a transaction.

---

## 3. The honest risk list, ordered

1. **A sale has never been rung end to end.** Not by a test, not by a human. The
   checkout path was rewritten twice this week — S-3 moved price resolution to
   the core engine, S-4b moved item identity from `RetailCatalogItem` to
   `Product` — and neither change has been exercised through the UI.
2. **Till settings has no screen**, so shelf-level configuration a shop needs
   mid-day (discount ceiling, receipt footer, printer) is unreachable from the
   till.
3. **Three built screens are unreachable.**
4. **No audit log and no help**, both named by the contract.
5. **`RetailCatalogItem` is an unread shadow** — everything reads `Product`, but
   the drop is deliberately un-run pending exactly the verification that has not
   happened.

---

## 4. What "ready" requires, in order

**A. Prove the till sells.** One sale, one refund, one void, one cash drop, one
cash-up, one Z-report — driven through the UI, not the API. This is the gate
everything else waits behind, and it is worth automating as
`e2e/retail-shots.spec.ts` (ticket **R-6.1**, already in the plan and still
unstarted) so it re-runs rather than being done once by hand.

**B. Close the reachability gaps.** Nav entries for overview, customers and
price check. Cheap.

**C. Build till settings.** The endpoint exists; the screen does not.

**D. Audit log and help.** Contract items, lowest risk to a trading day.

**E. Then, and only then, drop `RetailCatalogItem`.**

---

## 5. Why this took the shape it did

Recorded because the pattern is worth not repeating.

The POS had **no ticket in either plan** until 2026-08-17. Both plans treated it
as done because it existed and worked, and the build contract at
`design.corelith.co.zw/portals/pos/demo.html` was never downloaded — while the
three school portals had been, and were being treated as contracts. The
back-office surfaces got a design-system pass, a permissions matrix, a nav
reconciliation and a full schema migration; the highest-traffic surface in the
module got none of them until this week.

The second factor: three agents building POS work were interrupted mid-task —
two by connection loss, one by a session limit — and their output was committed
without the verification gates running. That is how two finished components came
to be imported by nothing, and how a missing import in `pos/sync/route.ts` sat
in the tree until a typecheck caught it days later.
