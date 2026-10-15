"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/lib/api-client";
import { checkQuestion, EXPLORE_ROW_LIMIT, type CheckedQuestion } from "@/lib/explore/guard";
import { exploreTable, type ExploreTable } from "@/lib/explore/products";
import type { ExploreCatalog } from "@/lib/explore/types";
import { resultColumns } from "@/lib/reports/sql/columns";
import { reportSql } from "@/lib/reports/sql/client";
import type { ReportColumn, ReportParams, ReportRow, ReportValue } from "@/lib/reports/types";

/** Explore's panel and tabs: the person's tables, the locked ones, templates and saved questions. */
export function useExploreCatalog() {
  return useQuery({
    queryKey: ["explore", "catalog"],
    queryFn: () => fetchJson<ExploreCatalog>("/api/explore/catalog"),
    staleTime: 5 * 60_000,
  });
}

/** A year back to today, as the report sources take their dates. */
export function questionPeriod(now = new Date()): { from: string; to: string } {
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { from, to };
}

type RowsResponse = {
  sources: Record<string, { rows: ReportRow[]; truncated: boolean; params: ReportParams }>;
  missing: string[];
};

export type QuestionResult = {
  columns: ReportColumn[];
  rows: Array<Record<string, ReportValue>>;
  /** More rows matched than Explore gives back. */
  truncated: boolean;
  /** A source it read came back cut short at the report row limit. */
  sourceCut: boolean;
  ms: number;
};

/** Typing stays quick: a question is checked as it is typed, and run a beat after typing stops. */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = React.useState(value);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/**
 * A question checked and run.
 *
 * It runs where a custom report's blocks run: the report database in this
 * tab, holding only the rows of the sources it reads, fetched through the
 * same checks as the person's reports. A question the guard refuses never
 * leaves the page.
 */
export function useQuestion(sql: string, catalog: ExploreCatalog | undefined) {
  const tables = React.useMemo<ExploreTable[]>(() => (catalog?.canUse ? catalog.sources.map(exploreTable) : []), [catalog]);
  const readable = React.useMemo(() => new Set(tables.map((table) => table.name)), [tables]);
  const locked = React.useMemo(() => new Map((catalog?.canUse ? catalog.locked : []).map((table) => [table.name, table.who])), [catalog]);
  const keyOf = React.useMemo(() => new Map(tables.map((table) => [table.name, table.key])), [tables]);

  const checked = React.useMemo<CheckedQuestion | null>(() => (sql.trim() && catalog?.canUse ? checkQuestion(sql, readable, locked) : null), [sql, catalog, readable, locked]);
  const settled = useSettled(checked, 450);
  const body = settled?.ok ? settled.body : null;
  const keys = React.useMemo(() => (settled?.ok ? settled.tables.map((table) => keyOf.get(table)!).filter(Boolean) : []), [settled, keyOf]);
  const period = React.useMemo(() => questionPeriod(), []);

  const rows = useQuery({
    queryKey: ["explore", "rows", keys, period],
    queryFn: () =>
      fetchJson<RowsResponse>("/api/v2/reports/sources/rows", { method: "POST", body: JSON.stringify({ keys, params: period }) }),
    enabled: keys.length > 0,
    placeholderData: (previous) => previous,
    staleTime: 60_000,
  });

  const run = useQuery({
    queryKey: ["explore", "run", body, rows.dataUpdatedAt],
    enabled: Boolean(body) && Boolean(rows.data) && keys.every((key) => rows.data?.sources[key] || rows.data?.missing.includes(key)),
    retry: false,
    staleTime: Infinity,
    placeholderData: (previous) => previous,
    queryFn: async (): Promise<QuestionResult> => {
      const client = reportSql();
      const missing = keys.find((key) => rows.data?.missing.includes(key));
      if (missing) throw new Error(`Your role no longer reads ${tables.find((table) => table.key === missing)?.name ?? missing}.`);
      for (const key of keys) {
        const table = tables.find((candidate) => candidate.key === key)!;
        await client.load(table, rows.data!.sources[key]!.rows, `${table.name}:${rows.dataUpdatedAt}`);
      }
      const started = performance.now();
      const ran = await client.run(body!, period);
      const ms = performance.now() - started;
      if (!ran.ok) throw new Error(ran.error.message);
      const ast = settled?.ok ? settled.ast : null;
      return {
        columns: resultColumns(ast, ran.result.fields, tables),
        rows: ran.result.rows.slice(0, EXPLORE_ROW_LIMIT),
        truncated: ran.result.truncated || ran.result.rows.length > EXPLORE_ROW_LIMIT,
        sourceCut: keys.some((key) => rows.data?.sources[key]?.truncated),
        ms,
      };
    },
  });

  return {
    tables,
    checked,
    /** The SQL as it last ran, or is about to. */
    body,
    reads: settled?.ok ? settled.tables : [],
    result: run.data ?? null,
    error: rows.error ?? run.error ?? null,
    running: Boolean(body) && (rows.isFetching || run.isFetching || (!run.data && !run.error)),
    rerun: () => {
      void rows.refetch().then(() => run.refetch());
    },
    period,
  };
}
