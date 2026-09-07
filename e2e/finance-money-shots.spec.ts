import { test, expect } from "./_support/fixtures";
import { SCHOOL } from "./_support/tenants";
import { shooter } from "./_support/shots";

/**
 * S-2.5 — money that came in and did not belong to an invoice yet.
 *
 * The Credits view is the evidence for the story: an overpayment that became a
 * balance rather than disappearing. `schools-back-office-suite.spec.ts` reaches
 * the ledger's refunds and waivers views by query parameter and never Credits;
 * `schools-suite.spec.ts` asserts `SFI-\d{5}` on the invoices view. This drives
 * the tab the way a bursar does, from the invoice list across to the credits,
 * which is the only thing that proves the two are the same screen.
 *
 * ## The path moved with the product, not with this migration
 *
 * S-4.6 made `/schools/finance` a year-group picker; the whole-school ledger —
 * structures, invoices, receipts, credits, refunds, waivers — is
 * `/schools/finance/ledger`, and `schools-fees-content.tsx` is rendered only
 * there. The old path in this file predates that split, so it now names the
 * ledger. Both assertions are unchanged.
 *
 * Migrated off `chisipite-demo` and the `VISUAL_PASS=1` gate. St Mary's is
 * seeded with 120 fee invoices, so the invoice-number assertion runs on its own
 * data.
 */

test.describe.configure({ timeout: 180_000 });
test.use({ tenant: SCHOOL, as: "head", serviceWorkers: "block" });

for (const viewport of [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test.describe(`${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("fees and finance", async ({ page }) => {
      const shot = shooter("schools", `finance-${viewport.name}`);

      await expect(async () => {
        await page.goto("/schools/finance/ledger?view=invoices");
        // An invoice number, not a rail label. The rail says "Invoices"
        // before the table has any, so matching it photographs the spinner —
        // the same mistake this suite has now made twice.
        await expect(page.getByText(/SFI-\d/).first()).toBeVisible({
          timeout: 20_000,
        });
      }).toPass({ timeout: 150_000, intervals: [2_000] });
      await shot(page, "finance");

      // The credits view is the evidence for S-2.5: an overpayment that
      // became a balance rather than disappearing.
      await page.getByRole("button", { name: /^Credits/ }).first().click();
      await expect(page.getByText(/Credit|unallocated/i).first()).toBeVisible({
        timeout: 20_000,
      });
      await shot(page, "finance-credits");
    });
  });
}
