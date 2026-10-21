import { expect, test } from "@playwright/test";

/** W7: Needs you for an ownership offer, the invite link and the fixture failure boards. Corelith at the w4 stage, signed in as Sean. */
test.describe("teams W7", () => {
  test("the failure boards are served in development", async ({ page }) => {
    for (const board of ["W4-F-failures", "W2-F-failures", "W7-F-failures"]) {
      await page.goto(`/design/${board}`);
      await expect(page.locator(".wp-cell__t").first()).toBeVisible();
    }
  });

  test.describe("signed in", () => {
    test.skip(!process.env.TEAMS_E2E, "set TEAMS_E2E with a signed-in Corelith session");

    test("the owner turns an invite link on and sees the address once", async ({ page }) => {
      await page.goto("/preferences/organization/invite-link");
      await page.getByRole("button", { name: "Turn on" }).first().click();
      await expect(page.locator(".wp-link")).toContainText("/join/");
    });
  });
});
