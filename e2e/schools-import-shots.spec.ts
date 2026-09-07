import { test, expect } from "./_support/fixtures";
import { SCHOOL } from "./_support/tenants";
import { shooter } from "./_support/shots";

/**
 * S-3.3 — the registrar's import screen.
 *
 * The dry-run report is the point of the screen, so this drives a real file
 * with deliberately bad rows all the way through upload → mapping → check, and
 * asserts the report shows actual rejections. A screenshot of an empty upload
 * form proves nothing about whether the thing works.
 *
 * Nothing here commits. A dry run touches the staging tables and no domain
 * table, so the tenant's data is exactly as it was afterwards.
 *
 * `/schools/imports` appears in no harness suite — grep across `e2e/` returns
 * this file alone — and this is the one member of the old `-shots` family whose
 * assertions survive the St Mary's seed unchanged, because it supplies its own
 * data. The classes it names are read back from the tenant rather than assumed,
 * which is the only thing that had to change: "Form 1" and "Form 2" were
 * `chisipite-demo`'s year groups and happen to be St Mary's as well, but a spec
 * that depends on that coincidence is one reseed from lying.
 */

test.describe.configure({ timeout: 180_000 });
test.use({ tenant: SCHOOL, as: "head", serviceWorkers: "block" });

/**
 * Two rows that are fine, and four that are not — one per kind of problem the
 * registrar will actually hit.
 *
 * `good` and `other` are real year groups on the tenant; `misspelt` is `good`
 * with a letter missing, which is what the fuzzy suggestion has to catch.
 */
function studentsCsv(good: string, other: string, misspelt: string): string {
  return `Reg No,Forename,Surname,Form,DOB
CH-0101,Tendai,Moyo,${good},2014-03-02
CH-0102,Rudo,Chikafu,${other},2013-11-14
CH-0103,Farai,Ncube,${misspelt},2014-06-30
CH-0104,Anesu,Dube,Upper Sixth,2012-01-09
CH-0105,Chipo,Marufu,${other},03/04/2019
CH-0106,,Zhou,${good},2014-08-21
`;
}

for (const viewport of [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test.describe(`${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("import: choose, map, and read the report", async ({ page }) => {
      const shot = shooter("schools", `imports-${viewport.name}`);

      // Two real year groups, so the CSV's good rows are genuinely good and the
      // misspelling below is genuinely near-miss.
      const list = await page.request.get("/api/v2/schools/classes?limit=25");
      expect(list.status()).toBeLessThan(400);
      const classes: { name: string }[] = (await list.json())?.data ?? [];
      expect(classes.length, "the school tenant has no classes to import into").toBeGreaterThan(1);
      const good = classes[0].name;
      const other = classes[1].name;
      // Drop the second letter: "Form 1" becomes "Frm 1". Near enough for the
      // suggestion, wrong enough to be rejected.
      const misspelt = good.slice(0, 1) + good.slice(2);

      // The first request to a route compiles it, which can outlast a normal
      // timeout. Retried rather than given a longer one, so a genuine failure
      // still fails fast on the second attempt.
      await expect(async () => {
        await page.goto("/schools/imports");
        // "What are you importing?" appears only in the loaded state — the
        // loading branch is skeletons with no text at all. Matching a string
        // that is in both is how this suite has photographed a spinner before.
        await expect(page.getByText("What are you importing?")).toBeVisible({
          timeout: 20_000,
        });
      }).toPass({ timeout: 120_000 });

      await shot(page, "choose");

      // Upload the file the way a registrar does.
      await page.setInputFiles("#import-file", {
        name: "students-term-2.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(studentsCsv(good, other, misspelt), "utf8"),
      });

      await expect(page.getByText("Check the columns")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("students-term-2.csv").first()).toBeVisible();
      await shot(page, "columns");

      await page.getByRole("button", { name: "Check the data" }).click();

      // The report, with real rejections in it.
      const report = page.getByTestId("import-dry-run");
      await expect(report).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("import-rejected-rows")).toBeVisible();
      await expect(page.getByText(/rows need fixing/)).toBeVisible();

      // The suggestion is the feature. If this stops appearing the screen has
      // quietly gone back to reporting foreign-key errors.
      // A string rather than the old `/did you mean "Form 1"/` regex: the year
      // group is read from the tenant now, and a name with a regex character in
      // it would silently stop matching what it names.
      await expect(page.getByText(`did you mean "${good}"`)).toBeVisible();

      await shot(page, "report");

      // The report sits inside the shell's own scroll container, so a viewport
      // screenshot stops above the table of rejections — the whole point of the
      // screen. Shot as an element instead.
      await report.scrollIntoViewIfNeeded();
      await report.screenshot({
        path: `${shot.dir}/04-rejections.png`,
      });
    });
  });
}
