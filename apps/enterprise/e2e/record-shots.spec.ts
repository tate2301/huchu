import { expect, test, type Page } from "@playwright/test";

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
 * Runs against the CRM demo tenant; see e2e/crm-shots.spec.ts for the seed.
 */

const OUT = process.env.SHOT_DIR ?? "/tmp/shots";
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.SHOT_EMAIL ?? "crm@demo.test";
const PASSWORD = process.env.SHOT_PASSWORD ?? "Password123!";

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
  try {
    await page.goto(list);
  } catch {
    await page.waitForTimeout(1000);
    await page.goto(list);
  }
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(6000);

  const link = page.locator(`a[href^="${prefix}"]`).first();
  if (!(await link.isVisible().catch(() => false))) {
    console.error(`[shots] no record row under ${prefix}`);
    return false;
  }
  const href = await link.getAttribute("href");
  await link.click();
  // Wait on the URL rather than the network: the record route compiles on
  // first hit, and `networkidle` settles on the list long before the record
  // has painted.
  if (href) {
    await page.waitForURL(`**${href}`, { timeout: 30000 }).catch(() => {
      console.error(`[shots] never landed on ${href}`);
    });
  }
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(6000);
  return true;
}

test.use({
  baseURL: BASE,
  launchOptions: { executablePath: "/opt/pw-browsers/chromium" },
});

const ALL_VIEWPORTS: Array<[label: string, width: number, height: number]> = [
  ["phone", 390, 844],
  ["desktop", 1440, 900],
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

      await page.goto("/login");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2500);
      await page.fill("#login-email", EMAIL);
      await page.fill("#login-password", PASSWORD);
      await page.click('button[type="submit"]');
      // Poll the session endpoint rather than the cookie jar or the URL. The
      // cookie's name depends on how the deployment is configured, and
      // NEXTAUTH_URL pins the post-login redirect to whichever host it names —
      // which need not be the host the form posted to. Whether the session
      // exists is the thing actually being waited on.
      await expect
        .poll(
          async () =>
            page.request
              .get(BASE + "/api/auth/session")
              .then((response) => response.json())
              .then((body: { user?: unknown }) => Boolean(body?.user))
              .catch(() => false),
          { timeout: 45000 },
        )
        .toBe(true);

      await page.goto("/", { waitUntil: "commit" }).catch(() => {});
      await page.waitForTimeout(1000);

      for (const { name, list, prefix } of SELECTED) {
        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(300);

        const opened = await openFirstRecord(page, list, prefix);
        if (!opened) continue;

        // The whole page, which is what shows how much scrolling a record
        // costs, and the first screen, which is what somebody actually gets.
        await page.screenshot({ path: `${OUT}/record-${name}-${label}.png`, fullPage: true });
        await page.screenshot({ path: `${OUT}/record-${name}-${label}-fold.png` });
      }
    });
  });
}
