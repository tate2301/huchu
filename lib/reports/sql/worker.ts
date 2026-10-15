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

/*
 * Postgres's three files, which PGlite would otherwise find for itself. The
 * bundler copies each to `/_next/static/media/` and gives its path from the
 * site's root; a worker started from a blob has no page to read that path
 * against, so it is read against the site.
 */
const PGLITE_WASM = new URL("../../../node_modules/@electric-sql/pglite/dist/pglite.wasm", import.meta.url);
const INITDB_WASM = new URL("../../../node_modules/@electric-sql/pglite/dist/initdb.wasm", import.meta.url);
const PGLITE_DATA = new URL("../../../node_modules/@electric-sql/pglite/dist/pglite.data", import.meta.url);

const fromSite = (url: URL) => new URL(String(url), self.location.origin);

async function compile(url: URL): Promise<WebAssembly.Module> {
  const response = await fetch(fromSite(url));
  if (!response.ok) throw new Error(`The report database could not load (${response.status})`);
  // Streaming needs the server to say application/wasm; read it whole when it does not.
  if (response.headers.get("content-type")?.startsWith("application/wasm")) return WebAssembly.compileStreaming(response);
  return WebAssembly.compile(await response.arrayBuffer());
}

async function bundle(url: URL): Promise<Blob> {
  const response = await fetch(fromSite(url));
  if (!response.ok) throw new Error(`The report database could not load (${response.status})`);
  return response.blob();
}

let database: Promise<ReportDatabase> | null = null;

/*
 * PGlite's CommonJS build, not its ES modules, and its files handed to it
 * (PGlite's `pgliteWasmModule`, `initdbWasmModule` and `fsBundle` options).
 *
 * The ES build is several esbuild chunks. A production build merges them into
 * one scope, and in that merge Turbopack (Next 16.1) binds initdb's call to
 * PGlite's own `instantiateWasm` helper to another chunk's variable
 * (`Object.getOwnPropertyNames`), so creating the database failed with
 * "f.instantiateWasm is not a function" and no query ran (Explore and every
 * custom report block). Development builds do not merge, so it only showed in
 * production. The CommonJS build is one module, with nothing to merge; it
 * cannot find its files from where it is loaded, so they are fetched here.
 */
function open(): Promise<ReportDatabase> {
  database ??= (async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the single-module build; see above
    const { PGlite } = require("@electric-sql/pglite") as typeof import("@electric-sql/pglite");
    const [pgliteWasmModule, initdbWasmModule, fsBundle] = await Promise.all([compile(PGLITE_WASM), compile(INITDB_WASM), bundle(PGLITE_DATA)]);
    return new ReportDatabase(await PGlite.create({ pgliteWasmModule, initdbWasmModule, fsBundle }));
  })();
  // A failed start is not kept: the next request tries again.
  database.catch(() => {
    database = null;
  });
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
