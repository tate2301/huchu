import { expect, test } from "@playwright/test";

/** W4: Members and a member's page. Needs the Corelith workspace at the w4 stage (scripts/seed-teams-members.ts --stage w4). */
test.describe("teams W4 members", () => {
  test.skip(!process.env.TEAMS_E2E, "set TEAMS_E2E with a signed-in Corelith session");

  test("the list shows six of six seats and the way to ask for more", async ({ page }) => {
    await page.goto("/preferences/organization/users");
    await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
    await expect(page.getByText("6 of 6 seats used")).toBeVisible();
    await expect(page.getByText("Simbarashe Mudonhi")).toBeVisible();
  });

  test("a person's page sets a permission in a sentence and suspends with undo", async ({ page }) => {
    await page.goto("/preferences/organization/users");
    await page.getByText("Simbarashe Mudonhi").click();
    await page.getByRole("button", { name: "Denied" }).first().click();
    await expect(page.getByText(/denied Simbarashe/)).toBeVisible();
    await page.getByRole("button", { name: "Suspend" }).last().click();
    await page.getByRole("dialog").getByRole("button", { name: "Suspend" }).click();
    await expect(page.getByRole("status")).toContainText("is suspended");
  });
});
