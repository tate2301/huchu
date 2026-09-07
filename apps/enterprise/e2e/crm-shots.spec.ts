import { expect, test, type Page } from "@playwright/test";

/**
 * Screenshots of the CRM surface, at every width it has to work at.
 *
 * The module is judged on a phone as often as on a desktop, and a board, a
 * record page or a filter row can only be judged with records in it — so this
 * runs against the CRM demo tenant, not an empty one:
 *
 *   npx tsx scripts/seed-staging-tenant.ts --slug crmdemo \
 *     --email crm@demo.test --password 'Password123!' --name 'Corelith Demo'
 *   npx tsx scripts/seed-crm-demo.ts --slug crmdemo
 *   E2E_BASE_URL=http://localhost:3000 npx playwright test e2e/crm-shots.spec.ts
 *
 * `SHOT_ONLY=crm-leads,crm-deals SHOT_VIEWPORTS=phone` reshoots one screen at
 * one width, which is the loop you want while changing it.
 */

const OUT = process.env.SHOT_DIR ?? "/tmp/shots";
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.SHOT_EMAIL ?? "crm@demo.test";
const PASSWORD = process.env.SHOT_PASSWORD ?? "Password123!";

type Screen = {
  name: string;
  path: string;
  prepare?: (page: Page) => Promise<void>;
};

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
  { name: "mgmt-users", path: "/management/users" },
  { name: "mgmt-users-create", path: "/management/users/create" },
  { name: "mgmt-users-status", path: "/management/users/status" },
  { name: "mgmt-users-role-change", path: "/management/users/role-change" },
  { name: "mgmt-users-password-reset", path: "/management/users/password-reset" },
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

function openFirstRecord(prefix: string) {
  return async (page: Page) => {
    const link = page.locator(`a[href^="${prefix}"]`).first();
    if (!(await link.isVisible().catch(() => false))) {
      console.error(`[shots] no record row to open under ${prefix}`);
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
        console.error(`[shots] never landed on ${href}`);
      });
    }
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(6000);
  };
}

// The environment ships a chromium this Playwright did not download, so point
// at the installed binary rather than fetching one.
test.use({
  baseURL: BASE,
  launchOptions: { executablePath: "/opt/pw-browsers/chromium" },
});

const ALL_VIEWPORTS: Array<[label: string, width: number, height: number]> = [
  ["desktop", 1440, 900],
  ["tablet", 768, 1024],
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
const SELECTED = screenFilter
  ? SCREENS.filter((screen) => screenFilter.has(screen.name))
  : SCREENS;
const VIEWPORTS = viewportFilter
  ? ALL_VIEWPORTS.filter(([label]) => viewportFilter.has(label))
  : ALL_VIEWPORTS;

for (const [label, width, height] of VIEWPORTS) {
  test.describe(`${label}`, () => {
    test.use({ viewport: { width, height } });

    test(`crm screens at ${width}x${height}`, async ({ page }) => {
      // The config's 60s global timeout cannot fit a pass: sign-in alone is
      // ~30s against a dev server, and each screen waits for compile-on-first-
      // hit. Sized to the work, so an overrun fails rather than half-writing a
      // directory of images that looks like a complete run.
      test.setTimeout(90_000 + SELECTED.length * 25_000);

      await page.goto("/login");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2500);
      await page.fill("#login-email", EMAIL);
      await page.fill("#login-password", PASSWORD);
      await page.click('button[type="submit"]');
      // Wait on the cookie rather than the URL: NEXTAUTH_URL pins the
      // post-login redirect to whichever host it names, while the session is
      // issued for the host the form posted to.
      await expect
        .poll(
          async () => {
            const cookies = await page.context().cookies();
            return cookies.some((cookie) => cookie.name.includes("session-token"));
          },
          { timeout: 45000 },
        )
        .toBe(true);

      await page.goto("/", { waitUntil: "commit" }).catch(() => {});
      await page.waitForTimeout(1000);

      for (const { name, path, prepare } of SELECTED) {
        // Close whatever the last screen left open. A screen whose `prepare`
        // opens a sheet or the sidebar used to leave it open across the next
        // `goto`, which is how a picture of the clients list came back showing
        // the sidebar over it.
        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(300);

        // One retry: an aborted navigation is a race, not a broken route.
        try {
          await page.goto(path);
        } catch {
          await page.waitForTimeout(1000);
          await page.goto(path);
        }
        await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
        // Compile-on-first-hit takes seconds against a dev server; a shot taken
        // during it is a picture of a skeleton.
        await page.waitForTimeout(6000);
        const banner = page.getByText(/Unable to load|Failed to (fetch|load)/i).first();
        if (await banner.isVisible().catch(() => false)) {
          console.error(`[shots] ${name} at ${label} rendered an error banner`);
        }
        if (prepare) {
          await prepare(page);
          await page.waitForTimeout(1500);
        }
        await page.screenshot({ path: `${OUT}/${name}-${label}.png`, fullPage: true });
      }
    });
  });
}
