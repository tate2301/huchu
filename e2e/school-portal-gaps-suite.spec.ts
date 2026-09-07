import { test } from "./_support/fixtures";
import { SCHOOL } from "./_support/tenants";
import { sweepTests, type Route } from "./_support/sweep";

/**
 * The four school-portal screens the portal shot specs miss.
 *
 * Teacher messages, the scheme of work, the register's old URL, and the
 * family's own message thread. Small, and worth having: messaging is the one
 * place where a parent, a teacher and a pupil write to each other, so a
 * regression there is visible to people outside the school rather than only
 * inside it.
 *
 * Two contexts, because a teacher and a parent see different products.
 */

test.describe.configure({ timeout: 600_000 });

test.describe("Teacher portal", () => {
  test.use({ tenant: SCHOOL, as: "teacher" });

  const ROUTES: readonly Route[] = [
    {
      path: "/portal/teacher/messages",
      name: "Teacher — parent messages",
      expect: /When a family writes to you about a pupil, the conversation appears here/i,
    },
    {
      path: "/portal/teacher/register",
      name: "Teacher — take the register (old URL)",
      // The register is `/attendance` now; `/register` is what the portal's own
      // navigation still links to in `lib/platform/gating/portal-isolation.ts`,
      // so the forward is load-bearing rather than legacy.
      redirectsTo: "/portal/teacher/attendance",
      expect: /Quick mark/i,
    },
    {
      path: "/portal/teacher/syllabus",
      name: "Teacher — scheme of work",
      /*
        A teacher may read the scheme and not change it. Worth asserting the
        exact refusal: `/schools/academics/syllabus` forwards administrators
        here as well, and they land on a page telling them to ask an
        administrator. Recorded in docs/testing/e2e-status.md.
      */
      expect: /A scheme of work is not yours to change/i,
    },
  ];

  sweepTests(ROUTES);
});

test.describe("Parent portal", () => {
  test.use({ tenant: SCHOOL, as: "parent" });

  sweepTests([
    {
      path: "/portal/parent/messages",
      name: "Parent — messages",
      expect: /Nothing has been sent either way/i,
    },
  ]);
});
