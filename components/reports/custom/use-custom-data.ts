"use client";

import { useDeferredValue, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { narrowRows, type CustomBlock } from "@/lib/reports/custom/document";
import { checkBlocks, runBlocks, tablesRead, type BlockCheck, type BlockResult } from "@/lib/reports/custom/run";
import { reportSql } from "@/lib/reports/sql/client";
import { sourceTable, sqlName, type SqlTable } from "@/lib/reports/sql/schema";
import type { ReportParams, ReportRow } from "@/lib/reports/types";

import { scopedKey, useReportData, type ReportSource } from "./report-data";

export type { ReportSource } from "./report-data";

const NO_FILTERS: Readonly<Record<string, string>> = {};

/** The sources this person can build on. Asked once, kept for the session. */
export function useReportSources() {
  const data = useReportData();
  return useQuery({
    queryKey: scopedKey(data, ["reports", "sources"]),
    queryFn: data.sources,
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
export function useCustomData(
  blocks: readonly CustomBlock[],
  sources: readonly ReportSource[] | undefined,
  params: ReportParams,
  /** The report's own filters, set: a value by the SQL name of the column it narrows. */
  filters: Readonly<Record<string, string>> = NO_FILTERS,
) {
  const data = useReportData();
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
    queryKey: scopedKey(data, ["reports", "custom-rows", keys, params]),
    queryFn: () => data.rows(keys, params),
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
  // The values each filtered column holds in the rows read, before any filter narrows them.
  const filterColumns = useMemo(
    () => [...new Set(deferred.flatMap((block) => (block.type === "controls" ? block.filters.map((filter) => filter.column) : [])))],
    [deferred],
  );
  const options = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const column of filterColumns) {
      const values = new Set<string>();
      for (const source of sources ?? []) {
        const key = source.columns.find((candidate) => sqlName(candidate.key) === column)?.key;
        if (!key) continue;
        for (const row of loadedRows?.[source.key]?.rows ?? []) {
          const value = row[key];
          if (value !== null && value !== undefined && value !== "") values.add(String(value));
        }
      }
      out[column] = [...values].sort((a, b) => a.localeCompare(b));
    }
    return out;
  }, [filterColumns, loadedRows, sources]);
  const filterKey = JSON.stringify(filters);
  /** A source's rows, narrowed by the report's filters on the columns it has. */
  const rowsOf = (table: string) => {
    const key = keyOf.get(table) ?? "";
    const source = (sources ?? []).find((candidate) => candidate.key === key);
    const loaded = loadedRows?.[key]?.rows;
    if (!loaded || !source) return loaded;
    return narrowRows(loaded, filters, (column) => source.columns.find((candidate) => sqlName(candidate.key) === column)?.key ?? null) as ReportRow[];
  };
  const refused = useMemo(() => new Set((rows.data?.missing ?? []).map((key) => sqlName(key))), [rows.data]);
  // A source refused is an answer too: its blocks say so rather than wait for rows that will not come.
  const ready = Boolean(sources) && (keys.length === 0 || keys.every((key) => loadedRows?.[key] || refused.has(sqlName(key))));

  const run = useQuery({
    queryKey: scopedKey(data, ["reports", "custom-run", signature, rows.dataUpdatedAt, params, filterKey]),
    queryFn: async () => {
      const started = performance.now();
      const results = await runBlocks(deferred, checks, {
        runner: reportSql(),
        sources: tables,
        rows: rowsOf,
        version: (table) => `${table}:${rows.dataUpdatedAt}:${filterKey}`,
        period: { from: params.from || undefined, to: params.to || undefined },
        refused: (table) => refused.has(table),
      });
      return { results, ms: performance.now() - started };
    },
    enabled: ready,
    placeholderData: (previous) => previous,
    staleTime: Infinity,
    retry: false,
    // Its Maps do not survive the offline copy; it is quick to work out again.
    meta: { persist: false },
  });

  /** Sources that came back cut short, for a warning under the blocks that read them. */
  const truncated = useMemo(
    () => new Set(Object.entries(loadedRows ?? {}).filter(([, source]) => source.truncated).map(([key]) => sqlName(key))),
    [loadedRows],
  );

  const results = run.data?.results ?? new Map<string, BlockResult>();
  return {
    tables,
    checks,
    results,
    /** The values each of the report's filters can be set to, by column. */
    options,
    rows,
    truncated,
    /** Still working out what to show: the rows are on their way, or the queries are running. */
    pending: !ready || run.isPending,
    running: run.isFetching,
    runError: run.error,
    /** How long the last run of the queries took, in milliseconds. */
    ms: run.data?.ms ?? null,
    /** Fetch the rows again and run every query over them. */
    rerun: () => void rows.refetch(),
  };
}
