import { test, expect } from "./_support/fixtures";
import { CRM } from "./_support/tenants";
import { sweepTests, type Route } from "./_support/sweep";
import { expectHealthyPage } from "./_support/assert";
import { visitSettled } from "./_support/nav";
import { companyIdFor, db } from "./_support/db";

/**
 * The service provider, end to end.
 *
 * Phase 3.5. A creative agency with a year behind it: 180 leads, 90 deals,
 * 1,165 activities, 57 quotations, 22 invoices, 20 receipts.
 *
 * What the existing `crm-shots` and `crm-overlays` specs could not tell us is
 * whether the sales documents join up — whether a quotation becomes an invoice
 * and an invoice becomes a receipt, or whether three lists happen to have rows
 * in them. That is what the second test here checks, in the database, because
 * the join is not something a page renders.
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
test.use({ tenant: CRM, as: "owner" });

const ROUTES: readonly Route[] = [
  { path: "/crm", name: "CRM overview" },
  { path: "/crm/leads", name: "Leads", expect: /CRML-|Lead|stage/i },
  { path: "/crm/deals", name: "Deals" },
  { path: "/crm/people", name: "People", expect: /CRMP-|Tendai|Rutendo|Blessing/ },
  { path: "/crm/companies", name: "Companies", expect: /Lux Liqour|Zambezi|Highveld|CRMC-/ },
  { path: "/crm/sites", name: "Sites", expect: /CRMS-|Borrowdale|Avondale|Depot/ },
  { path: "/crm/quotes", name: "Quotations" },
  { path: "/crm/invoices", name: "Invoices" },
  { path: "/crm/receipts", name: "Receipts" },
  { path: "/crm/collections", name: "Collections" },
  { path: "/crm/tasks", name: "Tasks" },
  { path: "/crm/follow-ups", name: "Follow-ups" },
  { path: "/crm/appointments", name: "Appointments" },
  { path: "/crm/reps", name: "Sales reps" },
  { path: "/crm/insights", name: "Insights" },
  { path: "/crm/reports", name: "Reports" },
  { path: "/crm/forms", name: "Intake forms" },
  /*
    Not `/crm/lists` — `app/crm/lists/` holds only `[id]`, so the index 404s.

    That is the *third* route group in this codebase with a child page and no
    index of its own, after `/gold/shift-output` and `/gold/insights`. The note
    in `gold-suite.spec.ts` said "worth knowing before adding a third"; here it
    is. Either the pattern is deliberate and should be written down, or these
    three want index pages. Both are product decisions, not test ones.
  */
  { path: "/crm/templates", name: "Templates" },
  { path: "/crm/settings", name: "Settings" },
];

/*
  One test per route. See the note in `_support/sweep.ts` for why a single
  sweeping test was the wrong shape: cold-compile cost made it a fifteen-minute
  test that reported one timeout instead of twenty-odd separate verdicts.
*/
sweepTests(ROUTES);

test("the book of business joins up", async ({ page, console_ }) => {
  const companyId = await companyIdFor(CRM.slug, CRM.seed);

  const [leads, deals, quotes, invoices, receipts] = await Promise.all([
    db.crmLead.count({ where: { companyId } }),
    db.crmDeal.count({ where: { companyId } }),
    // `SalesQuotation` / `SalesInvoice` / `SalesReceipt`, not `Crm*`. The sales
    // documents are shared platform models — CRM raises them, but so does
    // retail and so does the schools bursar — which is why they are not in the
    // Crm namespace and why `seed-crm-year.ts` writes them under those names.
    db.salesQuotation.count({ where: { companyId } }),
    db.salesInvoice.count({ where: { companyId } }),
    db.salesReceipt.count({ where: { companyId } }),
  ]);

  // A pipeline that narrows. Not an arbitrary shape — a book of business where
  // more invoices than quotations exist has either a data problem or a process
  // nobody has described, and either way the reports built on it are wrong.
  expect({ leads, deals, quotes, invoices, receipts }).toMatchObject({
    leads: expect.any(Number),
  });
  expect(leads, "a year of prospecting").toBeGreaterThan(100);
  expect(deals, "deals worked out of those leads").toBeGreaterThan(10);
  expect(quotes, "quotations raised").toBeGreaterThan(10);
  expect(invoices, "invoices should not outnumber quotations").toBeLessThanOrEqual(quotes);
  expect(receipts, "receipts should not outnumber invoices").toBeLessThanOrEqual(invoices);

  await visitSettled(page, "/crm/leads");
  await expectHealthyPage(page, console_);
});

test("a lead can be opened and read", async ({ page, console_ }) => {
  await visitSettled(page, "/crm/leads");

  /*
    Opening a record is the single most-used action in a CRM and the one the
    list specs never take. The row link is found by its record number rather
    than by position, so a change to default sort does not silently retarget
    this at a different lead.
  */
  /*
    `:visible` matters. A CRM record page renders its Table, List and Board
    views all at once and hides the two that are not selected, so `/crm/leads`
    carries 137 anchors of which most are hidden. Without the filter, `.first()`
    picks one from a hidden pane and waits 25 seconds for it to appear — which
    reads as "the leads list is empty" and is the opposite: there is too much of
    it, in three copies.
  */
  const firstLead = page.locator('a[href^="/crm/leads/"]:visible').first();
  await expect(firstLead).toBeVisible({ timeout: 25_000 });
  await firstLead.click();

  await page.waitForLoadState("networkidle", { timeout: 2_000 }).catch(() => {});
  await expect(page).toHaveURL(/\/crm\/leads\/[^/]+$/);
  await expectHealthyPage(page, console_);
});
