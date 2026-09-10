import { test, expect } from "./_support/fixtures";
import { signIn } from "./_support/auth";
import { PAYROLL, RETAIL } from "./_support/tenants";
import { expectHealthyPage } from "./_support/assert";
import { visitSettled } from "./_support/nav";

/**
 * The Phase 0 exit gate, as a test rather than a memory.
 *
 * Everything the rest of the suite assumes is true is asserted here, so when a
 * vertical's specs all fail at once this file says whether the cause is the
 * vertical or the plumbing:
 *
 *   - the dev server is on the e2e database, not Neon
 *   - host nomination works, so one origin can be several tenants
 *   - each seeded tenant resolves to *itself* and not to the origin's tenant
 *   - a real person can sign in and land on a working page
 *
 * `docs/testing/e2e-plan-2026-09-01.md` §2, step 0.6.
 */

test.describe("retail tenant", () => {
  test.use({ tenant: RETAIL });

  test("resolves, signs in, and shows a shop that has been trading", async ({
    page,
    console_,
  }) => {
    await page.goto("/login");
    // The nominated host decides the tenant, so the login page should greet us
    // by the shop's name — not the origin's, and not a generic fallback.
    await expect(page.locator("body")).toContainText(RETAIL.name, { timeout: 20_000 });

    await signIn(page, RETAIL, "manager");

    await visitSettled(page, "/retail");
    await expect(page).toHaveURL(/\/retail/);
    await expectHealthyPage(page, console_);
  });
});

test.describe("payroll tenant", () => {
  test.use({ tenant: PAYROLL });

  test("is a different tenant from the same origin", async ({ page, console_ }) => {
    await page.goto("/login");
    // Same origin as the retail test above. If nomination were not working this
    // would say ACME Inc, and that failure is the whole point of the assertion.
    await expect(page.locator("body")).toContainText(PAYROLL.name, { timeout: 20_000 });
    await expect(page.locator("body")).not.toContainText(RETAIL.name);

    await signIn(page, PAYROLL, "admin");

    await visitSettled(page, "/payroll/runs");
    await expect(page).toHaveURL(/\/payroll/);
    await expectHealthyPage(page, console_);
  });
});
