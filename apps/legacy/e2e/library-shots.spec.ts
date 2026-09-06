import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { request, test, expect } from "@playwright/test";

/** Screenshot of the S-1.10 library. See `visual-pass.spec.ts` for setup. */

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
  for (const target of ["/schools/library", "/api/v2/schools/library"]) {
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

    test("the shelves show what is in and what is out", async ({ page }) => {
      await page.goto("/schools/library");
      await expect(
        page.getByRole("heading", { name: "Library", exact: true }).first(),
      ).toBeVisible({ timeout: 30_000 });

      // A copy on the shelf is a row you can lend, not an absence.
      await expect(page.getByText("Things Fall Apart").first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(
        page.getByRole("button", { name: "Lend it" }).first(),
      ).toBeVisible({ timeout: 30_000 });

      await page.screenshot({
        path: `${SHOTS}/${viewport.name}-library.png`,
        fullPage: true,
      });
    });

    test("the loan register opens on what is late, with the fine", async ({ page }) => {
      await page.goto("/schools/library");
      await expect(
        page.getByRole("heading", { name: "Library", exact: true }).first(),
      ).toBeVisible({ timeout: 30_000 });

      await expect(async () => {
        await page.getByRole("button", { name: "Out" }).first().click();
        await expect(page.getByText(/if back today/).first()).toBeVisible({
          timeout: 3_000,
        });
      }).toPass({ timeout: 40_000 });

      await page.screenshot({
        path: `${SHOTS}/${viewport.name}-library-overdue.png`,
        fullPage: true,
      });
    });
  });
}
