import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { request, test, expect } from "@playwright/test";

/**
 * Screenshots of the S-1.3 surfaces.
 *
 * Separate from `visual-pass.spec.ts` for the same reason as the calendar
 * shots: these need driving — a rail switch, a dialog — where the visual pass
 * measures layout across three viewports and cannot afford to.
 *
 * Interactions are wrapped in `toPass` rather than clicked once, because a
 * click landing before React hydrates is swallowed and waiting afterwards only
 * waits for a click that never happened.
 */

const SHOTS = process.env.SHOT_DIR ?? "/tmp/shots";
const AUTH_STATE = path.join(os.tmpdir(), "visual-pass-auth.json");
const CLASS_ID =
  process.env.SHOT_CLASS_ID ?? "515bcc28-5300-49b9-8187-abf2f2d44988";

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
    "/schools/assessments",
    `/schools/assessments/class/${CLASS_ID}`,
    `/api/v2/schools/assessments?classId=${CLASS_ID}`,
    `/api/v2/schools/assessments/term-marks?classId=${CLASS_ID}`,
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

    test("assessments open on year groups, not on every test in the school", async ({
      page,
    }) => {
      await page.goto("/schools/assessments");
      await expect(
        page.getByRole("heading", { name: "Assessments", exact: true }).first(),
      ).toBeVisible({ timeout: 30_000 });
      // `visible: true` because the picker draws cards above `sm` and a list
      // below it, both in the DOM. `.first()` alone picks the hidden one on a
      // phone and waits thirty seconds for it to appear.
      await expect(
        page.getByText("Form 1", { exact: true }).filter({ visible: true }).first(),
      ).toBeVisible({ timeout: 30_000 });
      await page.screenshot({
        path: `${SHOTS}/${viewport.name}-assessments-grades.png`,
        fullPage: true,
      });
    });

    test("a year group's work is grouped by subject", async ({ page }) => {
      await page.goto(`/schools/assessments/class/${CLASS_ID}`);
      await expect(
        page.getByRole("heading", { name: /assessments$/ }).first(),
      ).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("End of term paper").first()).toBeVisible({
        timeout: 30_000,
      });
      await page.screenshot({
        path: `${SHOTS}/${viewport.name}-assessments-class.png`,
        fullPage: true,
      });
    });

    test("term marks show both sides of the scheme and the grade", async ({ page }) => {
      await page.goto(`/schools/assessments/class/${CLASS_ID}`);
      await expect(
        page.getByRole("heading", { name: /assessments$/ }).first(),
      ).toBeVisible({ timeout: 30_000 });

      await expect(async () => {
        await page.getByRole("button", { name: "Term marks" }).first().click();
        await expect(page.getByText(/class work \d/).first()).toBeVisible({
          timeout: 3_000,
        });
      }).toPass({ timeout: 40_000 });

      await page.screenshot({
        path: `${SHOTS}/${viewport.name}-assessments-term-marks.png`,
        fullPage: true,
      });
    });

    test("the mark sheet lists the whole class, marked or not", async ({ page }) => {
      await page.goto(`/schools/assessments/class/${CLASS_ID}`);
      await expect(page.getByText("End of term paper").first()).toBeVisible({
        timeout: 30_000,
      });

      await expect(async () => {
        await page.getByRole("button", { name: /^Marks$|^Enter marks$/ }).first().click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible({ timeout: 3_000 });
        // A mark box, not the footer counter. "0 of 0 marked" is true of a
        // dialog that has opened and fetched nothing, so asserting the counter
        // photographed a spinner and called it a pass.
        await expect(dialog.getByRole("spinbutton").first()).toBeVisible({
          timeout: 5_000,
        });
        await expect(dialog.getByText("Loading the class list…")).toHaveCount(0);
      }).toPass({ timeout: 40_000 });

      await page.screenshot({
        path: `${SHOTS}/${viewport.name}-assessments-mark-entry.png`,
        fullPage: true,
      });
    });
  });
}
