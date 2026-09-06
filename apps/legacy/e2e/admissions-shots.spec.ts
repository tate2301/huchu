import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { request, test, expect } from "@playwright/test";

/** Screenshots of the S-1.4 admissions board. See `visual-pass.spec.ts` for setup. */

const SHOTS = process.env.SHOT_DIR ?? "/tmp/shots";
const AUTH_STATE = path.join(os.tmpdir(), "visual-pass-auth.json");

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
  for (const target of ["/schools/admissions", "/api/v2/schools/applications"]) {
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

    test("the pipeline is grouped by stage and calls out a lapsed offer", async ({
      page,
    }) => {
      await page.goto("/schools/admissions");
      await expect(
        page.getByRole("heading", { name: "Admissions", exact: true }).first(),
      ).toBeVisible({ timeout: 30_000 });

      await expect(page.getByText("Assessment · 2").first()).toBeVisible({
        timeout: 30_000,
      });
      // The seeded offer with an expiry in the past. This is the thing an
      // admissions office needs the page to shout about.
      await expect(page.getByText(/offer has run out|offers have run out/).first())
        .toBeVisible({ timeout: 30_000 });

      await page.screenshot({
        path: `${SHOTS}/${viewport.name}-admissions-board.png`,
        fullPage: true,
      });
    });

    test("taking an application asks for a name and nothing else", async ({ page }) => {
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

      await page.screenshot({
        path: `${SHOTS}/${viewport.name}-admissions-form.png`,
        fullPage: true,
      });
    });
  });
}
