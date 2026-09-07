import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * A trading day at the till, photographed a step at a time.
 *
 * `retail-shots.spec.ts` proves every screen *renders*. This one proves the
 * till **sells**, which is the gate `docs/retail/pos-production-readiness-2026-08-17.md`
 * §4A names and the one thing 466 unit tests could not tell us:
 *
 *   > A sale has never been rung end to end. Not by a test, not by a human.
 *   > The checkout path was rewritten twice this week — S-3 moved price
 *   > resolution to the core engine, S-4b moved item identity from
 *   > `RetailCatalogItem` to `Product` — and neither change has been exercised
 *   > through the UI.
 *
 * The sale here is real: catalogue grid, cart, tender keys, Charge button, and
 * a row in `RetailSale` at the end of it. If the money path is broken this test
 * is red, rather than leaving a screenshot for somebody to squint at.
 *
 * ## Why it is one long test
 *
 * Because a shift is. Playwright gives each `test()` a fresh browser context,
 * and opening a drawer in one test then selling from it in another would need
 * the two to share a session that the runner deliberately does not share. The
 * day runs start to finish in order — open the drawer, sell, cash up — which is
 * also the only order in which any of it is true.
 *
 * ## It writes to the database
 *
 * Unlike the shots spec, this one posts sales and opens and closes a real
 * shift, against the demo tenant. Re-seed to clear them:
 *
 *   npx tsx scripts/seed-retail-demo.ts --slug acme --days 180 --reset
 *   SHOT_DIR=docs/retail/screenshots/workflows \
 *     E2E_BASE_URL=http://acme.apps.pagka.local:3000 \
 *     E2E_BROWSER_CHANNEL=chrome \
 *     npx playwright test e2e/retail-workflows.spec.ts
 */

const OUT = process.env.SHOT_DIR ?? "docs/retail/screenshots/workflows";
const BASE = process.env.E2E_BASE_URL ?? "http://acme.apps.pagka.local:3000";
const POS_BASE = process.env.E2E_POS_BASE_URL ?? BASE.replace("://", "://pos.");

/** The till admits cashiers only. See `retail-shots.spec.ts` for the detail. */
const CASHIER_EMAIL = process.env.E2E_POS_EMAIL ?? "chipo.till@bottlestore.test";
const CASHIER_PASSWORD = process.env.E2E_POS_PASSWORD ?? "RetailDemo123!";

/**
 * The manager who approves a reversal at the counter.
 *
 * Never signs in here — the POS portal would refuse them. They key their own
 * login into the approval box inside the refund dialog, which authorises that
 * one act and writes their name onto the reversal. Same seeded fixture as
 * everything else in this spec.
 */
const MANAGER_EMAIL = process.env.E2E_RETAIL_EMAIL ?? "tafara.manager@bottlestore.test";
const MANAGER_PASSWORD = process.env.E2E_RETAIL_PASSWORD ?? CASHIER_PASSWORD;

/** The till's own device. Everything here is shot at it. */
const VIEWPORT = { width: 1024, height: 768 };

const SETTLE_MS = Number(process.env.SHOT_SETTLE_MS ?? 9000);

test.use({ baseURL: BASE, viewport: VIEWPORT });

/**
 * Numbered, because the order of the steps is the point.
 *
 * Prefixed per test as well: Playwright gives each test its own module scope,
 * so a single shared counter restarts at 1 in the second test and overwrites
 * the first one's opening shots.
 */
function shooter(prefix: string) {
  let step = 0;
  return async function shot(page: Page, name: string) {
    step += 1;
    await page.screenshot({
      path: `${OUT}/${prefix}-${String(step).padStart(2, "0")}-${name}.png`,
      fullPage: false,
    });
  };
}

async function settle(page: Page, ms = SETTLE_MS) {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

async function signInAsCashier(page: Page) {
  await page.goto(`${POS_BASE}/login`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2500);

  await page.fill("#login-email", CASHIER_EMAIL);
  await page.fill("#login-password", CASHIER_PASSWORD);
  await page.click('button[type="submit"]');

  await expect
    .poll(
      async () => {
        const refusal = await page
          .getByRole("alert")
          .first()
          .textContent()
          .catch(() => null);
        if (refusal?.trim()) throw new Error(`sign-in refused: ${refusal.trim()}`);
        const cookies = await page.context().cookies();
        return cookies.some((cookie) => cookie.name.includes("session-token"));
      },
      { timeout: 45_000 },
    )
    .toBe(true);

  await page.goto(`${POS_BASE}/`, { waitUntil: "commit" }).catch(() => {});
  await settle(page);
}

/** Key a number into whichever POS field is active, using the on-screen pad. */
async function keyIn(scope: Locator, digits: string) {
  for (const digit of digits) {
    await scope.getByRole("button", { name: digit, exact: true }).first().click();
  }
}

test("a trading day: open the drawer, sell, cash up", async ({ page }) => {
  const shot = shooter("day");
  // 30 min. The day now opens a drawer, sells, refunds under approval, drops
  // cash and cashes up, and a single POST against the shared pooler has
  // measured 100s. The first version at 15 min died after the drawer closed,
  // one step short of the Z-report.
  test.setTimeout(1_800_000);

  await signInAsCashier(page);

  /* ── 1. The drawer, before anything ──────────────────────────────────── */

  await page.goto(`${POS_BASE}/shift`);
  await settle(page);
  await shot(page, "shift-before-the-day-starts");

  /*
    The seed leaves one shift open, but on whichever cashier it picked — Farai,
    as it happens, not the one this spec signs in as. Rather than depend on that
    coin flip, the spec opens its own drawer, which is a workflow worth
    photographing regardless. If this cashier already has one open, skip ahead.
  */
  const openShiftButton = page.getByRole("button", { name: "Open shift", exact: true }).first();
  const needsOpening = await openShiftButton.isVisible().catch(() => false);

  if (needsOpening) {
    await openShiftButton.click();
    await settle(page, 3000);

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await shot(page, "open-shift-register-and-float");

    // Count $200 of change into the drawer. The register preselects from the
    // shop's default, which `seed-retail-demo.ts` now actually sets.
    await dialog.getByText("Float amount").click();
    await keyIn(dialog, "200");
    await shot(page, "float-counted-in");

    await dialog.getByRole("button", { name: "Open shift", exact: true }).click();
    await settle(page, 6000);
    await shot(page, "drawer-open-for-trade");
  }

  /* ── 2. Ring a sale ──────────────────────────────────────────────────── */

  await page.goto(`${POS_BASE}/`);
  await settle(page);

  const products = page.getByTestId("pos-product");
  await expect(
    products.first(),
    "no products on the till — the drawer is shut or the shelf is empty",
  ).toBeVisible({ timeout: 40_000 });
  await shot(page, "till-open-for-trade");

  await page.fill('input[placeholder*="Scan barcode"]', "castle");
  await settle(page, 4000);
  await expect(products.first()).toBeVisible();
  await shot(page, "search-narrows-the-shelf");

  /*
    Pinned by name, not by position. Clicking `.first()` twice put *two*
    different products on the sale: adding one re-renders the grid, and the
    handle no longer pointed at the bottle it started on. Naming the product
    also makes the second click a real test of quantity — the same line going
    to 2, rather than two lines of one.
  */
  const productName = await products.first().getAttribute("data-product-name");
  const bottle = page.locator(
    `[data-testid="pos-product"][data-product-name="${productName}"]`,
  );
  await bottle.click();
  await settle(page, 2000);
  await bottle.click();
  await settle(page, 2500);

  const lines = page.getByTestId("pos-cart-line");
  await expect(
    lines,
    `two of ${productName} should be one line of quantity 2, not two lines`,
  ).toHaveCount(1);
  await shot(page, "two-on-the-sale");

  /*
    The amount due must have moved off zero. If it has not, the price engine
    failed to resolve a shelf price and everything downstream — VAT, the
    ledger, the Z-report — is arithmetic on nothing. This is the assertion that
    S-3 and S-4b actually landed.
  */
  const amountDue = page.locator('text="Amount Due"').locator("..");
  const dueText = (await amountDue.innerText()).replace(/\s+/g, " ");
  expect(
    dueText,
    `amount due stayed at zero after adding ${productName} — no price resolved`,
  ).not.toMatch(/Amount Due\s+0\.00/i);

  /*
    Pay. The presets are exact / round up to 5 / round up to 10, which is how a
    customer actually hands cash over; the last one guarantees change to count
    back, which is the number a cashier most needs to be right.
  */
  const presets = page.getByTestId("pos-cash-preset");
  await expect(presets.first()).toBeVisible();
  await presets.last().click();
  await settle(page, 2500);
  await shot(page, "cash-tendered-change-due");

  const charge = page.getByTestId("pos-charge");
  await expect(charge).toBeEnabled();
  await charge.click();

  /*
    The receipt is the whole point of this file. A dialog here means a
    `RetailSale` row was written, its lines and payments balanced, and the
    server accepted the basket the UI built.
  */
  /*
    Three minutes, not one. Posting a sale is one transaction but a fat one —
    lines, payments, stock movements and the journal — and against a shared
    pooled Neon endpoint with a dev server and a test run competing for it, a
    `POST /pos/sales` measured 90s at the start of a long session and 3.0min by
    the end of one. A run at a 90s ceiling, and later a 180s one, failed on the
    assertion while the server returned 200 — a timeout reported as "the sale
    did not complete", which is the most misleading thing this spec could say.
    Five minutes is not a performance target, it is a refusal to lie about why
    a run went red.
  */
  const receipt = page.getByTestId("pos-sale-complete");
  await expect(receipt, "the sale did not complete — no receipt dialog").toBeVisible({
    timeout: 300_000,
  });
  await shot(page, "sale-complete-change-to-count-back");

  /*
    Two shapes are legitimate. The server allocates `S-000123` from
    `reserveIdentifier`; the till supplies its own `RSL-<epoch><random>` as an
    idempotency key, and a supplied number wins. Both are real receipt numbers
    — see the follow-up on giving the customer-facing one a human size.
  */
  const receiptText = await receipt.innerText();
  expect(receiptText, "the receipt names no sale number").toMatch(/\b(?:RSL|S)-\d+/);

  await page.keyboard.press("Escape");
  await settle(page, 3000);
  await expect(page.getByTestId("pos-cart-line")).toHaveCount(0);
  await shot(page, "clean-till-next-customer");

  /* ── 3. The sale is on the system ────────────────────────────────────── */

  await page.goto(`${POS_BASE}/history`);
  await settle(page);
  await shot(page, "history-the-sale-just-rung");

  await page.goto(`${POS_BASE}/activity`);
  await settle(page);
  await shot(page, "activity-what-this-till-has-done");

  /* ── 3b. The customer brings it back ─────────────────────────────────── */

  /*
    S-7.7. Refunding is not a till permission — `RUN_A_TILL` grants `view`,
    `create`, `open-shift` and `close-shift` and withholds `refund` — but the
    POS portal admits only cashiers, so gating the button on "is a manager"
    hid it from everybody who can reach the screen. Reversals were unreachable
    from the shop floor entirely.

    A cashier now sees the button and the manager approves the one act at the
    counter. This drives that whole path, which is the only way to know the
    approval is verified rather than merely collected.
  */
  await page.goto(`${POS_BASE}/history`);
  await settle(page);

  await page.locator("tbody tr").first().click();
  await settle(page, 4000);

  const detail = page.getByRole("dialog");
  await expect(detail).toBeVisible();
  await shot(page, "the-receipt-they-brought-back");

  const refundButton = detail.getByRole("button", { name: "Refund", exact: true });
  await expect(
    refundButton,
    "a cashier cannot see the Refund button — the manager-approval path is gone again",
  ).toBeVisible({ timeout: 20_000 });
  await refundButton.click();
  await settle(page, 4000);

  /*
    `startRefund` pre-fills every line at full quantity and a cash tender for
    the whole total, so a straight "customer brought it all back" needs only a
    reason and the approval.
  */
  const refundDialog = page.getByRole("dialog");
  await refundDialog
    .getByPlaceholder(/damaged|wrong item|changed/i)
    .or(refundDialog.locator('input[placeholder*="eason" i]'))
    .first()
    .fill("Customer changed their mind");
  await shot(page, "refund-needs-a-manager");

  /*
    The seeded manager. Credentials come from `scripts/seed-retail-demo.ts`,
    the same fixture this spec already signs in with — the point of the
    assertion is that the *server* checks them, not that they are secret.
  */
  await refundDialog.getByPlaceholder("Manager email").fill(MANAGER_EMAIL);
  await refundDialog.getByPlaceholder("Manager password").fill(MANAGER_PASSWORD);
  await settle(page, 1500);
  await shot(page, "manager-approves-at-the-counter");

  const postRefund = refundDialog.getByRole("button", { name: /post refund/i });
  await expect(postRefund).toBeEnabled();
  await postRefund.click();

  /*
    The *button* going away, not "a dialog is hidden".
    `getByRole("dialog")` also matches the sale-detail dialog stacked behind
    this one, which stays open — so the first version of this assertion timed
    out for 180s and reported "the manager approval did not verify" while the
    server had answered 201 and written the reversal. A locator that can match
    two things is not an assertion about either.
  */
  await expect(
    postRefund,
    "the refund was refused — the manager approval did not verify",
  ).toBeHidden({ timeout: 180_000 });
  await settle(page, 6000);
  await shot(page, "refunded-and-back-on-the-shelf");

  /* ── 4. Money out of the drawer, and the day's figures ───────────────── */

  await page.goto(`${POS_BASE}/shift`);
  await settle(page);
  await shot(page, "shift-mid-day");

  await page.goto(`${POS_BASE}/reports`);
  await settle(page);
  await shot(page, "reports-the-shift-so-far");

  await page.goto(`${POS_BASE}/overview`);
  await settle(page);
  await shot(page, "overview-today-at-a-glance");

  /* ── 4b. Money out of the drawer ─────────────────────────────────────── */

  /*
    A cash drop, before the cash-up rather than after, because the two are
    connected: dropping $20 to the safe lowers what the drawer should hold, and
    the closeout below has to show that. A drop the cash-up ignored would be a
    shortfall on paper every time a manager banked mid-day — which is exactly
    what S-7.1 was raised for.

    This is the one reversal-adjacent act a cashier may perform at the till:
    `retail.sell` `create` covers a movement on their own shift, where `refund`
    and `void` are withheld. See `lib/retail/permissions.ts`.
  */
  await page.goto(`${POS_BASE}/shift`);
  await settle(page);

  const moveCash = page.getByRole("button", { name: /move cash/i }).first();
  await expect(moveCash, "no way to move cash out of the drawer").toBeVisible({
    timeout: 30_000,
  });
  await moveCash.click();
  await settle(page, 3500);

  const drop = page.getByRole("dialog");
  await expect(drop).toBeVisible();
  await shot(page, "move-cash-count-the-bundle");

  /*
    Counted as notes, not typed as a total. The dialog asks for the bundle —
    `denominations` is persisted so a shop investigating a shortfall can check
    the safe against it — and the API recomputes the amount from the counts and
    refuses a mismatch, so there is no way to key a total the notes do not add
    up to. Two $10 notes.
    */
  /*
    By accessible name, which the steppers already carry — "One more 10". They
    are icon buttons, so there is no `+` text to match on; a first pass looking
    for one found nothing and failed here rather than in the app.

    USD runs 100 / 50 / 20 / 10 / … (`RETAIL_CASH_DENOMINATIONS`), so two $10
    notes is $20 to the safe.
  */
  const tenner = drop.getByRole("button", { name: "One more 10", exact: true });
  await expect(tenner, "no $10 stepper in the cash dialog").toBeVisible();
  await tenner.click();
  await tenner.click();
  await settle(page, 1500);
  await shot(page, "two-notes-to-the-safe");

  // The confirm names the amount it is about to move — "Drop to safe 20.00".
  const confirmDrop = drop.getByRole("button", { name: /drop to safe/i }).last();
  await expect(confirmDrop).toBeEnabled();
  await confirmDrop.click();
  await settle(page, 7000);
  await shot(page, "drawer-lighter-by-the-drop");

  /* ── 5. Cash up and close ────────────────────────────────────────────── */

  /*
    Closing is not only the last workflow worth photographing — it is what makes
    this spec repeatable. A run that opened a drawer and walked away left the
    next run with a shift already open, so it skipped the opening steps and the
    screenshots of them silently stopped being produced. Open, sell, close: the
    till ends the run the way it started it.
  */
  await page.goto(`${POS_BASE}/shift`);
  await settle(page);

  const closeButton = page.getByRole("button", { name: /close shift/i }).first();
  await expect(closeButton, "no way to close the shift this test opened").toBeVisible({
    timeout: 30_000,
  });
  await closeButton.click();
  await settle(page, 4000);

  const closeout = page.getByRole("dialog");
  await expect(closeout).toBeVisible();
  await shot(page, "cash-up-count-the-drawer");

  /*
    Count the drawer deliberately short by keying a round number rather than the
    expected figure. A variance is the interesting case — it is what the shop
    investigates — and a cash-up that always balances proves nothing about the
    arithmetic that finds one.
  */
  await closeout.getByText("Counted cash").click();
  await keyIn(closeout, "250");
  await settle(page, 2000);
  await shot(page, "variance-against-the-expected-figure");

  await closeout.getByRole("button", { name: /close shift/i }).click();
  await settle(page, 8000);
  await shot(page, "drawer-closed-day-done");

  /* The Z-report is the figure the shop keeps. */
  await page.goto(`${POS_BASE}/reports`);
  await settle(page);
  await shot(page, "z-report-the-days-figures");
});

/**
 * The counter tools, which do not post anything.
 *
 * Separated because they need no shift and no write, so a failure here says
 * something different from a failure above.
 */
test("the counter tools", async ({ page }) => {
  const shot = shooter("tools");
  test.setTimeout(420_000);
  await signInAsCashier(page);

  await page.goto(`${POS_BASE}/price-check`);
  await settle(page);
  await page.fill('input[placeholder*="Scan barcode"]', "castle").catch(() => {});
  await settle(page, 4000);
  await shot(page, "price-check-what-does-it-cost");

  await page.goto(`${POS_BASE}/held`);
  await settle(page);
  await shot(page, "held-parked-baskets");

  await page.goto(`${POS_BASE}/customers`);
  await settle(page);
  await shot(page, "customers-at-the-counter");

  await page.goto(`${POS_BASE}/settings`);
  await settle(page);
  await shot(page, "settings-how-this-till-is-set-up");

  await page.goto(`${POS_BASE}/help`);
  await settle(page);
  await shot(page, "help-working-this-till");

  await page.goto(`${POS_BASE}/offline`);
  await settle(page);
  await shot(page, "offline-nothing-waiting");
});
