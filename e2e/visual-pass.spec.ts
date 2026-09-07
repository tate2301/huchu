import type { Page } from "@playwright/test";

import { test, expect } from "./_support/fixtures";
import { SCHOOL } from "./_support/tenants";
import { shooter } from "./_support/shots";

/**
 * Visual pass over the school surfaces.
 *
 * Code review cannot see rendering, so this measures what the browser actually
 * laid out at the three viewports the playbook names. It is the only spec in
 * `e2e/` that measures geometry: `_support/` has no layout helper, and the
 * measured findings in `docs/testing/e2e-status.md` §"The tables were
 * unreadable" (1145px against a 1129px viewport on /schools/students, 1944px on
 * /people) came from the walk below and nowhere else.
 *
 * ## What moved when this came onto the harness
 *
 * It used to sign in itself, against `chisipite-demo` — a tenant that no longer
 * exists on this database — behind a `VISUAL_PASS=1` gate and a storage-state
 * file in `os.tmpdir()`. All of that is now the fixture's job: `test.use`
 * nominates St Mary's and starts from a saved session, so the rate-limit
 * problem the old header described (10 credential attempts per 15 minutes)
 * cannot arise, and the run is recorded by the API coverage watcher like every
 * other suite.
 *
 * The three class-scoped routes used to name a hard-coded class id from the old
 * tenant. They now resolve a real class — preferring one with pupils on the
 * roll — and assert the heading the server derives from its name, which is what
 * the hard-coded id was standing in for.
 *
 * Two things here are load-bearing, both learned by getting them wrong:
 *
 * Page identity is asserted POSITIVELY, on the heading the page is supposed to
 * render. An earlier version asserted the absence of the admin magic-link form
 * and reported six greens over six screenshots of the *tenant* password form —
 * a different sign-in page, so the negative check never fired. Proving what a
 * page is beats enumerating what it is not.
 *
 * And the password-field count is still asserted alongside it. `checkRoute`
 * only looks for /login or /access-blocked in the pathname; a sign-in form
 * served in place, at the same URL, would pass that and fail this.
 */

test.describe.configure({ timeout: 900_000 });
test.use({ tenant: SCHOOL, as: "head" });

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844, hasTouch: true },
  { name: "tablet", width: 768, height: 1024, hasTouch: true },
  // The timetable grid is deliberately `lg` and up; without a desktop
  // viewport the pass would never look at it.
  { name: "desktop", width: 1440, height: 900, hasTouch: false },
];

type Target = { name: string; path: string; heading: string };

/** The pages whose path and heading are both known without asking the server. */
const PAGES: readonly Target[] = [
  { name: "academics", path: "/schools/academics", heading: "Academics Setup" },
  { name: "guardians", path: "/schools/guardians", heading: "Guardians" },
  { name: "students", path: "/schools/students", heading: "Students" },
  { name: "attendance", path: "/schools/attendance", heading: "Attendance" },
  { name: "teachers", path: "/schools/teachers", heading: "Teachers" },
  { name: "results", path: "/schools/results", heading: "Results" },
  { name: "timetable", path: "/schools/timetable", heading: "Timetable" },
];

/**
 * The year group a class teacher actually works in. Resolved server-side, so
 * the heading is the class name rather than "Students" — which is why these
 * three cannot go in the list above and have to ask first.
 */
const CLASS_PAGES = [
  { name: "class-students", path: (id: string) => `/schools/students/class/${id}`, heading: (n: string) => n },
  { name: "class-results", path: (id: string) => `/schools/results/class/${id}`, heading: (n: string) => `${n} marks` },
  { name: "class-fees", path: (id: string) => `/schools/finance/class/${id}`, heading: (n: string) => `${n} fees` },
];

/**
 * A class with pupils on the roll, so an empty page cannot pass for a laid-out
 * one. Falls back to the first class rather than failing: the geometry check is
 * still worth running over an empty table, and the row count logged below is
 * what tells the two apart.
 */
async function aClass(page: Page): Promise<{ id: string; name: string }> {
  const list = await page.request.get("/api/v2/schools/classes?limit=25");
  expect(list.status()).toBeLessThan(400);
  const body = await list.json();
  const candidates: { id: string; name: string }[] = body?.data ?? [];
  expect(candidates.length, "the school tenant has no classes to open").toBeGreaterThan(0);

  for (const candidate of candidates) {
    const roll = await page.request.get(
      `/api/v2/schools/students?classId=${candidate.id}&limit=1`,
    );
    const rollBody = await roll.json().catch(() => null);
    if ((rollBody?.data?.length ?? 0) > 0) return candidate;
  }
  return candidates[0];
}

/**
 * Arrive, prove where we are, photograph it, then measure it.
 *
 * Everything after the screenshot is the reason this spec exists; everything
 * before it is making sure the thing being measured is the page and not a
 * spinner or a login form.
 */
async function layoutPass(
  page: Page,
  viewport: (typeof VIEWPORTS)[number],
  target: Target,
): Promise<void> {
  const shot = shooter("schools", `visual-pass-${viewport.name}`);

  /*
    Warm the route in this context before navigating to it.

    `next dev` compiles a route on first request, and the first viewport to
    reach a cold one can spend longer than the 30-second data gate waiting —
    the phone run failed three separate times on pages that were fine at the
    next two viewports. That is an artefact of the harness, not of the product,
    and re-running until it passes is how a flaky suite gets trusted when it
    should not be. `page.request` shares this context's cookies, so this is the
    same warm-up the old `beforeAll` did, without a second auth state.
  */
  await page.request.get(target.path).catch(() => undefined);

  await page.goto(target.path);
  // Not networkidle: the app holds an open server-sent-event stream, so the
  // network never goes quiet. Wait for the data instead of for a timer — a
  // screenshot taken while a table still says "Loading…" tells you nothing
  // about how the loaded page looks.
  await page.waitForLoadState("domcontentloaded");

  // Page identity, before anything is measured or photographed.
  // `.first()` because the design system's header renders a heading per
  // breakpoint variant and a card may repeat the word. One visible match
  // is all this needs to prove: that we are on the page, not a login form.
  await expect(
    page.getByRole("heading", { name: target.heading, exact: true }).first(),
    `never rendered the "${target.heading}" heading — landed on ${page.url()}`,
  ).toBeVisible({ timeout: 60_000 });
  expect(
    new URL(page.url()).pathname,
    `redirected away from ${target.path} — landed on ${page.url()}`,
  ).toBe(target.path);
  await expect(
    page.locator('input[type="password"]'),
    "a password field is on screen — this is a sign-in page, not the app",
  ).toHaveCount(0);

  // Visible only. A bare `text=/Loading/i` also matches every ancestor
  // that contains the string and every hidden tab panel on the page, so
  // it counted six matches for one spinner and could never reach zero
  // while an unrelated inactive view was still fetching.
  await expect
    .poll(async () => page.getByText(/Loading/i).filter({ visible: true }).count(), {
      timeout: 30_000,
      intervals: [500],
    })
    .toBe(0);

  await shot(page, target.name);

  // What counts as overflow needs care in both directions.
  //
  // Body scrollWidth alone is too weak: a clipped inner container leaves
  // the body the right width while the content it holds is cut off.
  //
  // But "every element fits the viewport" is too strong, and wrongly so.
  // A wide table inside its own `overflow-x: auto` container is the
  // design system's deliberate answer at tablet widths — `tabletScrollable`
  // is on by default — and the user swipes the table, not the page. An
  // element that overflows a scroll container is working as intended.
  //
  // So: walk up from each element, and only count it when nothing above it
  // scrolls or clips horizontally. That is the case where the content is
  // genuinely unreachable or drags the page sideways.
  const widest = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    let worst = { selector: "", right: 0 };

    const describe = (element: Element) =>
      `${element.tagName.toLowerCase()}.${(element.getAttribute("class") ?? "").slice(0, 60)}`;

    // Walk up to whichever comes first: something that scrolls (the
    // content is reachable), or something that clips (it is not).
    const containerFor = (element: Element) => {
      let parent = element.parentElement;
      while (parent && parent !== document.documentElement) {
        const overflowX = getComputedStyle(parent).overflowX;
        if (overflowX === "auto" || overflowX === "scroll") {
          return { kind: "scrolls" as const, element: parent };
        }
        if (overflowX === "hidden" || overflowX === "clip") {
          return { kind: "clips" as const, element: parent };
        }
        parent = parent.parentElement;
      }
      return null;
    };

    const clipped: string[] = [];

    for (const element of Array.from(document.querySelectorAll("*"))) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      const container = containerFor(element);

      // Content cut off by an ancestor that does not scroll. Truncation
      // with an ellipsis does not land here — the text is replaced, so
      // the element's own box stays inside its container. Only content
      // that is genuinely lost sticks out.
      if (container?.kind === "clips") {
        const bounds = container.element.getBoundingClientRect();
        if (rect.right > bounds.right + 1 && clipped.length < 5) {
          clipped.push(
            `${describe(element)} reaches ${Math.round(rect.right)}px, ` +
              `clipped by ${describe(container.element)} at ${Math.round(bounds.right)}px`,
          );
        }
      }

      if (rect.right <= worst.right) continue;
      if (container) continue;
      worst = { selector: describe(element), right: Math.round(rect.right) };
    }

    return {
      ...worst,
      clipped,
      viewportWidth,
      documentScroll: document.documentElement.scrollWidth,
    };
  });

  expect(
    widest.clipped,
    `${target.path} at ${viewport.width}px: content is cut off by a non-scrolling ancestor`,
  ).toEqual([]);

  // The page itself must never scroll sideways, whatever is inside it.
  expect(
    widest.documentScroll,
    `${target.path} at ${viewport.width}px: the page scrolls horizontally ` +
      `(${widest.documentScroll}px of content in a ${widest.viewportWidth}px viewport)`,
  ).toBeLessThanOrEqual(widest.viewportWidth + 1);

  // Row counts go in the log because "no overflow" over an empty table is
  // not the same result as "no overflow" over a full one, and the
  // screenshot alone does not distinguish an empty state from a fetch
  // that silently returned nothing.
  const rows = await page.locator("table tbody tr, [data-slot='mobile-list-row']").count();
  console.log(
    `RESULT ${viewport.name} ${target.name}: rows=${rows} ` +
      `widest=${widest.right}px doc=${widest.documentScroll}px ` +
      `viewport=${widest.viewportWidth}px (${widest.selector})`,
  );

  expect(
    widest.right,
    `${target.path} at ${viewport.width}px: "${widest.selector}" reaches ${widest.right}px, past the ${widest.viewportWidth}px viewport`,
  ).toBeLessThanOrEqual(widest.viewportWidth + 1);
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} ${viewport.width}x${viewport.height}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.hasTouch,
    });

    for (const target of PAGES) {
      test(`${target.name} lays out without horizontal overflow`, async ({ page }) => {
        await layoutPass(page, viewport, target);
      });
    }

    for (const target of CLASS_PAGES) {
      test(`${target.name} lays out without horizontal overflow`, async ({ page }) => {
        const klass = await aClass(page);
        await layoutPass(page, viewport, {
          name: target.name,
          path: target.path(klass.id),
          heading: target.heading(klass.name),
        });
      });
    }
  });
}
