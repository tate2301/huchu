import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { request, test, expect } from "@playwright/test";

/** Screenshot of the S-1.9 homework board. See `visual-pass.spec.ts` for setup. */

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
    `/schools/assessments/class/${CLASS_ID}`,
    `/api/v2/schools/assignments?classId=${CLASS_ID}`,
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

    test("homework separates what is set from what is still a draft", async ({
      page,
    }) => {
      await page.goto(`/schools/assessments/class/${CLASS_ID}`);
      await expect(
        page.getByRole("heading", { name: /assessments$/ }).first(),
      ).toBeVisible({ timeout: 30_000 });

      await expect(async () => {
        await page.getByRole("button", { name: "Homework" }).first().click();
        await expect(page.getByText("Read chapter four").first()).toBeVisible({
          timeout: 3_000,
        });
      }).toPass({ timeout: 40_000 });

      // A draft is a state a teacher can see and the class cannot.
      await expect(page.getByText("Draft").first()).toBeVisible({ timeout: 10_000 });

      await page.screenshot({
        path: `${SHOTS}/${viewport.name}-homework.png`,
        fullPage: true,
      });
    });

    test("the board opens on who has not handed in", async ({ page }) => {
      await page.goto(`/schools/assessments/class/${CLASS_ID}`);
      await expect(
        page.getByRole("heading", { name: /assessments$/ }).first(),
      ).toBeVisible({ timeout: 30_000 });

      await expect(async () => {
        await page.getByRole("button", { name: "Homework" }).first().click();
        await expect(
          page.getByRole("button", { name: "Who has handed in" }).first(),
        ).toBeVisible({ timeout: 3_000 });
      }).toPass({ timeout: 40_000 });

      const dialog = page.getByRole("dialog");
      await expect(async () => {
        const trigger = page.getByRole("button", { name: "Who has handed in" }).first();
        if (await trigger.count()) await trigger.click();
        await expect(dialog).toBeVisible({ timeout: 3_000 });
        // "Not in" against a name is the thing this screen exists for.
        await expect(dialog.getByText("Not in").first()).toBeVisible({
          timeout: 3_000,
        });
      }).toPass({ timeout: 40_000 });

      await page.screenshot({
        path: `${SHOTS}/${viewport.name}-homework-board.png`,
        fullPage: true,
      });
    });
  });
}
