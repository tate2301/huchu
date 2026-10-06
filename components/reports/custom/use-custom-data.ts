"use client";

import { useDeferredValue, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/lib/api-client";
import type { CustomBlock } from "@/lib/reports/custom/document";
import { checkBlocks, runBlocks, sourcesRead, type BlockCheck, type BlockResult } from "@/lib/reports/custom/run";
import type { CompletionContext } from "@/lib/reports/query/complete";
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
 * however many blocks read them — and every block is run over them here, so
 * editing a query never waits on the server unless it names a new source.
 */
export function useCustomData(blocks: readonly CustomBlock[], sources: readonly ReportSource[] | undefined, params: ReportParams) {
  // Typing stays quick on a long page: the blocks re-run a beat behind it.
  const deferred = useDeferredValue(blocks);

  const context = useMemo<CompletionContext>(
    () => ({
      reports: new Map((sources ?? []).map((source) => [source.key, source.columns])),
      titles: new Map((sources ?? []).map((source) => [source.key, source.title])),
    }),
    [sources],
  );

  const checks = useMemo<Map<string, BlockCheck>>(
    () => (sources ? checkBlocks(deferred, context) : new Map()),
    [context, deferred, sources],
  );
  const keys = useMemo(() => sourcesRead(checks), [checks]);

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

  const results = useMemo<Map<string, BlockResult>>(() => {
    if (!rows.data && keys.length > 0) return new Map();
    const loaded = rows.data?.sources ?? {};
    return runBlocks(deferred, checks, {
      report: (key) => loaded[key]?.rows ?? [],
      params,
    });
  }, [checks, deferred, keys.length, params, rows.data]);

  /** Sources that came back cut short, for a warning under the blocks that read them. */
  const truncated = useMemo(
    () => new Set(Object.entries(rows.data?.sources ?? {}).filter(([, source]) => source.truncated).map(([key]) => key)),
    [rows.data],
  );

  /** Sources whose rows are here — a block reading any other is still loading. */
  const loaded = useMemo(() => new Set(Object.keys(rows.data?.sources ?? {})), [rows.data]);

  return { context, checks, results, rows, truncated, loaded };
}
