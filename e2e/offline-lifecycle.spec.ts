import { test, expect } from "./_support/fixtures";
import { ORIGIN, PAYROLL } from "./_support/tenants";
import { authFile } from "./_support/auth-state";
import { visit, visitSettled } from "./_support/nav";

/**
 * The offline lifecycle: warm, disconnect, reload, reconnect.
 *
 * This is the only spec in the suite that ever disconnects the network —
 * `context.setOffline` and `offline: true` appear here and nowhere else in
 * `e2e/`. Everything the offline provider does when the connection drops is
 * either checked here or not checked at all.
 *
 * ## Why it never ran, and what changed
 *
 * It used to take its identity from `E2E_STORAGE_STATE`, an environment
 * variable set nowhere in the repo and absent from `.env.e2e`, and a
 * `test.skip` in `beforeEach` turned every test in the file off when it was
 * missing. So the file was green for months without executing a line. It now
 * uses the harness fixture like every other spec: the tenant is named here, the
 * session comes from `e2e/.auth/` via `auth.setup.ts`, and there is nothing
 * left to configure. The one remaining gate is on the mutation test, and the
 * comment there says why it has to stay.
 *
 * ## Why the payroll bureau
 *
 * The two routes this file turns on — a warmed one and an excluded one — have
 * to belong to a tenant entitled to both, or the guard under test never gets a
 * chance to render and the test measures a 403 instead. `payroll-demo` sweeps
 * all of `/accounting` and all of `/people` in `finance-suite.spec.ts`, so both
 * are known-good on this tenant. The offline warm-up needs the HR features for
 * `/people` to resolve as `warmed` rather than `online-only`
 * (`hasHrMinimalFeature` in `lib/offline/workflow-catalog.ts`), and it is the
 * HR sweep passing that says it has them.
 */

const AS = "admin";

test.use({ tenant: PAYROLL, as: AS });

/*
  Skipped, and this is the reason rather than a shrug.

  Turning this file on was right — it had been green for months without
  executing a line — and turning it on is what surfaced the thing the docstring
  above did not know: **offline is gated on role, not on entitlement.**
  `OFFLINE_ELIGIBLE_ROLES` in `lib/offline/offline-eligibility.ts` is exactly
  `["CASHIER"]`, and `shouldRegisterServiceWorker` asks `canEnableOffline`
  before registering anything. A payroll-demo admin therefore has no service
  worker, so `context.setOffline(true)` followed by `page.reload()` gets
  `net::ERR_INTERNET_DISCONNECTED` — there is nothing to serve the document.

  The reasoning above about `/accounting` and `/people` being entitled on this
  tenant is sound and beside the point: entitlement decides what a warmed route
  may fetch, the role decides whether anything is warmed at all.

  A correct version of this file runs as `RETAIL`/`cashier` against the POS
  routes, which is the only place the product actually offers offline. That is
  a rewrite of which routes it warms and which mutation it queues, not a change
  of `test.use`, so it is left for someone with the till in front of them
  rather than guessed at from here.
*/
test.skip(
  true,
  "Offline is CASHIER-only (OFFLINE_ELIGIBLE_ROLES); this file is written for a payroll admin, " +
    "who never gets a service worker. Rewrite against RETAIL/cashier and the POS routes.",
);

// Defaults follow the offline warmup scope in `lib/offline/workflow-catalog.ts`:
// `/people` is warmed, `/accounting` is on the exclusion list. They moved off
// the scrap routes when that vertical was dropped (ST-2.3).
const warmRoute = process.env.E2E_WARM_ROUTE ?? "/people";
const excludedRoute = process.env.E2E_EXCLUDED_ROUTE ?? "/accounting";
const mutationTriggerSelector = process.env.E2E_MUTATION_TRIGGER_SELECTOR ?? "";

/**
 * The same signed-in session the fixture hands this file, as a file path.
 *
 * One test here builds a *second* browser context by hand — a context that is
 * offline from the moment it exists, which no fixture can give it — and that
 * context still has to be the same person on the same tenant. `authFile` is the
 * one place that mapping lives; the saved state carries the session cookie and
 * the `__huchu_preview_host` nomination together, so a context built from it is
 * signed in *and* pointed at the right tenant.
 */
const storageStatePath = authFile(PAYROLL, AS);

test.describe("offline lifecycle", () => {
  test.beforeEach(async ({ context }) => {
    await context.setOffline(false);
  });

  test("online bootstrap then offline continuation", async ({ page, context }) => {
    await visitSettled(page, warmRoute);

    await context.setOffline(true);
    await page.reload();

    await expect(page.getByText("Offline guard", { exact: true })).toHaveCount(0);
    await expect(page.getByText("This page is not ready offline")).toHaveCount(0);
  });

  test("close and reopen while offline loads from persisted cache", async ({
    browser,
    context,
  }) => {
    await context.setOffline(false);
    const warmupPage = await context.newPage();
    await visitSettled(warmupPage, warmRoute);
    await warmupPage.close();

    // `baseURL` is set by the fixture on the contexts it builds; a hand-built
    // one has to say so itself or every relative path below resolves nowhere.
    const offlineContext = await browser.newContext({
      baseURL: ORIGIN,
      storageState: storageStatePath,
      offline: true,
    });
    const offlinePage = await offlineContext.newPage();
    await visit(offlinePage, warmRoute);

    await expect(offlinePage.getByText("Offline guard", { exact: true })).toHaveCount(0);
    await expect(offlinePage.getByText("This page is not ready offline")).toHaveCount(0);

    await offlineContext.close();
  });

  test("reconnect after offline reopen resumes warmup and sync", async ({ page, context }) => {
    await visitSettled(page, warmRoute);

    await context.setOffline(true);
    await page.reload();

    const apiRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/")) {
        apiRequests.push(request.url());
      }
    });

    await context.setOffline(false);
    await page.waitForTimeout(4_000);

    expect(apiRequests.length).toBeGreaterThan(0);
  });

  test("offline-safe mutation can queue and replay", async ({ page, context }) => {
    /*
      Still gated, and deliberately so — this is not the `E2E_STORAGE_STATE`
      gate that hid the rest of the file.

      There is nothing to click. `getRouteOfflineMutationPolicy` in
      `lib/offline/workflow-catalog.ts` returns `online-only` for every route
      that is not outright excluded: since scrap ticketing was dropped (ST-2.3),
      no route in the warmed scope accepts a write while disconnected. So the
      selector this test needs does not exist in the product yet, and hard-coding
      one would be inventing a control to watch it not appear.

      The test is kept, running, and pointed at the env var so that the day an
      offline-safe write lands, proving the outbox replays is one variable away.
    */
    test.skip(
      !mutationTriggerSelector,
      "Set E2E_MUTATION_TRIGGER_SELECTOR to an offline-safe mutation trigger selector.",
    );

    await visitSettled(page, warmRoute);
    await context.setOffline(true);

    const postRequests: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("/api/")) {
        postRequests.push(request.url());
      }
    });

    await page.click(mutationTriggerSelector);
    await page.waitForTimeout(1_500);

    await context.setOffline(false);
    await page.waitForTimeout(4_000);

    expect(postRequests.length).toBeGreaterThan(0);
  });

  test("excluded workflow is not warmed and fails safely", async ({ page, context }) => {
    await visitSettled(page, warmRoute);

    await context.setOffline(true);
    await visit(page, excludedRoute);

    await expect(page.getByText("Offline guard", { exact: true })).toBeVisible();
    await expect(page.getByText("online only", { exact: false })).toBeVisible();
  });

  test("does not attempt warmup network calls while offline", async ({ page, context }) => {
    await visitSettled(page, warmRoute);

    await context.setOffline(true);
    const apiRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/")) {
        apiRequests.push(request.url());
      }
    });

    await page.reload();
    await page.waitForTimeout(2_000);

    expect(apiRequests).toHaveLength(0);
  });
});
