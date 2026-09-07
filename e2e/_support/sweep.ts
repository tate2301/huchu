import { expect, type Page } from "@playwright/test";

import { expectHealthyPage, type ConsoleWatcher } from "./assert";
import { test } from "./fixtures";
import { visitSettled } from "./nav";

/**
 * Walk a vertical's routes and assert each one actually works.
 *
 * The existing `-shots` specs navigate and photograph. That catches a route
 * that 500s and nothing else: a page rendering an empty state, `NaN` where a
 * total should be, or throwing in the console all photograph perfectly well.
 *
 * A swept route has to clear four bars:
 *
 *   1. it arrives — no redirect to /login or /access-blocked
 *   2. it does not throw, and does not hydrate wrong
 *   3. it renders none of `NaN`, `Invalid Date`, `undefined`, `[object Object]`
 *   4. it shows the evidence the route names — an `expect` string or pattern
 *
 * Point 4 is what makes this worth writing. A fees page with no invoice number
 * on it is not a working fees page, however green the run is.
 *
 * ## One test per route, not one test per sweep
 *
 * `sweepAll()` below runs a whole list inside a single test, and that was the
 * first design. It is the wrong one, measured: in `next dev` each route is
 * compiled the first time it is requested, and the server log put a cold route
 * at roughly 48 seconds all in. Seventeen accounting routes is thirteen and a
 * half minutes, twenty-six school routes is over fifteen — so the sweep blew
 * even a 900-second ceiling, and reported one timeout in place of what was
 * really twenty-six separate verdicts.
 *
 * `sweepTests()` declares a `test()` per route instead. Each gets its own
 * timeout, its own name in the report, and its own retry. A broken route is
 * then a red line that names it, rather than a suite that stopped somewhere.
 */

export type Route = {
  /** Path to visit, relative to the origin. */
  path: string;
  /** What this screen is, for the test name and the failure message. */
  name: string;
  /**
   * Evidence the page did its job — seeded data, not chrome. Omit only for a
   * screen that is legitimately empty on this tenant, and say why in `note`.
   */
  expect?: RegExp | string;
  /** Why this route has no evidence to assert, when `expect` is omitted. */
  note?: string;
  /**
   * This tenant is deliberately not entitled to this screen, and being turned
   * away is the pass.
   *
   * Entitlement gating is a claim the product makes and never demonstrates, so
   * a route the fixture cannot reach is worth more as an assertion than as a
   * deletion from the list. Kariba Payroll Bureau has no Banking, Currency or
   * Cost Centres; asking for them must land on /access-blocked, and if one day
   * it does not, that is a leak worth failing on.
   */
  blocked?: true;
  /**
   * This path is an alias and the pass is landing somewhere else.
   *
   * There are more of these than anybody expects — `/user-management/*` and
   * `/settings/*` are five redirects each into `/preferences/organization/*`,
   * `/stores` lands on `/stores/dashboard`, `/schools/finance/waivers` on the
   * ledger it is a tab of. `visit()` treats an unexpected destination as a
   * failure, which is right for a route that should have served a page, so an
   * alias has to say where it goes.
   *
   * Naming the destination is the point. A redirect that quietly changed
   * target would still be a redirect, and a test that only asserted "we moved"
   * would still be green while the link went somewhere else entirely.
   */
  redirectsTo?: string;
  /**
   * A console error this route is *supposed* to produce, and why.
   *
   * Reserved for a route whose correct behaviour is a failed request — a
   * public link opened with a token nobody issued has to 404, and the browser
   * logs that. Everything else stays a failure; this is not a place to quiet a
   * console.
   */
  expectedConsoleError?: { pattern: RegExp; why: string };
};

/** Assert one route. Used by `sweepTests`, and directly where that does not fit. */
export async function checkRoute(
  page: Page,
  console_: ConsoleWatcher,
  route: Route,
): Promise<void> {
  await visitSettled(page, route.path, { landsOn: route.redirectsTo });

  const url = new URL(page.url());
  const turnedAway = /\/login|\/access-blocked/.test(url.pathname);

  if (route.redirectsTo && !route.blocked) {
    expect(
      url.pathname,
      `${route.name} (${route.path}) is an alias and should land on ${route.redirectsTo}`,
    ).toBe(route.redirectsTo);
  }

  /*
    A declared destination outranks the turned-away check.

    `/home` on a tenant host redirects to that tenant's sign-in, and that is
    the product working: a customer's hostname belongs to the customer, and the
    marketing home lives on the root domain. Without this the assertion below
    reads the /login it was told to expect as a refusal.
  */
  const landedWhereDeclared = route.redirectsTo === url.pathname;

  if (route.blocked) {
    expect(
      turnedAway,
      `${route.name} (${route.path}) should be blocked for this tenant and instead served ${url.pathname}`,
    ).toBe(true);
    return;
  }

  if (turnedAway && !landedWhereDeclared) {
    throw new Error(
      `${route.name} (${route.path}) bounced to ${url.pathname} — not entitled, or not signed in.`,
    );
  }

  /*
    Both verdicts, from one run.

    These used to be a plain sequence, and a failing `expect` therefore hid
    every console error on the same page — it threw, and nothing below it ran.
    That happened: `/templates` failed on an assertion of mine that had gone
    stale, and the 404 underneath it (a dead intake-form link the library
    prefetches) went unreported until the assertion was fixed and the page got
    as far as the health check. One bug masking another, in the tool whose job
    is to stop exactly that.

    The order is not swappable, which is why this is a `try` rather than a
    reshuffle: the `expect` is also the **wait**. It polls for 25 seconds while
    the page fetches, and `expectNoBrokenValues` reads the body once. Health
    first would read a skeleton and pass on it.

    So: run the evidence check, keep its failure rather than throwing it, run
    the health check, and then report whichever of the two fired — or both.
  */
  let evidenceFailure: unknown = null;
  if (route.expect) {
    try {
      await expect(page.locator("body"), `${route.name} (${route.path})`).toContainText(
        route.expect,
        { timeout: 25_000 },
      );
    } catch (error) {
      evidenceFailure = error;
    }
  }

  try {
    await expectHealthyPage(page, console_, { allow: route.expectedConsoleError?.pattern });
  } catch (healthFailure) {
    if (evidenceFailure) {
      throw new Error(
        `${route.name} (${route.path}) failed both checks.\n\n` +
          `— the page is not healthy —\n${String(healthFailure)}\n\n` +
          `— and it does not show its evidence —\n${String(evidenceFailure)}`,
      );
    }
    throw healthFailure;
  }

  if (evidenceFailure) throw evidenceFailure;
}

/**
 * Declare one `test()` per route.
 *
 *   test.use({ tenant: RETAIL, as: "manager" })
 *   sweepTests(ROUTES)
 *
 * Call at module scope, not inside a `test()`.
 *
 * Every test starts from the session `auth.setup.ts` saved, so no sign-in
 * happens here. That was the first design and it was the expensive one: signing
 * in per route cost 15-25 seconds a time and turned the 17-test gold suite into
 * a 2.6-hour run, of which the tests themselves were about fifteen minutes.
 */
export function sweepTests(routes: readonly Route[], options: { timeout?: number } = {}): void {
  for (const route of routes) {
    test(`${route.name} renders`, async ({ page, console_ }) => {
      test.setTimeout(options.timeout ?? 120_000);
      await checkRoute(page, console_, route);
    });
  }
}

/**
 * A route whose path needs an id that only the database can supply.
 *
 * Detail pages are where a module's work actually shows — `/crm/deals/[id]` is
 * the deal, `/gold/transit/dispatches/[id]` is the dispatch — and they were the
 * single largest coverage gap after the platform admin portal: forty-odd pages
 * with no spec, because a spec cannot name an id a seed generates fresh on
 * every run.
 *
 * Hard-coding one is the obvious answer and the wrong one. It survives exactly
 * until the next re-seed, and then fails as a 404 that reads like a routing
 * bug. So the id is looked up when the test runs, from the same database the
 * server under test is using.
 *
 * A record that does not exist is reported as a **skip**, not a pass and not a
 * failure. It is a seed gap, and calling it either of the other two things
 * hides it: a pass claims coverage there is none of, and a failure puts a red
 * line against a page that is very probably fine.
 */
export type RecordRoute = Omit<Route, "path" | "redirectsTo"> & {
  /** Build the path once the id is known. */
  path: (id: string) => string;
  /**
   * Where it lands, when that is a different path — and it may carry the id,
   * so this takes one too. `/crm/templates/<id>` forwards into the workspace's
   * shared template builder at `/templates/<id>`.
   */
  redirectsTo?: (id: string) => string;
  /** Find one, or null when the seed wrote none. */
  find: () => Promise<string | null>;
};

export function sweepRecordTests(
  routes: readonly RecordRoute[],
  options: { timeout?: number } = {},
): void {
  for (const { find, path, redirectsTo, ...route } of routes) {
    test(`${route.name} renders`, async ({ page, console_ }) => {
      test.setTimeout(options.timeout ?? 120_000);

      const id = await find();
      test.skip(
        id === null,
        `${route.name}: the seed wrote no such record, so there is nothing to open.`,
      );

      const found = id as string;
      await checkRoute(page, console_, {
        ...route,
        path: path(found),
        ...(redirectsTo ? { redirectsTo: redirectsTo(found) } : {}),
      });
    });
  }
}
