/**
 * What the page and the service worker (`app/sw.ts`) agree on.
 *
 * Plain constants, no DOM or worker globals, so both sides import the same
 * names and a rename cannot leave one of them asking for a cache the other
 * never writes.
 */

/** Served by `app/serwist/[path]/route.ts`. */
export const SERVICE_WORKER_URL = "/serwist/sw.js";

/** Precached, and served for any page that is neither online nor kept. */
export const OFFLINE_FALLBACK_URL = "/offline";

/** Pages kept for offline use — visited, or warmed for a module. */
export const OFFLINE_PAGE_CACHE = "offline-pages";

/** `/api/auth/session`, so a kept page still knows who is signed in. */
export const SESSION_CACHE = "offline-session";

/** Asks the worker how much of the precache manifest is on the device. */
export const PRECACHE_STATUS_MESSAGE = "PRECACHE_STATUS";

export type PrecacheStatus = { total: number; cached: number };

/**
 * Whether this build runs the service worker.
 *
 * Only production builds do. `next dev` serves chunks at stable URLs, so a
 * worker that had cached one kept running the old code across edits, restarts
 * and a deleted `.next`.
 */
export const SERVICE_WORKER_ENABLED = process.env.NODE_ENV === "production";
