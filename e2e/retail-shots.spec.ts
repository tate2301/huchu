import type { Page } from "@playwright/test";

import { test, expect } from "./_support/fixtures";
import { RETAIL } from "./_support/tenants";
import { visitSettled } from "./_support/nav";
import { settle, shooter } from "./_support/shots";

/**
 * Screenshots of the Retail module and the POS till. Ticket R-6.1.
 *
 * Modelled on `hr-payroll-shots.spec.ts`, which is where the hard-won bits came
 * from — waiting on the cookie rather than the URL, parking on our own host
 * before the first real navigation, and a timeout sized to the work. All three
 * now live in `_support/auth.ts` and `_support/nav.ts` and are done once, before
 * this spec starts, by `auth.setup.ts`.
 *
 * ## Why this spec matters more than the payroll one
 *
 * As of `docs/retail/pos-production-readiness-2026-08-17.md`, **no POS screen
 * had ever been opened in a browser.** The checkout path was rewritten twice in
 * one week — S-3 moved price resolution to the core price engine, S-4b moved
 * item identity from `RetailCatalogItem` to `Product` — and neither change had
 * been exercised through the UI. 466 unit tests say the arithmetic is right;
 * none of them say a till can complete a sale.
 *
 * So this spec does two things the payroll one does not:
 *
 *  - it photographs **two personas**, because the till is a portal with its own
 *    front door and its own session: the back office is the manager, the till is
 *    the cashier, and neither session opens the other's screens;
 *  - it **fails** on an error banner rather than merely logging one. A
 *    screenshot of "Unable to load" is evidence of a broken screen, and a run
 *    that leaves a directory of those alongside a green tick is worse than no
 *    run at all.
 *
 * ## What is left here after the harness took the rest
 *
 * The route sweeps this spec used to be the only cover for now belong to
 * `retail-suite.spec.ts` and `pos-portal-suite.spec.ts`, which assert evidence
 * strings, console cleanliness and NaN poison that an error-banner regex cannot
 * see. What is unique to this file is the pictures — nothing else photographs a
 * till at all, or the back office at anything but desktop width — and the
 * keypad geometry test below, which is the only layout assertion in `e2e/`.
 *
 * ## Hosts
 *
 * There is no second base URL any more. The suite talks to one origin and
 * nominates the host per context (`_support/tenants.ts` explains why, and why it
 * is not a bypass), so `pos.acme.apps.pagka.local` needs no hosts-file line and
 * no second sign-in. The till's paths still change shape, though — see
 * `POS_SCREENS`.
 *
 * ## Running it
 *
 *   pnpm start:e2e                                  # production build, once
 *   npx playwright test e2e/retail-shots.spec.ts
 *
 * `SHOT_ONLY=retail-overview,pos-checkout` and `SHOT_VIEWPORTS=desktop` narrow a
 * re-shoot; a full pass across three viewports is slow against a dev server.
 * `SHOT_DIR` moves the output root, which is `docs/screenshots` — see
 * `_support/shots.ts` for why everything landing in one place matters.
 */

/**
 * What one screen costs, before the deliberate settle below is added to it.
 *
 * Measured against this dev server rather than guessed: a screen is ~35s
 * wall-clock end to end, and the previous 25s-per-screen budget timed the retail
 * leg out at screen 15 of 17 with nothing actually wrong.
 */
const PER_SCREEN_MS = 32_000;

type Screen = {
  name: string;
  path: string;
  /**
   * Where the path lands, when that is somewhere else. `visit()` treats an
   * unexpected destination as a failure, so an alias has to name its target.
   */
  landsOn?: string;
  prepare?: (page: Page) => Promise<void>;
};

/** The back office, in sidebar order. */
const RETAIL_SCREENS: Screen[] = [
  { name: "retail-overview", path: "/retail" },
  { name: "retail-sales", path: "/retail/sales" },
  { name: "retail-shifts", path: "/retail/shifts" },
  { name: "retail-customers", path: "/retail/customers" },
  { name: "retail-catalog", path: "/retail/catalog" },
  { name: "retail-pricing", path: "/retail/merchandising/pricing" },
  { name: "retail-promotions", path: "/retail/merchandising/promotions" },
  { name: "retail-stock", path: "/retail/stock" },
  { name: "retail-stock-count", path: "/retail/stock/count" },
  { name: "retail-purchasing-orders", path: "/retail/purchasing/orders" },
  { name: "retail-purchasing-receipts", path: "/retail/purchasing/receipts" },
  { name: "retail-reports", path: "/retail/reports" },
  { name: "retail-setup", path: "/retail/setup" },
  { name: "retail-setup-operations", path: "/retail/setup/operations" },
  { name: "retail-setup-pos-policy", path: "/retail/setup/pos-policy" },
  { name: "retail-setup-accounting", path: "/retail/setup/accounting" },
  { name: "retail-setup-branding", path: "/retail/setup/branding" },
];

/**
 * The till, in rail order.
 *
 * Two paths, one screen. `/portal/pos/held` is the *internal* path and `/held`
 * is the public form the till is actually served at — see `POS_PORTAL_LINKS` in
 * `pos-portal-layout-frame.tsx`, which swaps between them depending on whether
 * it is being served from the POS host. This spec asks for the internal path and
 * names the bare one it lands on, which is the same shape `pos-portal-suite`
 * uses: the rewrite is what makes the till a separate front door, so it is worth
 * asserting rather than working around.
 */
const POS_SCREENS: Screen[] = [
  { name: "pos-checkout", path: "/portal/pos", landsOn: "/" },
  { name: "pos-price-check", path: "/portal/pos/price-check", landsOn: "/price-check" },
  { name: "pos-held", path: "/portal/pos/held", landsOn: "/held" },
  { name: "pos-customers", path: "/portal/pos/customers", landsOn: "/customers" },
  { name: "pos-history", path: "/portal/pos/history", landsOn: "/history" },
  { name: "pos-shift", path: "/portal/pos/shift", landsOn: "/shift" },
  { name: "pos-reports", path: "/portal/pos/reports", landsOn: "/reports" },
  { name: "pos-overview", path: "/portal/pos/overview", landsOn: "/overview" },
  { name: "pos-offline-queue", path: "/portal/pos/offline", landsOn: "/offline" },
  // S-7.6. The three the contract named and the till never had.
  { name: "pos-activity", path: "/portal/pos/activity", landsOn: "/activity" },
  { name: "pos-settings", path: "/portal/pos/settings", landsOn: "/settings" },
  { name: "pos-help", path: "/portal/pos/help", landsOn: "/help" },
];

const ALL_VIEWPORTS: Array<[label: string, width: number, height: number]> = [
  ["desktop", 1440, 900],
  // The till's actual device. If only one viewport is ever shot for the POS,
  // it should be this one.
  ["tablet", 1024, 768],
  ["phone", 390, 844],
];

function only(value: string | undefined) {
  const names = (value ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  return names.length > 0 ? new Set(names) : null;
}

const screenFilter = only(process.env.SHOT_ONLY);
const viewportFilter = only(process.env.SHOT_VIEWPORTS);

/**
 * How long to let a screen settle before photographing it.
 *
 * The default suits a warm dev server. It is not always enough: against a
 * saturated Neon pooler `GET /api/v2/retail` — the back-office dashboard — has
 * been measured at 32s, and the result is a perfectly green run that
 * photographs a page of skeletons. That is the failure mode this spec exists to
 * avoid, so the wait is tunable rather than a constant somebody has to come
 * back and edit:
 *
 *   SHOT_SETTLE_MS=20000 npx playwright test …
 *
 * Raise the per-test timeouts to match, or the run will simply time out later
 * instead of screenshotting early.
 *
 * There is no `SHOT_IDLE_MS` any more, and there must not be one: the app holds
 * an open server-sent-event stream, so `networkidle` never resolves and the
 * idle wait is time-boxed to two seconds inside `visitSettled` and `settle`.
 * Waiting on it was always a way of spending the budget, never of arriving.
 */
const SETTLE_MS = Number(process.env.SHOT_SETTLE_MS ?? 8000);

function select(screens: Screen[]) {
  return screenFilter ? screens.filter((screen) => screenFilter.has(screen.name)) : screens;
}

const VIEWPORTS = viewportFilter
  ? ALL_VIEWPORTS.filter(([label]) => viewportFilter.has(label))
  : ALL_VIEWPORTS;

/**
 * Anything a screen renders when it could not load its data — or compile.
 *
 * The build-error alternatives were added after a run went green while
 * `pos-activity` was photographing Next's red "Module not found: Can't resolve
 * 'dns'" overlay. The screen had pulled `lib/prisma` into the client bundle
 * through `lib/money`, which is a total failure of the route, and the guard
 * sailed past it because the overlay says none of the application phrases.
 *
 * A dev overlay is the most complete failure a screen can have. It belongs at
 * the top of this list, not outside it — and nothing in `_support/assert.ts`
 * matches overlay text, so this regex is still the only guard against it.
 */
const ERROR_BANNER =
  /Unable to load|Failed to (fetch|load)|Something went wrong|An error occurred|Build Error|Module not found|Unhandled Runtime Error|Application error/i;

async function shoot(
  page: Page,
  shot: (page: Page, name: string) => Promise<string>,
  screen: Screen,
) {
  await visitSettled(page, screen.path, { landsOn: screen.landsOn });

  // Compile-on-first-hit takes seconds; a screenshot taken during it is a
  // picture of a skeleton. `shot()` settles again on its own, but with the
  // shorter default that suits an already-warm page.
  await settle(page, SETTLE_MS);

  if (screen.prepare) {
    await screen.prepare(page);
    await page.waitForTimeout(1500);
  }

  await shot(page, screen.name);

  // Photograph it, then fail. The picture is the evidence; the failure is what
  // stops a directory of error banners being mistaken for a passing run.
  const banner = page.getByText(ERROR_BANNER).first();
  if (await banner.isVisible().catch(() => false)) {
    const text = await banner.textContent().catch(() => null);
    throw new Error(`${screen.name} rendered an error banner: ${text?.trim()}`);
  }
}

for (const [label, width, height] of VIEWPORTS) {
  test.describe(label, () => {
    test.use({ viewport: { width, height } });

    const retail = select(RETAIL_SCREENS);
    const pos = select(POS_SCREENS);

    test.skip(retail.length === 0 && pos.length === 0, "no screens selected");

    if (retail.length > 0) {
      test.describe("back office", () => {
        test.use({ tenant: RETAIL, as: "manager" });

        test(`retail back office at ${width}x${height}`, async ({ page }) => {
          // `playwright.config.ts` sets 60s globally, which this cannot fit:
          // each screen waits SETTLE_MS for compile-on-first-hit on top of the
          // fetch. Sign-in is no longer inside that budget — `as: "manager"`
          // starts from the session `auth.setup.ts` saved, which is worth the
          // 15-25s signing in used to cost here on every viewport.
          test.setTimeout(120_000 + retail.length * (PER_SCREEN_MS + SETTLE_MS));
          const shot = shooter("retail", `back-office-${label}`);
          for (const screen of retail) {
            await shoot(page, shot, screen);
          }
        });
      });
    }

    // Declared only when it will hold something: the keypad test is desktop and
    // tablet only, and `SHOT_ONLY` can select every screen out of the till list.
    const tillHasWork = pos.length > 0 || (width >= 768 && !screenFilter);

    if (tillHasWork) {
      test.describe("the till", () => {
        /*
          The till takes a cashier, and only a cashier.

          `canAccessPosPortal` in `lib/retail/pos-host.ts` admits `CASHIER` and
          `POS_CASHIER`; everyone else is refused at sign-in with
          `POS_PORTAL_ACCESS_REQUIRED` — not redirected after, *refused*, so no
          session cookie is ever issued. Pointing both halves of this spec at the
          manager account failed here for exactly that reason, which is the gate
          working.

          `as: "cashier"` is that account, signed in through the POS portal by
          `auth.setup.ts`. The refusal itself is asserted in
          `cross-cutting.spec.ts` ("the till refuses a manager"), which is a
          better home for it than a spec whose job is pictures.
        */
        test.use({ tenant: RETAIL, as: "cashier" });

        /**
         * The keypad has to be on screen without scrolling.
         *
         * This is the requirement the checkout layout was restructured for: the
         * columns were declared only at `xl`, so on the till's actual 1024×768
         * tablet the payment rail stacked under the catalog and the keypad sat a
         * full screen below the fold. A screenshot proves that once. This proves
         * it on every run, and fails loudly the next time somebody moves the
         * keypad back inside a scroll container.
         *
         * Only from `md` up. Below that the layout is the phone one, where the
         * keypad is deliberately in a drawer.
         */
        if (width >= 768 && !screenFilter) {
          test(`the keypad needs no scrolling at ${width}x${height}`, async ({ page }) => {
            test.setTimeout(180_000 + SETTLE_MS * 2);
            await visitSettled(page, "/portal/pos", { landsOn: "/" });
            await settle(page, SETTLE_MS);

            const keypad = page.getByTestId("pos-keypad-pinned");
            // Generous, because the failure this guards against is a *layout*
            // one. The default 5s expires during a cold compile of the checkout
            // route, which reads as "the keypad is missing" when it simply is
            // not painted yet — a false red on the one assertion that has to
            // stay trustworthy.
            await expect(keypad).toBeVisible({ timeout: 30_000 });

            const box = await keypad.boundingBox();
            expect(box, "the keypad has no box, so it is not laid out").not.toBeNull();
            // Its bottom edge inside the viewport is the whole claim.
            expect(box!.y + box!.height).toBeLessThanOrEqual(height);

            // And the Charge button below it, or the cashier scrolls for that
            // instead.
            const charge = page.getByRole("button", { name: /Charge/i }).first();
            const chargeBox = await charge.boundingBox();
            expect(chargeBox).not.toBeNull();
            expect(chargeBox!.y + chargeBox!.height).toBeLessThanOrEqual(height);

            // Keys stay at or above the 44px touch minimum however short the
            // screen.
            const seven = keypad.getByRole("button", { name: "7", exact: true });
            const sevenBox = await seven.boundingBox();
            expect(sevenBox).not.toBeNull();
            expect(sevenBox!.height).toBeGreaterThanOrEqual(44);
          });
        }

        if (pos.length > 0) {
          test(`pos till at ${width}x${height}`, async ({ page }) => {
            test.setTimeout(120_000 + pos.length * (PER_SCREEN_MS + SETTLE_MS));
            const shot = shooter("retail", `till-${label}`);
            for (const screen of pos) {
              await shoot(page, shot, screen);
            }
          });
        }
      });
    }
  });
}
