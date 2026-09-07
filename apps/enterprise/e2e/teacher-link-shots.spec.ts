import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { request, test, expect } from "@playwright/test";

/** Screenshot of the S-1.7 teacher/employee link. See `visual-pass.spec.ts`. */

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
  for (const target of [
    "/schools/teachers",
    "/api/v2/schools/teachers/profiles?limit=50",
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

    test("the staff list says which teachers have no HR record", async ({ page }) => {
      await page.goto("/schools/teachers");
      await expect(
        page.getByRole("heading", { name: "Teachers", exact: true }).first(),
      ).toBeVisible({ timeout: 30_000 });

      // `visible: true`: the DataTable renders both a desktop table and a
      // mobile list, so `.first()` alone picks whichever is hidden at this
      // viewport and waits thirty seconds for it to appear.
      await expect(
        page.getByText("No HR record").filter({ visible: true }).first(),
      ).toBeVisible({ timeout: 30_000 });
      await page.screenshot({
        path: `${SHOTS}/${viewport.name}-teacher-hr.png`,
        fullPage: true,
      });
    });

    test("the suggestion says why it thinks they are the same person", async ({
      page,
    }) => {
      test.skip(viewport.name === "phone", "The link control is a table column.");

      await page.goto("/schools/teachers");
      await expect(
        page.getByRole("heading", { name: "Teachers", exact: true }).first(),
      ).toBeVisible({ timeout: 30_000 });

      // Scoped to one row, and the click retried only while the trigger is
      // still there — the dialog opens over the page, so an unconditional
      // re-click would hit the overlay and fail for the wrong reason.
      const row = page.getByRole("row").filter({ hasText: "Grace Banda" });
      const dialog = page.getByRole("dialog");
      await expect(async () => {
        const trigger = row.getByRole("button", { name: "Find the employee" });
        if (await trigger.count()) await trigger.click();
        await expect(dialog).toBeVisible({ timeout: 3_000 });
        // "Same login" or "Same name — check before linking". Either is the
        // point: the reason travels with the suggestion.
        await expect(dialog.getByText(/Same login|Same name/).first()).toBeVisible({
          timeout: 3_000,
        });
      }).toPass({ timeout: 40_000 });

      await page.screenshot({
        path: `${SHOTS}/${viewport.name}-teacher-hr-suggestion.png`,
        fullPage: true,
      });
    });
  });
}
