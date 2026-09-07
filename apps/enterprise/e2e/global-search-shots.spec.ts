import { expect, test } from "@playwright/test";

/**
 * The app-bar search box, end to end.
 *
 * The arms are tested against Postgres where they are built and the dispatch is
 * tested in `lib/records/search.test.ts`. What neither can tell you is whether
 * typing in the box reaches them: the input, the debounce, the fetch to
 * `/api/v2/records/search`, the entitlement resolved from the session, and the
 * grouped list rendered under the cursor. That whole path has no unit test and
 * every piece of it has been broken at least once.
 *
 * Run against the tenant host, as with the payroll shots:
 *
 *   echo '127.0.0.1 payroll-demo.apps.pagka.local' >> /etc/hosts
 *   E2E_BASE_URL=http://payroll-demo.apps.pagka.local:3000 \
 *     npx playwright test e2e/global-search-shots.spec.ts
 *
 * The demo tenant is a payroll bureau, so People is the only arm entitled here —
 * which makes it the right tenant for this check. Before the People arm existed
 * this box had nothing at all to find on a bureau.
 */

const OUT = process.env.SHOT_DIR ?? "/tmp/shots";
const BASE = process.env.E2E_BASE_URL ?? "http://payroll-demo.apps.pagka.local:3000";

test.use({
  baseURL: BASE,
  launchOptions: { executablePath: "/opt/pw-browsers/chromium" },
  viewport: { width: 1440, height: 900 },
});

test("the app bar search finds staff and photographs its own results", async ({ page }) => {
  // Sign-in plus a cold compile of `/people` is comfortably past the 60s default.
  test.setTimeout(240_000);

  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2500);
  await page.fill("#login-email", "rudo.chirwa@payroll-demo.test");
  await page.fill("#login-password", "Password123!");
  await page.click('button[type="submit"]');
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
  try {
    await page.goto("/people");
  } catch {
    await page.waitForTimeout(1000);
    await page.goto("/people");
  }
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(8000);

  // Read a real name off the directory rather than hard-coding one: the seed
  // names have changed under this spec once already.
  //
  // Flattened to lines and scanned in order, because the identity cell is three
  // lines ("AM" / "Ada Moyo" / "EMP-001 · Operations Officer") and a column index
  // is not stable. Two earlier attempts here searched for "fficer" and then for
  // "Staff" — the second passed, by matching a *position label*, which is a green
  // test proving the wrong thing.
  const cells = await page.locator("table tbody tr").first().locator("td").allInnerTexts();
  const name = cells
    .flatMap((cell) => cell.split("\n"))
    .map((line) => line.trim())
    .find((line) => /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(line));
  const surname = name?.split(/\s+/).pop() ?? "";
  expect(
    surname.length,
    `no employee name among the first row's cells: ${JSON.stringify(cells)}`,
  ).toBeGreaterThan(2);

  // The box is a real input now, not a button that opens a dialog — so typing
  // into it is the whole interaction, and the first keystroke is what opens the
  // results.
  const box = page.getByRole("searchbox").first();
  await box.click();
  await box.type(surname, { delay: 60 });

  // The response, not a timeout: a screenshot taken mid-request is a picture of
  // an empty list, which is indistinguishable from the bug this spec is for.
  const response = await page.waitForResponse(
    (response) =>
      response.url().includes("/api/v2/records/search") && response.status() === 200,
    { timeout: 30000 },
  );
  // Logged, because a green box and an empty answer look the same in a
  // screenshot and this line is what told us which one we had.
  console.log("[search]", response.url(), JSON.stringify(await response.json()).slice(0, 800));

  // Every character reached the query, including the first.
  //
  // This is the assertion that caught a real bug: the app-bar input handed its
  // text to the bar and the bar's open-transition cleared it in the same render,
  // so "Moyo" arrived as "oyo". `contains` still matched, the screenshot still
  // looked right, and a reference like "EMP-001" would have searched "MP-001".
  await expect(page.getByRole("dialog").getByRole("textbox").first()).toHaveValue(surname);
  await page.waitForTimeout(1200);

  // The person whose surname was typed has to come back by full name. Asserting
  // only the group heading would pass on an empty "Staff" group, and asserting
  // only the surname would pass on the row still visible in the table behind.
  await expect(page.getByRole("dialog").getByText(name!, { exact: false }).first()).toBeVisible({
    timeout: 15000,
  });

  await page.screenshot({ path: `${OUT}/global-search-staff-desktop.png`, fullPage: false });

  // A query nothing matches must say so rather than showing the last answer.
  //
  // Retyped into the *bar's* field, not the app bar's. Aimed at the app-bar input
  // the first time, this photographed the previous result set unchanged — the
  // input behind the dialog took the keystrokes and nothing re-queried.
  const barField = page.getByRole("dialog").getByRole("textbox").first();
  await barField.fill("zzzzqqq");
  await expect(page.getByText(/Nothing matches/i).first()).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: `${OUT}/global-search-empty-desktop.png`, fullPage: false });
});
