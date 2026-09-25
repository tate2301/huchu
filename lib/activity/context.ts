import { AsyncLocalStorage } from "node:async_hooks";

import type { ActivityChange } from "./describe";

/**
 * The request a change belongs to.
 *
 * One per mutating API request, opened by `validateSession` and filled in as
 * the handler writes: the Prisma extension in `lib/prisma.ts` appends every
 * create, update and delete to `changes`, and `flushActivity` turns the lot
 * into one `PlatformAuditEvent` once the response has gone.
 */
export type ActivityRequest = {
  method: string;
  path: string;
  companyId: string | null;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  changes: ActivityChange[];
  /** An error response was built for this request; its writes are not logged. */
  failed: boolean;
  /** The handler wrote its own audit event, which already says what happened. */
  explicit: boolean;
  /** Written out. Anything recorded after this is the log's own bookkeeping. */
  flushed: boolean;
};

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const storage = new AsyncLocalStorage<ActivityRequest>();

/**
 * Open the activity record for a request, or return the one already open.
 *
 * **Must be called synchronously** — before the caller's first `await`.
 * `enterWith` sets the store on the async resource that is running right now,
 * and a promise created afterwards inherits it. Called in the synchronous head
 * of `validateSession`, that resource is the route handler's own, so the
 * handler's continuation after `await validateSession(...)` — and every Prisma
 * call it makes — sees this store. Called after an `await`, it would bind to a
 * continuation the handler never runs in, and nothing would be recorded.
 *
 * Idempotent: a handler that validates twice keeps one record.
 */
export function beginActivityRequest(request: {
  method: string;
  url: string;
}): ActivityRequest | null {
  const method = request.method.toUpperCase();
  if (!MUTATING_METHODS.has(method)) return null;

  let path: string;
  try {
    path = new URL(request.url).pathname;
  } catch {
    return null;
  }

  const open = storage.getStore();
  if (open && !open.flushed && open.method === method && open.path === path) {
    return open;
  }

  const record: ActivityRequest = {
    method,
    path,
    companyId: null,
    actorId: null,
    actorName: null,
    actorRole: null,
    changes: [],
    failed: false,
    explicit: false,
    flushed: false,
  };
  storage.enterWith(record);
  return record;
}

export function currentActivityRequest(): ActivityRequest | undefined {
  return storage.getStore();
}

/** Called by `errorResponse`: a request that answers with an error changed nothing worth logging. */
export function markActivityFailed() {
  const open = storage.getStore();
  if (open && !open.flushed) open.failed = true;
}

/** Called by `writePlatformAuditEvent`: the handler has said what it did in its own words. */
export function markActivityExplicit() {
  const open = storage.getStore();
  if (open && !open.flushed) open.explicit = true;
}

/** Test seam: run `fn` with `record` as the open request. */
export function runWithActivityRequest<T>(record: ActivityRequest, fn: () => T): T {
  return storage.run(record, fn);
}
