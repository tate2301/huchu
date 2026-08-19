import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const useExternalBaseUrl = Boolean(process.env.E2E_BASE_URL);

/**
 * Drive a browser that is already on the machine instead of Playwright's own.
 *
 * `npx playwright install` pulls ~200MB from Microsoft's CDN, which on a
 * Zimbabwean connection — or behind a corporate proxy — can stall indefinitely;
 * it did on this workstation, twice, leaving a 0-byte `chromium-1217`. Setting
 * `E2E_BROWSER_CHANNEL=chrome` (or `msedge`) runs the suite against the
 * installed Chrome and needs no download at all.
 *
 * Unset by default, so CI and anyone with a working install keep the pinned
 * browser — which is the one worth trusting for a rendering difference.
 */
const channel = process.env.E2E_BROWSER_CHANNEL;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/.worktrees/**"],
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], ...(channel ? { channel } : {}) },
    },
  ],
  webServer: useExternalBaseUrl
    ? undefined
    : {
        command: "pnpm dev",
        url: baseURL,
        timeout: 180_000,
        reuseExistingServer: !process.env.CI,
      },
});
