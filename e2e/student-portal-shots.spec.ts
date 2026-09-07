import { test, expect } from "./_support/fixtures";
import { SCHOOL } from "./_support/tenants";
import { shooter } from "./_support/shots";

/**
 * The student portal, screen by screen.
 *
 * Signed in as a *pupil*. The portal resolves everything from the signed-in
 * user's own student record and never from a parameter (S-0.2), so a staff
 * account would see the "not linked to a pupil" state and every screen would be
 * that. `as: "student"` is what the separate storage-state file used to be.
 *
 * Phone first, because that is the device the prototype is drawn for and the
 * only one most pupils have. The tablet width is here to prove the shell does
 * not fall apart on one, not because it is the primary case — and it is covered
 * nowhere else: `marketing-shots.spec.ts` shoots `/portal/student` alone, at
 * 390x844, so nine of these ten screens and the whole 768x1024 shell are only
 * exercised here.
 *
 * Migrated off `chisipite-demo` and the `VISUAL_PASS=1` gate. The readiness
 * patterns already accepted the empty states, so nothing had to be dropped or
 * guarded to move tenant.
 */

// A screen's first request pays for `next dev` compiling it, and the retry
// below needs room to run afterwards. The 60s default caps the retry budget
// rather than the assertion.
test.describe.configure({ timeout: 180_000 });
test.use({
  tenant: SCHOOL,
  as: "student",
  // See the note in teacher-portal-shots.spec.ts: the offline service worker
  // sits in front of `/api/v2` once it installs, and whether it has finished
  // installing decides whether a run passes.
  serviceWorkers: "block",
});

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

for (const viewport of [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
]) {
  test.describe(`${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const screen of SCREENS) {
      test(`${screen.slug}`, async ({ page }) => {
        const shot = shooter("schools", `student-portal-${viewport.name}`);

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
        await shot(page, screen.slug);
      });
    }
  });
}
