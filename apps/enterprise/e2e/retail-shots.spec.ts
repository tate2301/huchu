import { expect, test, type Page } from "@playwright/test";

/**
 * Screenshots of the Retail module and the POS till. Ticket R-6.1.
 *
 * Modelled on `hr-payroll-shots.spec.ts`, which is where the hard-won bits come
 * from — waiting on the cookie rather than the URL, parking on our own host
 * before the first real navigation, and a timeout sized to the work.
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
 *  - it photographs **two hosts**, because the till lives on its own
 *    (`pos.<tenant>`) and signing into one does not sign you into the other;
 *  - it **fails** on an error banner rather than merely logging one. A
 *    screenshot of "Unable to load" is evidence of a broken screen, and a run
 *    that leaves a directory of those alongside a green tick is worse than no
 *    run at all.
 *
 * ## Running it
 *
 *   npx tsx scripts/seed-retail-demo.ts --slug acme --days 180 --reset
 *   SHOT_DIR=docs/retail/screenshots \
 *     E2E_BASE_URL=http://acme.apps.pagka.local:3000 \
 *     npx playwright test e2e/retail-shots.spec.ts
 *
 * Both hosts need a line in the hosts file — wildcards do not work there, see
 * `docs/_start-here/LOCAL_DEV.md` §7a:
 *
 *   127.0.0.1 acme.apps.pagka.local
 *   127.0.0.1 pos.acme.apps.pagka.local
 *
 * `SHOT_ONLY=retail-overview,pos-checkout` and `SHOT_VIEWPORTS=desktop` narrow a
 * re-shoot; a full pass across three viewports is slow against a dev server.
 */

const OUT = process.env.SHOT_DIR ?? "docs/retail/screenshots";
const BASE = process.env.E2E_BASE_URL ?? "http://acme.apps.pagka.local:3000";

/** The till is a separate host, so it needs a separate sign-in. */
const POS_BASE = process.env.E2E_POS_BASE_URL ?? BASE.replace("://", "://pos.");

const MANAGER_EMAIL = process.env.E2E_RETAIL_EMAIL ?? "tafara.manager@bottlestore.test";
const MANAGER_PASSWORD = process.env.E2E_RETAIL_PASSWORD ?? "RetailDemo123!";

/**
 * The till takes a cashier, and only a cashier.
 *
 * `canAccessPosPortal` in `lib/retail/pos-host.ts` admits `CASHIER` and
 * `POS_CASHIER`; everyone else is refused at sign-in with
 * `POS_PORTAL_ACCESS_REQUIRED` — not redirected after, *refused*, so no session
 * cookie is ever issued. Pointing both halves of this spec at the manager
 * account failed here for exactly that reason, which is the gate working.
 *
 * Both accounts come from `scripts/seed-retail-demo.ts`.
 */
const CASHIER_EMAIL = process.env.E2E_POS_EMAIL ?? "chipo.till@bottlestore.test";
const CASHIER_PASSWORD = process.env.E2E_POS_PASSWORD ?? MANAGER_PASSWORD;

type Screen = {
  name: string;
  path: string;
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
 * Paths are the portal-host forms (`/held`, not `/portal/pos/held`) — see
 * `POS_PORTAL_LINKS` in `pos-portal-layout-frame.tsx`, which swaps between the
 * two depending on whether it is being served from the POS host.
 */
const POS_SCREENS: Screen[] = [
  { name: "pos-checkout", path: "/" },
  { name: "pos-price-check", path: "/price-check" },
  { name: "pos-held", path: "/held" },
  { name: "pos-customers", path: "/customers" },
  { name: "pos-history", path: "/history" },
  { name: "pos-shift", path: "/shift" },
  { name: "pos-reports", path: "/reports" },
  { name: "pos-overview", path: "/overview" },
  { name: "pos-offline-queue", path: "/offline" },
  // S-7.6. The three the contract named and the till never had.
  { name: "pos-activity", path: "/activity" },
  { name: "pos-settings", path: "/settings" },
  { name: "pos-help", path: "/help" },
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
 * The defaults suit a warm dev server. They are not always enough: against a
 * saturated Neon pooler `GET /api/v2/retail` — the back-office dashboard — has
 * been measured at 32s, which is longer than the whole budget below, and the
 * result is a perfectly green run that photographs a page of skeletons. That is
 * the failure mode this spec exists to avoid, so the wait is tunable rather
 * than a constant somebody has to come back and edit:
 *
 *   SHOT_SETTLE_MS=20000 SHOT_IDLE_MS=40000 npx playwright test …
 *
 * Raise the per-test timeouts to match, or the run will simply time out later
 * instead of screenshotting early.
 */
const SETTLE_MS = Number(process.env.SHOT_SETTLE_MS ?? 8000);
const IDLE_MS = Number(process.env.SHOT_IDLE_MS ?? 15_000);

function select(screens: Screen[]) {
  return screenFilter ? screens.filter((screen) => screenFilter.has(screen.name)) : screens;
}

const VIEWPORTS = viewportFilter
  ? ALL_VIEWPORTS.filter(([label]) => viewportFilter.has(label))
  : ALL_VIEWPORTS;

/**
 * Sign in and wait on the **cookie**, not the URL.
 *
 * `NEXTAUTH_URL` pins the post-login redirect to whichever host it names, which
 * in a multi-tenant dev setup is a different host entirely. The session is
 * still issued for the host the form posted to, so the cookie is the only
 * signal that means anything here — `LOCAL_DEV.md` §9 says the same thing.
 */
async function signIn(
  page: Page,
  baseUrl: string,
  loginPath: string,
  who: { email: string; password: string },
) {
  await page.goto(`${baseUrl}${loginPath}`);
  await page.waitForLoadState("networkidle");
  // Clicking before React hydrates submits the form as a GET, which produces a
  // page of query parameters instead of a session.
  await page.waitForTimeout(2500);

  await page.fill("#login-email", who.email);
  await page.fill("#login-password", who.password);
  await page.click('button[type="submit"]');

  await expect
    .poll(
      async () => {
        // A refusal renders an alert and never mints a cookie, so surface the
        // reason rather than letting the poll time out on a silent `false`.
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

  // The post-login redirect is still in flight and will abort the first real
  // `goto`. Park on a page of our own host first.
  await page.goto(`${baseUrl}/`, { waitUntil: "commit" }).catch(() => {});
  await page.waitForTimeout(1000);
}

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
 * the top of this list, not outside it.
 */
const ERROR_BANNER =
  /Unable to load|Failed to (fetch|load)|Something went wrong|An error occurred|Build Error|Module not found|Unhandled Runtime Error|Application error/i;

async function shoot(page: Page, baseUrl: string, screen: Screen, label: string) {
  const url = `${baseUrl}${screen.path}`;
  try {
    await page.goto(url);
  } catch {
    // An aborted navigation is a race, not a broken route. One retry.
    await page.waitForTimeout(1000);
    await page.goto(url);
  }

  // Bounded. Some screens never reach `networkidle` against a dev server, and
  // an unbounded wait there eats the whole budget for a page that renders fine.
  await page.waitForLoadState("networkidle", { timeout: IDLE_MS }).catch(() => {});
  // Compile-on-first-hit takes seconds; a screenshot taken during it is a
  // picture of a skeleton.
  await page.waitForTimeout(SETTLE_MS);

  if (screen.prepare) {
    await screen.prepare(page);
    await page.waitForTimeout(1500);
  }

  await page.screenshot({ path: `${OUT}/${screen.name}-${label}.png`, fullPage: true });

  // Photograph it, then fail. The picture is the evidence; the failure is what
  // stops a directory of error banners being mistaken for a passing run.
  const banner = page.getByText(ERROR_BANNER).first();
  if (await banner.isVisible().catch(() => false)) {
    const text = await banner.textContent().catch(() => null);
    throw new Error(`${screen.name} at ${label} rendered an error banner: ${text?.trim()}`);
  }
}

test.use({ baseURL: BASE });

for (const [label, width, height] of VIEWPORTS) {
  test.describe(label, () => {
    test.use({ viewport: { width, height } });

    const retail = select(RETAIL_SCREENS);
    const pos = select(POS_SCREENS);

    test.skip(retail.length === 0 && pos.length === 0, "no screens selected");

    if (retail.length > 0) {
      test(`retail back office at ${width}x${height}`, async ({ page }) => {
        // `playwright.config.ts` sets 60s globally, which this cannot fit:
        // sign-in alone is ~30s against a dev server and each screen waits 8s
        // for compile-on-first-hit.
        // Measured, not guessed: against this dev server a screen costs ~35s
        // wall-clock end to end, and the previous 25s-per-screen budget timed
        // the retail leg out at screen 15 of 17 with nothing wrong.
        test.setTimeout(120_000 + retail.length * (32_000 + SETTLE_MS));
        await signIn(page, BASE, "/login", { email: MANAGER_EMAIL, password: MANAGER_PASSWORD });
        for (const screen of retail) {
          await shoot(page, BASE, screen, label);
        }
      });
    }

    /**
     * The keypad has to be on screen without scrolling.
     *
     * This is the requirement the checkout layout was restructured for: the
     * columns were declared only at `xl`, so on the till's actual 1024×768
     * tablet the payment rail stacked under the catalog and the keypad sat a
     * full screen below the fold. A screenshot proves that once. This proves it
     * on every run, and fails loudly the next time somebody moves the keypad
     * back inside a scroll container.
     *
     * Only from `md` up. Below that the layout is the phone one, where the
     * keypad is deliberately in a drawer.
     */
    if (width >= 768 && !screenFilter) {
      test(`the keypad needs no scrolling at ${width}x${height}`, async ({ page }) => {
        test.setTimeout(180_000 + SETTLE_MS * 2);
        await signIn(page, POS_BASE, "/login", { email: CASHIER_EMAIL, password: CASHIER_PASSWORD });
        await page.goto(`${POS_BASE}/`);
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(8000);

        const keypad = page.getByTestId("pos-keypad-pinned");
        // Generous, because the failure this guards against is a *layout* one.
        // The default 5s expires during a cold compile of the checkout route,
        // which reads as "the keypad is missing" when it simply is not painted
        // yet — a false red on the one assertion that has to stay trustworthy.
        await expect(keypad).toBeVisible({ timeout: 30_000 });

        const box = await keypad.boundingBox();
        expect(box, "the keypad has no box, so it is not laid out").not.toBeNull();
        // Its bottom edge inside the viewport is the whole claim.
        expect(box!.y + box!.height).toBeLessThanOrEqual(height);

        // And the Charge button below it, or the cashier scrolls for that instead.
        const charge = page.getByRole("button", { name: /Charge/i }).first();
        const chargeBox = await charge.boundingBox();
        expect(chargeBox).not.toBeNull();
        expect(chargeBox!.y + chargeBox!.height).toBeLessThanOrEqual(height);

        // Keys stay at or above the 44px touch minimum however short the screen.
        const seven = keypad.getByRole("button", { name: "7", exact: true });
        const sevenBox = await seven.boundingBox();
        expect(sevenBox).not.toBeNull();
        expect(sevenBox!.height).toBeGreaterThanOrEqual(44);
      });
    }

    if (pos.length > 0) {
      test(`pos till at ${width}x${height}`, async ({ page }) => {
        test.setTimeout(120_000 + pos.length * (32_000 + SETTLE_MS));
        // A separate host and therefore a separate session.
        //
        // Sign in at `/login`, not `/portal/pos/login`. On the POS host the
        // portal is served from the root — `/portal/pos/login` 307s to `/login`
        // — and starting on the redirect wastes a navigation the sign-in race
        // is already tight enough without.
        await signIn(page, POS_BASE, "/login", { email: CASHIER_EMAIL, password: CASHIER_PASSWORD });
        for (const screen of pos) {
          await shoot(page, POS_BASE, screen, label);
        }
      });
    }
  });
}
