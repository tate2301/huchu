import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

/**
 * Load `.env.e2e` before anything reads `process.env`.
 *
 * The suite needs `E2E_BASE_URL` to know where the app is and
 * `E2E_DATABASE_URL` to read the database back, and both live in `.env.e2e`
 * alongside the server's own settings. Without this, `npx playwright test`
 * throws at import time in `_support/db.ts` — before collecting a single test,
 * so Playwright then reports "No tests found" underneath the real error.
 *
 * `override: false` is the point: anything already exported on the command
 * line wins, so pointing a run at a different server stays a one-liner.
 */
loadEnv({ path: ".env.e2e", override: false, quiet: true });

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

  /**
   * Two minutes, because `next dev` compiles each route the first time it is
   * asked for and this suite is mostly first asks.
   *
   * It was 60s, and that was measured as wrong rather than assumed: the two
   * tenant smoke tests pass in 28s each when run alone, and both timed out when
   * run after the school suite — whose cold portal routes took 19.5s apiece to
   * compile, according to the dev server's own log. Nothing about the app was
   * slower; the queue in front of it was longer.
   *
   * Specs doing genuinely long work raise it themselves — `e2e/smoke-school.spec.ts`
   * uses `describe.configure`. This is not a performance target, it is a refusal
   * to report a compile as a failure, and a production-build run should want it
   * much lower.
   */
  timeout: 120_000,

  /**
   * Serial, because the specs share a tenant: one opens a till shift another
   * closes, and a parallel run would have them fighting over the same rows.
   * Per-vertical parallelism is possible later — each vertical has its own
   * tenant — but correctness first.
   */
  fullyParallel: false,

  /**
   * One worker. `fullyParallel: false` is not enough and that cost a day.
   *
   * It only disables parallelism *within* a file; Playwright still runs
   * different spec files concurrently, one per worker. Running the eight suites
   * together therefore spun up **six** browsers at once against one server and
   * one database — on a 16GB machine, with a production Next build already
   * resident.
   *
   * The symptom was not a crash but something worse to debug: a different set
   * of five or six tests failed on every run, always on a 25-second assertion
   * timeout, never the same ones twice. Two runs an hour apart shared no
   * failures at all. One worker crashed with 0xC0000374 (heap corruption) and a
   * 71-test run took 41 minutes instead of 10.
   *
   * The shared-tenant hazard the note below describes is real for the same
   * reason: with six workers, `retail-suite` and `cross-cutting` are both
   * signing into acme and moving the same till shift around.
   */
  workers: 1,

  retries: process.env.CI ? 1 : 0,

  /**
   * `list` for the terminal, `html` for afterwards. A failed journey is a
   * sequence, and reading it back as a trace beats scrolling the log.
   * `open: "never"` so a headless or CI run does not try to launch a browser.
   */
  reporter: [["list"], ["html", { outputFolder: "e2e-report", open: "never" }]],

  /** Failure artefacts, not test output — screenshots live in docs/screenshots. */
  outputDir: "e2e-results",

  use: {
    baseURL,
    /**
     * `on-first-retry` produces nothing at all locally, where `retries` is 0 —
     * so the one run you most want to inspect is the one with no trace. Keep it
     * on any failure instead; passing runs still cost nothing.
     */
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    /*
      Video only where ffmpeg exists.

      Playwright records through its own ffmpeg build, downloaded with the
      browsers. This workstation runs `E2E_BROWSER_CHANNEL=chrome` precisely
      because that download never completed, so there is no ffmpeg either — and
      every genuine failure grew a second, louder error:

        browserContext.newPage: Executable doesn't exist at
        ...ms-playwrightfmpeg-1011fmpeg-win64.exe

      Thirteen of them in one run, each attached to a real failure and each
      about the recorder rather than the test. The trace and the failure
      screenshot survive either way, and between them they are what anybody
      actually opens.

      `E2E_VIDEO=1` turns it back on for a machine that has the download.
    */
    video: process.env.E2E_VIDEO === "1" ? "retain-on-failure" : "off",
  },

  projects: [
    /**
     * Sign everybody in, once, before anything else runs.
     *
     * `e2e/auth.setup.ts` writes one `storageState` file per tenant-and-role
     * under `e2e/.auth/`, and the suites start from those instead of signing in
     * themselves. Signing in per test cost 15–25 seconds each and made the
     * 17-test gold suite a 2.6-hour run — the tests were about fifteen minutes
     * of that, and authentication the rest.
     */
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
      use: { ...devices["Desktop Chrome"], ...(channel ? { channel } : {}) },
    },
    {
      name: "chromium",
      dependencies: ["setup"],
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
