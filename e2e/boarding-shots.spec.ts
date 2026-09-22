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
 *
 * ## It had never run, and on 2026-09-22 that showed
 *
 * `seed-school-demo.ts` wrote no hostels, so this skipped on every run there had
 * ever been — and a test that has never executed is a test whose every literal
 * is a guess. The seed grew a boarding house on 2026-09-22 and all four of them
 * were wrong at once:
 *
 *   - the heading was `"Hostel Details"`; the record page titles itself after
 *     the house, as the class pages do in `visual-pass.spec.ts`
 *   - the free-bed row read `"Empty"`; `bed-board-content.tsx` says `"Free"`
 *   - the house rule read `/boys only/`, which is the *refusal* sentence the
 *     placer returns. The record page states the rule as a chip — "Girls" — and
 *     the house it resolves is whichever sorts first, which at St Mary's is a
 *     girls' house
 *   - and the board itself is behind its own view link. The record opens on
 *     Allocations, which is exactly the "who is in, never where there is
 *     space" view this file exists to say is not enough. It has to be opened.
 */

type Hostel = { id: string; name: string; genderPolicy?: string };

/** The chip the record page states a single-sex house's rule with. */
const SEX_CHIP: Record<string, string | undefined> = {
  MALE: "Boys",
  FEMALE: "Girls",
};

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
      const hostels: Hostel[] =
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
      // The house's own name, not "Hostel Details". The record page titles
      // itself after the thing it is showing — same as the class pages in
      // `visual-pass.spec.ts` — and the literal heading this asserted was the
      // one `chisipite-demo` happened to render.
      await expect(
        page.getByRole("heading", { name: hostel.name, exact: true }).first(),
      ).toBeVisible({ timeout: 30_000 });

      // The single-sex rule travels with the house, stated as a chip. Read from
      // the house rather than typed, so it is about the product and not about
      // which house happens to sort first. A MIXED house states no rule.
      //
      // Visible only. The identity strip renders a chip per breakpoint variant
      // and the one that comes first in the DOM is the one hidden at this
      // width — 33 resolutions to a hidden `<span>` at 1440px, none at 390.
      // `visual-pass.spec.ts` carries the same rule for the same reason.
      const chip = SEX_CHIP[hostel.genderPolicy?.toUpperCase() ?? ""];
      if (chip) {
        await expect(
          page.getByText(chip, { exact: true }).filter({ visible: true }).first(),
        ).toBeVisible({ timeout: 30_000 });
      }

      // Open the board. The record opens on Allocations — who is in — and the
      // beds are behind a view link beside it, which is why landing on the
      // record and looking for a free bed found nothing. `link`, not `tab`: the
      // record page's views are navigations, so each one is addressable.
      // Retried, because a click landing before React has hydrated is swallowed
      // by a control that is already in the DOM — the trap
      // `calendar-shots.spec.ts` documents on its Holidays view.
      await expect(async () => {
        await page.getByRole("link", { name: /^Beds/ }).first().click();
        await expect(
          page.getByText("Free", { exact: true }).filter({ visible: true }).first(),
        ).toBeVisible({ timeout: 3_000 });
      }).toPass({ timeout: 60_000, intervals: [2_000] });

      // A free bed as a row is the whole point: a list of allocations can tell
      // you who is in the hostel and never where there is space.
      await expect(
        page.getByText("Free", { exact: true }).filter({ visible: true }).first(),
      ).toBeVisible({ timeout: 30_000 });

      await shot(page, "bed-board");
    });
  });
}
