import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { request, test, expect } from "@playwright/test";

/** Screenshot of the S-1.5 year roll-up. See `visual-pass.spec.ts` for setup. */

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
  // The API too, not only the page: it compiles on the client's first fetch,
  // and the phone run reaches it cold. A 400 for missing params is fine — the
  // point is that the route is built before anything is measured.
  for (const target of [
    "/schools/students/roll-up",
    "/api/v2/schools/year-rollup",
    "/api/v2/schools/terms?limit=50",
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

    test("the roll-up shows every child and what would happen to them", async ({
      page,
    }) => {
      await page.goto("/schools/students/roll-up");
      await expect(
        page.getByRole("heading", { name: "Roll up the year", exact: true }).first(),
      ).toBeVisible({ timeout: 30_000 });

      // A per-child row, not just the summary — the point of the screen is that
      // it is reviewable.
      await expect(page.getByText(/Move up|Repeat the year|Leaving/).first())
        .toBeVisible({ timeout: 30_000 });

      await page.screenshot({
        path: `${SHOTS}/${viewport.name}-year-rollup.png`,
        fullPage: true,
      });
    });
  });
}
