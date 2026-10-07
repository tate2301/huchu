import type { Locator, Page } from "@playwright/test";

import { test, expect } from "./_support/fixtures";
import { visitSettled } from "./_support/nav";
import { settle, shooter, VIEWPORT } from "./_support/shots";
import { RETAIL } from "./_support/tenants";

/**
 * Every retail workflow, walked end to end, and photographed step by step.
 *
 * The catalogue is `docs/retail/retail-management-alignment-2026-09-29.md` §2 —
 * each test here is one of its IDs, and each photographs into
 * `docs/screenshots/retail/journey-wNN-*.png`. The till's own day (open a
 * drawer, sell, refund, drop cash, cash up, end-of-day) is
 * `retail-workflows.spec.ts`; this spec is everything around it — the product,
 * its price, its stock, the shop's settings — and the fiscal chain the till's
 * sales end on.
 *
 * Serial, because the workflows are one shop's week: the product added in W3
 * is the one repriced in W5, counted in W8 and sold and fiscalised in W17.
 *
 * ## The fiscal device
 *
 * W14 connects the shop's fiscal device to `scripts/fake-fdms.mjs`, which must
 * be running (`node scripts/fake-fdms.mjs`) on 127.0.0.1:9911, with the app's
 * `ZIMRA_FDMS_API_BASE_URL` pointing at it — a device takes its FDMS address
 * from there. The real FDMS spends a single-use activation key on
 * registration and treats every receipt as a tax document.
 *
 *   node scripts/fake-fdms.mjs &
 *   npx playwright test --project=setup --grep acme
 *   npx playwright test --project=chromium --no-deps e2e/retail-journeys.spec.ts
 */

test.describe.configure({ mode: "serial", timeout: 600_000 });

const RUN = Date.now().toString(36).slice(-4).toUpperCase();
const PRODUCT = `Mazoe Orange 2L ${RUN}`;
const SETTLE = 2_500;

/** A record's rare verb: the "…" beside its one labelled verb, then the item. */
async function moreVerb(page: Page, verb: string) {
  await page.getByRole("button", { name: "More actions" }).first().click();
  await page.getByRole("menuitem", { name: verb }).click();
}

async function dialogNamed(page: Page, name: string | RegExp): Promise<Locator> {
  const dialog = page.getByRole("dialog", { name });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  return dialog;
}

async function toast(page: Page, text: string | RegExp) {
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 60_000 });
}

/** A searchable select: open it, type, take the first option that matches. */
async function pick(page: Page, scope: Locator, trigger: string | RegExp, option: string) {
  await scope.getByRole("button", { name: trigger }).first().click();
  const search = page.getByPlaceholder(/search/i).last();
  if (await search.isVisible().catch(() => false)) await search.fill(option);
  await page.getByRole("option", { name: new RegExp(option, "i") }).first().click();
}

test.describe("the back office", () => {
  test.use({ tenant: RETAIL, as: "manager", viewport: VIEWPORT.desktop });

  test("W3 add a product", async ({ page }) => {
    const shot = shooter("retail", "journey-w03-add-a-product");
    await visitSettled(page, "/retail/products");
    await expect(page.getByRole("table")).toBeVisible({ timeout: 60_000 });
    await shot(page, "products");

    await page.getByRole("button", { name: "New product" }).click();
    const dialog = await dialogNamed(page, "New product");
    await shot(page, "new-product");

    await dialog.getByLabel("Name").fill(PRODUCT);
    await dialog.getByLabel("Price").fill("3.50");
    // Standard-rated VAT has been 15.5% since 1 January 2026 — the rate the
    // shop's current tax code and ZIMRA both charge, so the sale can be signed.
    await dialog.getByLabel("VAT %").fill("15.5");
    await dialog.getByLabel("Barcode").fill(`600${Date.now().toString().slice(-10)}`);
    await dialog.getByLabel("Sold by the").fill("bottle");
    await shot(page, "filled-in");

    await dialog.getByRole("button", { name: "Create product" }).click();
    await toast(page, "Product created");
    await expect(dialog).toBeHidden();

    await page.getByPlaceholder(/search by name/i).first().fill(RUN);
    await expect(page.getByRole("link", { name: new RegExp(PRODUCT) }).first()).toBeVisible({
      timeout: 30_000,
    });
    await settle(page, SETTLE);
    await shot(page, "on-the-list");
  });

  test("W4 take a product off sale, and back", async ({ page }) => {
    const shot = shooter("retail", "journey-w04-edit-a-product");
    await visitSettled(page, "/retail/products");
    await page.getByPlaceholder(/search by name/i).first().fill(RUN);
    await page.getByRole("link", { name: new RegExp(PRODUCT) }).first().click();
    await expect(page.getByRole("heading", { name: PRODUCT })).toBeVisible({ timeout: 60_000 });
    await settle(page, SETTLE);
    await shot(page, "the-product");

    await moreVerb(page, "Edit product");
    let dialog = await dialogNamed(page, PRODUCT);
    await shot(page, "edit-product");
    await dialog.getByLabel("On sale").click();
    await dialog.getByRole("button", { name: "Save product" }).click();
    await toast(page, "Product saved");
    await expect(page.getByText("Off sale").first()).toBeVisible({ timeout: 30_000 });
    await shot(page, "off-sale");

    await moreVerb(page, "Edit product");
    dialog = await dialogNamed(page, PRODUCT);
    await dialog.getByLabel("On sale").click();
    await dialog.getByRole("button", { name: "Save product" }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await expect(page.getByText("Off sale"), "the product did not go back on sale").toHaveCount(0, {
      timeout: 30_000,
    });
  });

  test("W5 change a price", async ({ page }) => {
    const shot = shooter("retail", "journey-w05-change-a-price");
    await visitSettled(page, "/retail/products/price-lists");
    await page.getByPlaceholder(/search by name/i).first().fill(RUN);
    await expect(page.getByText(PRODUCT).first()).toBeVisible({ timeout: 60_000 });
    await shot(page, "prices");

    // The row's own verb, drawn on the row the pointer is over.
    const row = page.getByRole("row", { name: new RegExp(PRODUCT) }).first();
    await row.hover();
    await row.getByRole("button", { name: "Change price" }).click();
    const dialog = await dialogNamed(page, /Change the price/);
    await dialog.getByLabel("Price").fill("3.75");
    await dialog.getByLabel("Was").fill("3.50");
    await shot(page, "change-price");
    await dialog.getByRole("button", { name: "Save price" }).click();
    await toast(page, "Price saved");
    await expect(page.getByText("$3.75").first()).toBeVisible({ timeout: 30_000 });
    await shot(page, "new-price");
  });

  test("W6 run a promotion", async ({ page }) => {
    const shot = shooter("retail", "journey-w06-run-a-promotion");
    await visitSettled(page, "/retail/products/promotions");
    await shot(page, "promotions");
    await page.getByRole("button", { name: "New promotion" }).click();
    const dialog = await dialogNamed(page, "New promotion");
    await dialog.getByLabel("Name").fill(`Month-end ${RUN}`);
    await dialog.getByLabel(/Percent off|Value/).first().fill("10");
    await shot(page, "new-promotion");
    await dialog.getByRole("button", { name: "Create promotion" }).click();
    await toast(page, "Promotion created");
    await expect(page.getByText(`Month-end ${RUN}`).first()).toBeVisible({ timeout: 30_000 });
    await shot(page, "running");
  });

  test("W7 order stock and receive the delivery", async ({ page }) => {
    const shot = shooter("retail", "journey-w07-order-and-deliver");
    await visitSettled(page, "/retail/buying/orders");
    await shot(page, "orders");

    await page.getByRole("button", { name: "New order" }).click();
    let dialog = await dialogNamed(page, "New order");
    await dialog.getByLabel("Supplier").fill(`Delta Beverages ${RUN}`);
    await pick(page, dialog, /Choose a product/, PRODUCT);
    await dialog.getByLabel("Quantity").first().fill("24");
    await dialog.getByLabel("Cost").first().fill("2.10");
    await shot(page, "new-order");
    await dialog.getByRole("button", { name: "Create order" }).click();
    await toast(page, "Order created");
    await expect(page.getByText(`Delta Beverages ${RUN}`).first()).toBeVisible({ timeout: 30_000 });
    await shot(page, "ordered");

    await page.getByPlaceholder(/search by order number/i).first().fill(RUN);
    await settle(page, SETTLE);
    // New orders are numbered RPO-; the seed's own is PO-00001.
    await page.getByRole("link", { name: /RPO-/ }).first().click();
    await expect(page.getByRole("heading", { name: /^RPO-/ })).toBeVisible({ timeout: 60_000 });
    await settle(page, SETTLE);
    await shot(page, "the-order");
    await page.getByRole("button", { name: "Receive a delivery" }).click();
    dialog = await dialogNamed(page, /Receive against R?PO-/);
    await shot(page, "receive-against-the-order");
    await dialog.getByRole("button", { name: "Save delivery" }).click();
    await toast(page, "Delivery saved");
    await settle(page, SETTLE);
    await shot(page, "delivered");
  });

  test("W10 add a stock location", async ({ page }) => {
    const shot = shooter("retail", "journey-w10-add-a-location");
    await visitSettled(page, "/stores/locations");
    await shot(page, "locations");
    await page.getByRole("button", { name: "New location" }).first().click();
    const dialog = await dialogNamed(page, "New location");
    await dialog.getByLabel(/^Name/).fill(`Back store ${RUN}`);
    await shot(page, "new-location");
    await dialog.getByRole("button", { name: "Create location" }).click();
    await toast(page, "Location created");
    await shot(page, "added");
  });

  test("W8 count stock", async ({ page }) => {
    const shot = shooter("retail", "journey-w08-count-stock");
    await visitSettled(page, "/retail/stock/counts");
    await shot(page, "stock-counts");
    await page.getByRole("button", { name: "Count stock" }).first().click();
    const dialog = await dialogNamed(page, "Count stock");
    await dialog.getByLabel("Product").click();
    await page.getByRole("option", { name: new RegExp(PRODUCT) }).first().click();
    await dialog.getByLabel("Counted").fill("23");
    await shot(page, "counted");
    await dialog.getByRole("button", { name: "Save count" }).click();
    await toast(page, "Stock count saved");
    await shot(page, "saved");
  });

  test("W11 add a till", async ({ page }) => {
    const shot = shooter("retail", "journey-w11-add-a-till");
    await visitSettled(page, "/retail/manage/tills");
    await expect(page.getByRole("heading", { name: "Tills" }).first()).toBeVisible({ timeout: 60_000 });
    await shot(page, "tills");
    await page.getByRole("button", { name: /^New/ }).first().click();
    const dialog = await dialogNamed(page, "New till");
    await dialog.getByLabel("Name").fill(`Bar till ${RUN}`);
    await shot(page, "new-till");
    await dialog.getByRole("button", { name: "Create till" }).click();
    await toast(page, "Till created");
    await expect(page.getByText(`Bar till ${RUN}`).first()).toBeVisible({ timeout: 30_000 });
    await shot(page, "added");
  });

  test("W12 set the till rules", async ({ page }) => {
    const shot = shooter("retail", "journey-w12-till-rules");
    await visitSettled(page, "/retail/manage/till-rules");
    await expect(page.getByText("Tenders that need a reference")).toBeVisible({ timeout: 60_000 });
    await shot(page, "till-rules");
    await page.getByRole("button", { name: "Save till rules" }).click();
    await toast(page, "Till rules saved");
    await shot(page, "saved");
  });

  test("W13 set up the accounts a sale posts to", async ({ page }) => {
    const shot = shooter("retail", "journey-w13-posting");
    await visitSettled(page, "/retail/manage/posting");
    await expect(page.getByText("Checks").first()).toBeVisible({ timeout: 60_000 });
    await shot(page, "posting");
    await page.getByRole("button", { name: "Set up the accounts" }).first().click();
    const dialog = await dialogNamed(page, "Set up the accounts");
    await dialog.getByLabel("ZWG to the US dollar").fill("27.50");
    await dialog.getByRole("button", { name: "Preview" }).click();
    await expect(dialog.getByText("Would add")).toBeVisible({ timeout: 120_000 });
    await shot(page, "preview");
    await dialog.getByRole("button", { name: "Set up the accounts" }).click();
    await toast(page, "Accounts set up");
    await settle(page, SETTLE);
    await shot(page, "set-up");
  });

  test("W14 set up and connect the fiscal device", async ({ page }) => {
    const shot = shooter("retail", "journey-w14-fiscal-device");
    await visitSettled(page, "/retail/manage/fiscal");
    await expect(page.getByLabel("Device ID", { exact: true })).toBeVisible({ timeout: 60_000 });
    await shot(page, "fiscal-device");

    // A device connects once. On a tenant this spec has already run against it
    // is connected, and its day opens with the first shift; the workflow is the same.
    const connect = page.getByRole("button", { name: "Connect" });
    if (await connect.isVisible().catch(() => false)) {
      await expect(page.getByText("Not connected yet.")).toBeVisible();
      await page.getByLabel("Device ID", { exact: true }).fill("12345");
      await page.getByLabel("Serial number", { exact: true }).fill("SN-001");
      await page.getByLabel("Taxpayer number", { exact: true }).fill("2000123456");
      await page.getByLabel("VAT number", { exact: true }).fill("22001234");
      await page.getByLabel("Activation key", { exact: true }).fill("00112233");
      await shot(page, "connect");
      await connect.click();
    }
    await expect(page.getByText(/^Connected to ZIMRA\./)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Test a receipt" })).toBeVisible();
    await shot(page, "connected");
  });
});

test.describe("the till", () => {
  test.use({ tenant: RETAIL, portal: "pos", as: "cashier", viewport: VIEWPORT.till });

  test("W16 + W17 sell the new product, and the sale is fiscalised", async ({ page }) => {
    const shot = shooter("retail", "journey-w17-fiscalise-a-sale");

    await visitSettled(page, "/shift");
    await settle(page, SETTLE);
    const open = page.getByRole("button", { name: "Open shift", exact: true }).first();
    if (await open.isVisible().catch(() => false)) {
      await open.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Open shift", exact: true }).click();
      await settle(page, 6_000);
    }

    await visitSettled(page, "/");
    const products = page.getByTestId("pos-product");
    await expect(products.first()).toBeVisible({ timeout: 60_000 });
    await page.getByPlaceholder(/scan/i).first().fill(RUN);
    await settle(page, 3_000);
    const bottle = page.locator(`[data-testid="pos-product"][data-product-name="${PRODUCT}"]`);
    await expect(bottle, "the product added in W3 is not on the till").toBeVisible({ timeout: 30_000 });
    await bottle.click();
    await settle(page, 2_000);
    await shot(page, "on-the-sale");

    await page.getByRole("button", { name: /^Charge/ }).first().click();
    const done = page.getByRole("dialog");
    await expect(done).toBeVisible({ timeout: 120_000 });
    await expect(done.getByText(/Fiscalised/), "the sale did not reach the fiscal device").toBeVisible({
      timeout: 60_000,
    });
    await shot(page, "sale-fiscalised");
  });
});
