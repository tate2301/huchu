import type { Page, Response } from "@playwright/test";

/**
 * Go to a page, and do not fail because the app was already going somewhere.
 *
 * `page.goto()` rejects with `net::ERR_ABORTED` when a navigation it started is
 * superseded by one the app started — which, in a Next app, happens routinely
 * right after sign-in: the auth redirect is still resolving, the router begins
 * a client-side navigation, and the `goto` underneath it is cancelled.
 *
 * The abort is not a failure. The first run of `smoke-tenants.spec.ts` failed
 * this way on `/payroll/runs`, and the failure screenshot showed the payroll
 * sidebar fully rendered behind it — the page had arrived, and only the
 * bookkeeping said otherwise. A test that reports that as "the page did not
 * load" is lying about what happened.
 *
 * So: retry once, then check where we actually ended up. Anything else — a
 * refused connection, a 500 — still throws.
 */

const ABORTED = /net::ERR_ABORTED|interrupted by another navigation|frame was detached/i;

export async function visit(
  page: Page,
  path: string,
  options: { timeout?: number; landsOn?: string } = {},
): Promise<Response | null> {
  const timeout = options.timeout ?? 30_000;
  /*
    Where arriving counts as arrived.

    Aliases are common enough in this app to need saying: `/user-management`
    serves nothing and redirects into `/preferences/organization/users`, and
    without this the retry below asks twice and then calls a working redirect a
    failure. `landsOn` names the destination, so the alias is still asserted
    rather than merely tolerated — `checkRoute` compares the final pathname
    against it afterwards.
  */
  const destination = options.landsOn ?? path;

  try {
    return await page.goto(path, { waitUntil: "domcontentloaded", timeout });
  } catch (error) {
    if (!ABORTED.test(String(error))) throw error;
  }

  // Let whatever superseded us finish before deciding anything.
  await page.waitForLoadState("domcontentloaded").catch(() => {});

  if (onPath(page, destination)) return null;

  // Still somewhere else — the app redirected us rather than raced us. Ask once
  // more, from a settled starting point.
  try {
    return await page.goto(path, { waitUntil: "domcontentloaded", timeout });
  } catch (error) {
    if (!ABORTED.test(String(error))) throw error;
  }

  await page.waitForLoadState("domcontentloaded").catch(() => {});

  if (!onPath(page, destination)) {
    throw new Error(
      `Asked for ${path} twice and ended on ${page.url()}. ` +
        "That is a redirect, not a race — check entitlements, role, or tenant.",
    );
  }
  return null;
}

function onPath(page: Page, path: string): boolean {
  try {
    return new URL(page.url()).pathname.startsWith(path.split("?")[0]);
  } catch {
    return false;
  }
}

/**
 * `visit`, then give the page a moment to finish fetching.
 *
 * **`networkidle` is time-boxed, and has to be.** This app holds an open
 * server-sent-event stream for notifications, so the network is never idle and
 * `waitForLoadState("networkidle")` never resolves. Left unbounded it eats the
 * whole test budget: against the production build, where the stream actually
 * connects, every page took the full 120 seconds and failed. Against `next dev`
 * the same call returned in five seconds, which is why this survived the first
 * runs — the bug was invisible until the app behaved properly.
 *
 * So: ask for idle, settle for two seconds of quiet, carry on. The assertions
 * that follow have their own timeouts and are the real wait.
 */
export async function visitSettled(
  page: Page,
  path: string,
  options: { timeout?: number; landsOn?: string } = {},
): Promise<void> {
  await visit(page, path, options);
  await page.waitForLoadState("networkidle", { timeout: 2_000 }).catch(() => {});
}
