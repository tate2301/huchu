import { test, expect } from "./_support/fixtures";
import { SCHOOL } from "./_support/tenants";
import { shooter } from "./_support/shots";

/**
 * The teacher portal, screen by screen.
 *
 * Signed in as a *teacher* rather than the head: the portal resolves everything
 * from the caller's own teacher profile, so a privileged account sees the "you
 * are not linked to a teacher profile" state and every screen would be that.
 * The fixture's `as: "teacher"` is what the separate storage-state file used to
 * be, and it is the same distinction.
 *
 * ## What the harness covers, and what it does not
 *
 * `smoke-school.spec.ts` covers the teacher's sign-in.
 * `school-portal-gaps-suite.spec.ts` covers messages, the register's old URL and
 * the syllabus — none of which is in the list below. These thirteen screens are
 * covered nowhere else, and neither is the assertion that the class rail has
 * stopped being a skeleton before anything is judged.
 *
 * Migrated off `chisipite-demo` and the `VISUAL_PASS=1` gate. Every readiness
 * pattern below already accepted the empty state, so nothing had to be dropped
 * or guarded to move tenant.
 */

test.describe.configure({ timeout: 180_000 });
test.use({
  tenant: SCHOOL,
  as: "teacher",
  // The app registers an offline service worker. Once it installs it sits in
  // front of `/api/v2`, and a run would pass or hang depending on whether the
  // install had finished — the same test green in one context and stuck on a
  // skeleton in the next. Offline behaviour has its own spec; this one is
  // about what the screens look like.
  serviceWorkers: "block",
});

/**
 * Each screen names something only the *loaded* screen renders.
 *
 * An earlier version matched the greeting, which the skeleton state also
 * shows — every screenshot was of a shell waiting for its data. Waiting on a
 * class name, a pupil's name or a period is waiting on the query.
 */
const SCREENS = [
  { slug: "today", path: "/portal/teacher", ready: "Today's lessons" },
  { slug: "attendance", path: "/portal/teacher/attendance", ready: "on the class list" },
  { slug: "marks", path: "/portal/teacher/marks", ready: /out of|No assessments/ },
  { slug: "marks-book", path: "/portal/teacher/marks-book", ready: /Term mark|Nothing has been marked/ },
  { slug: "timetable", path: "/portal/teacher/timetable", ready: /week|Monday/i },
  { slug: "lessons", path: "/portal/teacher/lessons", ready: /lesson/i },
  { slug: "homework", path: "/portal/teacher/homework", ready: /homework|due/i },
  { slug: "files", path: "/portal/teacher/files", ready: /file|resource/i },
  { slug: "meetings", path: "/portal/teacher/meetings", ready: /slot|meeting/i },
  { slug: "reports", path: "/portal/teacher/reports", ready: /attendance|class/i },
  { slug: "profile", path: "/portal/teacher/profile", ready: /staff|subject|profile/i },
  { slug: "settings", path: "/portal/teacher/settings", ready: /notification|publish|sign out/i },
  { slug: "help", path: "/portal/teacher/help", ready: /register|mark|question/i },
];

for (const viewport of [
  { name: "tablet", width: 1024, height: 768 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test.describe(`${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const screen of SCREENS) {
      test(`${screen.slug}`, async ({ page }) => {
        const shot = shooter("schools", `teacher-portal-${viewport.name}`);

        // Reload rather than wait harder, and let the first attempt pay for
        // `next dev` compiling the screen.
        //
        // The app-wide hydration mismatch recorded in schools-open-questions
        // makes React discard the tree and rebuild it, and often enough the
        // rebuilt tree never gets its data — the page sits on its header with
        // no query in flight. Waiting longer does not help, because nothing is
        // pending; loading the page again does. Two attempts, so a screen that
        // is genuinely broken still fails.
        await expect(async () => {
          await page.goto(screen.path);
          await expect(page.getByText(screen.ready).first()).toBeVisible({
            timeout: 20_000,
          });
        }).toPass({ timeout: 150_000, intervals: [2_000] });
        // The rail is part of every screenshot, so wait for it to stop being
        // a skeleton too.
        await expect(page.getByText("Loading your classes…")).toHaveCount(0, {
          timeout: 30_000,
        });
        await shot(page, screen.slug);
      });
    }
  });
}
