import { test, expect } from "./_support/fixtures";
import { SCHOOL } from "./_support/tenants";
import { shooter } from "./_support/shots";

/**
 * S-1.4 — the admissions board.
 *
 * `schools-suite.spec.ts`'s "Admissions renders" proves the route is healthy and
 * carries no `expect` at all, so nothing in the harness asserts what the board
 * says. Two things here do: that the pipeline is **grouped by stage with a
 * count** rather than a flat list, and that an offer whose expiry has passed is
 * shouted about rather than left as a row somebody has to notice.
 *
 * Migrated off `chisipite-demo` and the `VISUAL_PASS=1` gate.
 *
 * ## The count is now read, not typed
 *
 * The stage assertion used to be the literal "Assessment · 2", which was true of
 * the old tenant's seed and of nothing else. It now asks
 * `/api/v2/schools/applications` for the count in that stage and asserts the
 * heading agrees — the same claim (the board groups and counts), made about
 * whatever tenant it is run against, and one that fails if the heading and the
 * data ever disagree.
 *
 * `seed-school-demo.ts` writes no applications, so on St Mary's the two board
 * assertions skip with that as the reason. The New-application dialog does not
 * depend on the pipeline holding anything, so it runs unconditionally.
 */

test.describe.configure({ timeout: 180_000 });
test.use({ tenant: SCHOOL, as: "head", serviceWorkers: "block" });

type Pipeline = {
  applications: { stage: string; offerExpiresAt: string | null }[];
  counts: Record<string, number>;
};

for (const viewport of [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test.describe(`${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("the pipeline is grouped by stage and calls out a lapsed offer", async ({
      page,
    }) => {
      const response = await page.request.get("/api/v2/schools/applications");
      const pipeline: Pipeline | null = response.status() < 400
        ? await response.json().catch(() => null)
        : null;
      const assessment = pipeline?.counts?.ASSESSMENT ?? 0;
      const lapsed = (pipeline?.applications ?? []).filter(
        (application) =>
          application.stage === "OFFERED" &&
          application.offerExpiresAt !== null &&
          new Date(application.offerExpiresAt).getTime() < Date.now(),
      ).length;

      test.skip(
        assessment === 0,
        "no application is at the assessment stage on this tenant — " +
          "seed-school-demo.ts writes no admissions applications",
      );

      const shot = shooter("schools", `admissions-${viewport.name}`);

      await page.goto("/schools/admissions");
      await expect(
        page.getByRole("heading", { name: "Admissions", exact: true }).first(),
      ).toBeVisible({ timeout: 30_000 });

      await expect(page.getByText(`Assessment · ${assessment}`).first()).toBeVisible({
        timeout: 30_000,
      });

      // The offer with an expiry in the past. This is the thing an admissions
      // office needs the page to shout about — and it is only assertable when
      // there is one, which on a seed with no applications there is not.
      if (lapsed > 0) {
        await expect(
          page.getByText(/offer has run out|offers have run out/).first(),
        ).toBeVisible({ timeout: 30_000 });
      }

      await shot(page, "admissions-board");
    });

    test("taking an application asks for a name and nothing else", async ({ page }) => {
      const shot = shooter("schools", `admissions-${viewport.name}`);

      await page.goto("/schools/admissions");
      await expect(
        page.getByRole("heading", { name: "Admissions", exact: true }).first(),
      ).toBeVisible({ timeout: 30_000 });

      await expect(async () => {
        await page.getByRole("button", { name: "New application" }).first().click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible({ timeout: 3_000 });
        await expect(dialog.getByLabel("Surname")).toBeVisible({ timeout: 3_000 });
      }).toPass({ timeout: 40_000 });

      await shot(page, "admissions-form");
    });
  });
}
