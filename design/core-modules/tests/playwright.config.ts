import { defineConfig } from "@playwright/test";

/**
 * The visual acceptance test on its own, apart from the app's e2e suite:
 *
 *   BASE_URL=http://localhost:3000 npx playwright test -c design/core-modules/tests
 *
 * `E2E_BROWSER_EXECUTABLE` drives a Chromium already on the machine, as the
 * app's own config does.
 */
const executablePath = process.env.E2E_BROWSER_EXECUTABLE;

export default defineConfig({
  testDir: ".",
  testMatch: "visual.spec.ts",
  fullyParallel: true,
  workers: 2,
  reporter: [["list"]],
  use: executablePath ? { launchOptions: { executablePath } } : {},
});
