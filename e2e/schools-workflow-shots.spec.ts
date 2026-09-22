import { test } from "./_support/fixtures";
import { SCHOOL } from "./_support/tenants";
import { shooter, VIEWPORT } from "./_support/shots";
import { visitSettled } from "./_support/nav";
import { expectHealthyPage } from "./_support/assert";

/**
 * The school workflows nothing in `e2e/` reaches.
 *
 * `schools-suite` sweeps twenty-five screens and `schools-back-office-suite`
 * twenty-five more, and between them they cover the roll, fees, results,
 * teaching, master data and the portals. Grepped on 2026-09-22, these did not
 * appear in either, nor in any shot spec, nor anywhere else under `e2e/`:
 *
 *   /schools/conduct and its three sub-pages   — the discipline record
 *   /schools/leavers, /schools/alumni          — the end of a pupil's time here
 *   /schools/boarding/{allocations,roll-call,leave,sick-bay}
 *
 * That is three whole areas of a boarding school's week with no coverage of any
 * kind. This spec photographs them, and because `expectHealthyPage` runs before
 * every shot it is also the first thing that checks they render at all.
 *
 * ## The one school screen deliberately absent
 *
 * `/schools/exams`. It is gated on `schools.exams`, which is billable and which
 * **no tier and no addon bundle in `feature-catalog.ts` carries** — so the route
 * redirects to `/access-blocked` on every tenant, and a test of it would assert
 * a catalogue gap rather than a page. `scripts/seed-school-demo.ts` seeds the
 * ZIMSEC sitting regardless and says why; add a journey here on the day the key
 * becomes sellable.
 *
 * ## Why a shot spec rather than another sweep
 *
 * A sweep answers "does it 500". These screens are the ones a school is asked
 * about by a regulator — who was on detention, who sat which paper, which child
 * signed out to which guardian on Friday — and the useful artefact is a picture
 * of the answer. The health check comes free with taking it: `expectHealthyPage`
 * fails the run on a console error, a hydration warning or a rendered `NaN`, so
 * a broken page fails here instead of being photographed.
 *
 * ## Shot at desktop only
 *
 * `visual-pass.spec.ts` measures the core screens at three widths; this one is
 * about breadth, and these are back-office screens somebody works through at a
 * desk. The portals, which are the mobile ones, have their own spec.
 *
 * Journeys land in `docs/screenshots/schools/<journey>/`.
 */

test.describe.configure({ timeout: 900_000 });
test.use({ tenant: SCHOOL, as: "head", serviceWorkers: "block" });

/** One screen, one image. */
type Shot = { path: string; name: string };

/**
 * Photograph a list of screens as one test, after checking each is healthy.
 *
 * One test per journey rather than per screen, as in `marketing-shots.spec.ts`
 * and for its reason: these are a deliverable, and half a journey is not useful,
 * so there is nothing to gain from letting one partially succeed.
 */
function journey(title: string, slug: string, shots: readonly Shot[]): void {
  test(title, async ({ page, console_ }) => {
    const shot = shooter("schools", slug);
    await page.setViewportSize(VIEWPORT.desktop);

    for (const { path, name } of shots) {
      await visitSettled(page, path);
      await expectHealthyPage(page, console_);
      await shot(page, name);
    }

    console.log(`[shots] ${title} -> ${shot.dir}`);
  });
}

journey("schools — the discipline record", "conduct", [
  { path: "/schools/conduct", name: "incidents" },
  { path: "/schools/conduct/merits", name: "merits" },
  { path: "/schools/conduct/detention", name: "detention" },
  { path: "/schools/conduct/pastoral", name: "pastoral-care" },
]);

journey("schools — the boarding week", "boarding", [
  { path: "/schools/boarding", name: "overview" },
  { path: "/schools/boarding/hostels", name: "houses" },
  { path: "/schools/boarding/allocations", name: "bed-allocations" },
  { path: "/schools/boarding/roll-call", name: "roll-call" },
  { path: "/schools/boarding/leave", name: "exeat-and-leave" },
  { path: "/schools/boarding/sick-bay", name: "sick-bay" },
]);

journey("schools — leaving, and afterwards", "leavers", [
  { path: "/schools/leavers", name: "leavers" },
  { path: "/schools/leavers/documents", name: "leaving-documents" },
  { path: "/schools/alumni", name: "alumni" },
]);

/*
  Marking through to a published report card. `schools-back-office-suite` proves
  moderation and publishing render; nothing photographs the sequence, and the
  sequence is the thing a school asks about — who marks, who checks, who
  releases.
*/
journey("schools — marking, moderation, publication", "results-publishing", [
  { path: "/schools/results/sheets", name: "result-sheets" },
  { path: "/schools/results/moderation", name: "moderation" },
  { path: "/schools/results/publish", name: "publication" },
]);

/*
  The office's own week. Each of these is health-swept somewhere and
  photographed nowhere.
*/
journey("schools — the office week", "office", [
  { path: "/schools/calendar", name: "calendar" },
  { path: "/schools/notices", name: "notices" },
  { path: "/schools/messages", name: "messages" },
  { path: "/schools/meetings", name: "parents-evenings" },
  { path: "/schools/documents", name: "documents" },
  { path: "/schools/reports", name: "reports" },
  { path: "/schools/transport", name: "transport" },
  { path: "/schools/staff", name: "support-staff" },
  { path: "/schools/subjects", name: "subjects" },
  { path: "/schools/goals", name: "subject-targets" },
]);
