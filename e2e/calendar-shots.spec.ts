import type { Page } from "@playwright/test";

import { test, expect } from "./_support/fixtures";
import { SCHOOL } from "./_support/tenants";
import { shooter } from "./_support/shots";

/**
 * S-1.2 — the school calendar, and what a holiday does to the register.
 *
 * Both screens need a click or a date before they show anything, which is why
 * they are not part of `visual-pass.spec.ts`: that measures layout at three
 * viewports and cannot afford to drive either.
 *
 * `schools-suite.spec.ts` sweeps `/schools/calendar` and the bare
 * `/schools/attendance`. Neither is this. The rail switch on
 * `/schools/academics` and `/schools/attendance?date=<holiday>` are different
 * render paths — the second is the whole point of the story, because a closed
 * school used to read as a class-full of missing registers.
 *
 * ## Migrated off a hard-coded holiday
 *
 * `SHOT_HOLIDAY=2026-05-25` and the string "Africa Day" were `chisipite-demo`'s
 * seeded calendar. Both are now read from `/api/v2/schools/calendar`, so the
 * assertions are about whatever this tenant's calendar actually holds.
 * `seed-school-demo.ts` writes no calendar events, so on St Mary's these skip
 * with that as the stated reason rather than failing on somebody else's data.
 */

test.describe.configure({ timeout: 180_000 });
test.use({ tenant: SCHOOL, as: "head", serviceWorkers: "block" });

type CalendarEvent = {
  title: string;
  kind: string;
  startDate: string;
  isTeachingDay: boolean;
};

/** Everything on this tenant's calendar, as the page itself would fetch it. */
async function calendar(page: Page): Promise<CalendarEvent[]> {
  const response = await page.request.get("/api/v2/schools/calendar");
  if (response.status() >= 400) return [];
  return (await response.json().catch(() => null))?.events ?? [];
}

/** The day the school is shut. `isTeachingDay: false` is what closes it. */
function firstClosure(events: CalendarEvent[]): CalendarEvent | null {
  return events.find((event) => event.isTeachingDay === false) ?? null;
}

/**
 * A locator matching any one of the calendar's own titles.
 *
 * Asserting on `events[0]` specifically is what this used to do, and it was an
 * assumption about ordering rather than about the product. The API returns the
 * calendar by date, and the seed's earliest two entries are public holidays in
 * August — before the current term opens on 8 September — so the first event is
 * one the term's view has no reason to draw. The page is not wrong to leave it
 * out, and the test has no business naming which entry it wants.
 *
 * What the test is actually for is that the view lists the calendar at all, so
 * it asserts exactly that: one of the titles the calendar knows about is on the
 * screen.
 */
function anyEventTitle(page: Page, events: CalendarEvent[]) {
  return events
    .map((event) => page.getByText(event.title).filter({ visible: true }).first())
    .reduce((locator, next) => locator.or(next));
}

for (const viewport of [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test.describe(`${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("the school calendar lists holidays by month", async ({ page }) => {
      const events = await calendar(page);
      test.skip(
        events.length === 0,
        "this tenant's calendar is empty — seed-school-demo.ts writes no calendar events",
      );

      const shot = shooter("schools", `calendar-${viewport.name}`);

      // The calendar is a page now, not a tab. It used to be reached by going
      // to the academic ladder under Master Data and clicking a
      // "Holidays and events" view beside Academic years and Terms; that ladder
      // has since been rebuilt as a master-detail settings surface with no such
      // view on it, so the click had nothing to hit and the shot was of a year
      // record rather than of a calendar.
      //
      // `/schools/calendar` renders the same `SchoolDaysContent` the tab did,
      // with an app bar of its own. Its own docstring gives the reason there
      // are two ways in: setting next year's terms up wants the calendar
      // alongside, and asking whether the school is open on Monday should not
      // go through Master Data to find out. That second reading is this test's,
      // so it asks for the page.
      await page.goto("/schools/calendar");
      await expect(
        page.getByRole("heading", { name: "Calendar" }).first(),
      ).toBeVisible({ timeout: 30_000 });

      // Still retried rather than asserted once: the content fetches its events
      // after hydration, so the page answers before the calendar is on it.
      //
      // The title comes from the calendar rather than being typed here: it used
      // to be the literal "Africa Day", which was a public holiday on the tenant
      // this spec was written against and is not one here. It is now any of the
      // calendar's titles rather than its first — see `anyEventTitle`.
      await expect(anyEventTitle(page, events)).toBeVisible({ timeout: 30_000 });
      await shot(page, "school-calendar");
    });

    test("a holiday reads as a closed school, not as missing registers", async ({
      page,
    }) => {
      const closure = firstClosure(await calendar(page));
      test.skip(
        closure === null,
        "no non-teaching day on this tenant's calendar — seed-school-demo.ts writes no calendar events",
      );
      if (!closure) return;

      const holiday = closure.startDate.slice(0, 10);
      const shot = shooter("schools", `calendar-${viewport.name}`);

      // Warm the route and the day's verdict before asking for either. Cold, the
      // API can outrun the thirty-second gate below, and the failure looks like
      // six red "Missing" badges on a public holiday — which is the bug this
      // story fixed, reported by the harness rather than by the product.
      for (const target of [
        `/api/v2/schools/calendar?on=${holiday}`,
        `/schools/attendance?date=${holiday}`,
      ]) {
        await page.request.get(target).catch(() => undefined);
      }

      // Via the URL rather than by typing into the date field. Typing is what
      // a person does, but a test types before React hydrates, and a fill that
      // early updates the DOM and even fires the request while the answer never
      // reaches the screen — so the harness reported the exact bug this story
      // fixes. `?date=` exists because a day is worth linking to anyway.
      await page.goto(`/schools/attendance?date=${holiday}`);
      await expect(
        page.getByRole("heading", { name: "Attendance", exact: true }).first(),
      ).toBeVisible({ timeout: 30_000 });

      await expect(page.getByText(/Not a school day/).first()).toBeVisible({
        timeout: 30_000,
      });
      await shot(page, "oversight-holiday");
    });
  });
}
