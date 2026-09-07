import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";

/**
 * S-3.3 — the registrar's import screen.
 *
 * The dry-run report is the point of the screen, so the shots drive a real file
 * with deliberately bad rows all the way through upload → mapping → check, and
 * photograph the report showing actual rejections. A screenshot of an empty
 * upload form proves nothing about whether the thing works.
 *
 * Nothing here commits. A dry run touches the staging tables and no domain
 * table, so the demo tenant's data is exactly as it was afterwards.
 *
 * See `visual-pass.spec.ts` for the login setup this shares.
 */

const EMAIL = process.env.VISUAL_PASS_EMAIL ?? "head@chisipite-demo.test";
const PASSWORD = process.env.VISUAL_PASS_PASSWORD ?? "VisualPass123!";
const SHOTS = process.env.SHOT_DIR ?? "/tmp/shots";
const AUTH_STATE = path.join(os.tmpdir(), "visual-pass-auth.json");

test.use({
  launchOptions: {
    ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
    args: ["--no-proxy-server"],
  },
  storageState: AUTH_STATE,
  serviceWorkers: "block",
});

test.skip(process.env.VISUAL_PASS !== "1", "See visual-pass.spec.ts for setup.");
test.describe.configure({ timeout: 180_000 });

/**
 * Two rows that are fine, and four that are not — one per kind of problem the
 * registrar will actually hit. "Form 1" and "Form 2" exist in the demo tenant.
 */
const STUDENTS_CSV = `Reg No,Forename,Surname,Form,DOB
CH-0101,Tendai,Moyo,Form 1,2014-03-02
CH-0102,Rudo,Chikafu,Form 2,2013-11-14
CH-0103,Farai,Ncube,Frm 1,2014-06-30
CH-0104,Anesu,Dube,Upper Sixth,2012-01-09
CH-0105,Chipo,Marufu,Form 2,03/04/2019
CH-0106,,Zhou,Form 1,2014-08-21
`;

test.beforeAll(async ({ browser }) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  if (fs.existsSync(AUTH_STATE)) {
    const probe = await browser.newContext({ storageState: AUTH_STATE });
    const session = await probe.request.get("/api/auth/session");
    const body = await session.json().catch(() => ({}));
    await probe.close();
    if (body?.user) return;
  }
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();
  await page.goto("/login");
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/auth/callback/credentials"), {
      timeout: 30_000,
    }),
    page.click('button[type="submit"]'),
  ]);
  expect(response.status()).toBeLessThan(400);
  await context.storageState({ path: AUTH_STATE });
  await context.close();
});

for (const viewport of [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test.describe(`${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("import: choose, map, and read the report", async ({ page }) => {
      // The first request to a route compiles it, which can outlast a normal
      // timeout. Retried rather than given a longer one, so a genuine failure
      // still fails fast on the second attempt.
      await expect(async () => {
        await page.goto("/schools/imports");
        // "What are you importing?" appears only in the loaded state — the
        // loading branch is skeletons with no text at all. Matching a string
        // that is in both is how this suite has photographed a spinner before.
        await expect(page.getByText("What are you importing?")).toBeVisible({
          timeout: 20_000,
        });
      }).toPass({ timeout: 120_000 });

      await page.screenshot({
        path: `${SHOTS}/import-1-choose-${viewport.name}.png`,
        fullPage: true,
      });

      // Upload the file the way a registrar does.
      await page.setInputFiles("#import-file", {
        name: "students-term-2.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(STUDENTS_CSV, "utf8"),
      });

      await expect(page.getByText("Check the columns")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("students-term-2.csv").first()).toBeVisible();
      await page.screenshot({
        path: `${SHOTS}/import-2-columns-${viewport.name}.png`,
        fullPage: true,
      });

      await page.getByRole("button", { name: "Check the data" }).click();

      // The report, with real rejections in it.
      const report = page.getByTestId("import-dry-run");
      await expect(report).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("import-rejected-rows")).toBeVisible();
      await expect(page.getByText(/rows need fixing/)).toBeVisible();

      // The suggestion is the feature. If this stops appearing the screen has
      // quietly gone back to reporting foreign-key errors.
      await expect(page.getByText(/did you mean "Form 1"/)).toBeVisible();

      await page.screenshot({
        path: `${SHOTS}/import-3-report-${viewport.name}.png`,
        fullPage: true,
      });

      // The report sits inside the shell's own scroll container, so `fullPage`
      // stops at the viewport and the table of rejections — the whole point of
      // the screen — falls below the fold. Shot as an element instead.
      await report.scrollIntoViewIfNeeded();
      await report.screenshot({
        path: `${SHOTS}/import-4-rejections-${viewport.name}.png`,
      });
    });
  });
}
