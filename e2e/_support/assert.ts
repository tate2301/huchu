import { expect, type Page } from "@playwright/test";

/**
 * The checks worth making on every page, regardless of what the page is for.
 *
 * A screenshot spec that only navigates will pass over a page throwing in the
 * console, hydrating twice, or rendering `NaN` where a total should be. None of
 * those fail a `goto`. These do.
 */

/**
 * Console messages that are noise, not defects.
 *
 * Kept deliberately short. Every entry here is a class of real error the suite
 * can no longer see, so an addition needs a reason next to it.
 */
const IGNORED = [
  // Next dev-server chatter, absent in a production build.
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  // Chrome emits this for any favicon miss; not the app's doing.
  /favicon\.ico.*404/i,
  /*
    `<Analytics />` from @vercel/analytics, in app/layout.tsx, fetches
    /_vercel/insights/script.js. That path is served by Vercel's edge, not by
    the app, so under `next start` it 404s — on every page, authenticated or
    not.

    This cost real time to find. It presented as three broken gold routes
    (/gold/prices, /gold/intake/pours, /gold/settlement/receipts) while /gold
    and the dispatch routes looked clean, which reads exactly like a routing
    bug in one corner of one module. It is not: a network capture showed the
    same 404 on /gold too. The script is injected after hydration, so whether
    it lands before the assertion runs is a race, and the three "failing"
    routes were simply the slower ones.

    Matched on the path rather than the status text because Chrome's message —
    "Failed to load resource: the server responded with a status of 404" —
    names no URL, so a status-only pattern would blind the suite to every 404
    the app makes. The URL is not in the message text either; it is in
    `message.location()`, which is why `watchConsole` matches against both.
  */
  /_vercel\/insights/i,
];

/**
 * Real defects, already diagnosed, deliberately not failing the suite yet.
 *
 * This list is not the same as `IGNORED` above, and the difference matters.
 * `IGNORED` is noise — things that are not the app's fault and never will be.
 * This is the opposite: things that **are** the app's fault, written down
 * precisely enough to fix, and held here only so that one known problem does
 * not mask every unknown one behind it.
 *
 * Every entry needs a diagnosis, not just a pattern. An entry without one is
 * indistinguishable from sweeping something under the carpet.
 *
 * `knownIssues()` reports which of these actually fired, so they stay visible
 * in the run rather than quietly passing.
 */
const KNOWN_ISSUES: Array<{ id: string; pattern: RegExp; diagnosis: string }> = [
  /*
    Empty, as of 2026-09-05, and that is the point of the list rather than a
    failure of it. All four entries were verified gone against a fresh
    production build before being removed:

    - `unentitled-accounting-api-403` — /accounting/{sales,purchases,journals}
      now gate their sibling-module queries on `useHasFeature`, so the payroll
      bureau's three 403s per page load are gone.
    - `offline-warmup-bare-pos-paths` — the warm-up stops at the first URL that
      answers, so the bare `/overview`, `/history`, `/held` and the rest no
      longer 404 on every page of every tenant.
    - `dead-nav-links-prefetched` — the Suppliers button and the two Scrap
      master-data entries have been removed; they pointed at pages that never
      existed and Next prefetched all three.
    - `offline-status-hydration` — was still real, and removing the entry is
      what proved it. It reappeared within one run, was measured for the first
      time by diffing the SSR HTML against the hydrated DOM ("Ready" against
      "Preparing 50%"), and is fixed at the source: `statusLabel` in
      `components/providers/offline-provider.tsx` now reports the server's
      answer until `useHydrated()` says otherwise.

    A known-issue list that outlives its bugs is a blindfold: every entry is a
    pattern that also swallows the *next* unknown failure matching it, and the
    widest was the hydration one — "A tree hydrated but some attributes"
    matches every hydration mismatch in the application, on every route.
    Adding one back is cheap; leaving a stale one in is not.
  */
];

export type ConsoleWatcher = {
  /**
   * Throw if anything unignored and not a known issue was logged as an error.
   *
   * `allow` forgives one pattern for one assertion — for a route whose correct
   * behaviour *is* a failed request. The public token pages are the case that
   * wanted it: `/a/<token>` with a token nobody issued must 404, the browser
   * logs the 404, and a suite that called that a defect would be asking the
   * product to answer 200 for a record that does not exist. Scoped to the one
   * call rather than added to `IGNORED`, so the same 404 elsewhere still fails.
   */
  assertClean(options?: { allow?: RegExp }): void;
  /** Everything seen, for a test that wants to inspect rather than assert. */
  errors(): string[];
  /** Which entries from `KNOWN_ISSUES` actually fired on this page. */
  knownIssues(): string[];
};

/**
 * Start collecting console errors and page exceptions.
 *
 * Attach before the first `goto` — messages logged during navigation are gone
 * by the time the page settles.
 *
 *   const console_ = watchConsole(page)
 *   await page.goto("/retail")
 *   console_.assertClean()
 */
export function watchConsole(page: Page): ConsoleWatcher {
  const seen: string[] = [];
  const known = new Set<string>();

  page.on("console", (message) => {
    if (message.type() !== "error") return;

    /*
      Match against the source URL as well as the text.

      Chrome reports a failed subresource as "Failed to load resource: the
      server responded with a status of 404 (Not Found)" and puts the URL
      nowhere in that string — it is in `location()`. A suite that only reads
      `text()` can therefore tell you that something 404'd but never what, and
      cannot ignore one known-bad URL without ignoring every 404 in the app.
    */
    const url = message.location()?.url ?? "";
    const text = url ? `${message.text()} [${url}]` : message.text();

    if (IGNORED.some((pattern) => pattern.test(text))) return;
    const issue = KNOWN_ISSUES.find((candidate) => candidate.pattern.test(text));
    if (issue) {
      known.add(issue.id);
      return;
    }
    seen.push(text);
  });

  // An uncaught exception never reaches `console`, and is strictly worse than
  // anything that does.
  page.on("pageerror", (error) => {
    seen.push(`uncaught: ${error.message}`);
  });

  return {
    errors: () => [...seen],
    knownIssues: () => [...known],
    assertClean(options = {}) {
      const { allow } = options;
      const unexpected = allow ? seen.filter((text) => !allow.test(text)) : seen;
      expect(
        unexpected,
        `console errors on ${page.url()}:\n${unexpected.join("\n")}`,
      ).toEqual([]);
    },
  };
}

/**
 * React logs a hydration mismatch as a console error, so `watchConsole` already
 * catches it — but it reads as one error among others. This names it, because
 * the fix is a different kind of fix.
 */
export function expectNoHydrationWarning(watcher: ConsoleWatcher): void {
  const hydration = watcher
    .errors()
    .filter((text) => /hydrat|did not match|server HTML/i.test(text));
  expect(hydration, `hydration mismatch:\n${hydration.join("\n")}`).toEqual([]);
}

/**
 * No page should ever render these. `NaN` and `Invalid Date` are what a broken
 * Decimal or a missing timezone looks like to a user, and both survive every
 * type check in the codebase — `Decimal` crosses JSON as a string, so a number
 * that was never parsed formats as `NaN` rather than failing.
 */
const POISON = ["NaN", "Invalid Date", "undefined", "[object Object]"];

export async function expectNoBrokenValues(page: Page): Promise<void> {
  const body = (await page.locator("body").innerText().catch(() => "")) ?? "";
  const found = POISON.filter((token) => body.includes(token));
  expect(found, `page at ${page.url()} renders ${found.join(", ")}`).toEqual([]);
}

/**
 * The three things every page must survive: it loaded, it did not throw, and it
 * is not showing rubbish. Cheap enough to call after every navigation.
 */
export async function expectHealthyPage(
  page: Page,
  watcher: ConsoleWatcher,
  options: { allow?: RegExp } = {},
): Promise<void> {
  watcher.assertClean(options);
  expectNoHydrationWarning(watcher);
  await expectNoBrokenValues(page);
}
