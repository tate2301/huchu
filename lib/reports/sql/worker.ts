/// <reference lib="webworker" />
import { ReportDatabase } from "@/lib/reports/sql/engine";
import type { SqlTable } from "@/lib/reports/sql/schema";
import type { ReportRow, ReportValue } from "@/lib/reports/types";

/**
 * The report database's own thread. Postgres runs here, off the page, so a
 * query that runs away can be stopped by ending the thread — which is what
 * `client.ts` does — without the page freezing first.
 */

export type WorkerRequest =
  | { id: number; type: "load"; table: SqlTable; rows: ReportRow[]; version: string }
  | { id: number; type: "loadResult"; table: SqlTable; rows: Array<Record<string, ReportValue>>; version: string }
  | { id: number; type: "run"; body: string; period: { from?: string; to?: string } };

export type WorkerResponse = { id: number; ok: true; value: unknown } | { id: number; ok: false; message: string };

declare const self: DedicatedWorkerGlobalScope;

// The bundler gives PGlite its WebAssembly and data files as paths from the
// site's root ("/_next/static/media/pglite.wasm"). A worker started from a
// blob has no page to read such a path against, so it is read against the
// site here — only those paths, and only in this worker.
const fetchFromSite = self.fetch.bind(self);
self.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const path = input instanceof Request ? null : String(input);
  return fetchFromSite(path?.startsWith("/_next/") ? new URL(path, self.location.origin) : input, init);
};

let database: Promise<ReportDatabase> | null = null;

function open(): Promise<ReportDatabase> {
  // Imported here, after `fetch` above is in place, so PGlite fetches through it.
  database ??= import("@electric-sql/pglite").then(async ({ PGlite }) => new ReportDatabase(await PGlite.create()));
  return database;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    const db = await open();
    let value: unknown = null;
    if (request.type === "load") await db.load(request.table, request.rows, request.version);
    else if (request.type === "loadResult") await db.loadResult(request.table, request.rows, request.version);
    else value = await db.run(request.body, request.period);
    self.postMessage({ id: request.id, ok: true, value } satisfies WorkerResponse);
  } catch (error) {
    self.postMessage({ id: request.id, ok: false, message: error instanceof Error ? error.message : "The report database failed" } satisfies WorkerResponse);
  }
};
