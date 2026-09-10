import { test, expect } from "./_support/fixtures";
import { portalSignIn, signIn } from "./_support/auth";
import { SCHOOL } from "./_support/tenants";
import { expectHealthyPage } from "./_support/assert";
import { visitSettled } from "./_support/nav";

/*
  Three minutes, not one. Next compiles each route on first request in dev, and
  the portal routes are cold: the server log measured /portal/student/login at
  19.5s to compile the first time it was asked for. A 60s ceiling turns that
  into "the portal cannot be signed into", which is the most misleading thing
  this file could say. This is not a performance target — it is a refusal to
  report a compile as a failure.

  `describe.configure`, not `test.setTimeout`: the latter only does anything
  called from inside a test body, so at module scope it silently left the
  ceiling at 60s — which is exactly how this was first mis-diagnosed.
*/
test.describe.configure({ timeout: 180_000 });

/**
 * The school and its three portals, proved reachable.
 *
 * Phase 2.4's exit gate. Not the school suite — that is Phase 3.2 — but the
 * thing that has to be true before any of it can be written: that the seed
 * produced a school somebody can sign into, from four different directions, on
 * four different nominated hosts.
 *
 * The portal half is the part that has never been possible before. There were
 * no portal accounts in any tenant on this database, so `student-portal-shots`
 * and its siblings could only ever photograph a login screen.
 */

test.describe("the school itself", () => {
  test.use({ tenant: SCHOOL });

  test("the roll, the register and the fees are all populated", async ({ page, console_ }) => {
    await signIn(page, SCHOOL, "head");

    await visitSettled(page, "/schools/students");
    // Admission numbers, not student numbers: the roll displays `ADM-0007`.
    // `STU-0007` is the internal key and never reaches the page.
    await expect(page.locator("body")).toContainText(/ADM-\d+/, { timeout: 20_000 });
    await expect(page.locator("body")).toContainText("Boarders", { timeout: 20_000 });
    await expectHealthyPage(page, console_);

    await visitSettled(page, "/schools/attendance");
    await expectHealthyPage(page, console_);

    // `/schools/finance/invoices` is a redirect, not a page — the invoice list
    // lives on the ledger behind a view parameter. Asking for the redirect works
    // in a browser and makes a poor assertion target, because the navigation is
    // still in flight when the text check starts.
    await visitSettled(page, "/schools/finance/ledger?view=invoices");
    await expect(page.locator("body")).toContainText(/SFI-\d+/, { timeout: 30_000 });
    await expectHealthyPage(page, console_);
  });
});

test.describe("student portal", () => {
  test.use({ tenant: SCHOOL, portal: "student" });

  test("a pupil can sign in", async ({ page, console_ }) => {
    await portalSignIn(page, SCHOOL, "student", "student");
    await expect(page).toHaveURL(/\/portal\/student/);
    await expectHealthyPage(page, console_);
  });
});

test.describe("parent portal", () => {
  test.use({ tenant: SCHOOL, portal: "parent" });

  test("a guardian can sign in", async ({ page, console_ }) => {
    await portalSignIn(page, SCHOOL, "parent", "parent");
    await expect(page).toHaveURL(/\/portal\/parent/);
    await expectHealthyPage(page, console_);
  });
});

test.describe("teacher portal", () => {
  test.use({ tenant: SCHOOL, portal: "teacher" });

  test("a teacher can sign in", async ({ page, console_ }) => {
    await portalSignIn(page, SCHOOL, "teacher", "teacher");
    await expect(page).toHaveURL(/\/portal\/teacher/);
    await expectHealthyPage(page, console_);
  });
});
