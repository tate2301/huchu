import { test } from "./_support/fixtures";
import { CRM, GOLD, PAYROLL, RETAIL, SCHOOL } from "./_support/tenants";
import { shooter, VIEWPORT } from "./_support/shots";
import { visitSettled } from "./_support/nav";
import { expectHealthyPage } from "./_support/assert";

/**
 * Phase 4 — the screenshots, taken from the same fixtures the tests run on.
 *
 * The plan asks for images that could end up in front of a client or on a
 * marketing page (`docs/testing/e2e-plan-2026-09-01.md` §6). That is a higher
 * bar than a debug capture, and the constraint that makes it achievable is the
 * rule in `docs/demo-playbook/README.md`: **shoot the seeded tenants, never a
 * hand-made one.** A screenshot of a tenant somebody built by hand at eleven at
 * night shows three products and one customer, and no amount of cropping fixes
 * that. These five tenants have a year, a quarter or a term of trading behind
 * them, and they look like it.
 *
 * ## Why these assert as well as capture
 *
 * Every shot calls `expectHealthyPage` first. A marketing screenshot of a page
 * rendering `NaN` is worse than no screenshot — it is a lie that outlives the
 * bug, because nobody re-checks an image once it is in a deck. The check is
 * cheap, and it means a broken page fails the run instead of being
 * photographed.
 *
 * ## Output
 *
 * `docs/screenshots/<vertical>/<journey>/NN-name.png`, numbered in the order
 * taken so the directory reads as the journey. Override the root with
 * `SHOT_DIR`.
 *
 * ## Running it
 *
 *   pnpm start:e2e                              # production build, once
 *   npx playwright test e2e/marketing-shots.spec.ts
 *
 * Against `next dev` the images come out the same but the run takes an order of
 * magnitude longer, and the dev overlay can appear in a corner.
 */

test.describe.configure({ timeout: 900_000 });

/** One screen, one image. */
type Shot = { path: string; name: string };

/**
 * Photograph a list of screens for one tenant, as one Playwright test.
 *
 * One test per *journey* rather than per screen, unlike `sweepTests`. The
 * sweeps are diagnostics, where twenty separate verdicts are exactly what you
 * want when a route breaks. These are a deliverable: half a journey is not
 * useful, so there is nothing to gain from letting it partially succeed.
 */
function journey(
  title: string,
  vertical: string,
  slug: string,
  shots: readonly Shot[],
  viewport: { width: number; height: number } = VIEWPORT.desktop,
): void {
  test(title, async ({ page, console_ }) => {
    const shot = shooter(vertical, slug);
    await page.setViewportSize(viewport);

    for (const { path, name } of shots) {
      await visitSettled(page, path);
      await expectHealthyPage(page, console_);
      await shot(page, name);
    }

    console.log(`[shots] ${title} -> ${shot.dir}`);
  });
}

/* ── Retail: a bottle store in Harare ─────────────────────────────────── */

test.describe("retail", () => {
  test.use({ tenant: RETAIL, as: "manager" });

  journey("retail — the trading floor", "retail", "trading-floor", [
    { path: "/retail", name: "overview" },
    { path: "/retail/sales", name: "sales" },
    { path: "/retail/shifts", name: "shifts" },
    { path: "/retail/customers", name: "customers" },
  ]);

  journey("retail — range and stock", "retail", "range-and-stock", [
    { path: "/retail/catalog", name: "catalogue" },
    { path: "/retail/merchandising/pricing", name: "pricing" },
    { path: "/retail/merchandising/promotions", name: "promotions" },
    { path: "/retail/stock", name: "stock-on-hand" },
    { path: "/retail/stock/count", name: "stock-count" },
    { path: "/retail/purchasing/orders", name: "purchase-orders" },
  ]);

  journey("retail — what the owner reads", "retail", "reporting", [
    { path: "/retail/reports", name: "reports" },
  ]);
});

/* ── Schools: St Mary's, one term in ──────────────────────────────────── */

test.describe("schools", () => {
  test.use({ tenant: SCHOOL, as: "head" });

  journey("schools — the roll", "schools", "the-roll", [
    { path: "/schools", name: "overview" },
    { path: "/schools/students", name: "students" },
    { path: "/schools/classes", name: "classes" },
    { path: "/schools/teachers", name: "teachers" },
    { path: "/schools/guardians", name: "guardians" },
  ]);

  journey("schools — a term of teaching", "schools", "teaching", [
    { path: "/schools/attendance", name: "attendance" },
    { path: "/schools/attendance/follow-up", name: "absence-follow-up" },
    { path: "/schools/results", name: "results" },
    { path: "/schools/timetable", name: "timetable" },
    { path: "/schools/homework", name: "homework" },
  ]);

  journey("schools — the bursar's view", "schools", "fees", [
    { path: "/schools/finance", name: "finance-overview" },
    { path: "/schools/finance/ledger?view=invoices", name: "invoices" },
    { path: "/schools/finance/arrears", name: "arrears" },
    { path: "/schools/finance/receipts", name: "receipts" },
    { path: "/schools/fees", name: "fee-structures" },
  ]);
});

/* ── The portals, at the width they are actually used ─────────────────── */

test.describe("schools — parent portal, on a phone", () => {
  test.use({ tenant: SCHOOL, as: "parent" });

  journey(
    "schools — a parent checks fees",
    "schools",
    "parent-portal",
    [{ path: "/portal/parent", name: "parent-home" }],
    VIEWPORT.mobile,
  );
});

test.describe("schools — student portal, on a phone", () => {
  test.use({ tenant: SCHOOL, as: "student" });

  journey(
    "schools — a pupil checks their marks",
    "schools",
    "student-portal",
    [{ path: "/portal/student", name: "student-home" }],
    VIEWPORT.mobile,
  );
});

/* ── Gold: a quarter at the mine ──────────────────────────────────────── */

test.describe("gold", () => {
  test.use({ tenant: GOLD, as: "admin" });

  journey("gold — the chain of custody", "gold", "chain-of-custody", [
    { path: "/gold", name: "overview" },
    { path: "/gold/insights/allocations", name: "shift-allocations" },
    { path: "/gold/intake/pours", name: "pours" },
    { path: "/gold/transit/dispatches", name: "dispatches" },
    { path: "/gold/settlement/receipts", name: "buyer-receipts" },
  ]);

  journey("gold — money and control", "gold", "settlement", [
    { path: "/gold/prices", name: "price-curve" },
    { path: "/gold/settlement/approvals", name: "approvals" },
    { path: "/gold/settlement/payouts", name: "payouts" },
    // The exceptions board is the strongest single screen in the module: the
    // one that shows the product noticing something is wrong on its own.
    { path: "/gold/exceptions", name: "exceptions" },
    { path: "/gold/audit", name: "audit-trail" },
  ]);
});

/* ── CRM: a creative agency, a year in ────────────────────────────────── */

test.describe("crm", () => {
  test.use({ tenant: CRM, as: "owner" });

  journey("crm — the pipeline", "crm", "pipeline", [
    { path: "/crm", name: "overview" },
    { path: "/crm/leads", name: "leads" },
    { path: "/crm/deals", name: "deals" },
    { path: "/crm/companies", name: "companies" },
    { path: "/crm/people", name: "people" },
  ]);

  journey("crm — getting paid", "crm", "getting-paid", [
    { path: "/crm/quotes", name: "quotations" },
    { path: "/crm/invoices", name: "invoices" },
    { path: "/crm/receipts", name: "receipts" },
    { path: "/crm/collections", name: "collections" },
  ]);

  journey("crm — the week ahead", "crm", "the-week", [
    { path: "/crm/tasks", name: "tasks" },
    { path: "/crm/follow-ups", name: "follow-ups" },
    { path: "/crm/appointments", name: "appointments" },
    { path: "/crm/insights", name: "insights" },
  ]);
});

/* ── Accounting, payroll and HR ───────────────────────────────────────── */

test.describe("finance", () => {
  test.use({ tenant: PAYROLL, as: "admin" });

  journey("accounting — the books", "accounting", "the-books", [
    { path: "/accounting", name: "overview" },
    { path: "/accounting/chart-of-accounts", name: "chart-of-accounts" },
    { path: "/accounting/journals", name: "journals" },
    { path: "/accounting/trial-balance", name: "trial-balance" },
    { path: "/accounting/financial-statements", name: "financial-statements" },
  ]);

  journey("accounting — who owes whom", "accounting", "receivables-payables", [
    { path: "/accounting/receivables", name: "receivables" },
    { path: "/accounting/payables", name: "payables" },
    { path: "/accounting/banking", name: "banking" },
    // Zimbabwe-specific and worth showing: nobody else's demo has this screen.
    { path: "/accounting/fiscalisation", name: "fiscalisation" },
  ]);

  journey("payroll — a month end", "payroll", "month-end", [
    // Not `/payroll` — it has no page of its own, only children. Runs is the
    // screen a bureau actually opens first anyway.
    { path: "/payroll/runs", name: "runs" },
    { path: "/payroll/salaries", name: "salaries" },
    { path: "/payroll/disbursements", name: "disbursements" },
    { path: "/payroll/statutory", name: "statutory" },
  ]);

  journey("hr — the people behind it", "hr", "people", [
    { path: "/people", name: "overview" },
    { path: "/people/attendance", name: "attendance" },
    { path: "/people/leave", name: "leave" },
    { path: "/people/rosters", name: "rosters" },
  ]);
});
