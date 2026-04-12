import fs from "node:fs";
import { expect, test } from "@playwright/test";

const storageStatePath = process.env.E2E_STORAGE_STATE ?? "";
const hasStorageState = storageStatePath.length > 0 && fs.existsSync(storageStatePath);
const warmRoute = process.env.E2E_WARM_ROUTE ?? "/scrap-metal/tickets";
const excludedRoute = process.env.E2E_EXCLUDED_ROUTE ?? "/scrap-metal/settlements";
const mutationTriggerSelector = process.env.E2E_MUTATION_TRIGGER_SELECTOR ?? "";

if (hasStorageState) {
  test.use({ storageState: storageStatePath });
}

test.describe("offline lifecycle", () => {
  test.beforeEach(async ({ context }) => {
    test.skip(!hasStorageState, "Set E2E_STORAGE_STATE to run authenticated offline lifecycle tests.");
    await context.setOffline(false);
  });

  test("online bootstrap then offline continuation", async ({ page, context }) => {
    await page.goto(warmRoute);
    await page.waitForLoadState("networkidle");

    await context.setOffline(true);
    await page.reload();

    await expect(page.getByText("Offline guard", { exact: true })).toHaveCount(0);
    await expect(page.getByText("This page is not ready offline")).toHaveCount(0);
  });

  test("close and reopen while offline loads from persisted cache", async ({ browser, context }) => {
    await context.setOffline(false);
    const warmupPage = await context.newPage();
    await warmupPage.goto(warmRoute);
    await warmupPage.waitForLoadState("networkidle");
    await warmupPage.close();

    const offlineContext = await browser.newContext({
      storageState: storageStatePath,
      offline: true,
    });
    const offlinePage = await offlineContext.newPage();
    await offlinePage.goto(warmRoute);

    await expect(offlinePage.getByText("Offline guard", { exact: true })).toHaveCount(0);
    await expect(offlinePage.getByText("This page is not ready offline")).toHaveCount(0);

    await offlineContext.close();
  });

  test("reconnect after offline reopen resumes warmup and sync", async ({ page, context }) => {
    await page.goto(warmRoute);
    await page.waitForLoadState("networkidle");

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
    test.skip(
      !mutationTriggerSelector,
      "Set E2E_MUTATION_TRIGGER_SELECTOR to an offline-safe mutation trigger selector.",
    );

    await page.goto(warmRoute);
    await page.waitForLoadState("networkidle");
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
    await page.goto(warmRoute);
    await page.waitForLoadState("networkidle");

    await context.setOffline(true);
    await page.goto(excludedRoute);

    await expect(page.getByText("Offline guard", { exact: true })).toBeVisible();
    await expect(page.getByText("online only", { exact: false })).toBeVisible();
  });

  test("does not attempt warmup network calls while offline", async ({ page, context }) => {
    await page.goto(warmRoute);
    await page.waitForLoadState("networkidle");

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
