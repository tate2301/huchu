import type { Page } from "@playwright/test";

/**
 * Screenshots, numbered and put somewhere findable.
 *
 * These are a deliverable, not debris: the plan says they may end up on a
 * marketing page (`docs/testing/e2e-plan-2026-09-01.md` §6). That imposes two
 * requirements a debug screenshot does not have.
 *
 * **They must land in one place.** Before this, four specs wrote to four
 * different roots — `/tmp/shots` twice, `docs/retail/screenshots`, and
 * `docs/retail/screenshots/workflows`. Two of those do not survive a reboot.
 * Everything now goes to `docs/screenshots/<vertical>/<journey>/NN-name.png`.
 *
 * **They must be reproducible.** A screenshot that differs run to run cannot be
 * reviewed, only re-taken. `settle()` waits the page out; `freeze()` stops the
 * things that move.
 */

const ROOT = process.env.SHOT_DIR ?? "docs/screenshots";

/** How long to let a page finish before believing what it shows. */
const SETTLE_MS = Number(process.env.SHOT_SETTLE_MS ?? 2500);

/**
 * Kill the things that make two screenshots of the same page differ: CSS
 * animations and transitions mid-flight, a blinking caret, a focus ring left on
 * whatever was last clicked, and the scroll position.
 *
 * Injected as a stylesheet rather than a Playwright option because
 * `reducedMotion` only sets the media query — an animation that does not honour
 * `prefers-reduced-motion` keeps running.
 */
export async function freeze(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
        scroll-behavior: auto !important;
      }
      *:focus, *:focus-visible { outline: none !important; box-shadow: none !important; }
    `,
  });
}

/**
 * Wait for the network to go quiet, then a beat more for React to paint.
 *
 * The idle wait is time-boxed, and has to be: the app holds an open
 * server-sent-event stream for notifications, so the network is never idle and
 * `waitForLoadState("networkidle")` never resolves. Unbounded it burns the
 * page's whole default timeout — once per screenshot — which is the same bug
 * that turned the route sweeps into a 2.6-hour run before `nav.ts` was given
 * this fix. Caught here before Phase 4 ran rather than after.
 *
 * Two seconds of asking, then `SHOT_SETTLE_MS` of deliberate quiet. For a
 * screenshot the second wait is the one that was ever doing the work.
 */
export async function settle(page: Page, ms: number = SETTLE_MS): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 2_000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

export type Shooter = {
  /** Photograph the current page as the next numbered step. */
  (page: Page, name: string): Promise<string>;
  /** Where this shooter is writing, for a log line. */
  dir: string;
};

/**
 * A numbered camera for one journey.
 *
 *   const shot = shooter("retail", "trading-day")
 *   await shot(page, "till-open")     // …/retail/trading-day/01-till-open.png
 *
 * The counter is per-shooter and not module-global on purpose: Playwright gives
 * each test its own module scope, so one shared counter restarts at 1 in the
 * second test and silently overwrites the first one's opening shots. That bug
 * was live in `retail-workflows.spec.ts` until it grew a per-test prefix.
 */
export function shooter(vertical: string, journey: string): Shooter {
  const dir = `${ROOT}/${vertical}/${journey}`;
  let step = 0;

  const shot = async (page: Page, name: string): Promise<string> => {
    step += 1;
    const path = `${dir}/${String(step).padStart(2, "0")}-${name}.png`;
    await freeze(page);
    await settle(page);
    await page.screenshot({ path, fullPage: false });
    return path;
  };

  shot.dir = dir;
  return shot as Shooter;
}

/** Standard viewports. Named so a spec says what device it means. */
export const VIEWPORT = {
  /** The admin app, on a laptop. */
  desktop: { width: 1440, height: 900 },
  /** The till. Small, and the reason the POS layout exists. */
  till: { width: 1024, height: 768 },
  /** A parent checking fees on their phone. */
  mobile: { width: 390, height: 844 },
} as const;
