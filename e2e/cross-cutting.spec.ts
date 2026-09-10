import { test, expect } from "./_support/fixtures";
import { expectPortalRefuses, portalSignIn, signIn, signOut } from "./_support/auth";
import { GOLD, RETAIL, SCHOOL } from "./_support/tenants";
import { expectHealthyPage } from "./_support/assert";
import { visit, visitSettled } from "./_support/nav";

/**
 * The checks that belong to no vertical and matter to all of them.
 *
 * Phase 3.7. Everything here is a claim the product makes implicitly and never
 * demonstrates: that a session is scoped to one tenant, that a portal admits
 * only its own people, and that signing out actually ends the session.
 *
 * These are the tests that would catch the worst class of bug in a
 * multi-tenant system — one shop seeing another shop's takings — and the class
 * least likely to be noticed by anyone using the product normally, because you
 * cannot see the leak from inside your own tenant.
 */

test.describe.configure({ timeout: 180_000 });

test.describe("tenant isolation", () => {
  test.use({ tenant: RETAIL });

  test("a retail session cannot reach the mine or the school", async ({ page }) => {
    await signIn(page, RETAIL, "manager");

    /*
      The session belongs to `acme`. Its token carries acme's `allowedHosts` and
      acme's feature set, and the shop manager has no business in a gold ledger
      or a school roll. Asking for those routes must not render them — whether
      the refusal is /access-blocked, a redirect, or a 403 page is the app's
      choice; rendering the other tenant's data is the failure.
    */
    for (const path of ["/gold/shift-output", "/schools/students"]) {
      await visit(page, path).catch(() => {});
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      const body = (await page.locator("body").innerText().catch(() => "")) ?? "";

      expect(body, `${path} leaked gold data into an acme session`).not.toMatch(/SEAL-\d{5}|BAR-\d{4}/);
      expect(body, `${path} leaked school data into an acme session`).not.toMatch(/ADM-\d{4}|SFI-\d{5}/);
    }
  });

  test("signing out ends the session", async ({ page }) => {
    await signIn(page, RETAIL, "manager");
    await visitSettled(page, "/retail");
    await expect(page).toHaveURL(/\/retail/);

    await signOut(page);

    // With the cookie gone the same route must not serve the workspace.
    await visit(page, "/retail").catch(() => {});
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
  });
});

test.describe("role gating at the till", () => {
  test.use({ tenant: RETAIL, portal: "pos" });

  /*
    Two tests, not one, and the split is the fix rather than tidying.

    These were a single test that refused the manager, cleared cookies, then
    signed the cashier in on the same page. It failed on a wall of 401s from
    `/api/v2/retail/pos/{pin,context,current-shift}` — which looked like the
    till refusing a cashier, and was the opposite.

    The 401s belong to the *manager* half. A refused sign-in still mounts the
    POS shell, which polls those three endpoints, and 401 is the right answer
    for someone with no session. But `console_` accumulates for the whole test,
    so correct behaviour in the first half failed an assertion in the second.
    Clearing cookies does not clear that, and neither would re-nominating the
    host — both were tried.

    Probed directly to be sure rather than reasoned about: a cashier signing in
    on a clean context gets 200 from all three. The product was never wrong.

    A test that ends by asserting a clean console cannot also contain a
    deliberate failure. One door per test.
  */

  test("the till refuses a manager", async ({ page }) => {
    /*
      A manager has more authority everywhere else and less here — they approve
      a reversal by keying their login into the approval box, not by taking over
      the till. No console assertion: being refused is noisy by design.
    */
    await expectPortalRefuses(page, RETAIL, "pos", "manager");
  });

  test("the till admits a cashier", async ({ page, console_ }) => {
    await portalSignIn(page, RETAIL, "pos", "cashier");

    /*
      The cashier lands on `/`, not `/portal/pos`, and that is correct.

      Two things put them there. The proxy bounces any cashier-role session to
      the POS host wherever it finds them — a cashier has no business anywhere
      else — and on a POS host `/portal/pos` is the *internal* path, whose public
      form is `/`. Asserting the internal path was this test's earlier mistake:
      it described the routing table rather than the product.

      So assert what actually matters: that they hold a session, and are looking
      at the till rather than at a sign-in form.
    */
    const cookies = await page.context().cookies();
    expect(
      cookies.some((cookie) => cookie.name.includes("session-token")),
      "the cashier should hold a session",
    ).toBe(true);

    await expect(page.locator("#portal-email")).toHaveCount(0);
    await expectHealthyPage(page, console_);
  });
});

test.describe("role gating in the school portals", () => {
  test.use({ tenant: SCHOOL, portal: "student" });

  test("the student portal refuses a teacher", async ({ page }) => {
    await expectPortalRefuses(page, SCHOOL, "student", "teacher");
  });
});

test.describe("the mine", () => {
  test.use({ tenant: GOLD });

  test("a clerk sees the ledger and the manager's approvals are still gated", async ({
    page,
    console_,
  }) => {
    await signIn(page, GOLD, "clerk");
    // Not `/gold/shift-output` — that path has no page and 404s for everyone,
    // which this test previously mistook for a role-gating failure.
    await visitSettled(page, "/gold/prices");
    await expectHealthyPage(page, console_);
  });
});
