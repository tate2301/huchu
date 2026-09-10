import { test, expect } from "./_support/fixtures";
import { RETAIL, loginFor } from "./_support/tenants";
import { visitSettled } from "./_support/nav";
import { settle, shooter, VIEWPORT } from "./_support/shots";

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
 *   npx playwright test e2e/retail-void.spec.ts
 *
 * The host, the origin and the credentials all come from `_support/tenants.ts`
 * now, and the cashier's till session from `auth.setup.ts` — which the `setup`
 * project establishes before this file runs. It used to carry its own copies of
 * `E2E_BASE_URL`, `E2E_POS_BASE_URL` and four credential variables; four copies
 * is four chances for a re-seed to leave one behind.
 *
 * The cashier arrives already signed into the till, so the sign-in leg this
 * file used to drive by hand is gone: `auth.setup.ts` signs
 * `{ tenant: RETAIL, who: "cashier", portal: "pos" }` in through `portalSignIn`
 * and fails the whole run — not just this spec — if the till login breaks. The
 * manager is never signed in at all; their credentials are typed into the
 * approval box, which is the point of the test.
 *
 * ## It writes
 *
 * It voids a real posted sale on the demo tenant. The sale it picks is one this
 * cashier rang and nobody has reversed.
 */

test.use({ tenant: RETAIL, as: "cashier", portal: "pos", viewport: VIEWPORT.till });

/** How long to let the till's history finish fetching before reading rows off it. */
const HISTORY_SETTLE_MS = 9_000;

test("a manager approves a void at the counter", async ({ page }) => {
  test.setTimeout(900_000);

  const shot = shooter("retail", "void");
  const manager = loginFor(RETAIL, "manager");

  /*
    Open the drawer if it is shut.

    `pos-history-view.tsx` renders Refund and Void only when
    `currentShift && saleType === "SALE" && status === "POSTED"` — a till with
    no open shift shows the receipt and no way to act on it. That is correct:
    a reversal belongs to a shift, and there is nowhere to put one otherwise.

    `seed-retail-demo.ts` leaves a shift open so the till is live, and this spec
    used to inherit it. Then `retail-workflows.spec.ts` — which runs a whole
    trading day and cashes up at the end — began running first, and closed it.
    The failure read "no receipt offered an enabled Void … or the button is
    gated out again", which sent me looking at the role guard; the cashier had
    1,624 voidable sales and no drawer to void them into.

    So: open one. A spec that depends on what another spec left behind is a spec
    that fails for reasons its own name cannot explain.
  */
  /*
    `/shift`, not `/` — the till's menu links the drawer controls there and the
    sell screen carries no "Open shift" of its own. The bare path, not
    `/portal/pos/shift`: on a cashier's session the portal prefix is the
    internal form and `/shift` is what the till is actually served at.

    Retried, and not swallowed. A hand-rolled `goto` with `waitUntil: "commit"`
    and a bare `.catch(() => {})` is how this silently stayed on the login page:
    the till is still settling its own client-side navigation after sign-in,
    that supersedes the `goto`, Playwright rejects with `net::ERR_ABORTED`, and
    the catch throws the only evidence away. Two minutes later the failure reads
    "no receipt offered an enabled Void", about a screen that was never open.
    `visit` in `_support/nav.ts` is that retry, kept in one place: it forgives
    the abort, asks again from a settled start, and throws naming where it
    ended up if the app genuinely redirected us.
  */
  await visitSettled(page, "/shift");
  await settle(page, 3_000);
  expect(
    new URL(page.url()).pathname,
    `asked for /shift and ended on ${page.url()}`,
  ).toBe("/shift");

  /*
    Assert, do not skip.

    The first version of this guard used `if (visible) { ... }` and, when the
    button was not where it expected, quietly did nothing — so the failure
    surfaced two minutes later as "no receipt offered an enabled Void", which
    is a sentence about the wrong screen. A setup step that cannot tell you it
    failed is worse than no setup step.
  */
  await expect(
    page.getByText("DRAWER CONTROL").first(),
    "the till's shift screen did not load — check the POS host and the session",
  ).toBeVisible({ timeout: 30_000 });

  const openShiftButton = page.getByRole("button", { name: "Open shift", exact: true }).first();
  if (await openShiftButton.isVisible().catch(() => false)) {
    await openShiftButton.click();
    await settle(page, 3_000);
    const shiftDialog = page.getByRole("dialog");
    await expect(shiftDialog).toBeVisible();

    /*
      Count the float in before confirming. The dialog's own "Open shift"
      button stays disabled until there is a figure in the drawer — which is
      right, because a till opened without counting its change cannot be
      cashed up honestly. Skipping this step is why the first version of this
      guard clicked a dead button and left the drawer shut.
    */
    await shiftDialog.getByText("Float amount").click();
    for (const digit of "200") {
      await shiftDialog.getByRole("button", { name: digit, exact: true }).first().click();
    }

    await shiftDialog.getByRole("button", { name: "Open shift", exact: true }).click();
    await settle(page, 6_000);

    // The drawer is either open now or this spec has nothing to test.
    await expect(
      page.getByText("DRAWER CONTROL").first(),
      "opened a shift but the drawer did not come up",
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("button", { name: "Open shift", exact: true }).first(),
      "the shift did not open — the till still offers to open one",
    ).toBeHidden({ timeout: 30_000 });

    /*
      Reload before going on.

      The history view renders its Refund and Void buttons only when
      `currentShift` is set, and `currentShift` comes from a React Query keyed
      `["retail-current-shift"]` that the till fetched — as null — before this
      shift existed. The offline provider persists and restores query data, so
      a plain navigation can bring the stale null back with it.

      Reloading is the cheap, honest fix for a test. That the till can hold a
      stale "no shift" after one is opened in the same session is worth a look
      of its own; it is not this spec's job to prove it.
    */
    await page.reload({ waitUntil: "domcontentloaded" });
    await settle(page, 4_000);
  }

  await visitSettled(page, "/history");
  await settle(page, HISTORY_SETTLE_MS);

  /*
    Find a receipt that can still be voided.

    The button is disabled once a sale carries any reversal, and this cashier's
    recent history is full of sales earlier runs already refunded. Rather than
    ring a fresh one — a 3-minute POST against this pooler — walk the rows and
    take the first that offers an enabled Void.
  */
  const rows = page.locator("tbody tr");
  await expect(rows.first()).toBeVisible({ timeout: 40_000 });
  /*
    Twenty-five rows, not eight.

    Eight was enough when the only reversals in this cashier's history were the
    seed's. It is not now, and the thing that fills it is *this spec succeeding*:
    every passing run voids a sale, and a void is its own receipt at the top of
    the list. Six good runs and the window is nothing but VOID receipts, none of
    which offer the button — `saleType === "SALE"` is the first half of the
    condition that renders it — so the spec fails with "no receipt offered an
    enabled Void" precisely because it has been working.

    The loop breaks on the first candidate, so the wider window costs nothing on
    a clean tenant and only pays out when the recent history is full of the
    spec's own leavings.
  */
  const rowCount = Math.min(await rows.count(), 25);
  expect(rowCount, "no sales in this cashier's history to void").toBeGreaterThan(0);

  let voidButton = null;
  for (let index = 0; index < rowCount; index += 1) {
    await rows.nth(index).click();
    await settle(page, 3_500);

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
    await settle(page, 1_500);
  }

  expect(
    voidButton,
    "no receipt in this cashier's history offered an enabled Void — either every one is already reversed, or the button is gated out again",
  ).not.toBeNull();
  if (!voidButton) return;

  await shot(page, "a-receipt-that-can-be-voided");
  await voidButton.click();
  await settle(page, 3_500);

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
  await dialog.getByPlaceholder("Manager email").fill(manager.email);
  await dialog.getByPlaceholder("Manager password").fill(manager.password);
  await settle(page, 1_500);
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
  await settle(page, 6_000);
  await shot(page, "voided");
});
