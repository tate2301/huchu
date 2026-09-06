import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";

/**
 * The bursar's money screens, after Iteration 2.
 *
 * Credits and refunds are new surfaces with no screenshot behind them —
 * the verification pass named that as the one Definition-of-Done item the
 * workflow could not meet on its own, because the agents had no tenant host.
 * See `visual-pass.spec.ts` for the setup this shares.
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

    test("fees and finance", async ({ page }) => {
      await expect(async () => {
        await page.goto("/schools/finance");
        // An invoice number, not a rail label. The rail says "Invoices"
        // before the table has any, so matching it photographs the spinner —
        // the same mistake this suite has now made twice.
        await expect(page.getByText(/SFI-\d/).first()).toBeVisible({
          timeout: 20_000,
        });
      }).toPass({ timeout: 150_000, intervals: [2_000] });
      await page.screenshot({
        path: `${SHOTS}/finance-${viewport.name}.png`,
        fullPage: true,
      });

      // The credits view is the evidence for S-2.5: an overpayment that
      // became a balance rather than disappearing.
      await page.getByRole("button", { name: /^Credits/ }).first().click();
      await expect(page.getByText(/Credit|unallocated/i).first()).toBeVisible({
        timeout: 20_000,
      });
      await page.screenshot({
        path: `${SHOTS}/finance-credits-${viewport.name}.png`,
        fullPage: true,
      });
    });
  });
}
