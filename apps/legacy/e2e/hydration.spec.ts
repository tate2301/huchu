import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";

/**
 * No page throws on hydration.
 *
 * This existed as a caveat for weeks before it was a spec: the sidebar rendered
 * one module's name server-side and another's in the browser, on every page of
 * the app including ones no school work had touched. Nothing caught it, because
 * a hydration error is a console throw and a repaint — the page looks right a
 * frame later, so a screenshot passes and a `toBeVisible` passes.
 *
 * So this spec asserts on the console rather than on the pixels. `pageerror` is
 * where React's hydration failure lands; anything else thrown during a page load
 * is caught by the same net, which is the point.
 *
 * See `visual-pass.spec.ts` for the login setup this shares.
 */

const EMAIL = process.env.VISUAL_PASS_EMAIL ?? "head@chisipite-demo.test";
const PASSWORD = process.env.VISUAL_PASS_PASSWORD ?? "VisualPass123!";
const AUTH_STATE = path.join(os.tmpdir(), "visual-pass-auth.json");
const SHOTS = process.env.SHOT_DIR ?? "/tmp/shots";

const PAGES = [
  "/schools",
  "/schools/students",
  "/schools/classes",
  "/schools/subjects",
  "/schools/teachers",
  "/schools/finance",
  "/schools/attendance",
  "/schools/boarding",
];

test.use({
  launchOptions: {
    ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
    args: ["--no-proxy-server"],
  },
  storageState: AUTH_STATE,
  serviceWorkers: "block",
});

test.skip(process.env.VISUAL_PASS !== "1", "See visual-pass.spec.ts for setup.");
test.describe.configure({ timeout: 300_000 });

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

    test("no school page throws while loading", async ({ page }) => {
      const thrown: string[] = [];
      page.on("pageerror", (error) => thrown.push(`${page.url()} — ${error.message}`));

      for (const target of PAGES) {
        await page.goto(target, { waitUntil: "load" });
        // Hydration happens after load, so the assertion needs the frame after
        // it. Anchored to the sidebar's own heading rather than a timer: it is
        // rendered from the session, which is the thing that used to disagree.
        await expect(page.getByText("School Operations").first()).toBeVisible({
          timeout: 30_000,
        });
      }

      expect(thrown, thrown.join("\n")).toEqual([]);
    });

    test("the server sends the school's workspace, not another module's", async ({ page }) => {
      // Straight from the HTML, before any script runs. The browser repaints a
      // mismatch within a frame, so the only place the old bug was visible was
      // here and in the console.
      const response = await page.request.get("/schools/students");
      const html = await response.text();
      expect(html).toContain("School Operations");
      expect(html).not.toMatch(/Scrap &(amp;)? Recycling/);
    });
  });
}
