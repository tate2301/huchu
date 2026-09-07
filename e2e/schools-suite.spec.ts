import { test, expect } from "./_support/fixtures";
import { SCHOOL } from "./_support/tenants";
import { sweepTests, type Route } from "./_support/sweep";
import { expectHealthyPage } from "./_support/assert";
import { visitSettled } from "./_support/nav";
import { companyIdFor, db } from "./_support/db";

/**
 * School management, end to end.
 *
 * Phase 3.2. Fifteen `-shots` specs already walk these screens; what none of
 * them does is check that the numbers on a page agree with the roll behind it.
 * A fees page listing 40 invoices for 120 pupils photographs exactly as well as
 * one listing 120.
 *
 * The portals are `smoke-school.spec.ts`; this is the admin side.
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
test.use({ tenant: SCHOOL, as: "head" });

const ROUTES: readonly Route[] = [
  { path: "/schools", name: "School overview" },
  { path: "/schools/students", name: "Students", expect: /ADM-\d{4}/ },
  { path: "/schools/classes", name: "Classes", expect: /Form \d/ },
  { path: "/schools/subjects", name: "Subjects" },
  { path: "/schools/teachers", name: "Teachers", expect: /Mutasa|Chigumba|Zhou|Mabika/ },
  { path: "/schools/guardians", name: "Guardians" },
  { path: "/schools/attendance", name: "Attendance" },
  { path: "/schools/attendance/follow-up", name: "Absence follow-up" },
  { path: "/schools/admissions", name: "Admissions" },
  { path: "/schools/results", name: "Results" },
  { path: "/schools/results/sheets", name: "Result sheets" },
  { path: "/schools/finance", name: "Finance overview" },
  { path: "/schools/finance/ledger?view=invoices", name: "Fee invoices", expect: /SFI-\d{5}/ },
  { path: "/schools/finance/arrears", name: "Arrears" },
  { path: "/schools/finance/receipts", name: "Fee receipts" },
  { path: "/schools/fees", name: "Fee structures" },
  { path: "/schools/boarding", name: "Boarding" },
  { path: "/schools/boarding/hostels", name: "Hostels" },
  { path: "/schools/timetable", name: "Timetable" },
  { path: "/schools/calendar", name: "Calendar" },
  { path: "/schools/homework", name: "Homework" },
  { path: "/schools/library", name: "Library" },
  { path: "/schools/notices", name: "Notices" },
  { path: "/schools/messages", name: "Messages" },
  { path: "/schools/documents", name: "Documents" },
  { path: "/schools/reports", name: "Reports" },
];

/*
  One test per route. See the note in `_support/sweep.ts` for why a single
  sweeping test was the wrong shape: cold-compile cost made it a fifteen-minute
  test that reported one timeout instead of twenty-odd separate verdicts.
*/
sweepTests(ROUTES);

test("the roll on the page is the roll in the database", async ({ page, console_ }) => {
  const companyId = await companyIdFor(SCHOOL.slug, SCHOOL.seed);

  const [active, suspended, boarders, withoutGuardian] = await Promise.all([
    db.schoolStudent.count({ where: { companyId, status: "ACTIVE" } }),
    db.schoolStudent.count({ where: { companyId, status: "SUSPENDED" } }),
    db.schoolStudent.count({ where: { companyId, isBoarding: true } }),
    db.schoolStudent.count({ where: { companyId, guardianLinks: { none: {} } } }),
  ]);

  expect(active, "the seed enrols 119 active pupils").toBeGreaterThan(100);
  expect(suspended, "one pupil is suspended on purpose").toBe(1);
  expect(boarders, "some pupils board").toBeGreaterThan(0);
  expect(
    withoutGuardian,
    "one pupil is deliberately left with no guardian, so the un-contactable path renders",
  ).toBe(1);

  /*
    The counts are rendered as summary tiles. Asserting the page agrees with the
    database is what turns a screenshot into a test: a tile reading the wrong
    query still looks like a tile.
  */
  await visitSettled(page, "/schools/students");
  await expect(page.locator("body")).toContainText(String(active), { timeout: 30_000 });
  await expect(page.locator("body")).toContainText("Suspended", { timeout: 10_000 });
  await expectHealthyPage(page, console_);
});

test("fees show money owed, not just money billed", async ({ page, console_ }) => {
  const companyId = await companyIdFor(SCHOOL.slug, SCHOOL.seed);

  const [paid, partPaid, issued] = await Promise.all([
    db.schoolFeeInvoice.count({ where: { companyId, status: "PAID" } }),
    db.schoolFeeInvoice.count({ where: { companyId, status: "PART_PAID" } }),
    db.schoolFeeInvoice.count({ where: { companyId, status: "ISSUED" } }),
  ]);

  // All three states must exist, or the fees screens have never been seen doing
  // the only job that matters: telling a bursar who has not paid.
  expect(paid, "some fees are settled").toBeGreaterThan(0);
  expect(partPaid, "some are part-paid").toBeGreaterThan(0);
  expect(issued, "some are outstanding").toBeGreaterThan(0);

  const outstanding = await db.schoolFeeInvoice.findMany({
    where: { companyId, status: { in: ["ISSUED", "PART_PAID"] } },
    select: { balanceAmount: true },
  });
  const owed = outstanding.reduce((sum, row) => sum + Number(row.balanceAmount), 0);
  expect(owed, "an outstanding invoice with a zero balance is a contradiction").toBeGreaterThan(0);

  await visitSettled(page, "/schools/finance/arrears");
  await expectHealthyPage(page, console_);
});
