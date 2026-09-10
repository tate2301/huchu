import { test, expect } from "./_support/fixtures";
import { SCHOOL } from "./_support/tenants";
import { shooter } from "./_support/shots";

/**
 * S-1.5 — the year roll-up.
 *
 * `/schools/students/roll-up` appears in no harness suite; grep across `e2e/`
 * returns this file alone. Kept and migrated for that reason: the assertion
 * below is not that the page loads but that it is *reviewable* — a per-child
 * outcome row, rather than a summary that says 119 pupils will move up and
 * shows you none of them.
 *
 * Migrated off `chisipite-demo` and the `VISUAL_PASS=1` gate. Both assertions
 * survive the move: pupils and classes are what `seed-school-demo.ts` writes
 * most of.
 */

test.describe.configure({ timeout: 180_000 });
test.use({ tenant: SCHOOL, as: "head", serviceWorkers: "block" });

for (const viewport of [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test.describe(`${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("the roll-up shows every child and what would happen to them", async ({
      page,
    }) => {
      const shot = shooter("schools", `year-rollup-${viewport.name}`);

      /*
        Warm the page and the two routes it fetches before measuring anything.

        `next dev` compiles on first request and the API compiles on the
        client's first fetch, so the phone run reached both cold. A 400 for
        missing parameters is fine — the point is that the route is built.
        `page.request` shares this context's cookies, which is what the old
        standalone `request.newContext({ storageState })` was for.
      */
      for (const target of [
        "/schools/students/roll-up",
        "/api/v2/schools/year-rollup",
        "/api/v2/schools/terms?limit=50",
      ]) {
        await page.request.get(target).catch(() => undefined);
      }

      await page.goto("/schools/students/roll-up");
      await expect(
        page.getByRole("heading", { name: "Roll up the year", exact: true }).first(),
      ).toBeVisible({ timeout: 30_000 });

      // A per-child row, not just the summary — the point of the screen is that
      // it is reviewable.
      await expect(page.getByText(/Move up|Repeat the year|Leaving/).first()).toBeVisible({
        timeout: 30_000,
      });

      await shot(page, "year-rollup");
    });
  });
}
