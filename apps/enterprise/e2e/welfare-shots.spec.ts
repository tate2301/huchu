import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { request, test, expect } from "@playwright/test";

/** Screenshot of the S-1.8 welfare list. See `visual-pass.spec.ts` for setup. */

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
  for (const target of ["/schools/boarding/welfare", "/api/v2/schools/health"]) {
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

    test("the welfare list leads with the gaps", async ({ page }) => {
      await page.goto("/schools/boarding/welfare");
      await expect(
        page.getByRole("heading", { name: "Health and welfare", exact: true }).first(),
      ).toBeVisible({ timeout: 30_000 });

      // A child with nothing on file is a row, not an absence — the whole point
      // of building the list from the children outward.
      await expect(
        page.getByText("Nothing recorded at all").filter({ visible: true }).first(),
      ).toBeVisible({ timeout: 30_000 });
      // And the combination a boarding school cannot be caught by.
      await expect(
        page.getByText(/allergy and no consent to treat/).first(),
      ).toBeVisible({ timeout: 30_000 });

      await page.screenshot({
        path: `${SHOTS}/${viewport.name}-welfare.png`,
        fullPage: true,
      });
    });
  });
}
