import { test, expect } from "./_support/fixtures";
import { CRM } from "./_support/tenants";
import { visitSettled } from "./_support/nav";
import { freeze, settle, VIEWPORT } from "./_support/shots";
import type { Page } from "@playwright/test";

/**
 * Screenshots of the CRM surface, at every width it has to work at.
 *
 * The module is judged on a phone as often as on a desktop, and a board, a
 * record page or a filter row can only be judged with records in it — so this
 * runs against the seeded CRM tenant (`hurudza-creative`, a creative agency
 * with a year of trading behind it: 180 leads, 90 deals, 1,165 activities, 57
 * quotations, 22 invoices, 20 receipts), never a hand-made one.
 *
 * It used to point at a `crmdemo` tenant that no longer exists on `huchu_e2e`,
 * with the email and password written into this file. Both are gone: the tenant
 * and the login now come from `_support/tenants.ts`, and the seed is the one
 * recorded there —
 *
 *   npx tsx scripts/seed-staging-tenant.ts --slug hurudza-creative \
 *     --email tafadzwa@hurudza.test --password 'Password123!' \
 *     --name 'Hurudza Creative' --user-name 'Tafadzwa Mukono' --profile GENERAL
 *   npx tsx scripts/seed-crm-demo.ts --slug hurudza-creative
 *   npx tsx scripts/seed-crm-year.ts --slug hurudza-creative
 *   npx playwright test e2e/crm-shots.spec.ts
 *
 * `SHOT_ONLY=crm-leads,crm-deals SHOT_VIEWPORTS=phone` reshoots one screen at
 * one width, which is the loop you want while changing it.
 *
 * ## What this spec is for, now that the harness suites exist
 *
 * Most of the *routes* below are asserted elsewhere — `crm-suite.spec.ts`
 * sweeps them with real expectations, `record-pages-suite.spec.ts` opens the
 * record pages by id, and `marketing-shots.spec.ts` photographs the three CRM
 * journeys. What none of them do is **width**: every harness shot of CRM is
 * desktop, and `VIEWPORT` has no tablet entry at all. This file is the tablet
 * and phone pass over the whole surface, plus the seven routes no suite visits
 * (`/crm/work-orders`, `/crm/clients`, `/crm/import`, the three `/crm/workflows`
 * routes and `/crm/leads?layout=table`), the two sheets, and `fullPage` capture
 * — `shooter()` is `fullPage: false`, so a long list is only ever photographed
 * below the fold here.
 */

/*
  Where the images land.

  `SHOT_DIR` is the same root `_support/shots.ts` uses, so one environment
  variable moves every screenshot the suite takes. The old default was
  `/tmp/shots`, which on this workstation is neither a real path nor one that
  survives a reboot.
*/
const ROOT = process.env.SHOT_DIR ?? "docs/screenshots";
const OUT = `${ROOT}/crm/widths`;

/*
  How long to let a screen finish before believing what it shows.

  Six seconds, not `shots.ts`'s 2.5: this spec is normally run against
  `next dev`, where compile-on-first-hit takes seconds and a shot taken during
  it is a picture of a skeleton. `SHOT_SETTLE_MS` still overrides it, and a
  production-build run should want it much lower.
*/
const SETTLE_MS = Number(process.env.SHOT_SETTLE_MS ?? 6000);

type Screen = {
  name: string;
  path: string;
  /** Where arriving counts as arrived, when the route is an alias. */
  landsOn?: string;
  /** Drive the screen into the state worth photographing. `problems` collects
   *  anything that went wrong, for the report at the end of the pass. */
  prepare?: (page: Page, problems: string[]) => Promise<void>;
};

/** Every management/users path is a bare `redirect()` to this one page. */
const ORG_USERS = "/preferences/organization/users";

const SCREENS: Screen[] = [
  { name: "crm-overview", path: "/crm" },
  { name: "crm-leads", path: "/crm/leads" },
  { name: "crm-leads-list", path: "/crm/leads?layout=table" },
  { name: "crm-deals", path: "/crm/deals" },
  { name: "crm-people", path: "/crm/people" },
  { name: "crm-companies", path: "/crm/companies" },
  { name: "crm-sites", path: "/crm/sites" },
  { name: "crm-tasks", path: "/crm/tasks" },
  { name: "crm-follow-ups", path: "/crm/follow-ups" },
  { name: "crm-quotes", path: "/crm/quotes" },
  { name: "crm-invoices", path: "/crm/invoices" },
  { name: "crm-collections", path: "/crm/collections" },
  { name: "crm-appointments", path: "/crm/appointments" },
  { name: "crm-work-orders", path: "/crm/work-orders" },
  { name: "crm-insights", path: "/crm/insights" },
  { name: "crm-reports", path: "/crm/reports" },
  { name: "crm-workflows", path: "/crm/workflows" },
  { name: "crm-templates", path: "/crm/templates" },
  { name: "crm-forms", path: "/crm/forms" },
  { name: "crm-import", path: "/crm/import" },
  { name: "crm-settings", path: "/crm/settings" },
  { name: "crm-reps", path: "/crm/reps" },
  { name: "crm-clients", path: "/crm/clients" },
  { name: "crm-receipts", path: "/crm/receipts" },
  { name: "crm-workflow-runs", path: "/crm/workflows/runs" },
  { name: "crm-workflow-new", path: "/crm/workflows/new" },

  // Management — the same vertical's back office, held to the same rules.
  { name: "mgmt-master-data", path: "/management/master-data" },
  { name: "mgmt-departments", path: "/management/master-data/hr/departments" },
  { name: "mgmt-job-grades", path: "/management/master-data/hr/job-grades" },
  { name: "mgmt-sites", path: "/management/master-data/operations/sites" },
  { name: "mgmt-sections", path: "/management/master-data/operations/sections" },
  { name: "mgmt-downtime-codes", path: "/management/master-data/operations/downtime-codes" },
  /*
    These five are one page five times over: every `page.tsx` under
    `app/management/users/`
    are each a bare `redirect("/preferences/organization/users")`, so the
    create, status, role-change and password-reset paths all photograph the
    users list. Kept because the widths are what this spec is measuring and
    dropping them would silently change the image set, but they are not five
    screens and nobody should read them as five. `landsOn` names the real
    destination so `visit()` treats the redirect as arrival rather than as a
    route that refused us.
  */
  { name: "mgmt-users", path: "/management/users", landsOn: ORG_USERS },
  { name: "mgmt-users-create", path: "/management/users/create", landsOn: ORG_USERS },
  { name: "mgmt-users-status", path: "/management/users/status", landsOn: ORG_USERS },
  { name: "mgmt-users-role-change", path: "/management/users/role-change", landsOn: ORG_USERS },
  {
    name: "mgmt-users-password-reset",
    path: "/management/users/password-reset",
    landsOn: ORG_USERS,
  },
  // The create flow, which on a phone is a sheet over the list it was opened
  // from — worth photographing because it is where most typing happens.
  {
    name: "crm-new-lead-sheet",
    path: "/crm/leads",
    prepare: async (page) => {
      await page.getByRole("button", { name: /New lead/i }).first().click();
      await page.waitForTimeout(1500);
    },
  },
  {
    name: "crm-view-sheet",
    path: "/crm/leads",
    prepare: async (page) => {
      const trigger = page.getByRole("button", { name: /View and filters/i }).first();
      if (!(await trigger.isVisible().catch(() => false))) return;
      await trigger.click();
      await page.waitForTimeout(1500);
    },
  },

  // Record pages, reached by opening the first row of their list — the ids are
  // uuids, so there is no path to hardcode, and naming a record by its title
  // fails the moment the board opens on a stage that record is not in.
  { name: "crm-deal-record", path: "/crm/deals", prepare: openFirstRecord("/crm/deals/") },
  {
    name: "crm-company-record",
    path: "/crm/companies",
    prepare: openFirstRecord("/crm/companies/"),
  },
  { name: "crm-person-record", path: "/crm/people", prepare: openFirstRecord("/crm/people/") },
];

/**
 * Problems noticed while shooting, reported at the end of the test rather than
 * thrown at the point they happen.
 *
 * These were `console.error` calls and they stay soft, deliberately. A screen
 * that renders an error banner is a real defect, but the hard version of that
 * check belongs to the suites that assert rather than photograph —
 * `expectHealthyPage` in `crm-suite`, `marketing-shots`, `record-pages-suite`
 * and `schools-back-office-suite` fails on exactly this. Failing here instead
 * would abandon the pass at the first bad screen and leave a directory of
 * images that looks complete and is not, which is the failure mode this spec
 * was written to avoid.
 */
function note(problems: string[], message: string): void {
  problems.push(message);
  console.error(`[shots] ${message}`);
}

function openFirstRecord(prefix: string) {
  return async (page: Page, problems: string[] = []) => {
    const link = page.locator(`a[href^="${prefix}"]`).first();
    if (!(await link.isVisible().catch(() => false))) {
      note(problems, `no record row to open under ${prefix}`);
      return;
    }
    const href = await link.getAttribute("href");
    await link.click();
    // Wait on the URL, not on the network: the record route compiles on first
    // hit against a dev server, and `networkidle` settles on the list long
    // before the record has painted — which produced three pictures of the
    // list with one row hovered.
    if (href) {
      await page.waitForURL(`**${href}`, { timeout: 30000 }).catch(() => {
        note(problems, `never landed on ${href}`);
      });
    }
    // `settle` asks for idle for two seconds and then waits deliberately. It
    // has to be time-boxed: the app holds an open server-sent-event stream, so
    // `networkidle` never resolves and an unbounded wait eats the whole budget.
    await settle(page, SETTLE_MS);
  };
}

/*
  The tenant, and whose session to start from.

  Both come from `_support/tenants.ts` — the rule there is that a credential
  appears in that file or nowhere. `as: "owner"` starts the test already signed
  in from the state `auth.setup.ts` saved, which is worth 15-25 seconds per
  test and, more importantly, means this spec can no longer sign a CRM user
  into whatever tenant `E2E_BASE_URL` happens to name. The host nomination
  travels with the saved session.

  Nothing here sets `baseURL` or a chromium path any more. The fixture points
  every context at `ORIGIN`, and the browser to drive is
  `playwright.config.ts`'s business — `E2E_BROWSER_CHANNEL=chrome` runs the
  suite against an installed Chrome, which is what the old `PW_CHROMIUM`
  guard was reaching for.
*/
test.use({ tenant: CRM, as: "owner" });

const ALL_VIEWPORTS: Array<[label: string, size: { width: number; height: number }]> = [
  ["desktop", VIEWPORT.desktop],
  ["tablet", { width: 768, height: 1024 }],
  ["phone", VIEWPORT.mobile],
];

/*
  Tablet is spelled out rather than taken from `VIEWPORT`, because `VIEWPORT`
  has no tablet entry — it names desktop, till and mobile. This spec is the
  only thing in the suite that shoots at 768 wide, so the size lives here until
  something else needs it and it earns a place in `_support/shots.ts`.
*/

function only(value: string | undefined) {
  const names = (value ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  return names.length > 0 ? new Set(names) : null;
}

const screenFilter = only(process.env.SHOT_ONLY);
const viewportFilter = only(process.env.SHOT_VIEWPORTS);
const SELECTED = screenFilter
  ? SCREENS.filter((screen) => screenFilter.has(screen.name))
  : SCREENS;
const VIEWPORTS = viewportFilter
  ? ALL_VIEWPORTS.filter(([label]) => viewportFilter.has(label))
  : ALL_VIEWPORTS;

for (const [label, size] of VIEWPORTS) {
  test.describe(`${label}`, () => {
    test.use({ viewport: size });

    test(`crm screens at ${size.width}x${size.height}`, async ({ page, console_ }) => {
      // The config's global timeout cannot fit a pass: each screen waits for
      // compile-on-first-hit against a dev server. Sized to the work, so an
      // overrun fails rather than half-writing a directory of images that looks
      // like a complete run. Sign-in is no longer part of the budget — the
      // session arrives with the context — so the base is headroom.
      test.setTimeout(90_000 + SELECTED.length * 25_000);

      /*
        The one hard assertion this spec ever made was that sign-in had issued a
        session token — a 45-second cookie poll after driving the login form.
        Sign-in has moved to `auth.setup.ts`, which makes the same check and
        fails the whole `setup` project if it ever stops holding. What is left
        worth asserting here is that the saved state actually arrived: a context
        with no session renders 47 login pages and photographs every one of them.
      */
      const cookies = await page.context().cookies();
      expect(
        cookies.some((cookie) => cookie.name.includes("session-token")),
        `${CRM.slug}/owner should start signed in — check e2e/.auth/`,
      ).toBe(true);

      const problems: string[] = [];

      for (const { name, path, landsOn, prepare } of SELECTED) {
        // Close whatever the last screen left open. A screen whose `prepare`
        // opens a sheet or the sidebar used to leave it open across the next
        // navigation, which is how a picture of the clients list came back
        // showing the sidebar over it.
        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(300);

        // `visitSettled` carries the retry this loop used to do by hand: an
        // aborted navigation is a race with the app's own router, not a broken
        // route. It also time-boxes the idle wait, which the hand-rolled
        // version did too — an unbounded one never returns here.
        await visitSettled(page, path, landsOn ? { landsOn } : {});
        // Compile-on-first-hit takes seconds against a dev server; a shot taken
        // during it is a picture of a skeleton.
        await page.waitForTimeout(SETTLE_MS);
        const banner = page.getByText(/Unable to load|Failed to (fetch|load)/i).first();
        if (await banner.isVisible().catch(() => false)) {
          note(problems, `${name} at ${label} rendered an error banner`);
        }
        if (prepare) {
          await prepare(page, problems);
          await page.waitForTimeout(1500);
        }
        // Stop the animations, the caret and the focus ring, so two runs of
        // this spec produce comparable images rather than merely similar ones.
        await freeze(page);
        await page.screenshot({ path: `${OUT}/${name}-${label}.png`, fullPage: true });
      }

      /*
        Everything the pass noticed, in one place at the end. Neither list fails
        the test — see the note on `note()` — but a run that says nothing about
        47 screens is not reporting, it is hiding.
      */
      const errors = console_.errors();
      if (errors.length > 0) {
        console.error(`[shots] ${label}: ${errors.length} console errors\n${errors.join("\n")}`);
      }
      if (problems.length > 0) {
        console.error(`[shots] ${label}: ${problems.length} problems\n${problems.join("\n")}`);
      }
      console.log(`[shots] ${label} -> ${OUT}`);
    });
  });
}
