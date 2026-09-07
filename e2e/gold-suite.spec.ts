import { test, expect } from "./_support/fixtures";
import { GOLD } from "./_support/tenants";
import { sweepTests, type Route } from "./_support/sweep";
import { expectHealthyPage } from "./_support/assert";
import { visitSettled } from "./_support/nav";
import { companyIdFor, db } from "./_support/db";

/**
 * The gold mine, end to end.
 *
 * Phase 3.4. This module had **zero** browser specs before today — 19 routes
 * and nothing exercising any of them, which for the founding module of the
 * codebase is the largest single gap the plan found.
 *
 * The sweep is not a screenshot pass: every route has to render evidence of the
 * seeded quarter, not merely load. See `_support/sweep.ts` for the four bars.
 */

/*
  Fifteen minutes for a sweep, and that number is measured rather than picked.

  `next dev` compiles each route the first time it is asked for, and the server
  log put a cold gold route at up to 20s. A sweep of twenty routes is therefore
  a several-minute test on its first run and a fast one afterwards, because the
  routes stay warm. A 240s ceiling failed the sweep two-thirds of the way
  through and reported it as a product failure, which is a lie about what
  happened.

  Against a production build this should come down by an order of magnitude.
*/
test.describe.configure({ timeout: 900_000 });
test.use({ tenant: GOLD, as: "admin" });

const ROUTES: readonly Route[] = [
  { path: "/gold", name: "Gold overview", expect: /g\b|gram|Gold/i },
  // `/gold/shift-output` has no page — only `/gold/shift-output/new` does.
  // Asking for the parent returns a genuine 404, which is correct behaviour
  // and was my wrong URL rather than a broken route.
  { path: "/gold/shift-output/new", name: "Log shift output", expect: /Shift|Output|Site|Weight/i },
  { path: "/gold/prices", name: "Prices", expect: /\$?\s?7\d|8\d/ },
  { path: "/gold/intake/pours", name: "Pours", expect: /BAR-\d{4}/ },
  { path: "/gold/intake/purchases", name: "Purchases", note: "The seed mines its own gold; no public purchases yet." },
  // The dispatch list shows the bar, the courier and the destination — not
  // the seal number, which lives on the record rather than in the table.
  { path: "/gold/transit/dispatches", name: "Dispatches", expect: /BAR-\d{4}/ },
  { path: "/gold/settlement/receipts", name: "Buyer receipts", expect: /FPR-\d{6}/ },
  { path: "/gold/settlement/approvals", name: "Settlement approvals" },
  { path: "/gold/settlement/payouts", name: "Payouts" },
  // `/gold/insights` has no page of its own — only `/gold/insights/allocations`
  // does, the same shape as `/gold/shift-output`. Two route groups in this
  // module have a child page and no index; worth knowing before adding a third.
  { path: "/gold/insights/allocations", name: "Allocations insight" },
  /*
    The exceptions page lists two things the seed leaves deliberately open: a
    poured bar never dispatched, and a dispatched bar never sold. It shows them
    by bar number and site.

    The first pattern here was /deficit|witness|Milling|Shaft 2/ — vocabulary
    from `GoldException` rows and site names this seed does not use (its sites
    are Shaft 1, Shaft 2 and Alluvial Section, and the open exception happens to
    sit on the alluvial one). The page was rendering both exceptions correctly
    the whole time. Assert the headings, which are the page's own words.
  */
  {
    path: "/gold/exceptions",
    name: "Exceptions",
    expect: /Missing Dispatch|Dispatches Missing Sale/i,
  },
  { path: "/gold/reconciliation", name: "Reconciliation" },
  { path: "/gold/audit", name: "Audit trail" },
  { path: "/gold/import", name: "Ledger import" },
];

/*
  One test per route. See the note in `_support/sweep.ts` for why a single
  sweeping test was the wrong shape: cold-compile cost made it a fifteen-minute
  test that reported one timeout instead of twenty-odd separate verdicts.
*/
sweepTests(ROUTES);

test("the shift ledger reconciles with the database", async ({ page, console_ }) => {

  const companyId = await companyIdFor(GOLD.slug, GOLD.seed);

  /*
    The invariant worth asserting, and the one no screenshot can see: a shift's
    gold is split, not created. `workerShareWeight + companyShareWeight` must
    equal `netWeight` on every allocation, or somebody is owed grams that do not
    exist. Decimal, not float — these are `Decimal(…)` columns and comparing
    them through `Number` is the trap `lib/money.ts` exists to avoid, so the
    comparison is to a milligram rather than to zero.
  */
  const allocations = await db.goldShiftAllocation.findMany({
    where: { companyId },
    select: {
      id: true,
      date: true,
      shift: true,
      netWeight: true,
      workerShareWeight: true,
      companyShareWeight: true,
    },
  });

  expect(allocations.length, "the mine should have a quarter of shifts behind it").toBeGreaterThan(
    100,
  );

  const unbalanced = allocations.filter((row) => {
    const net = Number(row.netWeight);
    const split = Number(row.workerShareWeight) + Number(row.companyShareWeight);
    /*
      Exact, not milligram-tolerant. This was `> 0.001`, which was meant to
      allow a milligram of rounding and instead sat exactly on the boundary:
      the seed was out by precisely 0.001 on 69 of 154 shifts, and float noise
      decided the verdict. A tolerance that admits a whole milligram is also
      the wrong tolerance — 0.001g is the column's precision, so a discrepancy
      of one is a real discrepancy, not a rounding artefact. The epsilon here
      covers binary representation only.
    */
    return Math.abs(net - split) > 1e-9;
  });

  expect(
    unbalanced.map((row) => `${row.date.toISOString().slice(0, 10)} ${row.shift}`),
    "worker share plus company share must equal net weight",
  ).toEqual([]);

  /*
    `/gold/insights/allocations`, not `/gold/shift-output` — the latter has no
    page of its own and returns a genuine 404, which `ROUTES` above already
    records and this test went on asking for anyway. Worth noting that the
    harness caught it: a 404 page still renders, so the navigation succeeds and
    only the console watcher notices. That is the check earning its keep.
  */
  await visitSettled(page, "/gold/insights/allocations");
  await expectHealthyPage(page, console_);
});

test("gold in transit is visible as gold in transit", async ({ page, console_ }) => {
  const companyId = await companyIdFor(GOLD.slug, GOLD.seed);

  /*
    The state the mine actually worries about: a bar that has left the safe and
    has not been receipted. The seed leaves exactly one, plus one bar still in
    the safe, because a screen that has never rendered either cannot be trusted
    to render them on the day it matters.
  */
  const dispatched = await db.goldDispatch.count({
    where: { goldPour: { site: { companyId } } },
  });
  const receipted = await db.buyerReceipt.count({
    where: { goldPour: { site: { companyId } } },
  });

  expect(dispatched, "the seed dispatches five bars").toBeGreaterThan(0);
  expect(
    dispatched - receipted,
    "one dispatched bar should still be awaiting its buyer receipt",
  ).toBeGreaterThan(0);

  await visitSettled(page, "/gold/transit/dispatches");
  /*
    Bar number, not seal number. The dispatch list shows date, bar, weight,
    value, courier, destination and status; the seal lives on the dispatch
    record behind it. This is the second time this spec has asserted `SEAL-` on
    a list that has never rendered one — the sibling assertion was corrected on
    2026-09-01 and this one was missed.
  */
  await expect(page.locator("body")).toContainText(/BAR-\d{4}/, { timeout: 25_000 });
  await expect(page.locator("body")).toContainText(/Awaiting sale/i);
  await expectHealthyPage(page, console_);
});
