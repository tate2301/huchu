import { expect, test, type Page } from "@playwright/test";

/**
 * Voiding a receipt, under a manager's approval, at the till.
 *
 * S-7.7 closed the last open item in §4A′ of
 * `docs/retail/pos-production-readiness-2026-08-17.md`. Refund and void share
 * the approval mechanism and the same gate, so the risk left here was small —
 * but small is not none: a void is a different service call
 * (`voidRetailSaleTransaction`, not `refundRetailSaleTransaction`) with its own
 * stock and ledger behaviour, and its own copy of the role guard that had to
 * learn about approvals.
 *
 * Its own file rather than another leg on `retail-workflows.spec.ts`, which
 * already runs half an hour against a loaded pooler. A failure here should say
 * "void is broken", not "the trading day timed out somewhere".
 *
 * ## Running it
 *
 *   E2E_BASE_URL=http://acme.apps.pagka.local:3000 \
 *     E2E_BROWSER_CHANNEL=chrome \
 *     npx playwright test e2e/retail-void.spec.ts
 *
 * ## It writes
 *
 * It voids a real posted sale on the demo tenant. The sale it picks is one this
 * cashier rang and nobody has reversed.
 */

const OUT = process.env.SHOT_DIR ?? "docs/retail/screenshots/workflows";
const BASE = process.env.E2E_BASE_URL ?? "http://acme.apps.pagka.local:3000";
const POS_BASE = process.env.E2E_POS_BASE_URL ?? BASE.replace("://", "://pos.");

const CASHIER_EMAIL = process.env.E2E_POS_EMAIL ?? "chipo.till@bottlestore.test";
const CASHIER_PASSWORD = process.env.E2E_POS_PASSWORD ?? "RetailDemo123!";
const MANAGER_EMAIL = process.env.E2E_RETAIL_EMAIL ?? "tafara.manager@bottlestore.test";
const MANAGER_PASSWORD = process.env.E2E_RETAIL_PASSWORD ?? CASHIER_PASSWORD;

const SETTLE_MS = Number(process.env.SHOT_SETTLE_MS ?? 9000);

test.use({ baseURL: BASE, viewport: { width: 1024, height: 768 } });

let step = 0;
async function shot(page: Page, name: string) {
  step += 1;
  await page.screenshot({
    path: `${OUT}/void-${String(step).padStart(2, "0")}-${name}.png`,
    fullPage: false,
  });
}

async function settle(page: Page, ms = SETTLE_MS) {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

test("a manager approves a void at the counter", async ({ page }) => {
  test.setTimeout(900_000);

  await page.goto(`${POS_BASE}/login`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2500);
  await page.fill("#login-email", CASHIER_EMAIL);
  await page.fill("#login-password", CASHIER_PASSWORD);
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

  await page.goto(`${POS_BASE}/history`, { waitUntil: "commit" }).catch(() => {});
  await settle(page);

  /*
    Find a receipt that can still be voided.

    The button is disabled once a sale carries any reversal, and this cashier's
    recent history is full of sales earlier runs already refunded. Rather than
    ring a fresh one — a 3-minute POST against this pooler — walk the rows and
    take the first that offers an enabled Void.
  */
  const rows = page.locator("tbody tr");
  await expect(rows.first()).toBeVisible({ timeout: 40_000 });
  const rowCount = Math.min(await rows.count(), 8);
  expect(rowCount, "no sales in this cashier's history to void").toBeGreaterThan(0);

  let voidButton = null;
  for (let index = 0; index < rowCount; index += 1) {
    await rows.nth(index).click();
    await settle(page, 3500);

    const detail = page.getByRole("dialog");
    await expect(detail).toBeVisible();

    const candidate = detail.getByRole("button", { name: "Void", exact: true });
    if (
      (await candidate.isVisible().catch(() => false)) &&
      (await candidate.isEnabled().catch(() => false))
    ) {
      voidButton = candidate;
      break;
    }

    await page.keyboard.press("Escape");
    await settle(page, 1500);
  }

  expect(
    voidButton,
    "no receipt in this cashier's history offered an enabled Void — either every one is already reversed, or the button is gated out again",
  ).not.toBeNull();
  if (!voidButton) return;

  await shot(page, "a-receipt-that-can-be-voided");
  await voidButton.click();
  await settle(page, 3500);

  const dialog = page.getByRole("dialog").last();
  // The heading, explicitly. "Void sale" is also the confirm button's label, so
  // a bare text match resolves to two elements and fails strict mode.
  await expect(dialog.getByRole("heading", { name: "Void sale" })).toBeVisible();

  await dialog.getByPlaceholder(/accidental duplicate/i).fill("Rung on the wrong till");

  /*
    Voiding is not a till permission either — `RUN_A_TILL` withholds `void` the
    same way it withholds `refund`. The approval box is the same component and
    the same server-side check; what differs is the action it is checked
    against, and that is exactly what this test is here to exercise.
  */
  await expect(
    dialog.getByText(/a manager has to approve this/i),
    "a cashier was offered a void with no approval asked for",
  ).toBeVisible();
  await dialog.getByPlaceholder("Manager email").fill(MANAGER_EMAIL);
  await dialog.getByPlaceholder("Manager password").fill(MANAGER_PASSWORD);
  await settle(page, 1500);
  await shot(page, "manager-approves-the-void");

  const confirm = dialog.getByRole("button", { name: "Void sale", exact: true });
  await expect(confirm).toBeEnabled();
  await confirm.click();

  /*
    The confirm going away is the server having accepted it — not "a dialog is
    hidden", which also matches the receipt dialog stacked behind this one and
    cost a 180s false failure on the refund leg.
  */
  await expect(
    confirm,
    "the void was refused — the manager approval did not verify",
  ).toBeHidden({ timeout: 300_000 });
  await settle(page, 6000);
  await shot(page, "voided");
});
