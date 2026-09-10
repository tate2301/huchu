import { test, expect } from "./_support/fixtures";
import { SCHOOL } from "./_support/tenants";
import { shooter } from "./_support/shots";

/**
 * S-1.6 — the bed board.
 *
 * `schools-suite.spec.ts` sweeps `/schools/boarding` and
 * `/schools/boarding/hostels`, both without an `expect`; no suite opens a hostel
 * record. What this asserts is the thing that made the screen worth building: an
 * EMPTY bed is a row. A list of allocations can tell you who is in the hostel and
 * never where there is space — and the hostel's own rule ("boys only") has to
 * travel with the board, or the space it shows you is space you cannot use.
 *
 * Migrated off `chisipite-demo` and the `VISUAL_PASS=1` gate. The hostel id was
 * hard-coded to a record on that tenant and is now resolved from the API.
 * `seed-school-demo.ts` writes no hostels, so on St Mary's this skips with that
 * as the reason — the assertions are kept because nothing else in `e2e/` makes
 * them, and they start running the day the seed grows a boarding house.
 */

test.describe.configure({ timeout: 180_000 });
test.use({ tenant: SCHOOL, as: "head", serviceWorkers: "block" });

for (const viewport of [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test.describe(`${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("the bed board shows empty beds, not only who is in", async ({ page }) => {
      const list = await page.request.get("/api/v2/schools/boarding/hostels?limit=25");
      const hostels: { id: string }[] =
        list.status() < 400 ? ((await list.json().catch(() => null))?.data ?? []) : [];
      test.skip(hostels.length === 0, "the school seed writes no hostels");

      const hostel = hostels[0];
      const shot = shooter("schools", `bed-board-${viewport.name}`);

      // Compile the page and its occupancy query before either is measured;
      // `page.request` carries this context's cookies.
      for (const target of [
        `/schools/boarding/${hostel.id}`,
        `/api/v2/schools/boarding/hostels/${hostel.id}/occupancy`,
      ]) {
        await page.request.get(target).catch(() => undefined);
      }

      await page.goto(`/schools/boarding/${hostel.id}`);
      await expect(
        page.getByRole("heading", { name: "Hostel Details", exact: true }).first(),
      ).toBeVisible({ timeout: 30_000 });

      // An empty bed as a row is the whole point: a list of allocations can
      // tell you who is in the hostel and never where there is space.
      await expect(page.getByText("Empty").first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(/boys only/).first()).toBeVisible({
        timeout: 30_000,
      });

      await shot(page, "bed-board");
    });
  });
}
