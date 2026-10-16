"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { questionPeriod } from "@/components/explore/use-explore";
import { scopedKey, useReportData } from "@/components/reports/custom/report-data";
import { insightFromResult, LIBRARY_INSIGHT_LIMIT_MS, type LibraryInsights } from "@/lib/library/insights";
import type { QueryBlock } from "@/lib/reports/custom/document";
import { checkBlocks, runBlocks, STOPPED } from "@/lib/reports/custom/run";
import { reportSql } from "@/lib/reports/sql/client";
import type { WeekInsight } from "@/lib/reports/week-insights";

/**
 * Corelith's insights from the library, run in this tab: the rows of the
 * sources they read are fetched once, under the person's own checks, and
 * each question runs in the report database as an Explore question does —
 * one at a time, each stopped after a few seconds. What has something to
 * say comes back as an insight; the rest is left out.
 */
export function useLibraryInsights(library: LibraryInsights | undefined): WeekInsight[] {
  const data = useReportData();
  const questions = React.useMemo(() => library?.questions ?? [], [library]);
  const keys = React.useMemo(() => [...new Set(questions.flatMap((question) => question.reads))].sort(), [questions]);
  const period = React.useMemo(() => questionPeriod(), []);

  const rows = useQuery({
    queryKey: scopedKey(data, ["reports", "library-insights", "rows", keys, period]),
    queryFn: () => data.rows(keys, period),
    enabled: keys.length > 0,
    staleTime: 5 * 60_000,
    meta: { persist: false },
  });

  const run = useQuery({
    queryKey: scopedKey(data, ["reports", "library-insights", "run", questions.map((question) => question.id), rows.dataUpdatedAt]),
    enabled: Boolean(library && rows.data),
    staleTime: Infinity,
    retry: false,
    meta: { persist: false },
    queryFn: async (): Promise<WeekInsight[]> => {
      const tables = library!.tables;
      const keyOf = new Map(tables.map((table) => [table.name, table.key]));
      const missing = new Set(rows.data!.missing);
      const runner = reportSql();
      const out: WeekInsight[] = [];
      for (const question of questions) {
        const block: QueryBlock = { id: question.id, type: "query", name: "insight", query: question.sql, display: { type: "table" } };
        const results = await runBlocks([block], checkBlocks([block], tables), {
          runner,
          sources: tables,
          rows: (table) => rows.data!.sources[keyOf.get(table) ?? ""]?.rows,
          version: (table) => `${table}:${rows.dataUpdatedAt}`,
          period,
          refused: (table) => missing.has(keyOf.get(table) ?? ""),
          limitMs: LIBRARY_INSIGHT_LIMIT_MS,
        });
        const result = results.get(question.id);
        // One that ran too long holds the database up: the rest wait for another visit.
        if (result && !result.ok && result.problem.message === STOPPED) break;
        const insight = insightFromResult(question, result, library!.explore);
        if (insight) out.push(insight);
      }
      return out;
    },
  });

  return run.data ?? [];
}
