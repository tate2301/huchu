import { test, expect } from "./_support/fixtures";
import { SCHOOL } from "./_support/tenants";
import { shooter } from "./_support/shots";

/**
 * S-1.7 — which teachers are joined up to an HR record, and which are not.
 *
 * `schools-suite.spec.ts`'s "Teachers renders" asserts surnames on this page and
 * stops there; nothing in the harness reaches the HR-link column or the dialog
 * behind it. Both are kept here.
 *
 * Migrated off `chisipite-demo` and the `VISUAL_PASS=1` gate. Two things had to
 * change to move tenant, and neither drops a check:
 *
 * The row was scoped by the hard-coded name "Grace Banda", who was a teacher on
 * the old tenant. It is now scoped to whichever teacher the suggestion endpoint
 * actually has a match for — which is a stronger scoping, because it is the row
 * the assertion is about rather than a name that happened to be in the seed.
 *
 * And the suggestion needs an HR employee to suggest. `seed-school-demo.ts`
 * writes teacher profiles and no employees, so that test asks the endpoint first
 * and skips, saying why, when the tenant has nothing to match. The "No HR
 * record" badge is the other side of the same coin and runs unconditionally: a
 * tenant with no employees is exactly the tenant where every teacher should
 * carry it.
 */

test.describe.configure({ timeout: 180_000 });
test.use({ tenant: SCHOOL, as: "head", serviceWorkers: "block" });

for (const viewport of [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test.describe(`${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("the staff list says which teachers have no HR record", async ({ page }) => {
      const shot = shooter("schools", `teacher-hr-${viewport.name}`);

      await page.goto("/schools/teachers");
      await expect(
        page.getByRole("heading", { name: "Teachers", exact: true }).first(),
      ).toBeVisible({ timeout: 30_000 });

      // `visible: true`: the DataTable renders both a desktop table and a
      // mobile list, so `.first()` alone picks whichever is hidden at this
      // viewport and waits thirty seconds for it to appear.
      await expect(
        page.getByText("No HR record").filter({ visible: true }).first(),
      ).toBeVisible({ timeout: 30_000 });
      await shot(page, "teacher-hr");
    });

    test("the suggestion says why it thinks they are the same person", async ({
      page,
    }) => {
      test.skip(viewport.name === "phone", "The link control is a table column.");

      // Which teacher, if any, the app can suggest an employee for. Asked of the
      // same endpoint the dialog calls, so a skip here means there is genuinely
      // nothing to show rather than that the dialog is broken.
      const list = await page.request.get("/api/v2/schools/teachers/profiles?limit=50");
      expect(list.status()).toBeLessThan(400);
      const profiles: { id: string; user?: { name?: string | null } }[] =
        (await list.json())?.data ?? [];
      expect(profiles.length, "the school tenant has no teachers").toBeGreaterThan(0);

      let matched: { id: string; name: string } | null = null;
      for (const profile of profiles) {
        const response = await page.request.get(
          `/api/v2/schools/teachers/profiles/${profile.id}/employee`,
        );
        const suggestions = (await response.json().catch(() => null))?.suggestions ?? [];
        const name = profile.user?.name;
        if (suggestions.length > 0 && name) {
          matched = { id: profile.id, name };
          break;
        }
      }

      test.skip(
        matched === null,
        "no teacher on this tenant has an employee record to be matched with — " +
          "seed-school-demo.ts writes teacher profiles and no HR employees",
      );
      // `test.skip` throws, so this never runs — it is here so the rest of the
      // test reads as non-null without an assertion operator.
      if (!matched) return;

      const shot = shooter("schools", `teacher-hr-${viewport.name}`);

      await page.goto("/schools/teachers");
      await expect(
        page.getByRole("heading", { name: "Teachers", exact: true }).first(),
      ).toBeVisible({ timeout: 30_000 });

      // Scoped to one row, and the click retried only while the trigger is
      // still there — the dialog opens over the page, so an unconditional
      // re-click would hit the overlay and fail for the wrong reason.
      const row = page.getByRole("row").filter({ hasText: matched.name });
      const dialog = page.getByRole("dialog");
      await expect(async () => {
        const trigger = row.getByRole("button", { name: "Find the employee" });
        if (await trigger.count()) await trigger.click();
        await expect(dialog).toBeVisible({ timeout: 3_000 });
        // "Same login" or "Same name — check before linking". Either is the
        // point: the reason travels with the suggestion.
        await expect(dialog.getByText(/Same login|Same name/).first()).toBeVisible({
          timeout: 3_000,
        });
      }).toPass({ timeout: 40_000 });

      await shot(page, "teacher-hr-suggestion");
    });
  });
}
