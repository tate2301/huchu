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

      // A copy on the shelf is a row you can lend, not an absence.
      await expect(page.getByText(onShelf.title).first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByRole("button", { name: "Lend it" }).first()).toBeVisible({
        timeout: 30_000,
      });

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

      await expect(async () => {
        await page.getByRole("button", { name: "Out" }).first().click();
        await expect(page.getByText(/if back today/).first()).toBeVisible({
          timeout: 3_000,
        });
      }).toPass({ timeout: 40_000 });

      await shot(page, "library-overdue");
    });
  });
}
