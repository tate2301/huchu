import { expect, test } from "@playwright/test";

/** W2: asking for a seat, adding it, and joining from the invite. Needs Corelith at the w2 stage (scripts/seed-teams-members.ts --stage w2), signed in as Sean. */
test.describe("teams W2 seat and join", () => {
  test.skip(!process.env.TEAMS_E2E, "set TEAMS_E2E with a signed-in Corelith session");

  test("the owner sees the request in Needs you and adds the seat", async ({ page }) => {
    await page.goto("/activity");
    await expect(page.getByText("asked for a seat for")).toBeVisible();
    await page.getByRole("button", { name: "Add the seat" }).click();
    await expect(page.getByRole("status")).toContainText("Seat added");
  });

  test("a join page that is not an invite falls back to the staff card", async ({ page }) => {
    await page.goto("/join/not-an-invite");
    await expect(page.getByText("Join Corelith")).toHaveCount(0);
  });
});
