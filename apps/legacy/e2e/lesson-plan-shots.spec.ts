import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { request, test, expect } from "@playwright/test";

/** Screenshots of S-1.11 and S-1.12. See `visual-pass.spec.ts` for setup. */

const SHOTS = process.env.SHOT_DIR ?? "/tmp/shots";
const AUTH_STATE = path.join(os.tmpdir(), "visual-pass-auth.json");
/** The week the seeded plans sit in. */
const WEEK = process.env.SHOT_WEEK ?? "2026-08-03";

test.use({
  launchOptions: {
    ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
    args: ["--no-proxy-server"],
  },
  storageState: AUTH_STATE,
});

test.skip(process.env.VISUAL_PASS !== "1", "See visual-pass.spec.ts for setup.");

test.beforeAll(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const probe = await request.newContext({
    baseURL: process.env.E2E_BASE_URL,
    storageState: AUTH_STATE,
  });
  for (const target of [
    "/schools/lesson-plans",
    "/schools/resources",
    `/api/v2/schools/lesson-plans?weekStart=${WEEK}`,
    "/api/v2/schools/teaching-resources",
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

    test("a week of lesson plans, day by day", async ({ page }) => {
      await page.goto("/schools/lesson-plans");
      await expect(
        page.getByRole("heading", { name: "Lesson plans", exact: true }).first(),
      ).toBeVisible({ timeout: 30_000 });

      // The seeded week. The date field is client state, so set it via the
      // control rather than fighting hydration with a fill.
      await expect(async () => {
        await page.locator("#week-start").fill(WEEK);
        await expect(page.getByText("Simultaneous equations").first()).toBeVisible({
          timeout: 3_000,
        });
      }).toPass({ timeout: 40_000 });

      await page.screenshot({
        path: `${SHOTS}/${viewport.name}-lesson-plans.png`,
        fullPage: true,
      });
    });

    test("the resource shelf groups by subject", async ({ page }) => {
      await page.goto("/schools/resources");
      await expect(
        page.getByRole("heading", { name: "Teaching resources", exact: true }).first(),
      ).toBeVisible({ timeout: 30_000 });

      await expect(page.getByText(/past papers/).first()).toBeVisible({
        timeout: 30_000,
      });

      await page.screenshot({
        path: `${SHOTS}/${viewport.name}-resources.png`,
        fullPage: true,
      });
    });
  });
}
