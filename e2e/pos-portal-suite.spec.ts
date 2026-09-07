import { test, expect } from "./_support/fixtures";
import { RETAIL } from "./_support/tenants";
import { sweepTests, type Route } from "./_support/sweep";
import { expectHealthyPage } from "./_support/assert";
import { visitSettled } from "./_support/nav";

/**
 * The till, every screen of it, as the cashier.
 *
 * Nine of the POS portal's thirteen pages had no spec — the offline queue, the
 * activity log, the price check, the shift drawer, the reports, the settings
 * card, the help sheet, the sales history and the customer book. That is most
 * of the surface of the one module that handles cash.
 *
 * ## Why the paths change
 *
 * A cashier's session is on the POS host, and there `/portal/pos/history` is
 * served as `/history` — the portal prefix is the *internal* path and the bare
 * one is its public form. Each route therefore declares where it lands. That is
 * worth asserting rather than working around: the rewrite is what makes the
 * till a separate front door, and a rewrite that stopped firing would put the
 * portal prefix in front of a cashier, on a screen designed for a touchscreen
 * with no address bar.
 *
 * ## What this sweep found: three things the till could not read
 *
 * `/portal/pos/customers` sent every cashier to `/access-blocked`. It is gated
 * on `crm.customers` — correctly, since the shop's customer book and the CRM's
 * are the same records — and neither the `CASHIER` nor the `SHOP_MANAGER` role
 * template granted that key. The till's Customers tab was unreachable by the
 * only two roles that ever open a till, and so was the search behind the
 * checkout's customer picker, which showed an empty address book instead.
 *
 * Active promotions 403'd for the same reason on **every** POS screen, because
 * the query lives in the shared portal state. A promotion the till cannot read
 * is a promotion the shop is not running: the basket was priced at full shelf
 * price on a tenant that had bought the feature and configured one.
 *
 * The tender policy 403'd too, and that one had already been half-fixed —
 * `pos-portal-state.tsx` had been moved onto `pos/context` with a comment
 * explaining why, while the offline preload and the offline bootstrap were
 * left pointing at the gated endpoint. The bootstrap is the one that matters:
 * it fills the cache a till reads when the line is down.
 *
 * All three fail **closed and silently**, which is why nobody had reported
 * them. It is also the fourth entry in this document's running tally of pages
 * fetching what their session is not entitled to.
 */

test.describe.configure({ timeout: 900_000 });
test.use({ tenant: RETAIL, as: "cashier" });

const TILL: readonly Route[] = [
  {
    path: "/portal/pos",
    name: "Checkout",
    redirectsTo: "/",
    expect: /Castle Lager|Recall \/ search/i,
  },
  {
    path: "/portal/pos/overview",
    name: "Till overview",
    redirectsTo: "/overview",
    expect: /Your shift so far/i,
  },
  {
    path: "/portal/pos/held",
    name: "Held carts",
    redirectsTo: "/held",
    expect: /Recall any cart to instantly resume it at checkout/i,
  },
  {
    path: "/portal/pos/history",
    name: "Sales history",
    redirectsTo: "/history",
    // The seed's receipt numbering. 120 matching receipts on this fixture, so
    // an empty history here is a real failure rather than a quiet tenant.
    expect: /RSL-\d{4}/,
  },
  {
    path: "/portal/pos/activity",
    name: "Till activity log",
    redirectsTo: "/activity",
    expect: /Everything you have rung, reversed, moved or counted/i,
  },
  {
    path: "/portal/pos/shift",
    name: "Shift and drawer",
    redirectsTo: "/shift",
    expect: /RSH-\d{4}/,
  },
  {
    path: "/portal/pos/price-check",
    name: "Price check",
    redirectsTo: "/price-check",
    expect: /Scan-first, glanceable/i,
  },
  {
    path: "/portal/pos/reports",
    name: "Till reports",
    redirectsTo: "/reports",
    expect: /Sales by hour/i,
  },
  {
    path: "/portal/pos/settings",
    name: "Till settings",
    redirectsTo: "/settings",
    expect: /Everything here is read-only at the till/i,
  },
  {
    path: "/portal/pos/help",
    name: "Till help",
    redirectsTo: "/help",
    expect: /The keys, the everyday jobs, and what to do when something does not go to plan/i,
  },
  {
    path: "/portal/pos/offline",
    name: "Offline queue",
    redirectsTo: "/offline",
    expect: /Sales this till took while the line was down/i,
  },
  {
    path: "/portal/pos/customers",
    name: "Customer book at the till",
    redirectsTo: "/customers",
    // Was /access-blocked for every cashier until `crm.customers` was added to
    // the till role templates. See the header note.
    expect: /Start with at least 2 characters/i,
  },
];

sweepTests(TILL);

/**
 * The three requests the till makes that a cashier was not entitled to.
 *
 * Every one of them fails **closed**: the screen renders, the number is wrong
 * or the list is empty, and nothing says why. That is the reason this is an
 * assertion on the status code rather than on the page — a 403 and "there are
 * none" look identical from the outside, and only one of them is a bug.
 *
 *   customer search   an empty address book at checkout
 *   promotions        full shelf price on a basket that should be discounted
 *   pos/context       the tender rules the checkout enforces
 *
 * The first two were fixed in `lib/platform/user-entitlements.ts` by granting
 * the till roles `crm.customers` and `retail.promotions`. The third was fixed
 * by moving its two remaining callers onto `pos/context`, which the till is
 * entitled to — the checkout query had already been moved and the offline
 * bootstrap and preload had not.
 */
for (const [what, url] of [
  ["customer search", "/api/v2/retail/customers/search?q=mu&limit=10"],
  ["active promotions", "/api/v2/retail/promotions?status=ACTIVE&pos=1"],
  ["till context and tender rules", "/api/v2/retail/pos/context"],
] as const) {
  test(`a cashier can read ${what}`, async ({ page }) => {
    await visitSettled(page, "/portal/pos", { landsOn: "/" });

    const response = await page.request.get(url);
    expect(
      response.status(),
      `${what} answered ${response.status()} for a cashier — at the till that shows as empty, not as refused`,
    ).toBe(200);
  });
}

/**
 * The lock screen covers the whole till, not one page.
 *
 * `PosTillLockProvider` wraps every POS route in `app/portal/pos/layout.tsx`
 * precisely so a cashier stepping away leaves the basket covered wherever they
 * were. There is no point testing that on the checkout page alone.
 */
test("every till screen is inside the lock provider", async ({ page, console_ }) => {
  for (const path of ["/overview", "/history", "/shift"]) {
    await visitSettled(page, path);
    await expect(
      page.locator("body"),
      `${path} should render inside the POS frame, which carries the lock`,
    ).toContainText(/POS TERMINAL/i, { timeout: 15_000 });
  }
  await expectHealthyPage(page, console_);
});
