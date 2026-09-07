import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";

/**
 * The student portal, screen by screen.
 *
 * Signs in as a *pupil*. The portal resolves everything from the signed-in
 * user's own student record and never from a parameter (S-0.2), so a staff
 * account would see the "not linked to a pupil" state and every screenshot
 * would be of that.
 *
 * Phone first, because that is the device the prototype is drawn for and the
 * only one most pupils have. The tablet width is here to prove the shell does
 * not fall apart on one, not because it is the primary case.
 */

const EMAIL = process.env.STUDENT_EMAIL ?? "s1000@chisipite-demo.test";
const PASSWORD = process.env.STUDENT_PASSWORD ?? "VisualPass123!";
const SHOTS = process.env.SHOT_DIR ?? "/tmp/shots";
const AUTH_STATE = path.join(os.tmpdir(), "student-portal-auth.json");

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

// A screen's first request pays for `next dev` compiling it, and the retry
// below needs room to run afterwards. The 60s default caps the retry budget
// rather than the assertion.
test.describe.configure({ timeout: 180_000 });

/** Each screen names something only the *loaded* screen renders. */
const SCREENS = [
  { slug: "home", path: "/portal/student", ready: "Next lesson" },
  { slug: "timetable", path: "/portal/student/timetable", ready: /Monday|Tuesday|Wednesday|Thursday|Friday|Saturday/ },
  { slug: "marks", path: "/portal/student/marks", ready: /marks|results/i },
  { slug: "homework", path: "/portal/student/homework", ready: /homework|hand/i },
  { slug: "library", path: "/portal/student/library", ready: /librar|borrow/i },
  { slug: "goals", path: "/portal/student/goals", ready: /goal/i },
  { slug: "profile", path: "/portal/student/profile", ready: /student number|year group|profile/i },
  { slug: "notifications", path: "/portal/student/notifications", ready: /notification|nothing/i },
  { slug: "settings", path: "/portal/student/settings", ready: /sign-in|notification/i },
  { slug: "help", path: "/portal/student/help", ready: /hand work in|questions/i },
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
          await page.goto(screen.path);
          await expect(page.getByText(screen.ready).first()).toBeVisible({
            timeout: 20_000,
          });
        // No warm-up hook: `next dev` compiles a screen on its first request,
        // so the first attempt pays for the build and the retry measures the
        // screen. A hook that warmed every screen up front just moved the same
        // wait somewhere that reports it worse.
        }).toPass({ timeout: 150_000, intervals: [2_000] });
        await page.screenshot({
          path: `${SHOTS}/student-${screen.slug}-${viewport.name}.png`,
          fullPage: true,
        });
      });
    }
  });
}
