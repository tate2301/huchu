import type { Page } from "@playwright/test";

import { test, expect } from "./_support/fixtures";
import { SCHOOL } from "./_support/tenants";
import { shooter } from "./_support/shots";

/**
 * S-4.5 — the search box in the app bar, on a school.
 *
 * Before this it was wired to `/api/v2/crm/search`, gated on `crm.core` by URL
 * prefix, so on a school tenant every keystroke returned 403 and the palette
 * showed "Nothing matches" for a pupil sitting in the database. Driving it is
 * the only way to know that is fixed: a 200 with an empty `groups` array looks
 * identical from the server side.
 *
 * Nothing in the harness opens the command palette or calls
 * `/api/v2/records/search`, on any tenant. Migrated off `chisipite-demo` and the
 * `VISUAL_PASS=1` gate; the queries were already built from whatever the tenant
 * holds, so every assertion survives the move unchanged.
 */

test.describe.configure({ timeout: 180_000 });
test.use({ tenant: SCHOOL, as: "head", serviceWorkers: "block" });

/**
 * Open the palette from the app bar and hand back its input.
 *
 * The button is matched by its accessible name and the input by its exact
 * placeholder: the register underneath has a search box of its own and a year
 * group picker, and a loose placeholder pattern typed a pupil's surname into the
 * year group filter, which then reported the palette as broken.
 */
async function openPalette(page: Page) {
  await page.goto("/schools/students");
  const button = page.getByRole("button", { name: "Search" }).first();
  await expect(button).toBeVisible({ timeout: 30_000 });
  const input = page.getByPlaceholder("Search quick actions");

  // Clicked until it opens rather than once. The button paints before React
  // hydrates the app bar, and a click that lands in that window does nothing at
  // all — which on the phone viewport made the palette look broken while the
  // same code opened it perfectly a second later. The handler sets open rather
  // than toggling it, so clicking again is safe.
  await expect(async () => {
    await button.click();
    await expect(input).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 60_000 });

  return input;
}

for (const viewport of [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test.describe(`${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("search finds a pupil by name", async ({ page }) => {
      const shot = shooter("schools", `search-${viewport.name}`);

      // A real pupil, so the query is one that must return something. Their
      // surname rather than their full name: it is what somebody at a counter
      // types, and it exercises the two-column name match.
      const list = await page.request.get("/api/v2/schools/students?limit=25");
      expect(list.status()).toBeLessThan(400);
      const body = await list.json();
      const students: { id: string; studentNo: string; firstName: string; lastName: string }[] =
        body?.data ?? [];
      expect(students.length, "the school tenant has no students to find").toBeGreaterThan(0);
      const student = students[0];

      // The endpoint itself, first. If this 403s the palette is not the problem.
      const search = await page.request.get(
        `/api/v2/records/search?q=${encodeURIComponent(student.lastName)}`,
      );
      expect(search.status(), "school search must not be refused by the CRM gate").toBe(200);
      const searched = await search.json();
      const types: string[] = (searched?.groups ?? []).map((group: { type: string }) => group.type);
      expect(types).toContain("STUDENT");
      // Nothing from a module this tenant does not have.
      expect(types).not.toContain("DEAL");

      const palette = await openPalette(page);
      await palette.fill(student.lastName);

      // Inside the palette rather than anywhere on the page: the register behind
      // it lists the same pupil, so a page-wide assertion would pass with the
      // palette empty — which is exactly the bug being watched for.
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText("Students", { exact: true })).toBeVisible({ timeout: 20_000 });
      // `.first()`: the highlighted row's reference is also shown in the preview
      // pane beside it, so an unqualified match is two elements at desktop width
      // and one on a phone, where the pane is hidden.
      await expect(dialog.getByText(student.studentNo, { exact: true }).first()).toBeVisible();
      await shot(page, "student");
    });

    test("search finds a class and a subject", async ({ page }) => {
      const shot = shooter("schools", `search-${viewport.name}`);

      const classes = await page.request.get("/api/v2/schools/classes?limit=5");
      const subjects = await page.request.get("/api/v2/schools/subjects?limit=5");
      const klass = (await classes.json())?.data?.[0];
      const subject = (await subjects.json())?.data?.[0];
      expect(klass, "the school tenant has no classes to find").toBeTruthy();
      expect(subject, "the school tenant has no subjects to find").toBeTruthy();

      const palette = await openPalette(page);
      const dialog = page.getByRole("dialog");

      // Asserted on the CODE, not on the group heading. An earlier version
      // waited for the text "Classes", which the Shortcuts group also renders as
      // a row — so it went green against the shortcut and photographed the
      // palette before the search had returned anything. A reference number only
      // a result carries cannot do that.
      await palette.fill(klass.name.split(" ")[0]);
      await expect(dialog.getByText(klass.code, { exact: true }).first()).toBeVisible({
        timeout: 20_000,
      });
      await shot(page, "classes");

      await palette.fill(subject.name.slice(0, 4));
      await expect(dialog.getByText(subject.code, { exact: true }).first()).toBeVisible({
        timeout: 20_000,
      });
      await shot(page, "subjects");
    });
  });
}
