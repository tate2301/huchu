import { test, expect } from "./_support/fixtures";
import { SCHOOL } from "./_support/tenants";
import { shooter } from "./_support/shots";
import { expectHealthyPage } from "./_support/assert";

/**
 * The student and parent portals, screen by screen.
 *
 * `teacher-portal-shots.spec.ts` does this for the teacher and is the shape
 * this follows. The other two portals had no such spec: `marketing-shots.spec.ts`
 * photographs one screen of each — the home screen, on a phone — and that is
 * the whole coverage. The nine and six images sitting in
 * `docs/screenshots/schools/student-portal-phone` and `…/parent-portal-phone`
 * came from pre-harness specs that have since been retired, so they cannot be
 * regenerated and nothing checks whether the screens still look like that.
 *
 * ## Why the portals are worth this and the back office is not
 *
 * Because they are the part of the system a family sees, and the only part most
 * of a school's users ever open. A head can be walked through the back office;
 * a parent gets the portal and whatever it says on its own.
 *
 * ## Signed in as the pupil and the guardian, not the head
 *
 * Both portals resolve everything from the caller's own record — the pupil's
 * enrolment, the guardian's children. A privileged account sees "this account is
 * not linked to a pupil" and every screenshot would be that. Same distinction
 * `teacher-portal-shots.spec.ts` makes with `as: "teacher"`.
 *
 * ## Widths
 *
 * Phone first, and phone is the real one: a parent checks fees standing in a
 * queue. Tablet is kept because a school laptop in the library is the other
 * place a pupil opens this. Desktop is deliberately absent — the portals are
 * built mobile-first and a 1440px screenshot of one flatters nothing.
 */

test.describe.configure({ timeout: 300_000 });

/**
 * Each screen names something only the *loaded* screen renders.
 *
 * Every pattern here also accepts the empty state, so a screen the seed does
 * not fill is still photographed rather than timing out: "No marks published
 * yet" is a real screen and a school will see it in week one. What none of them
 * accept is the skeleton, which is the thing that must not be photographed —
 * the failure `teacher-portal-shots.spec.ts` records, where the greeting
 * matched before the query had returned and every image was of a shell.
 *
 * ## No pattern here may be a navigation label
 *
 * Not "Timetable", "Marks", "Fees", "Messages". Both portals render their whole
 * nav on every screen — the rail hidden at phone width, the bottom bar visible
 * at it — so a pattern that is also a nav label matches on *every* screen, and
 * matches before any data has arrived. The first draft of this file used
 * `/timetable/i` for the student home and spent four minutes resolving it to a
 * hidden `<a class="ps-side-item">` twenty-four times over.
 *
 * So the patterns below are phrases out of the screens' own bodies, and the
 * locator is filtered to what is visible — which is `visual-pass.spec.ts`'s
 * rule for the same reason.
 */
const STUDENT_SCREENS = [
  {
    slug: "home",
    path: "/portal/student",
    ready: /Nothing left today|Nothing to hand in|Books out|How it is going/i,
  },
  {
    slug: "timetable",
    path: "/portal/student/timetable",
    ready: /No lessons on your class timetable|You are not in a year group yet|Monday|Tuesday|Wednesday|Thursday|Friday/,
  },
  {
    slug: "marks",
    path: "/portal/student/marks",
    ready: /No marks published yet|out of|Term mark/i,
  },
  {
    slug: "homework",
    path: "/portal/student/homework",
    ready: /No homework set|Handed in|Due /i,
  },
  {
    slug: "library",
    path: "/portal/student/library",
    ready: /Nothing on the shelves yet|on the shelf|All out|Borrowed — check the due date below/i,
  },
  {
    slug: "goals",
    path: "/portal/student/goals",
    ready: /No subjects yet|No mark yet|No teacher on it yet|The mark you want|What you are aiming for/i,
  },
  {
    slug: "messages",
    path: "/portal/student/notifications",
    ready: /Nothing new|Messages are switched off at your school/i,
  },
  {
    slug: "profile",
    path: "/portal/student/profile",
    ready: /Boarder|Day pupil|Not in a year group yet|How this app works/i,
  },
  {
    slug: "settings",
    path: "/portal/student/settings",
    ready: /Tell me when something arrives|That setting/i,
  },
  {
    slug: "help",
    path: "/portal/student/help",
    ready: /How do I hand work in\?|When do my marks appear\?|What is a goal for\?/i,
  },
];

const PARENT_SCREENS = [
  {
    slug: "home",
    path: "/portal/parent",
    ready: /Good morning|Good afternoon|Good evening|No register taken yet|Nothing from the school yet/i,
  },
  {
    slug: "fees",
    path: "/portal/parent/fees",
    ready: /What it is for|Download this bill|Download the statement|No bill yet/i,
  },
  {
    slug: "news",
    path: "/portal/parent/notices",
    ready: /Nothing from the school yet|Mark them all as read|Mark all read/i,
  },
  {
    slug: "attendance",
    path: "/portal/parent/attendance",
    ready: /In school|Away — excused|Every day in school|No registers yet/i,
  },
  {
    slug: "marks",
    path: "/portal/parent/marks",
    ready: /No marks published yet|Download report card|This term/i,
  },
  {
    slug: "messages",
    path: "/portal/parent/messages",
    ready: /No messages yet|Messages from teachers|The school office|Send to the office/i,
  },
  {
    slug: "profile",
    path: "/portal/parent/profile",
    ready: /Main parent|No email on file|Sign out/i,
  },
  {
    slug: "help",
    path: "/portal/parent/help",
    ready: /How do I get a receipt or a statement\?|The fees figure looks wrong\.|Why can't I see marks\?/i,
  },
];

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
];

type Screen = { slug: string; path: string; ready: RegExp };

/**
 * One screen, photographed once it has its data.
 *
 * The retry-and-reload is `teacher-portal-shots.spec.ts`'s, for the reason
 * recorded there: the app-wide hydration mismatch can leave a rebuilt tree with
 * no query in flight, and waiting longer cannot fix a page that is not waiting
 * for anything. Loading it again does.
 */
function shotTest(
  portal: "student" | "parent",
  who: "student" | "parent",
  screens: readonly Screen[],
): void {
  for (const viewport of VIEWPORTS) {
    test.describe(`${portal} portal · ${viewport.name}`, () => {
      test.use({
        tenant: SCHOOL,
        as: who,
        // The offline service worker sits in front of `/api/v2` once it
        // installs, so a run would pass or hang depending on whether the
        // install had finished. Offline behaviour has its own spec.
        serviceWorkers: "block",
        viewport: { width: viewport.width, height: viewport.height },
      });

      for (const screen of screens) {
        test(`${screen.slug}`, async ({ page, console_ }) => {
          const shot = shooter("schools", `${portal}-portal-${viewport.name}`);

          await expect(async () => {
            await page.goto(screen.path);
            await expect(
              page.getByText(screen.ready).filter({ visible: true }).first(),
            ).toBeVisible({ timeout: 20_000 });
          }).toPass({ timeout: 120_000, intervals: [2_000] });

          // And nothing still fetching. Visible only: a bare `text=/Loading/i`
          // also matches every ancestor holding the string and every hidden
          // panel, so it can never reach zero — the note is
          // `visual-pass.spec.ts`'s, and so is the fix.
          await expect
            .poll(
              async () =>
                page
                  .getByText(/Loading|Fetching|Reading your/i)
                  .filter({ visible: true })
                  .count(),
              { timeout: 30_000, intervals: [500] },
            )
            .toBe(0);

          // A portal screenshot rendering `NaN` in front of a parent is worse
          // than no screenshot, so the page is checked before it is kept.
          await expectHealthyPage(page, console_);
          await shot(page, screen.slug);
        });
      }
    });
  }
}

shotTest("student", "student", STUDENT_SCREENS);
shotTest("parent", "parent", PARENT_SCREENS);
