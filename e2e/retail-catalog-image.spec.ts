import { expect, test, type Page } from "@playwright/test";

/**
 * A shelf photograph, from the manager's dialog to the cashier's grid.
 *
 * S-7.8. `Product.imageUrl` existed and the till had always rendered it; there
 * was simply no way in the product to put a value there, so every card on the
 * till was a grey placeholder. This drives the whole path that fixes that:
 *
 *   manager → catalogue → pick a file → upload → save → cashier's grid
 *
 * Two hosts and two people, which is the point. The manager works in the back
 * office on `<tenant>` and a cashier cannot; the till is on `pos.<tenant>` and a
 * manager cannot sign into it. A photograph is only useful if it survives that
 * crossing, and nothing short of driving both halves proves it does.
 *
 * ## Running it
 *
 *   E2E_BASE_URL=http://acme.apps.pagka.local:3000 \
 *     E2E_BROWSER_CHANNEL=chrome \
 *     npx playwright test e2e/retail-catalog-image.spec.ts
 *
 * Needs `BLOB_READ_WRITE_TOKEN` set, or the endpoint answers 503 by design and
 * this fails with that message rather than something cryptic.
 *
 * ## It writes
 *
 * It uploads a real object to blob storage and sets `imageUrl` on a real
 * product in the demo tenant. Both are harmless and both persist.
 */

const OUT = process.env.SHOT_DIR ?? "docs/retail/screenshots/workflows";
const BASE = process.env.E2E_BASE_URL ?? "http://acme.apps.pagka.local:3000";
const POS_BASE = process.env.E2E_POS_BASE_URL ?? BASE.replace("://", "://pos.");

const MANAGER_EMAIL = process.env.E2E_RETAIL_EMAIL ?? "tafara.manager@bottlestore.test";
const MANAGER_PASSWORD = process.env.E2E_RETAIL_PASSWORD ?? "RetailDemo123!";
const CASHIER_EMAIL = process.env.E2E_POS_EMAIL ?? "chipo.till@bottlestore.test";
const CASHIER_PASSWORD = process.env.E2E_POS_PASSWORD ?? MANAGER_PASSWORD;

const SETTLE_MS = Number(process.env.SHOT_SETTLE_MS ?? 9000);

test.use({ baseURL: BASE, viewport: { width: 1440, height: 900 } });

let step = 0;
async function shot(page: Page, name: string) {
  step += 1;
  await page.screenshot({
    path: `${OUT}/photo-${String(step).padStart(2, "0")}-${name}.png`,
    fullPage: false,
  });
}

async function settle(page: Page, ms = SETTLE_MS) {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

async function signIn(page: Page, baseUrl: string, who: { email: string; password: string }) {
  await page.goto(`${baseUrl}/login`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2500);
  await page.fill("#login-email", who.email);
  await page.fill("#login-password", who.password);
  await page.click('button[type="submit"]');

  await expect
    .poll(
      async () => {
        const refusal = await page.getByRole("alert").first().textContent().catch(() => null);
        if (refusal?.trim()) throw new Error(`sign-in refused: ${refusal.trim()}`);
        const cookies = await page.context().cookies();
        return cookies.some((cookie) => cookie.name.includes("session-token"));
      },
      { timeout: 45_000 },
    )
    .toBe(true);

  await page.goto(`${baseUrl}/`, { waitUntil: "commit" }).catch(() => {});
  await settle(page);
}

/**
 * A real 1×1 PNG, byte for byte.
 *
 * Not a stub with a `.png` name: the endpoint sniffs the magic bytes precisely
 * so a renamed file cannot be stored and served back to a browser later, and a
 * fake would be refused — correctly — telling us nothing about the happy path.
 */
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("a manager photographs an item and the till shows it", async ({ page }) => {
  test.setTimeout(600_000);

  /* ── 1. The manager, in the back office ──────────────────────────────── */

  await signIn(page, BASE, { email: MANAGER_EMAIL, password: MANAGER_PASSWORD });

  await page.goto(`${BASE}/retail/catalog`);
  await settle(page);
  await shot(page, "the-range");

  // The pencil on the first row. Opening an existing item rather than making
  // one keeps this about the photograph and nothing else.
  const edit = page.getByRole("button", { name: /edit/i }).first();
  await expect(edit, "no way to edit an item on the range").toBeVisible({ timeout: 30_000 });
  await edit.click();
  await settle(page, 4000);

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  /*
    The field has to be reachable without expanding anything. It sat under
    "Advanced options" for one commit and that is exactly how a feature ships
    and never gets used.
  */
  const field = dialog.getByText("Shelf photo", { exact: true });
  await expect(field, "the shelf photo field is not visible without expanding anything").toBeVisible();
  await shot(page, "no-photo-yet");

  /* ── 2. Pick a file ──────────────────────────────────────────────────── */

  await dialog.locator('input[type="file"]').setInputFiles({
    name: "castle-lager.png",
    mimeType: "image/png",
    buffer: ONE_PIXEL_PNG,
  });

  /*
    The Remove button only exists once something is showing, so waiting for it
    is waiting for the preview — and it stays through the upload, because the
    local object URL is swapped for the stored one rather than cleared.
  */
  const remove = dialog.getByRole("button", { name: /remove/i });
  await expect(remove, "no preview appeared after picking a file").toBeVisible({
    timeout: 60_000,
  });

  /*
    Wait for the *upload*, not the preview — and Save being re-enabled is the
    only honest signal of it.

    The first version waited for the Replace button, which appears the instant
    the local preview does, and then clicked Save. The POST took 7.8s behind it,
    so the form still held an empty `imageUrl` and the item saved without a
    photo — both the endpoint and the PATCH answered 200 and nothing was
    persisted. That race is a real one a shopkeeper would hit, so the fix is in
    the dialog (Save is disabled while an upload is in flight) and this asserts
    the fix rather than sleeping past the problem.
  */
  const save = dialog.getByRole("button", { name: /save changes|create item/i }).last();
  await expect(save, "Save stayed enabled during an upload — the photo can be lost").toBeDisabled({
    timeout: 15_000,
  });

  const failure = page.getByText(/could not save that photo|not configured/i).first();
  if (await failure.isVisible().catch(() => false)) {
    throw new Error(`the upload was refused: ${(await failure.textContent())?.trim()}`);
  }

  await expect(save, "the upload never finished").toBeEnabled({ timeout: 120_000 });
  await expect(dialog.getByRole("button", { name: /replace/i })).toBeVisible();
  await shot(page, "photo-attached");

  /* ── 3. Save it onto the item ────────────────────────────────────────── */

  await save.click();
  await expect(dialog).toBeHidden({ timeout: 120_000 });
  await settle(page, 6000);
  await shot(page, "saved-onto-the-item");

  /*
    Reopen and confirm it stuck. A preview that survives only until the dialog
    closes is the failure this catches — the form held the URL but the save
    never carried it.
  */
  await page.getByRole("button", { name: /edit/i }).first().click();
  await settle(page, 4000);
  const reopened = page.getByRole("dialog");
  await expect(
    reopened.getByRole("button", { name: /replace/i }),
    "the photo did not survive the save",
  ).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("Escape");
  await settle(page, 2000);
});

test("the cashier's grid draws the photo", async ({ page }) => {
  test.setTimeout(420_000);

  /*
    A separate session on the other host, because that is the crossing that
    matters: the manager who took the photograph cannot open this screen, and
    the cashier who sees it cannot have taken it.
  */
  await signIn(page, POS_BASE, { email: CASHIER_EMAIL, password: CASHIER_PASSWORD });

  await page.goto(`${POS_BASE}/`);
  await settle(page);

  const products = page.getByTestId("pos-product");
  await expect(products.first()).toBeVisible({ timeout: 40_000 });

  /*
    At least one card drawing a real `<img>` rather than the package glyph.
    Scoped to the product cards so a logo or an avatar elsewhere on the page
    cannot make this pass on its own.
    */
  const withPhoto = page.locator('[data-testid="pos-product"] img');
  await expect(
    withPhoto.first(),
    "no item on the till is drawing a photograph — imageUrl is not reaching the grid",
  ).toBeVisible({ timeout: 30_000 });

  await shot(page, "the-till-grid-with-a-photo");
});
