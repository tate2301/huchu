import { appendFileSync, mkdirSync } from "node:fs";
import type { BrowserContext } from "@playwright/test";

/**
 * Which API routes the suite actually calls, recorded as it runs.
 *
 * Page coverage can be counted statically — a spec names a path, the path
 * matches a `page.tsx`. There are 647 API routes and nothing names them: they
 * are called by the pages, by the offline pre-cache, by React Query on a
 * refetch. So the only honest way to count them is to watch.
 *
 * Every browser context appends the pathname of every `/api/**` request it
 * makes to `e2e-coverage/api-hits.log`, one per line, duplicates and all.
 * `scripts/e2e-coverage.mjs --api` reads that back and matches it against the
 * route files, resolving `[id]` and `[...slug]` segments the same way the page
 * matcher does.
 *
 * ## Not in `e2e-results/`, and that was a bug for one run
 *
 * `e2e-results/` is Playwright's `outputDir`, and Playwright **empties it at
 * the start of every run**. Writing here meant each run silently destroyed the
 * previous one's log, so the accumulating measurement the note below describes
 * accumulated nothing — measured by watching the line count reset to zero
 * between two consecutive runs. Its own directory, which nothing else owns.
 *
 * ## Appending rather than collecting
 *
 * A line at a time to a file, not an array flushed at the end. Playwright runs
 * specs in worker processes that are recycled, and a global teardown does not
 * see what a crashed worker held — which is exactly the run whose coverage you
 * want to look at. Appending is atomic enough for single lines on both
 * platforms and survives a worker dying mid-test.
 *
 * The file is **not** truncated here: several `playwright test` invocations in
 * a row are one measurement pass as far as this is concerned. Delete it to
 * start a new one.
 *
 * ## What it does not see, which is more than it sounds
 *
 * This is attached in the `context` fixture in `fixtures.ts`, so it sees only
 * contexts built through it. **Thirty-one of the forty-two spec files import
 * `test` from `@playwright/test` directly** and build their own — and that set
 * contains every behavioural spec in the repo: `retail-workflows`,
 * `retail-void`, `attendance-mark`, `offline-lifecycle`. Those are exactly the
 * specs that issue mutations, so the mutation figure `--api` reports is a
 * floor rather than a measurement.
 *
 * Measured, not assumed: a 13-test run of those three specs, including a full
 * trading day, added zero lines to the log.
 *
 * The fix is the migration already on the open list — retro-fit the legacy
 * specs onto `_support/tenants.ts` and this fixture — not a second recorder.
 *
 * `auth.setup.ts` is the one deliberate omission. It builds its own contexts
 * too, so the sign-in round trip is unrecorded, and that is left alone:
 * threading this through the setup project buys four endpoints that every
 * other test already depends on and cannot break silently.
 */

const DIR = "e2e-coverage";
const LOG = `${DIR}/api-hits.log`;

let ready = false;

function ensureDir(): void {
  if (ready) return;
  mkdirSync(DIR, { recursive: true });
  ready = true;
}

/** Record every `/api/**` request this context makes. */
export function recordApiCalls(context: BrowserContext): void {
  context.on("request", (request) => {
    let pathname: string;
    try {
      pathname = new URL(request.url()).pathname;
    } catch {
      return;
    }
    if (!pathname.startsWith("/api/")) return;

    ensureDir();
    try {
      appendFileSync(LOG, `${request.method()} ${pathname}\n`);
    } catch {
      /*
        Never fail a test over bookkeeping. A locked file or a full disk is a
        reason to lose a coverage line, not a reason to turn a passing sweep
        red — the measurement exists to inform the suite, not to gate it.
      */
    }
  });
}
