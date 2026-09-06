import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { request, test, expect } from "@playwright/test";

/** Screenshot of the S-1.6 bed board. See `visual-pass.spec.ts` for setup. */

const SHOTS = process.env.SHOT_DIR ?? "/tmp/shots";
const AUTH_STATE = path.join(os.tmpdir(), "visual-pass-auth.json");
const HOSTEL_ID =
  process.env.SHOT_HOSTEL_ID ?? "2d6f2063-59ea-4bb4-9be8-ae24df65a421";

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
    `/schools/boarding/${HOSTEL_ID}`,
    `/api/v2/schools/boarding/hostels/${HOSTEL_ID}/occupancy`,
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

    test("the bed board shows empty beds, not only who is in", async ({ page }) => {
      await page.goto(`/schools/boarding/${HOSTEL_ID}`);
      await expect(
        page.getByRole("heading", { name: "Hostel Details", exact: true }).first(),
      ).toBeVisible({ timeout: 30_000 });

      // An empty bed as a row is the whole point: a list of allocations can
      // tell you who is in the hostel and never where there is space.
      await expect(page.getByText("Empty").first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(/boys only/).first()).toBeVisible({
        timeout: 30_000,
      });

      await page.screenshot({
        path: `${SHOTS}/${viewport.name}-bed-board.png`,
        fullPage: true,
      });
    });
  });
}
