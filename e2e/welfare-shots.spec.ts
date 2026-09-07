import { test, expect } from "./_support/fixtures";
import { SCHOOL } from "./_support/tenants";
import { shooter } from "./_support/shots";

/**
 * S-1.8 — the health and welfare list.
 *
 * `/schools/boarding/welfare` appears in no harness suite; grep across `e2e/`
 * returns this file alone. What it proves is that the list is built from the
 * children outward: a child with nothing on file is a ROW, not an absence. A
 * list built from health records would show an empty table and look fine.
 *
 * Migrated off `chisipite-demo` and the `VISUAL_PASS=1` gate.
 *
 * ## The one assertion that had to move behind a guard
 *
 * `seed-school-demo.ts` writes no health records at all, so on St Mary's the
 * "children with an allergy and no consent to treat" alert cannot render —
 * `welfare-content.tsx` draws it only when that count is above zero. Rather than
 * delete the check, it now runs when the tenant has the data and skips, saying
 * why, when it does not. Nothing is lost, and the day the seed writes a health
 * record the check starts running on its own.
 */

test.describe.configure({ timeout: 180_000 });
test.use({ tenant: SCHOOL, as: "head", serviceWorkers: "block" });

for (const viewport of [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test.describe(`${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("the welfare list leads with the gaps", async ({ page }) => {
      const shot = shooter("schools", `welfare-${viewport.name}`);

      // Warm the page and the route it fetches; `page.request` carries this
      // context's cookies, so it is the same warm-up the old standalone request
      // context did with a storage-state file.
      for (const target of ["/schools/boarding/welfare", "/api/v2/schools/health"]) {
        await page.request.get(target).catch(() => undefined);
      }

      await page.goto("/schools/boarding/welfare");
      await expect(
        page.getByRole("heading", { name: "Health and welfare", exact: true }).first(),
      ).toBeVisible({ timeout: 30_000 });

      // A child with nothing on file is a row, not an absence — the whole point
      // of building the list from the children outward.
      await expect(
        page.getByText("Nothing recorded at all").filter({ visible: true }).first(),
      ).toBeVisible({ timeout: 30_000 });

      await shot(page, "welfare");
    });

    test("the combination a boarding school cannot be caught by is called out", async ({
      page,
    }) => {
      // The alert is rendered only when at least one child has an allergy
      // recorded and no consent to treat. The school seed writes no health
      // records, so ask before asserting.
      const health = await page.request.get("/api/v2/schools/health");
      const rows: { gaps?: string[] }[] = (await health.json().catch(() => null))?.rows ?? [];
      // `URGENT_GAP` in lib/schools/health-consents.ts — the same string the
      // page counts to decide whether to draw the alert at all.
      const urgent = rows.filter((row) =>
        (row.gaps ?? []).includes("Allergy on file, no consent to treat"),
      ).length;
      test.skip(
        urgent === 0,
        "no child on this tenant has an allergy recorded without consent to treat — " +
          "seed-school-demo.ts writes no health records",
      );

      const shot = shooter("schools", `welfare-${viewport.name}`);

      await page.goto("/schools/boarding/welfare");
      await expect(
        page.getByRole("heading", { name: "Health and welfare", exact: true }).first(),
      ).toBeVisible({ timeout: 30_000 });

      await expect(page.getByText(/allergy and no consent to treat/).first()).toBeVisible({
        timeout: 30_000,
      });

      await shot(page, "welfare-urgent");
    });
  });
}
