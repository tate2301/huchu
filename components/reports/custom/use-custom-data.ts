"use client";

import { useDeferredValue, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/lib/api-client";
import type { CustomBlock } from "@/lib/reports/custom/document";
import { checkBlocks, runBlocks, tablesRead, type BlockCheck, type BlockResult } from "@/lib/reports/custom/run";
import { reportSql } from "@/lib/reports/sql/client";
import { sourceTable, sqlName, type SqlTable } from "@/lib/reports/sql/schema";
import type { ReportColumn, ReportParams, ReportRow } from "@/lib/reports/types";

/** A source as `/api/v2/reports/sources` describes it. */
export type ReportSource = {
  key: string;
  title: string;
  area: string;
  columns: ReportColumn[];
};

type RowsResponse = {
  sources: Record<string, { rows: ReportRow[]; truncated: boolean; params: ReportParams }>;
  missing: string[];
};

/** The sources this person can build on. Asked once, kept for the session. */
export function useReportSources() {
  return useQuery({
    queryKey: ["reports", "sources"],
    queryFn: () => fetchJson<{ sources: ReportSource[] }>("/api/v2/reports/sources"),
    staleTime: 5 * 60_000,
  });
}

/**
 * A custom report's blocks, checked, fetched and run.
 *
 * Checking needs only the sources' columns, so a problem in a query shows as
 * it is typed. Rows are fetched for the sources the blocks read — once each,
 * however many blocks read them — and every block runs in the report
 * database in this tab, so editing a query never waits on the server unless
 * it names a new source.
 */
export function useCustomData(blocks: readonly CustomBlock[], sources: readonly ReportSource[] | undefined, params: ReportParams) {
  // Typing stays quick on a long page: the blocks re-run a beat behind it.
  const deferred = useDeferredValue(blocks);

  const tables = useMemo<SqlTable[]>(() => (sources ?? []).map(sourceTable), [sources]);
  const keyOf = useMemo(() => new Map((sources ?? []).map((source) => [sqlName(source.key), source.key])), [sources]);

  const checks = useMemo<Map<string, BlockCheck>>(
    () => (sources ? checkBlocks(deferred, tables) : new Map()),
    [deferred, sources, tables],
  );
  const keys = useMemo(() => tablesRead(checks, tables).map((table) => keyOf.get(table)!), [checks, keyOf, tables]);

  const rows = useQuery({
    queryKey: ["reports", "custom-rows", keys, params],
    queryFn: () =>
      fetchJson<RowsResponse>("/api/v2/reports/sources/rows", {
        method: "POST",
        body: JSON.stringify({ keys, params }),
      }),
    enabled: keys.length > 0,
    // The page keeps what it has on screen while a new source loads.
    placeholderData: (previous) => previous,
  });

  // What the run depends on: the queries, and which rows they run over.
  const signature = useMemo(
    () =>
      JSON.stringify(
        deferred.flatMap((block) => (block.type === "query" ? [[block.id, block.name, block.query]] : [])),
      ),
    [deferred],
  );
  const loadedRows = rows.data?.sources;
  const refused = useMemo(() => new Set((rows.data?.missing ?? []).map((key) => sqlName(key))), [rows.data]);
  // A source refused is an answer too: its blocks say so rather than wait for rows that will not come.
  const ready = Boolean(sources) && (keys.length === 0 || keys.every((key) => loadedRows?.[key] || refused.has(sqlName(key))));

  const run = useQuery({
    queryKey: ["reports", "custom-run", signature, rows.dataUpdatedAt, params],
    queryFn: () =>
      runBlocks(deferred, checks, {
        runner: reportSql(),
        sources: tables,
        rows: (table) => loadedRows?.[keyOf.get(table) ?? ""]?.rows,
        version: (table) => `${table}:${rows.dataUpdatedAt}`,
        period: { from: params.from || undefined, to: params.to || undefined },
        refused: (table) => refused.has(table),
      }),
    enabled: ready,
    placeholderData: (previous) => previous,
    staleTime: Infinity,
    retry: false,
  });

  /** Sources that came back cut short, for a warning under the blocks that read them. */
  const truncated = useMemo(
    () => new Set(Object.entries(loadedRows ?? {}).filter(([, source]) => source.truncated).map(([key]) => sqlName(key))),
    [loadedRows],
  );

  const results = run.data ?? new Map<string, BlockResult>();
  return {
    tables,
    checks,
    results,
    rows,
    truncated,
    /** Still working out what to show: the rows are on their way, or the queries are running. */
    pending: !ready || run.isPending,
    running: run.isFetching,
    runError: run.error,
  };
}
