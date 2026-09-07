import { test, expect } from "./_support/fixtures";
import { GOLD } from "./_support/tenants";
import { sweepTests, type Route } from "./_support/sweep";
import { expectHealthyPage } from "./_support/assert";
import { visitSettled } from "./_support/nav";

/**
 * Stores, maintenance, compliance and the reporting shelf — the mine's back office.
 *
 * Thirty-seven pages at **zero** coverage between them. They are swept on the
 * gold tenant because that is the vertical that owns them: `demo-focus` leaves
 * `stores.*`, `maintenance.*`, `reports.*` and `compliance.*` switched on for
 * Huchu Enterprises and switches them off for everybody else, so this is the
 * only fixture that can reach them at all.
 *
 * ## What this sweep can and cannot prove
 *
 * Most of these screens render an **empty state**, and honestly so: the gold
 * seed writes shifts, pours, dispatches and receipts, and writes no stock, no
 * equipment, no permits and no work orders. So the assertion for those routes
 * is the empty state's own words, and the value is the other bars in
 * `_support/sweep.ts` — it arrives, it does not throw, it does not hydrate
 * wrong, and it renders no `NaN` where a total belongs. That last one is not
 * nothing on a page whose totals are all zero: `0` and `NaN` look similar in a
 * screenshot and behave very differently in a sum.
 *
 * The seed gap is recorded in `docs/testing/e2e-status.md`. Filling it would
 * upgrade roughly twenty of these assertions from "the empty state is correct"
 * to "the figures are correct", which is where they should end up.
 *
 * ## Fuel is billable, and this tenant has not bought it
 *
 * `stores.fuel-ledger` and `reports.fuel-ledger` are addons — `defaultEnabled:
 * false, isBillable: true` in the feature catalogue — and Huchu's plan does not
 * include them. Both routes are therefore `blocked`, which turns two red lines
 * into two assertions that the paywall holds.
 */

test.describe.configure({ timeout: 900_000 });
test.use({ tenant: GOLD, as: "admin" });

const STORES: readonly Route[] = [
  {
    path: "/stores",
    name: "Stores index",
    redirectsTo: "/stores/dashboard",
    expect: /Nothing in stock yet/i,
  },
  { path: "/stores/dashboard", name: "Stores dashboard", expect: /Nothing in stock yet/i },
  { path: "/stores/inventory", name: "Stock on hand", expect: /Stock on Hand/i },
  { path: "/stores/locations", name: "Stock locations", expect: /No stock locations yet/i },
  { path: "/stores/movements", name: "Stock movements", expect: /Nothing has moved yet/i },
  {
    path: "/stores/catalogue",
    name: "Shared catalogue",
    expect: /One catalogue, shared with Stock & Inventory and Retail/i,
  },
  { path: "/stores/price-lists", name: "Price lists", expect: /What things cost, per list/i },
  // Both are dialogs on the movement log now, by design — see the docstrings
  // on the two route stubs. The dialogs themselves are asserted at the bottom.
  {
    path: "/stores/issue",
    name: "Issue stock",
    redirectsTo: "/stores/movements",
    expect: /Nothing has moved yet/i,
  },
  {
    path: "/stores/receive",
    name: "Receive stock",
    redirectsTo: "/stores/movements",
    expect: /Nothing has moved yet/i,
  },
  { path: "/stores/fuel", name: "Fuel log", blocked: true },
];

const MAINTENANCE: readonly Route[] = [
  {
    path: "/maintenance",
    name: "Maintenance command centre",
    expect: /Maintenance Command Center/i,
  },
  { path: "/maintenance/equipment", name: "Equipment register", expect: /Equipment Register/i },
  {
    path: "/maintenance/work-orders",
    name: "Work orders",
    expect: /No work orders logged for this site/i,
  },
  {
    path: "/maintenance/breakdown",
    name: "Log a breakdown",
    expect: /Capture equipment downtime and create a work order/i,
  },
  {
    path: "/maintenance/schedule",
    name: "PM schedule",
    expect: /Upcoming preventive maintenance windows/i,
  },
];

const COMPLIANCE: readonly Route[] = [
  {
    path: "/compliance",
    name: "Compliance index",
    redirectsTo: "/compliance/permits",
    expect: /Track permit status, expiry windows, and ownership by site/i,
  },
  {
    path: "/compliance/permits",
    name: "Permits",
    expect: /Track permit status, expiry windows, and ownership by site/i,
  },
  {
    path: "/compliance/inspections",
    name: "Inspections",
    expect: /Manage inspections, due actions, and completion/i,
  },
  {
    path: "/compliance/incidents",
    name: "Incidents",
    expect: /Log incidents, severity trends, and mitigation updates/i,
  },
  {
    path: "/compliance/training",
    name: "Training records",
    expect: /Monitor training records, expiries, and certificate evidence/i,
  },
];

const REPORTS: readonly Route[] = [
  { path: "/reports", name: "Reports shelf", expect: /Shift Reports/i },
  /*
    The three that read real seeded data, and the reason this list is worth
    more than a smoke test. 154 shift allocations, 6 pours and 4 buyer receipts
    are behind them, so the assertions name the seeded records rather than the
    chrome around them.
  */
  { path: "/reports/shift", name: "Shift reports", expect: /APPROVED/ },
  { path: "/reports/gold-chain", name: "Gold chain of custody", expect: /BAR-\d{4}/ },
  { path: "/reports/gold-receipts", name: "Gold receipts", expect: /FPR-\d{6}/ },
  { path: "/reports/plant", name: "Plant reports", expect: /No plant reports for this range/i },
  {
    path: "/reports/attendance",
    name: "Attendance report",
    expect: /No attendance records for this range/i,
  },
  { path: "/reports/downtime", name: "Downtime analytics", expect: /No downtime recorded/i },
  { path: "/reports/audit-trails", name: "Audit trails", expect: /audit events/i },
  { path: "/reports/compliance-incidents", name: "Incident report", expect: /incident records/i },
  {
    path: "/reports/maintenance-equipment",
    name: "Equipment service report",
    expect: /equipment records/i,
  },
  {
    path: "/reports/maintenance-work-orders",
    name: "Work order report",
    expect: /work orders/i,
  },
  {
    path: "/reports/stores-movements",
    name: "Stock movement report",
    expect: /movement records/i,
  },
  { path: "/reports/fuel-ledger", name: "Fuel ledger report", blocked: true },
];

const DAILY: readonly Route[] = [
  /*
    The two forms the mine fills in every day, and the dashboard they feed.
    `ops.shift-report.submit` and `ops.plant-report.submit` are the keys — the
    payroll bureau has both switched off, which is why they are swept here.
  */
  { path: "/shift-report", name: "Shift report form", expect: /Shift Entry Form/i },
  { path: "/plant-report", name: "Plant report form", expect: /Plant Entry Form/i },
  { path: "/dashboard", name: "Production dashboard", expect: /TONNES PROCESSED/i },
  { path: "/status", name: "Implementation status", expect: /Current Phase/i },
  { path: "/help", name: "Quick tips", expect: /Quick Tips/i },
  {
    // The last master-data screen that is not a school's. Reached from here
    // because the gold room is the only place that books against these codes.
    path: "/management/master-data/operations/gold-expense-types",
    name: "Gold expense types",
    expect: /What gold-room spending can be booked against/i,
  },
];

sweepTests([...STORES, ...MAINTENANCE, ...COMPLIANCE, ...REPORTS, ...DAILY]);

/**
 * The two dialog routes open their dialog, not just the page behind it.
 *
 * `/stores/issue` and `/stores/receive` redirect to `/stores/movements` with
 * `?record=issue` / `?record=receive`, and the whole point of keeping the
 * routes is that a bookmark still lands you in the form. A redirect that drops
 * the query — or a movement log that ignores it — leaves somebody staring at a
 * list wondering where the button went, and the sweep above would not notice:
 * the page it lands on is perfectly healthy.
 */
for (const action of ["issue", "receive"] as const) {
  test(`Bookmarked /stores/${action} opens its dialog`, async ({ page, console_ }) => {
    await visitSettled(page, `/stores/${action}`, { landsOn: "/stores/movements" });

    expect(
      new URL(page.url()).searchParams.get("record"),
      `/stores/${action} must arrive with ?record=${action}, or the dialog has nothing to open on`,
    ).toBe(action);
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15_000 });

    await expectHealthyPage(page, console_);
  });
}
