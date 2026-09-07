import { expect, test } from "./_support/fixtures";
import { PAYROLL } from "./_support/tenants";
import { visitSettled } from "./_support/nav";
import { VIEWPORT } from "./_support/shots";

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
 *   npx playwright test e2e/global-search-shots.spec.ts
 *
 * ## Why it is on the payroll bureau
 *
 * `PAYROLL` is a payroll bureau, so People is the only arm entitled here —
 * which makes it the right tenant for this check. Before the People arm existed
 * this box had nothing at all to find on a bureau.
 *
 * ## What the migration to the harness fixed
 *
 * This spec used to carry its own host and its own login, as
 * `test.use({ baseURL: process.env.E2E_BASE_URL ?? "http://payroll-demo.…" })`
 * plus a hand-rolled sign-in with the bureau's credentials written inline. That
 * default never applied: `.env.e2e` sets `E2E_BASE_URL` for the whole suite, so
 * the spec posted payroll credentials at the **acme** host with no
 * `__huchu_preview_host` cookie, and was refused — surfacing 45 seconds later as
 * a failed cookie poll, a sentence about a session rather than about a tenant.
 *
 * `test.use({ tenant: PAYROLL, as: "admin" })` replaces both: the fixture takes
 * the one origin, nominates the bureau's host on it, and starts from the session
 * `auth.setup.ts` already established. That sign-in is asserted there and in
 * `smoke-tenants.spec.ts`, so the cookie poll this spec used to do is covered
 * twice over and is the only check dropped in the move.
 */

/**
 * Where the two images land.
 *
 * The names are unchanged — nothing else in the suite photographs the search
 * box — but the root now follows `_support/shots.ts` rather than `/tmp/shots`,
 * which does not survive a reboot and is not a path this workstation has.
 */
const SHOTS = `${process.env.SHOT_DIR ?? "docs/screenshots"}/payroll/global-search`;

test.use({
  tenant: PAYROLL,
  as: "admin",
  // Guarded, like `visual-pass.spec.ts` and the other shots specs. An
  // unconditional Linux path meant this spec could only run in one
  // container; everywhere else it died before the first navigation with
  // "Failed to launch chromium", which reads as a broken install.
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
  viewport: VIEWPORT.desktop,
});

test("the app bar search finds staff and photographs its own results", async ({ page }) => {
  // The sign-in half of this budget is gone — the session arrives with the
  // context — but a cold compile of `/people` under `next dev` plus the search
  // round trip is still comfortably past the 120s default.
  test.setTimeout(240_000);

  // `visit` retries the one navigation that Next's own post-login redirect used
  // to abort, which is what the hand-rolled try/catch round `goto("/people")`
  // was doing here. `visitSettled` time-boxes the idle wait: the app holds an
  // open SSE stream, so an unbounded `networkidle` never resolves.
  await visitSettled(page, "/people");

  // Read a real name off the directory rather than hard-coding one: the seed
  // names have changed under this spec once already.
  //
  // Flattened to lines and scanned in order, because the identity cell is three
  // lines ("AM" / "Ada Moyo" / "EMP-001 · Operations Officer") and a column index
  // is not stable. Two earlier attempts here searched for "fficer" and then for
  // "Staff" — the second passed, by matching a *position label*, which is a green
  // test proving the wrong thing.
  //
  // Waiting for the row replaces an eight-second sleep: the directory is what
  // this read depends on, so it is the thing worth waiting for.
  const firstRow = page.locator("table tbody tr").first();
  await expect(firstRow).toBeVisible({ timeout: 60_000 });
  const cells = await firstRow.locator("td").allInnerTexts();
  const name = cells
    .flatMap((cell) => cell.split("\n"))
    .map((line) => line.trim())
    .find((line) => /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(line));
  const surname = name?.split(/\s+/).pop() ?? "";
  expect(
    surname.length,
    `no employee name among the first row's cells: ${JSON.stringify(cells)}`,
  ).toBeGreaterThan(2);

  /*
    The response, not a timeout: a screenshot taken mid-request is a picture of
    an empty list, which is indistinguishable from the bug this spec is for.

    Armed *before* the typing, and matched on the query rather than on the path
    alone. Both matter. Waiting only afterwards can miss a response that already
    landed; and the route answers `{ groups: [], total: 0 }` with a 200 for any
    query under two characters (`app/api/v2/records/search/route.ts`), so a
    path-only match can settle on the first keystroke's empty answer — the exact
    green-box-empty-answer confusion the log line below exists to tell apart.
    `global-command-bar.tsx` debounces 200ms and sends `q=encodeURIComponent(
    query.trim())`, so the full surname is what arrives.
  */
  const searched = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v2/records/search") &&
      new URL(response.url()).searchParams.get("q") === surname &&
      response.status() === 200,
    { timeout: 30000 },
  );

  // The box is a real input now, not a button that opens a dialog — so typing
  // into it is the whole interaction, and the first keystroke is what opens the
  // results. Typed key by key, with a delay: per-keystroke behaviour is the
  // thing under test here, so a `fill` would skip the bug below.
  // (`pressSequentially` is `type` under its current name.)
  const box = page.getByRole("searchbox").first();
  await box.click();
  await box.pressSequentially(surname, { delay: 60 });

  const response = await searched;
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

  await page.screenshot({
    path: `${SHOTS}/global-search-staff-desktop.png`,
    fullPage: false,
  });

  // A query nothing matches must say so rather than showing the last answer.
  //
  // Retyped into the *bar's* field, not the app bar's. Aimed at the app-bar input
  // the first time, this photographed the previous result set unchanged — the
  // input behind the dialog took the keystrokes and nothing re-queried.
  const barField = page.getByRole("dialog").getByRole("textbox").first();
  await barField.fill("zzzzqqq");
  await expect(page.getByText(/Nothing matches/i).first()).toBeVisible({ timeout: 15000 });
  await page.screenshot({
    path: `${SHOTS}/global-search-empty-desktop.png`,
    fullPage: false,
  });
});
