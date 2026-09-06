import { expect, test, type Page } from "@playwright/test";

/**
 * Screenshots of the Zimbabwe payroll surface.
 *
 * Run against the tenant host, not localhost. The demo tenant has
 * `core.multitenancy.tenant-host-enforcement` on, so localhost is the central
 * admin host and every `/people` path 307s to `/admin`:
 *
 *   echo '127.0.0.1 payroll-demo.apps.pagka.local' >> /etc/hosts
 *   npx tsx scripts/seed-payroll-demo.ts
 *   E2E_BASE_URL=http://payroll-demo.apps.pagka.local:3000 \
 *     npx playwright test e2e/hr-payroll-shots.spec.ts
 *
 * The login click waits for `networkidle` plus a beat: clicking before React has
 * hydrated submits the form as a GET, which produced a page of query parameters
 * rather than a session on an earlier pass.
 */

const OUT = process.env.SHOT_DIR ?? "/tmp/shots";
const BASE = process.env.E2E_BASE_URL ?? "http://payroll-demo.apps.pagka.local:3000";

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
      await page.waitForLoadState("networkidle");
    },
  },
];

// The environment ships chromium-1194 but this Playwright wants 1217, so point
// at the installed binary rather than downloading one.
test.use({
  baseURL: BASE,
  launchOptions: { executablePath: "/opt/pw-browsers/chromium" },
});

const ALL_VIEWPORTS: Array<[label: string, width: number, height: number]> = [
  ["desktop", 1440, 900],
  ["tablet", 768, 1024],
  ["phone", 390, 844],
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

for (const [label, width, height] of VIEWPORTS) {
  test.describe(`${label}`, () => {
    test.use({ viewport: { width, height } });

    test(`payroll screens at ${width}x${height}`, async ({ page }) => {
      // `playwright.config.ts` sets a 60s global timeout, which this spec cannot
      // fit: sign-in alone is ~30s against a dev server, and each screen waits 8s
      // for compile-on-first-hit. Screenshots are written inside the loop, so a
      // run that overran left a directory of images *and* a failed test — which
      // looks enough like success to be believed. Sized to the work instead.
      test.setTimeout(90_000 + SELECTED.length * 25_000);

      await page.goto("/login");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2500);
      await page.fill("#login-email", "rudo.chirwa@payroll-demo.test");
      await page.fill("#login-password", "Password123!");
      await page.click('button[type="submit"]');
      // Wait on the cookie, not the URL. NEXTAUTH_URL pins the post-login
      // redirect to whichever host it names, which in a multi-tenant dev setup
      // is some other tenant — the session is still issued for the host the
      // form posted to, so the cookie is the signal that matters.
      await expect
        .poll(
          async () => {
            const cookies = await page.context().cookies();
            return cookies.some((cookie) => cookie.name.includes("session-token"));
          },
          { timeout: 45000 },
        )
        .toBe(true);

      // The post-login redirect goes to whatever NEXTAUTH_URL names, which is a
      // host this box does not resolve. That navigation is still in flight when
      // the loop starts, and it aborts the first real `goto` — which is how the
      // desktop leg produced no files while tablet and phone got lucky on
      // timing. Park on a page of our own host before photographing anything.
      await page.goto("/", { waitUntil: "commit" }).catch(() => {});
      await page.waitForTimeout(1000);

      for (const { name, path, prepare } of SELECTED) {
        // One retry: an aborted navigation is a race, not a broken route.
        try {
          await page.goto(path);
        } catch {
          await page.waitForTimeout(1000);
          await page.goto(path);
        }
        // Bounded, and failure to settle is not fatal. Some screens never reach
        // `networkidle` at all against a dev server — the crew board is one — and
        // an unbounded wait there consumed the whole test budget and produced no
        // picture of a page that renders perfectly well.
        await page
          .waitForLoadState("networkidle", { timeout: 15000 })
          .catch(() => {});
        // Compile on first hit can take seconds; a screenshot taken during it is
        // a picture of a skeleton, which is how 30 blank images happened before.
        // The runs page needs the longer end of this — it fires a second query
        // for periods after the shell paints.
        await page.waitForTimeout(8000);
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
        await page.screenshot({
          path: `${OUT}/${name}-${label}.png`,
          fullPage: true,
        });
      }
    });
  });
}
