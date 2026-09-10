import { test, expect } from "./_support/fixtures";
import { SCHOOL } from "./_support/tenants";

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
 * ## What the harness already does, and what it does not
 *
 * `_support/assert.ts`'s `watchConsole` attaches `page.on("pageerror")` on every
 * swept route, so the desktop half of the first test below is covered by
 * `schools-suite.spec.ts` — that net is how the PDF template's React #418 was
 * found (`docs/testing/e2e-status.md`). It runs at the config's default
 * viewport and only there. The **phone** width is not covered anywhere else, and
 * a mismatch in a mobile-only branch — the DataTable's mobile list, the folded
 * `RecordPageShell` rail — is only reachable at 390px.
 *
 * The second test is not covered at all. It reads the raw SSR payload, before
 * any script runs. `expectNoHydrationWarning` works on console text, so a server
 * that renders the wrong module's workspace and is corrected by the client
 * repaint is invisible to it. Grep for `.text()` across `e2e/` and this is the
 * only spec that asks for the bytes.
 *
 * Migrated off `chisipite-demo` and the `VISUAL_PASS=1` gate: the tenant is now
 * St Mary's, and the session comes from the fixture rather than a JSON file in
 * `os.tmpdir()`.
 */

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

test.describe.configure({ timeout: 300_000 });
test.use({ tenant: SCHOOL, as: "head", serviceWorkers: "block" });

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
        /*
          Hydration happens after load, so the assertion needs the frame after
          it. Anchored to the sidebar's own heading rather than a timer: it is
          rendered from the session, which is the thing that used to disagree.

          `toBeAttached`, not `toBeVisible`. The heading lives in the sidebar,
          which collapses below `md` — so at the 390px viewport this file also
          runs at, the correct label is in the DOM and not on the screen, and
          asserting visibility failed the phone case on a page that was working.
          What this test is about is *which workspace the session resolved*, and
          presence is exactly that claim; whether the sidebar happens to be open
          is a different question and not this one.
        */
        await expect(page.getByText("School Operations").first()).toBeAttached({
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
