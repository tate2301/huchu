"use client";

import type { RawResult, RunError } from "@/lib/reports/sql/engine";
import type { SqlTable } from "@/lib/reports/sql/schema";
import type { WorkerRequest, WorkerResponse } from "@/lib/reports/sql/worker";
import type { ReportRow, ReportValue } from "@/lib/reports/types";

/**
 * The page's side of the report database. One worker per tab, started the
 * first time a report needs it, holding each table once until its rows change.
 *
 * A query gets a fixed time. Past it the worker is ended — the only way to
 * stop a WebAssembly Postgres mid-query — and the next query starts a fresh
 * one, reloading what it needs.
 */

export const QUERY_TIME_LIMIT_MS = 10_000;

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

export class ReportSqlClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private versions = new Map<string, string>();
  /** One thing at a time: Postgres here has a single connection. */
  private queue: Promise<unknown> = Promise.resolve();

  private start(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const waiting = this.pending.get(response.id);
      if (!waiting) return;
      this.pending.delete(response.id);
      if (response.ok) waiting.resolve(response.value);
      else waiting.reject(new Error(response.message));
    };
    worker.onerror = (event) => this.reset(event.message || "The report database stopped");
    this.worker = worker;
    return worker;
  }

  /** Ends the worker and everything it held. */
  private reset(reason: string) {
    this.worker?.terminate();
    this.worker = null;
    this.versions.clear();
    for (const waiting of this.pending.values()) waiting.reject(new Error(reason));
    this.pending.clear();
  }

  private send(request: DistributiveOmit<WorkerRequest, "id">): Promise<unknown> {
    const worker = this.start();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ ...request, id } as WorkerRequest);
    });
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** Puts a source's rows in place, unless this version is already there. */
  load(table: SqlTable, rows: readonly ReportRow[], version: string): Promise<void> {
    return this.enqueue(async () => {
      if (this.versions.get(table.name) === version) return;
      await this.send({ type: "load", table, rows: rows as ReportRow[], version });
      this.versions.set(table.name, version);
    });
  }

  /** Puts another block's result in place, for blocks that read it. */
  loadResult(table: SqlTable, rows: ReadonlyArray<Record<string, ReportValue>>, version: string): Promise<void> {
    return this.enqueue(async () => {
      if (this.versions.get(table.name) === version) return;
      await this.send({ type: "loadResult", table, rows: rows as Array<Record<string, ReportValue>>, version });
      this.versions.set(table.name, version);
    });
  }

  run(body: string, period: { from?: string; to?: string }): Promise<{ ok: true; result: RawResult } | { ok: false; error: RunError }> {
    return this.enqueue(async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const limit = new Promise<{ ok: false; error: RunError }>((resolve) => {
        timer = setTimeout(() => {
          this.reset("stopped");
          resolve({
            ok: false,
            error: { message: `This query ran for more than ${QUERY_TIME_LIMIT_MS / 1000} seconds and was stopped`, position: null },
          });
        }, QUERY_TIME_LIMIT_MS);
      });
      try {
        return await Promise.race([
          this.send({ type: "run", body, period }) as Promise<{ ok: true; result: RawResult } | { ok: false; error: RunError }>,
          limit,
        ]);
      } finally {
        clearTimeout(timer);
      }
    });
  }
}

let shared: ReportSqlClient | null = null;

/** The tab's report database. Browser only. */
export function reportSql(): ReportSqlClient {
  shared ??= new ReportSqlClient();
  return shared;
}
