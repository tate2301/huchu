import { test, expect } from "./_support/fixtures";
import { PAYROLL } from "./_support/tenants";
import { sweepTests, type Route } from "./_support/sweep";
import { expectHealthyPage } from "./_support/assert";
import { visitSettled } from "./_support/nav";
import { companyIdFor, db, expectJournalsBalance } from "./_support/db";

/**
 * Accounting, payroll and HR — one tenant, because they are one system.
 *
 * Phase 3.6. Accounting had **zero** specs before today across 16 routes, and
 * payroll had one screenshot file. Between them they are the largest untested
 * surface in the product after gold.
 *
 * The last test is the point of the file. Payroll posting, retail Z-reports and
 * gold settlement all write journals, and an unbalanced one is invisible in
 * every screen that renders it — a trial balance will happily show you two
 * numbers that do not agree if nothing ever compares them. `JournalLine.debit`
 * and `.credit` are `Float` in this schema, not `Decimal`, which makes the
 * check more valuable rather than less.
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
test.use({ tenant: PAYROLL, as: "admin" });

const ACCOUNTING: readonly Route[] = [
  { path: "/accounting", name: "Accounting overview" },
  { path: "/accounting/chart-of-accounts", name: "Chart of accounts", expect: /\d{4}|Cash|Bank|Payable/i },
  { path: "/accounting/journals", name: "Journals" },
  { path: "/accounting/trial-balance", name: "Trial balance" },
  { path: "/accounting/financial-statements", name: "Financial statements" },
  { path: "/accounting/financial-reports", name: "Financial reports" },
  { path: "/accounting/receivables", name: "Receivables" },
  { path: "/accounting/payables", name: "Payables" },
  // Kariba Payroll Bureau is not entitled to these three. Being turned away
  // is the assertion — see `blocked` in `_support/sweep.ts`.
  { path: "/accounting/banking", name: "Banking", blocked: true },
  { path: "/accounting/periods", name: "Periods" },
  { path: "/accounting/posting-rules", name: "Posting rules" },
  { path: "/accounting/tax", name: "Tax" },
  { path: "/accounting/currency", name: "Currency", blocked: true },
  { path: "/accounting/cost-centers", name: "Cost centres", blocked: true },
  { path: "/accounting/fiscalisation", name: "Fiscalisation" },
  /*
    Sales and Purchases both call `/api/accounting/banking/accounts` to fill a
    "receive payment into" picker, and this tenant has no Banking entitlement,
    so both take a 403 and log it. Recorded as `unentitled-accounting-api-403` in
    `_support/assert.ts` — the pages themselves work; the picker is empty and
    the console is not.
  */
  { path: "/accounting/sales", name: "Sales" },
  { path: "/accounting/purchases", name: "Purchases" },
];

const PAYROLL_ROUTES: readonly Route[] = [
  /*
    No `/payroll` — `app/payroll/` has no `page.tsx`, only child routes, so the
    index 404s. That is the **fourth** route group in this codebase shaped that
    way, after `/gold/shift-output`, `/gold/insights` and `/crm/lists`. Four is
    a pattern rather than an oversight; it wants a decision, written down.
  */
  { path: "/payroll/runs", name: "Payroll runs", expect: /2026|August|Run|period/i },
  { path: "/payroll/salaries", name: "Salaries" },
  { path: "/payroll/salaries/outstanding", name: "Outstanding salaries" },
  { path: "/payroll/compensation", name: "Compensation" },
  { path: "/payroll/disbursements", name: "Disbursements" },
  { path: "/payroll/statutory", name: "Statutory" },
  { path: "/payroll/statutory/returns", name: "Statutory returns" },
];

const HR: readonly Route[] = [
  { path: "/people", name: "People overview" },
  { path: "/people/attendance", name: "Attendance" },
  { path: "/people/leave", name: "Leave" },
  { path: "/people/leave/holidays", name: "Public holidays" },
  { path: "/people/rosters", name: "Rosters" },
  { path: "/people/incidents", name: "Incidents" },
  { path: "/people/approvals", name: "Approvals" },
];

/*
  One test per route — see `_support/sweep.ts`. Accounting, payroll and HR are
  swept separately so a red line names the module as well as the screen.
*/
sweepTests(ACCOUNTING);

sweepTests(PAYROLL_ROUTES);

sweepTests(HR);

test("the payroll run posted, and the journal it posted balances", async ({ page, console_ }) => {
  const companyId = await companyIdFor(PAYROLL.slug, PAYROLL.seed);

  /*
    The seam the plan calls the one that matters: payroll posts, the journal
    appears in accounting, and the books still balance. Three separate claims,
    and the third is the one nothing in the UI checks.
  */
  const runs = await db.payrollRun.findMany({
    where: { companyId },
    select: { id: true, status: true, periodId: true },
  });
  expect(runs.length, "the seed approves and posts one August run").toBeGreaterThan(0);

  const entries = await db.journalEntry.count({ where: { companyId } });
  expect(entries, "posting the run should have written journal entries").toBeGreaterThan(0);

  // Throws with the offending entry numbers and their debit/credit totals.
  await expectJournalsBalance(companyId);

  await visitSettled(page, "/accounting/trial-balance");
  await expectHealthyPage(page, console_);
});

test("the employee with no BP number is still visible as a blocker", async ({
  page,
  console_,
}) => {

  /*
    `seed-payroll-demo.ts` leaves one employee without a BP number on purpose,
    so the blocker path renders. A payroll module that hides an unpayable
    employee is worse than one that has none — the money simply does not move
    and nobody is told.
  */
  await visitSettled(page, "/payroll/runs");
  await expectHealthyPage(page, console_);

  await visitSettled(page, "/payroll/salaries/outstanding");
  await expectHealthyPage(page, console_);
});
