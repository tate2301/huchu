import { expect, test, type Page } from "@playwright/test";

/**
 * Overlay behaviour at phone width — the part screenshots cannot see.
 *
 * Three defects this pins down, all of them reported from a real phone and all
 * of them invisible to a static shot:
 *
 *   1. A menu opened inside the expanded sidebar painted *behind* it, because
 *      the design system's drawer carries an inline `z-index: 1100` and every
 *      overlay in this repo carried `z-50`.
 *   2. A picker opened from inside a form dialog opened behind the dialog, for
 *      the same reason in the other direction.
 *   3. Escape in that picker closed the form under it and lost everything
 *      typed — the sheet is a Radix dialog, the form is a Base UI one, and
 *      both answered the same key.
 *
 * Run against the CRM demo tenant; see `crm-shots.spec.ts` for the seed.
 */

const BASE = process.env.E2E_BASE_URL ?? "http://crmdemo.apps.pagka.local:3000";
const EMAIL = process.env.SHOT_EMAIL ?? "crm@demo.test";
const PASSWORD = process.env.SHOT_PASSWORD ?? "Password123!";

test.use({
  baseURL: BASE,
  viewport: { width: 390, height: 844 },
  launchOptions: { executablePath: "/opt/pw-browsers/chromium" },
});

async function signIn(page: Page) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);
  await page.fill("#login-email", EMAIL);
  await page.fill("#login-password", PASSWORD);
  await page.click('button[type="submit"]');
  await expect
    .poll(
      async () =>
        (await page.context().cookies()).some((cookie) =>
          cookie.name.includes("session-token"),
        ),
      { timeout: 45000 },
    )
    .toBe(true);
  await page.goto("/", { waitUntil: "commit" }).catch(() => {});
  await page.waitForTimeout(800);
}

async function openLeads(page: Page) {
  await page.goto("/crm/leads");
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(5000);
}

test("a menu opened inside the sidebar paints above it", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page);
  await openLeads(page);

  await page.locator('[data-slot="sidebar-trigger"], [data-sidebar="trigger"]').first().click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /Scrap & Recycling/i }).first().click();
  await page.waitForTimeout(1500);

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
  await signIn(page);
  await openLeads(page);

  await page.getByRole("button", { name: /New lead/i }).first().click();
  await page.waitForTimeout(2000);
  const dialog = page.locator('[data-slot="dialog-content"]').first();
  await expect(dialog).toBeVisible();

  await page.getByRole("button", { name: /Search clients/i }).first().click();
  await page.waitForTimeout(1500);

  // On a phone the picker is a sheet, not a popover floating over the form.
  const picker = page.locator(".drawer.drawer-bottom").first();
  await expect(picker).toBeVisible();
  const onTop = await page.evaluate(() => {
    const sheet = document.querySelector<HTMLElement>(".drawer.drawer-bottom");
    if (!sheet) return "no sheet";
    const box = sheet.getBoundingClientRect();
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + 30);
    return top && sheet.contains(top) ? "on top" : `covered by .${top?.className}`;
  });
  expect(onTop).toBe("on top");

  // Choosing keeps the form.
  const option = page
    .locator('[cmdk-item], [role="option"]')
    .filter({ hasText: "Zambezi Mining Supplies" })
    .first();
  await option.click();
  await page.waitForTimeout(1200);
  await expect(dialog).toBeVisible();

  // And so does dismissing without choosing. This is the regression: both
  // libraries used to answer the same Escape and the form went with it.
  await page.getByRole("button", { name: /Zambezi|Search clients/i }).first().click();
  await page.waitForTimeout(1200);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1200);
  await expect(picker).toBeHidden();
  await expect(dialog).toBeVisible();
});
