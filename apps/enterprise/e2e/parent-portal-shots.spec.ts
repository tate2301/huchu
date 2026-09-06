import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";

/**
 * The parent portal, screen by screen.
 *
 * Signs in as a *guardian*. The household is resolved from the caller's own
 * `SchoolGuardian` link (`loadParentHousehold`), never from a parameter, so a
 * staff account would see the "no children" state and every screenshot would
 * be of that. The state file is separate for the same reason as the teacher
 * and student specs.
 *
 * Phone first — this is a mobile shell with bottom tabs, drawn for the device
 * a parent actually carries.
 */

const EMAIL = process.env.PARENT_EMAIL ?? "grace.banda@chisipite-demo.test";
const PASSWORD = process.env.PARENT_PASSWORD ?? "VisualPass123!";
const SHOTS = process.env.SHOT_DIR ?? "/tmp/shots";
const AUTH_STATE = path.join(os.tmpdir(), "parent-auth.json");

test.use({
  launchOptions: {
    ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
    args: ["--no-proxy-server"],
  },
  storageState: AUTH_STATE,
  // See the note in teacher-portal-shots.spec.ts: the offline service worker
  // sits in front of `/api/v2` once it installs, and whether it has finished
  // installing decides whether a run passes.
  serviceWorkers: "block",
});

test.skip(process.env.VISUAL_PASS !== "1", "See visual-pass.spec.ts for setup.");

test.describe.configure({ timeout: 180_000 });

/** Each screen names something only the *loaded* screen renders. */
const SCREENS = [
  { slug: "home", path: "/portal/parent", ready: /How often at school|linked any children/i },
  { slug: "fees", path: "/portal/parent/fees", ready: /What you still owe|not shown on your account/i },
  {
    slug: "attendance",
    path: "/portal/parent/attendance",
    ready: /at school|Day by day|No registers|Nothing has been recorded/i,
  },
  { slug: "marks", path: "/portal/parent/marks", ready: /out of|score|have not been released|not been shared|subjects?/i },
  {
    slug: "notices",
    path: "/portal/parent/notices",
    ready: /School news|not sent you anything/i,
  },
  { slug: "profile", path: "/portal/parent/profile", ready: /guardian|child|profile/i },
  { slug: "help", path: "/portal/parent/help", ready: /child|question|switch/i },
];

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
  expect(
    response.status(),
    `sign-in as ${EMAIL} was rejected (${response.status()})`,
  ).toBeLessThan(400);
  await expect
    .poll(
      async () => {
        const session = await page.request.get("/api/auth/session");
        const body = await session.json().catch(() => ({}));
        return Boolean(body?.user);
      },
      { timeout: 30_000, intervals: [500] },
    )
    .toBe(true);
  await context.storageState({ path: AUTH_STATE });
  await context.close();
});

for (const viewport of [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
]) {
  test.describe(`${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const screen of SCREENS) {
      test(`${screen.slug}`, async ({ page }) => {
        await expect(async () => {
          await page.goto(screen.path, { waitUntil: "domcontentloaded" });
          await expect(page.getByText(screen.ready).first()).toBeVisible({
            timeout: 20_000,
          });
        }).toPass({ timeout: 150_000, intervals: [2_000] });
        await page.screenshot({
          path: `${SHOTS}/parent-${screen.slug}-${viewport.name}.png`,
          fullPage: true,
        });
      });
    }
  });
}
