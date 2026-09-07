import type { Page } from "@playwright/test";

import { test, expect } from "./_support/fixtures";
import { PAYROLL } from "./_support/tenants";
import { visitSettled } from "./_support/nav";
import { freeze, settle, VIEWPORT } from "./_support/shots";

/**
 * Screenshots of the Zimbabwe payroll surface, at three widths.
 *
 * This used to run against `payroll-demo.apps.pagka.local:3000` directly, with
 * its own `E2E_BASE_URL` default, its own copy of Rudo's credentials and its own
 * sign-in. All three are gone: the suite nominates the tenant host with the
 * `__huchu_preview_host` cookie on one origin (see the long note in
 * `_support/tenants.ts`), and `auth.setup.ts` signs `payroll-demo/admin` in once
 * for the whole run.
 *
 * The old hand-rolled setup was not merely redundant, it was broken. `BASE`
 * defaulted to the payroll host but `.env.e2e` sets `E2E_BASE_URL` to the acme
 * origin, so this spec posted payroll-demo credentials at the *retail* tenant
 * and sat out a 45-second cookie poll; with the variable unset it fell back to a
 * hostname this workstation has no hosts-file entry for. Either way it could not
 * run. `test.use({ tenant: PAYROLL, as: "admin" })` is the whole fix.
 *
 *   npx tsx scripts/seed-payroll-demo.ts
 *   npx playwright test e2e/hr-payroll-shots.spec.ts
 *
 * Two comments that used to live here have been retired with the code they
 * described, and are worth knowing about if sign-in ever comes back:
 *
 *   - the login click waited for `networkidle` plus a beat, because clicking
 *     before React had hydrated submitted the form as a GET and produced a page
 *     of query parameters rather than a session;
 *   - the post-login redirect goes wherever NEXTAUTH_URL names, which in a
 *     multi-tenant dev setup is some other tenant's host — that in-flight
 *     navigation aborted the first real `goto` of the loop, which is how the
 *     desktop leg once produced no files at all while tablet and phone got lucky
 *     on timing. The spec parked on `/` first to avoid it.
 *
 * Neither applies now: the saved session means the first navigation of the test
 * is already a screen we want, and `visit()` in `_support/nav.ts` retries an
 * aborted navigation anyway.
 *
 * ## What this still covers that no other suite does
 *
 * `finance-suite.spec.ts` sweeps these fourteen routes for health and
 * `marketing-shots.spec.ts` photographs eight of them at desktop width. This
 * file is the only place that renders the whole payroll and HR surface at tablet
 * and phone width, the only place that photographs `/payroll/compensation`,
 * `/payroll/salaries/outstanding`, `/payroll/statutory/returns`,
 * `/people/leave/holidays`, `/people/incidents` and `/people/approvals` at all,
 * and the only place that drives the statutory-returns period picker off its
 * empty default. It also shoots `fullPage`, which the harness camera
 * (`shooter()`) deliberately does not — below-the-fold rows of a long payroll or
 * roster table are recorded nowhere else.
 */

/**
 * Where the images land.
 *
 * Was `/tmp/shots`, which does not survive a reboot and does not exist on the
 * Windows workstation this runs on. `_support/shots.ts` settled the convention:
 * everything goes under `docs/screenshots/<vertical>/<journey>/`, overridable
 * with `SHOT_DIR`. Named per viewport rather than numbered, because these are a
 * grid of the same screens at three widths, not a journey.
 */
const OUT = `${process.env.SHOT_DIR ?? "docs/screenshots"}/payroll/hr-payroll`;

/**
 * How long to let a screen finish before photographing it.
 *
 * Compile on first hit can take seconds against `next dev`, and a screenshot
 * taken during it is a picture of a skeleton — which is how 30 blank images
 * happened before. The runs page needs the longer end of this: it fires a second
 * query for periods after the shell paints. Deliberately longer than the 2.5s
 * `settle()` defaults to.
 */
const SETTLE_MS = Number(process.env.SHOT_SETTLE_MS ?? 8000);

test.use({
  tenant: PAYROLL,
  as: "admin",
  // The environment ships chromium-1194 but this Playwright wants 1217, so point
  // at the installed binary rather than downloading one.
  //
  // Guarded, like `visual-pass.spec.ts` and the other shots specs. An
  // unconditional Linux path meant this spec could only run in one
  // container; everywhere else it died before the first navigation with
  // "Failed to launch chromium", which reads as a broken install.
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
});

type Screen = {
  name: string;
  path: string;
  prepare?: (page: Page) => Promise<void>;
};

const SCREENS: Screen[] = [
  // --- People, in rail order.
  { name: "people-employees", path: "/people" },
  { name: "people-rosters", path: "/people/rosters" },
  // Moved here from `/attendance` under Daily Operations: marking a register is
  // not mining, and a bureau with no shafts could not reach one.
  { name: "people-attendance", path: "/people/attendance" },
  {
    name: "people-leave",
    path: "/people/leave",
    prepare: async (page) => {
      await page
        .getByText(/Annual leave/i)
        .first()
        .waitFor({ state: "visible", timeout: 30000 })
        .catch(() => {});
    },
  },
  {
    name: "people-public-holidays",
    path: "/people/leave/holidays",
    prepare: async (page) => {
      await page
        .getByText(/Heroes/i)
        .first()
        .waitFor({ state: "visible", timeout: 30000 })
        .catch(() => {});
    },
  },
  { name: "people-incidents", path: "/people/incidents" },
  { name: "people-approvals-history", path: "/people/approvals" },

  // --- Payroll, in rail order.
  { name: "payroll-compensation-rules", path: "/payroll/compensation" },
  { name: "payroll-salaries", path: "/payroll/salaries" },
  { name: "payroll-salaries-outstanding", path: "/payroll/salaries/outstanding" },
  {
    name: "payroll-runs",
    path: "/payroll/runs",
    prepare: async (page) => {
      await page
        .getByText("2026-08")
        .first()
        .waitFor({ state: "visible", timeout: 30000 })
        .catch(() => {});
    },
  },
  { name: "payroll-disbursements", path: "/payroll/disbursements" },
  { name: "payroll-statutory-tables", path: "/payroll/statutory" },
  {
    name: "payroll-statutory-returns",
    path: "/payroll/statutory/returns",
    // Returns default to the previous complete month — the right default to file
    // against and the wrong one to photograph, since the demo run is August 2026
    // and July lands on the empty state.
    prepare: async (page) => {
      const trigger = page.getByRole("combobox").first();
      if (!(await trigger.isVisible().catch(() => false))) return;
      await trigger.click();
      const option = page.getByRole("option", { name: /August 2026/i });
      if (await option.isVisible().catch(() => false)) await option.click();
      // Bounded, always: the app holds an open SSE stream, so an unbounded
      // `networkidle` never resolves. See `_support/nav.ts`.
      await page.waitForLoadState("networkidle", { timeout: 2_000 }).catch(() => {});
    },
  },
];

const ALL_VIEWPORTS: Array<[label: string, size: { width: number; height: number }]> = [
  ["desktop", VIEWPORT.desktop],
  // Not one of the three named in `_support/shots.ts`: portrait tablet is the
  // width the payroll rail collapses at, and nothing else in the suite renders
  // these pages there.
  ["tablet", { width: 768, height: 1024 }],
  ["phone", VIEWPORT.mobile],
];

// A full pass is ~20 minutes, which is too slow a loop when one screen changed.
// `SHOT_ONLY=leave,public-holidays SHOT_VIEWPORTS=desktop` reshoots just that.
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

    test(`payroll screens at ${size.width}x${size.height}`, async ({ page, context }) => {
      // `playwright.config.ts` sets a 120s global timeout, which this spec cannot
      // fit: each screen waits `SETTLE_MS` for compile-on-first-hit. Screenshots
      // are written inside the loop, so a run that overran left a directory of
      // images *and* a failed test — which looks enough like success to be
      // believed. Sized to the work instead. The ~30s of sign-in the old base
      // allowance covered is gone with the saved session.
      test.setTimeout(60_000 + SELECTED.length * 25_000);

      // The session arrives from `auth.setup.ts` via storageState rather than a
      // form post, but assert it is actually there before photographing fourteen
      // signed-out screens. Checking the cookie rather than a URL is the habit
      // this spec learned the hard way: NEXTAUTH_URL pins the post-login redirect
      // to whichever host it names, which in a multi-tenant dev setup is some
      // other tenant — the session is still issued for the host that was posted
      // to, so the cookie is the signal that matters.
      await expect
        .poll(
          async () => {
            const cookies = await context.cookies();
            return cookies.some((cookie) => cookie.name.includes("session-token"));
          },
          { timeout: 15000 },
        )
        .toBe(true);

      for (const { name, path, prepare } of SELECTED) {
        // `visitSettled` retries the one failure mode this loop used to handle by
        // hand — a navigation aborted by one the app started — and time-boxes the
        // idle wait. Some screens never reach `networkidle` at all against a dev
        // server (the crew board is one), and an unbounded wait there consumed the
        // whole test budget and produced no picture of a page that renders
        // perfectly well.
        await visitSettled(page, path);
        await settle(page, SETTLE_MS);
        // A screen that renders its own error banner is worth photographing as
        // it is, but it is not worth photographing *silently* — the desktop leg
        // once shipped six pictures of "Failed to fetch payroll periods".
        const banner = page.getByText(/Unable to load|Failed to (fetch|load)/i).first();
        if (await banner.isVisible().catch(() => false)) {
          console.error(`[shots] ${name} at ${label} rendered an error banner`);
        }
        if (prepare) {
          await prepare(page);
          await page.waitForTimeout(1500);
        }
        // Stop the animations and the caret first, so two runs of the same screen
        // produce the same image rather than two that can only be re-taken.
        await freeze(page);
        await page.screenshot({
          path: `${OUT}/${name}-${label}.png`,
          fullPage: true,
        });
      }

      console.log(`[shots] payroll/HR at ${label} -> ${OUT}`);
    });
  });
}
