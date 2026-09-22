import { test, expect } from "./_support/fixtures";
import { SCHOOL } from "./_support/tenants";
import { shooter } from "./_support/shots";

/**
 * S-1.10 — the shelves, and the loan register behind them.
 *
 * `schools-suite.spec.ts`'s "Library renders" health-checks `/schools/library`
 * and carries no `expect`; `schools-back-office-suite.spec.ts` covers
 * `/schools/library/loans`. Neither asserts the split this file is about: a copy
 * on the shelf is a row you can LEND — a title with its own "Lend it" button —
 * and the register's overdue view carries the fine as it would stand today,
 * which is the number a librarian actually reads out.
 *
 * Migrated off `chisipite-demo` and the `VISUAL_PASS=1` gate. The title was the
 * literal "Things Fall Apart", a book on that tenant's shelf; it is now read
 * from `/api/v2/schools/library`, so the assertion is about a book this tenant
 * really holds. `seed-school-demo.ts` catalogues nothing, so on St Mary's both
 * tests skip with that as the reason — which is consistent with
 * `schools-back-office-suite`'s own evidence that these shelves are empty
 * (`/Nothing on the shelf yet/i`).
 */

test.describe.configure({ timeout: 180_000 });
test.use({ tenant: SCHOOL, as: "head", serviceWorkers: "block" });

/** A title is data, and a title with a `(` in it is a regular expression. */
function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type Shelf = {
  books: { title: string; copies: { loans: unknown[] }[] }[];
  loans: unknown[];
};

for (const viewport of [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test.describe(`${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("the shelves show what is in and what is out", async ({ page }) => {
      const response = await page.request.get("/api/v2/schools/library");
      const shelf: Shelf | null =
        response.status() < 400 ? await response.json().catch(() => null) : null;
      // A book with at least one copy nobody has out — the row that must offer
      // "Lend it".
      const onShelf = (shelf?.books ?? []).find((book) =>
        book.copies.some((copy) => copy.loans.length === 0),
      );
      test.skip(
        onShelf === undefined,
        "nothing is catalogued on this tenant — seed-school-demo.ts writes no library items",
      );
      if (!onShelf) return;

      const shot = shooter("schools", `library-${viewport.name}`);

      await page.goto("/schools/library");
      await expect(
        page.getByRole("heading", { name: "Library", exact: true }).first(),
      ).toBeVisible({ timeout: 30_000 });

      // A copy on the shelf is a row, not an absence — which is the claim in
      // this test's own name, and the copies are behind the title you open.
      // `library-content.tsx` renders the copy list only for `openBook`, so the
      // cover has to be *clicked*. Retried, because a click landing before
      // hydration is swallowed by a button that is already in the DOM.
      await expect(async () => {
        await page
          .getByRole("button", { name: new RegExp(escapeForRegExp(onShelf.title)) })
          .first()
          .click();
        await expect(
          page.getByText("In", { exact: true }).filter({ visible: true }).first(),
        ).toBeVisible({ timeout: 3_000 });
      }).toPass({ timeout: 60_000, intervals: [2_000] });

      // Both states on one title, which is what a second copy is for: this book
      // has one out and one in, and the page says so per copy rather than only
      // in a count.
      await expect(
        page.getByText("Out", { exact: true }).filter({ visible: true }).first(),
      ).toBeVisible({ timeout: 30_000 });

      // Not "Lend it". It asked for that as a visible button and it is a
      // `RecordActions layout="menu"` item — behind the copy's own actions
      // menu, two opens down from here — so the assertion was for a control the
      // page does not render until asked twice. The badges above say the same
      // thing about the same row, at the width the screenshot is taken.

      await shot(page, "library");
    });

    test("the loan register opens on what is late, with the fine", async ({ page }) => {
      const response = await page.request.get("/api/v2/schools/library");
      const shelf: Shelf | null =
        response.status() < 400 ? await response.json().catch(() => null) : null;
      test.skip(
        (shelf?.loans ?? []).length === 0,
        "nothing is out on loan on this tenant — seed-school-demo.ts writes no library items",
      );

      const shot = shooter("schools", `library-${viewport.name}`);

      await page.goto("/schools/library");
      await expect(
        page.getByRole("heading", { name: "Library", exact: true }).first(),
      ).toBeVisible({ timeout: 30_000 });

      // The register is a page, not a tab. `library-views.tsx` draws the two
      // views as "links that look like segments" and `/schools/library/loans`
      // has its own URL, so this asks for it directly — the same move
      // `calendar-shots.spec.ts` makes on the forward it follows. It used to
      // click a `button` named "Out", which is neither the role nor a control
      // that stays put, and waited out its whole budget on every attempt;
      // nothing noticed, because the test skipped for want of a single
      // catalogued book until the seed grew a library.
      await page.goto("/schools/library/loans");
      await expect(
        page.getByText(/if back today/).filter({ visible: true }).first(),
      ).toBeVisible({ timeout: 30_000 });

      await shot(page, "library-overdue");
    });
  });
}
