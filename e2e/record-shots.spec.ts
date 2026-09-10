import type { Page } from "@playwright/test";

import { test, expect } from "./_support/fixtures";
import { CRM } from "./_support/tenants";
import { visitSettled } from "./_support/nav";
import { freeze, settle, VIEWPORT } from "./_support/shots";

/**
 * Every record page, at the width it is hardest at.
 *
 * The list screens were audited first; records are where the work is, because
 * a record page carries more per screen than anything else in the product —
 * a name, a status, a dozen properties, a stage bar, nine tabs and a rail.
 * Phone comes first in the viewport list for that reason: it is the width
 * that decides whether the page is readable, and the one people actually open
 * a lead on while standing on a site.
 *
 *   npx playwright test e2e/record-shots.spec.ts
 *   SHOT_ONLY=lead SHOT_VIEWPORTS=phone npx playwright test e2e/record-shots.spec.ts
 *
 * ## What this still owns after the harness migration
 *
 * `record-pages-suite` reaches each of these six records by a database-resolved
 * id typed straight into the URL, and asserts their content. It never opens one
 * the way a person does, and it takes no picture. This spec does both:
 *
 *  - it clicks a **row link** on each list, so a list whose rows stopped
 *    linking fails here and nowhere else;
 *  - it photographs the record at **390x844** — no other harness suite sets a
 *    non-desktop viewport for CRM at all;
 *  - it takes a **full-page** capture, which is the "how much scrolling does a
 *    record cost" shot. `shooter()` in `_support/shots.ts` always passes
 *    `fullPage: false`, so this is the only full-page image the suite makes.
 *
 * Ran against the dead `crmdemo` tenant with a hard-coded email and host until
 * this migration; it now takes both from `_support/tenants.ts` and runs on
 * `hurudza-creative`, the seeded CRM tenant every other CRM spec uses. Nothing
 * here asserts on a specific record — the first row of each list is whatever the
 * seed sorts first — so the change of tenant costs no assertion.
 */

test.use({ tenant: CRM, as: "owner" });

/**
 * Where the images land.
 *
 * `_support/shots.ts` keeps the rule: everything under
 * `docs/screenshots/<vertical>/<journey>`, because the previous four roots
 * included two `/tmp` paths that do not survive a reboot. This spec cannot use
 * `shooter()` — it needs `fullPage` — but it obeys the same root, and the same
 * `SHOT_DIR` override.
 */
const OUT = `${process.env.SHOT_DIR ?? "docs/screenshots"}/crm/records`;

type Record_ = {
  name: string;
  /** The list to open the record from — record ids are uuids, so there is no path to hardcode. */
  list: string;
  /** The record route's prefix, which is what a row's link starts with. */
  prefix: string;
  /** A tab to open once the record has loaded, for the shot that shows tab content. */
  tab?: string;
};

const RECORDS: Record_[] = [
  { name: "lead", list: "/crm/leads?layout=table", prefix: "/crm/leads/" },
  { name: "deal", list: "/crm/deals", prefix: "/crm/deals/" },
  { name: "company", list: "/crm/companies", prefix: "/crm/companies/" },
  { name: "person", list: "/crm/people", prefix: "/crm/people/" },
  { name: "site", list: "/crm/sites", prefix: "/crm/sites/" },
  { name: "rep", list: "/crm/reps", prefix: "/crm/reps/" },
];

async function openFirstRecord(page: Page, list: string, prefix: string) {
  // `visitSettled` rather than `goto` + a retry: it already survives the
  // `net::ERR_ABORTED` a client-side navigation causes, and its idle wait is
  // time-boxed. An unbounded `networkidle` never resolves here — the app holds
  // an open SSE stream — which is what the old hand-rolled version was paying
  // 20 seconds a call to discover.
  await visitSettled(page, list);

  /*
    `:visible` matters, and this spec was missing it. A CRM list renders its
    Table, List and Board views at once and hides the two that are not
    selected, so `/crm/leads` carries a hundred-odd anchors of which most are
    hidden. Without the filter `.first()` picks one out of a hidden pane and
    waits for it to appear — which reads as "the list is empty" and is the
    opposite. `crm-suite` documents the same trap.

    This used to `console.error` and skip. A screenshot spec that skips
    silently produces neither an image nor a failure, so it now asserts: a list
    whose rows stopped linking is exactly the regression this file is the only
    one placed to catch.
  */
  const link = page.locator(`a[href^="${prefix}"]:visible`).first();
  await expect(link, `no record row under ${prefix} on ${list}`).toBeVisible({
    timeout: 25_000,
  });
  await link.click();

  // Wait on the URL rather than the network: the record route compiles on
  // first hit, and `networkidle` settles on the list long before the record
  // has painted.
  await expect(page).toHaveURL(new RegExp(`${prefix}[^/]+$`), { timeout: 30_000 });

  // `settle` is the time-boxed idle wait plus a deliberate quiet period, and
  // `freeze` stops animations, the caret and any focus ring — the three things
  // that make two shots of one page differ.
  await settle(page);
  await freeze(page);
}

const ALL_VIEWPORTS: Array<[label: string, width: number, height: number]> = [
  ["phone", VIEWPORT.mobile.width, VIEWPORT.mobile.height],
  ["desktop", VIEWPORT.desktop.width, VIEWPORT.desktop.height],
];

function only(value: string | undefined) {
  const names = (value ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  return names.length > 0 ? new Set(names) : null;
}

const recordFilter = only(process.env.SHOT_ONLY);
const viewportFilter = only(process.env.SHOT_VIEWPORTS);
const SELECTED = recordFilter ? RECORDS.filter((r) => recordFilter.has(r.name)) : RECORDS;
const VIEWPORTS = viewportFilter
  ? ALL_VIEWPORTS.filter(([label]) => viewportFilter.has(label))
  : ALL_VIEWPORTS;

for (const [label, width, height] of VIEWPORTS) {
  test.describe(`${label}`, () => {
    test.use({ viewport: { width, height } });

    test(`record pages at ${width}x${height}`, async ({ page }) => {
      test.setTimeout(90_000 + SELECTED.length * 40_000);

      /*
        The session is established by `auth.setup.ts` and arrives as saved
        storage state, so there is no login form to fill here any more — which
        is 15-25 seconds off each of these two tests.

        The check the login used to end on is kept, because it is the one thing
        this spec ever asserted hard. Ask the session endpoint rather than the
        cookie jar or the URL: the cookie's name depends on how the deployment
        is configured, and NEXTAUTH_URL pins the post-login redirect to whichever
        host it names — which need not be the host the form posted to. Whether
        the session exists is the thing actually being waited on. It is now a
        short poll rather than a 45-second one: a saved session either restored
        or it did not.
      */
      await expect
        .poll(
          async () =>
            page.request
              .get("/api/auth/session")
              .then((response) => response.json())
              .then((body: { user?: unknown }) => Boolean(body?.user))
              .catch(() => false),
          { timeout: 15_000, message: "the saved session did not restore" },
        )
        .toBe(true);

      for (const { name, list, prefix } of SELECTED) {
        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(300);

        await openFirstRecord(page, list, prefix);

        // The whole page, which is what shows how much scrolling a record
        // costs, and the first screen, which is what somebody actually gets.
        await page.screenshot({ path: `${OUT}/record-${name}-${label}.png`, fullPage: true });
        await page.screenshot({ path: `${OUT}/record-${name}-${label}-fold.png` });
      }

      console.log(`[shots] record pages (${label}) -> ${OUT}`);
    });
  });
}
