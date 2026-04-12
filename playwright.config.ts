import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const useExternalBaseUrl = Boolean(process.env.E2E_BASE_URL);

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
      use: { ...devices["Desktop Chrome"] },
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
