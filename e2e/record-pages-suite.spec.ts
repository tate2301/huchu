import { test, expect } from "./_support/fixtures";
import { CRM, GOLD, RETAIL, SCHOOL } from "./_support/tenants";
import { sweepRecordTests, sweepTests, type Route } from "./_support/sweep";
import { companyIdFor, db } from "./_support/db";
import { expectHealthyPage } from "./_support/assert";
import { visitSettled } from "./_support/nav";

/**
 * The detail pages — one deal, one dispatch, one sale, one class.
 *
 * Twenty-eight routes across four verticals, and every one of them was
 * uncovered for the same reason: a spec cannot name an id that the seed
 * generates fresh on every run. `sweepRecordTests` in `_support/sweep.ts`
 * looks one up from the database when the test runs, and reports a **skip**
 * rather than a pass when the seed wrote none.
 *
 * This matters more than the list length suggests. A list page renders a
 * summary the API already shaped; a detail page is where a module joins its
 * own tables, and where a missing `companyId`, an unparsed `Decimal` or a
 * relation nobody backfilled actually shows. Both gold bugs found in the first
 * pass — the null `companyId` on pours, and the milligram that did not add up —
 * were of exactly that kind.
 *
 * ## Eight routes create through a query, not a page
 *
 * `/gold/intake/pours/new` and its three siblings redirect to their list with
 * `?create=1`, the way `/stores/issue` redirects with `?record=issue`. The
 * bookmark is meant to land you in the form, so the query and the dialog are
 * asserted rather than just the redirect: a sweep that only checked the
 * destination would be green while the button had gone.
 */

test.describe.configure({ timeout: 900_000 });

/* ── The service provider ─────────────────────────────────────────────── */

test.describe("CRM records", () => {
  test.use({ tenant: CRM, as: "owner" });

  const crmCompanyId = () => companyIdFor(CRM.slug, CRM.seed);

  /*
    Assertions are on the record number, not on a field label.

    The first draft asserted words like "Stage", "Owner" and "Email" — none of
    which these pages print. A record page shows the record: `CRMD-0010`,
    `DEAL-0007`, the pipeline as a row of stage names. The number is also the
    only string on the page that proves the *right* record was fetched rather
    than a working page with somebody else's data on it.
  */

  sweepRecordTests([
    {
      name: "One CRM company",
      path: (id) => `/crm/companies/${id}`,
      find: async () =>
        (await db.crmClient.findFirst({ where: { companyId: await crmCompanyId() }, select: { id: true } }))?.id ?? null,
      expect: /CRMC-\d{4}/,
    },
    {
      name: "One deal",
      path: (id) => `/crm/deals/${id}`,
      find: async () =>
        (await db.crmDeal.findFirst({ where: { companyId: await crmCompanyId() }, select: { id: true } }))?.id ?? null,
      expect: /DEAL-\d{4}/,
    },
    {
      name: "One lead",
      path: (id) => `/crm/leads/${id}`,
      find: async () =>
        (await db.crmLead.findFirst({ where: { companyId: await crmCompanyId() }, select: { id: true } }))?.id ?? null,
      expect: /CRMD-\d{4}/,
    },
    {
      name: "One person",
      path: (id) => `/crm/people/${id}`,
      find: async () =>
        (await db.crmPerson.findFirst({ where: { companyId: await crmCompanyId() }, select: { id: true } }))?.id ?? null,
      expect: /CRMP-\d{4}/,
    },
    {
      name: "One site",
      path: (id) => `/crm/sites/${id}`,
      find: async () =>
        (await db.crmSite.findFirst({ where: { companyId: await crmCompanyId() }, select: { id: true } }))?.id ?? null,
      expect: /CRMS-\d{4}/,
    },
    {
      // A "rep" is a `User`, not a table of its own — the CRM measures the
      // people who already have sign-ins rather than keeping a second roster.
      name: "One sales rep",
      path: (id) => `/crm/reps/${id}`,
      find: async () =>
        (await db.user.findFirst({ where: { companyId: await crmCompanyId() }, select: { id: true } }))?.id ?? null,
      expect: /Pipeline|Won|Activity|Leads/i,
    },
    {
      name: "One intake form",
      path: (id) => `/crm/forms/${id}`,
      find: async () =>
        (await db.crmIntakeForm.findFirst({ where: { companyId: await crmCompanyId() }, select: { id: true } }))?.id ?? null,
      expect: /Form details/i,
    },
    {
      name: "One list",
      path: (id) => `/crm/lists/${id}`,
      find: async () =>
        (await db.crmList.findFirst({ where: { companyId: await crmCompanyId() }, select: { id: true } }))?.id ?? null,
      expect: /in this list/i,
    },
    {
      name: "One CRM template",
      path: (id) => `/crm/templates/${id}`,
      // The template builder is shared with the rest of the workspace, so the
      // CRM path forwards into it. Both routes are covered; one page exists.
      redirectsTo: (id) => `/templates/${id}`,
      find: async () =>
        (await db.crmTemplate.findFirst({ where: { companyId: await crmCompanyId() }, select: { id: true } }))?.id ?? null,
      expect: /block types/i,
    },
    {
      name: "One work order",
      path: (id) => `/crm/work-orders/${id}`,
      find: async () =>
        (await db.crmWorkOrder.findFirst({ where: { companyId: await crmCompanyId() }, select: { id: true } }))?.id ?? null,
      expect: /CRMW-\d{4}/,
    },
  ]);
});

/* ── The mine ─────────────────────────────────────────────────────────── */

test.describe("Gold records", () => {
  test.use({ tenant: GOLD, as: "admin" });

  const goldCompanyId = () => companyIdFor(GOLD.slug, GOLD.seed);

  sweepRecordTests([
    {
      name: "One pour",
      path: (id) => `/gold/intake/pours/${id}`,
      find: async () =>
        (await db.goldPour.findFirst({ where: { companyId: await goldCompanyId() }, select: { id: true } }))?.id ?? null,
      expect: /BAR-\d{4}/,
    },
    {
      name: "One dispatch",
      path: (id) => `/gold/transit/dispatches/${id}`,
      find: async () =>
        (await db.goldDispatch.findFirst({ where: { companyId: await goldCompanyId() }, select: { id: true } }))?.id ?? null,
      expect: /BAR-\d{4}|Courier|Destination/i,
    },
    {
      name: "One buyer receipt",
      path: (id) => `/gold/settlement/receipts/${id}`,
      find: async () =>
        (await db.buyerReceipt.findFirst({ where: { companyId: await goldCompanyId() }, select: { id: true } }))?.id ?? null,
      expect: /FPR-\d{6}|Receipt/i,
    },
    {
      name: "One shift allocation",
      path: (id) => `/gold/insights/allocations/${id}`,
      find: async () =>
        (await db.goldShiftAllocation.findFirst({ where: { companyId: await goldCompanyId() }, select: { id: true } }))?.id ?? null,
      // Weights are the whole content of an allocation, and `g` is how every
      // one of them is rendered. A NaN here is caught by the sweep's own
      // poison check; this asserts the figures arrived at all.
      expect: /\d+\.\d+\s*g/,
    },
    {
      name: "One ledger import",
      path: (id) => `/gold/import/${id}`,
      find: async () =>
        (await db.goldLedgerImport.findFirst({ where: { companyId: await goldCompanyId() }, select: { id: true } }))?.id ?? null,
      note: "Skips until the gold seed runs a ledger import.",
    },
  ]);
});

/* ── The shop ─────────────────────────────────────────────────────────── */

test.describe("Retail records", () => {
  test.use({ tenant: RETAIL, as: "manager" });

  const retailCompanyId = () => companyIdFor(RETAIL.slug, RETAIL.seed);

  const PURCHASING: readonly Route[] = [
    {
      path: "/retail/purchasing",
      name: "Purchasing index",
      redirectsTo: "/retail/purchasing/orders",
      expect: /Purchase orders/i,
    },
  ];

  sweepTests(PURCHASING);

  sweepRecordTests([
    {
      name: "One catalogue line",
      path: (id) => `/retail/catalog/${id}`,
      // `{id}` here is a `Product.id` — the shelf listing, not the stock item.
      // See the docstring on app/api/v2/retail/catalog/[id]/route.ts.
      find: async () =>
        (await db.product.findFirst({ where: { companyId: await retailCompanyId() }, select: { id: true } }))?.id ?? null,
      expect: /Price|Shelf|SKU|Barcode/i,
    },
    {
      name: "One sale",
      path: (id) => `/retail/sales/${id}`,
      find: async () =>
        (await db.retailSale.findFirst({ where: { companyId: await retailCompanyId() }, select: { id: true } }))?.id ?? null,
      expect: /RSL-\d{4}/,
    },
    {
      name: "One shift",
      path: (id) => `/retail/shifts/${id}`,
      find: async () =>
        (await db.retailShift.findFirst({ where: { companyId: await retailCompanyId() }, select: { id: true } }))?.id ?? null,
      expect: /RSH-\d{4}/,
    },
    {
      name: "One purchase order",
      path: (id) => `/retail/purchasing/orders/${id}`,
      find: async () =>
        (await db.retailPurchaseOrder.findFirst({ where: { companyId: await retailCompanyId() }, select: { id: true } }))?.id ?? null,
      expect: /Supplier|Order|Delta Beverages/i,
    },
  ]);
});

/* ── The school ───────────────────────────────────────────────────────── */

test.describe("School master-data records", () => {
  test.use({ tenant: SCHOOL, as: "head" });

  const schoolCompanyId = () => companyIdFor(SCHOOL.slug, SCHOOL.seed);

  sweepRecordTests([
    {
      name: "One class in master data",
      path: (id) => `/management/master-data/schools/classes/${id}`,
      find: async () =>
        (await db.schoolClass.findFirst({ where: { companyId: await schoolCompanyId() }, select: { id: true } }))?.id ?? null,
      expect: /on the roll/i,
    },
    {
      name: "One subject in master data",
      path: (id) => `/management/master-data/schools/subjects/${id}`,
      find: async () =>
        (await db.schoolSubject.findFirst({ where: { companyId: await schoolCompanyId() }, select: { id: true } }))?.id ?? null,
      expect: /take this subject/i,
    },
  ]);
});

/* ── The create routes that are dialogs ───────────────────────────────── */

/**
 * Four bookmarked "new" routes, each of which must arrive with its dialog open.
 *
 * From `app/gold/routes.ts`: every one redirects to its own list with
 * `?create=1`. Asserting the query and the dialog rather than the destination
 * is the difference between "the redirect still fires" and "the form is still
 * there" — and only the second is what a bookmark is for.
 */
test.describe("Gold create routes", () => {
  test.use({ tenant: GOLD, as: "admin" });

  for (const [path, lands] of [
    ["/gold/intake/pours/new", "/gold/intake/pours"],
    ["/gold/intake/purchases/new", "/gold/intake/purchases"],
    ["/gold/transit/dispatches/new", "/gold/transit/dispatches"],
    ["/gold/settlement/receipts/new", "/gold/settlement/receipts"],
  ] as const) {
    test(`Bookmarked ${path} opens its dialog`, async ({ page, console_ }) => {
      await visitSettled(page, path, { landsOn: lands });

      expect(
        new URL(page.url()).searchParams.get("create"),
        `${path} must arrive with ?create=1, or the dialog has nothing to open on`,
      ).toBe("1");
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15_000 });

      await expectHealthyPage(page, console_);
    });
  }
});
