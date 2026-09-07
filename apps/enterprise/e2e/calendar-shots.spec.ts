import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { request, test, expect } from "@playwright/test";

/**
 * Screenshots of the two screens S-1.2 changes.
 *
 * Separate from `visual-pass.spec.ts` because both need a click before they
 * show anything: the calendar lives behind a rail item, and the "not a school
 * day" state only appears once a date with a holiday on it is chosen. The
 * visual pass measures layout at three viewports and cannot afford to drive
 * either. Reuses that file's storage state, so run the visual pass first (or
 * just let this fail and sign in there).
 */

const SHOTS = process.env.SHOT_DIR ?? "/tmp/shots";
const AUTH_STATE = path.join(os.tmpdir(), "visual-pass-auth.json");
/** A public holiday inside the active term — see the seeded calendar. */
const HOLIDAY = process.env.SHOT_HOLIDAY ?? "2026-05-25";

test.use({
  launchOptions: {
    ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
    args: ["--no-proxy-server"],
  },
  storageState: AUTH_STATE,
});

test.skip(process.env.VISUAL_PASS !== "1", "See visual-pass.spec.ts for setup.");

/**
 * Compile every route and API this file touches before anything is measured.
 *
 * Same lesson as `visual-pass.spec.ts`: the dev server compiles on first
 * request, and the first viewport to reach a cold API can outrun the 30-second
 * gate. That failed this file exactly once, showing six red "Missing" badges on
 * a public holiday — the bug this story fixes, reported by the harness rather
 * than by the product.
 */
test.beforeAll(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });

  const probe = await request.newContext({
    baseURL: process.env.E2E_BASE_URL,
    storageState: AUTH_STATE,
  });
  for (const target of [
    "/schools/academics",
    "/schools/attendance",
    "/api/v2/schools/calendar",
    `/api/v2/schools/calendar?on=${HOLIDAY}`,
    `/schools/attendance?date=${HOLIDAY}`,
  ]) {
    await probe.get(target).catch(() => undefined);
  }
  await probe.dispose();
});

for (const viewport of [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test.describe(`${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("the school calendar lists holidays by month", async ({ page }) => {
      await page.goto("/schools/academics");
      await expect(
        page.getByRole("heading", { name: "Academics Setup", exact: true }).first(),
      ).toBeVisible({ timeout: 30_000 });

      // Retry the click rather than click once and wait. A click landing
      // before React has hydrated is swallowed — the rail is server-rendered,
      // so the button exists and is clickable well before it does anything —
      // and waiting thirty seconds afterwards only waits for a click that never
      // happened. `toPass` re-clicks until the view actually changes.
      await expect(async () => {
        await page.getByRole("button", { name: /Holidays & Events/ }).first().click();
        await expect(page.getByText("Africa Day").first()).toBeVisible({
          timeout: 2_000,
        });
      }).toPass({ timeout: 30_000 });
      await page.screenshot({
        path: `${SHOTS}/${viewport.name}-school-calendar.png`,
        fullPage: true,
      });
    });

    test("a holiday reads as a closed school, not as missing registers", async ({
      page,
    }) => {
      // Via the URL rather than by typing into the date field. Typing is what
      // a person does, but a test types before React hydrates, and a fill that
      // early updates the DOM and even fires the request while the answer never
      // reaches the screen — so the harness reported the exact bug this story
      // fixes. `?date=` exists because a day is worth linking to anyway.
      await page.goto(`/schools/attendance?date=${HOLIDAY}`);
      await expect(
        page.getByRole("heading", { name: "Attendance", exact: true }).first(),
      ).toBeVisible({ timeout: 30_000 });

      await expect(page.getByText(/Not a school day/).first()).toBeVisible({
        timeout: 30_000,
      });
      await page.screenshot({
        path: `${SHOTS}/${viewport.name}-oversight-holiday.png`,
        fullPage: true,
      });
    });
  });
}
