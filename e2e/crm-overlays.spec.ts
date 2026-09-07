import { test, expect } from "./_support/fixtures";
import { CRM } from "./_support/tenants";
import { visitSettled } from "./_support/nav";
import type { Page } from "@playwright/test";

/**
 * Overlay behaviour at phone width — the part screenshots cannot see.
 *
 * Three defects this pins down, all of them reported from a real phone and all
 * of them invisible to a static shot:
 *
 *   1. A menu opened inside the expanded sidebar painted *behind* it, because
 *      the design system's drawer carries an inline `z-index: 1100` and every
 *      overlay in this repo carried `z-50`. The guard now is
 *      `menu z-[var(--z-overlay)]` in `components/ui/dropdown-menu.tsx`.
 *   2. A picker opened from inside a form dialog opened behind the dialog, for
 *      the same reason in the other direction.
 *   3. Escape in that picker closed the form under it and lost everything
 *      typed — the sheet is a Radix dialog, the form is a Base UI one, and
 *      both answered the same key. The fix is the capture-phase `keydown`
 *      listener in `components/ui/responsive-popover.tsx`, whose own docstring
 *      describes this bug; these tests are its regression guard.
 *
 * Nothing else in `e2e/` hit-tests with `document.elementFromPoint`, and
 * nothing else exercises the `ResponsivePopover` `compact = useIsBelow(640)`
 * branch — `marketing-shots` only goes to phone width for the school portals,
 * and `crm-suite` runs the CRM routes at the fixture's desktop viewport. So
 * this file is the only thing in the suite that reasons about stacking at all.
 *
 * Migrated off the dead `crmdemo` tenant onto the harness. Three things the
 * rewrite changed, and why:
 *
 *   - The tenant is `CRM` (`hurudza-creative`) with the saved `owner` session,
 *     so there is no hand-rolled sign-in and no hard-coded host or password —
 *     see the rule at the top of `_support/tenants.ts`.
 *   - The sidebar's workspace button was addressed by the label
 *     "Scrap & Recycling", which was `crmdemo`'s workspace label and is not
 *     this tenant's. It is addressed structurally now — the first menu button
 *     in the sidebar header is the account/workspace switcher — so the test
 *     does not break again the next time a seed changes a profile.
 *   - The `PW_CHROMIUM` / `launchOptions` guard is gone: `playwright.config.ts`
 *     picks the browser centrally from `E2E_BROWSER_CHANNEL`, which is what
 *     this workstation actually uses, and a per-file `launchOptions` would only
 *     force a second browser.
 *
 * "Zambezi Mining Supplies" survives the move: it is `CRMC-0002` in
 * `scripts/seed-crm-demo.ts`, and `seed-crm-year.ts` upserts the same name over
 * the same client number.
 */

test.use({
  tenant: CRM,
  as: "owner",
  viewport: { width: 390, height: 844 },
});

async function openLeads(page: Page) {
  await visitSettled(page, "/crm/leads");
  // The readiness gate that the old blind `waitForTimeout(5000)` was standing
  // in for. `next dev` compiles this route cold on the first run, hence the
  // generous ceiling — the assertion retries, it does not sleep.
  await expect(page.getByRole("button", { name: /New lead/i }).first()).toBeVisible({
    timeout: 90_000,
  });
}

test("a menu opened inside the sidebar paints above it", async ({ page }) => {
  test.setTimeout(180_000);
  await openLeads(page);

  await page
    .locator('[data-slot="sidebar-trigger"], [data-sidebar="trigger"]')
    .first()
    .click();

  // The workspace switcher: the first menu button in the sidebar header, which
  // is `SidebarAccountMenu`'s `DropdownMenuTrigger`. Its label is the workspace
  // label and therefore tenant-dependent, so it is not what we match on.
  const switcher = page
    .locator('[data-sidebar="header"] [data-sidebar="menu-button"]')
    .first();
  await expect(switcher).toBeVisible({ timeout: 30_000 });
  await switcher.click();

  // Bounded, and swallowed on purpose: if the menu never renders we want the
  // evaluate below to say "no menu rendered" rather than fail here with a
  // locator timeout that does not name the thing being tested.
  await page
    .locator(".menu")
    .first()
    .waitFor({ state: "visible", timeout: 15_000 })
    .catch(() => {});

  // Hit-testing rather than z-index arithmetic: what is actually on top at the
  // menu's own coordinates?
  const verdict = await page.evaluate(() => {
    const menu = document.querySelector<HTMLElement>(".menu");
    if (!menu) return "no menu rendered";
    const box = menu.getBoundingClientRect();
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + 20);
    return top && menu.contains(top) ? "on top" : `covered by .${top?.className}`;
  });
  expect(verdict).toBe("on top");
});

test("a picker opened from a form dialog stays in front of it, and Escape closes only the picker", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openLeads(page);

  await page.getByRole("button", { name: /New lead/i }).first().click();
  const dialog = page.locator('[data-slot="dialog-content"]').first();
  await expect(dialog).toBeVisible({ timeout: 30_000 });

  /*
    Scoped to the dialog, which the original did not have to be.

    This tenant's leads are titled after their client — `seed-crm-year.ts` builds
    them as "<trading name> <work>" — so "Zambezi" appears in the list *behind*
    the dialog too, and a page-wide `.first()` would find the row rather than the
    picker. The dialog is portaled after the list, so `.first()` would have
    picked the wrong one.

    The name is `/Search clients/i` only once the client query resolves; until
    then the trigger reads "Loading clients…". The retrying assertion is the
    wait — there is no sleep here.
  */
  const clientPicker = dialog.getByRole("button", { name: /Search clients/i }).first();
  await expect(clientPicker).toBeVisible({ timeout: 30_000 });
  await clientPicker.click();

  // On a phone the picker is a sheet, not a popover floating over the form.
  const picker = page.locator(".drawer.drawer-bottom").first();
  await expect(picker).toBeVisible({ timeout: 30_000 });
  const onTop = await page.evaluate(() => {
    const sheet = document.querySelector<HTMLElement>(".drawer.drawer-bottom");
    if (!sheet) return "no sheet";
    const box = sheet.getBoundingClientRect();
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + 30);
    return top && sheet.contains(top) ? "on top" : `covered by .${top?.className}`;
  });
  expect(onTop).toBe("on top");

  // Choosing keeps the form.
  //
  // The list is narrowed first: this tenant carries 35 clients where the old
  // `crmdemo` seed carried a handful, so the option is well below the fold of a
  // 390px sheet. `SearchableSelect` runs `shouldFilter={false}` and filters on
  // its own `query` state, so typing here is the same filter the user gets.
  await picker.getByPlaceholder("Search by name").fill("Zambezi");
  const option = picker
    .locator('[cmdk-item], [role="option"]')
    .filter({ hasText: "Zambezi Mining Supplies" })
    .first();
  await option.click();
  await expect(dialog).toBeVisible();
  await expect(picker).toBeHidden();

  // And so does dismissing without choosing. This is the regression: both
  // libraries used to answer the same Escape and the form went with it.
  await dialog.getByRole("button", { name: /Zambezi|Search clients/i }).first().click();
  await expect(picker).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
  await expect(dialog).toBeVisible();
});
