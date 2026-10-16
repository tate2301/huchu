import { checkQuestion } from "@/lib/explore/guard";
import { exploreHref } from "@/lib/explore/questions";
import { fillSentence } from "@/lib/reports/custom/document";
import type { BlockResult } from "@/lib/reports/custom/run";
import { formatValue } from "@/lib/reports/format";
import { sourceTable, sqlName, type SqlTable } from "@/lib/reports/sql/schema";
import type { ReportColumn, ReportDefinition, ReportValue } from "@/lib/reports/types";
import { insightMoney, type WeekInsight } from "@/lib/reports/week-insights";

import type { ReachedItem } from "./reach";
import { insightPayloadSchema } from "./report-kinds";

/**
 * Corelith's insights from the library, on a workspace's Insights page.
 *
 * Each is one question over the report sources and a headline with
 * `{column}` holes. The server picks the ones this person may run — every
 * table it reads is one their role reads — and the page runs them where
 * Explore runs a question: the report database in the person's own tab, over
 * the rows they could already open, each stopped after a few seconds. One
 * whose answer has no rows is not shown (unless it says otherwise), and the
 * first row fills its headline and line.
 */

/** As many library insights as one page load runs. */
export const LIBRARY_INSIGHT_CAP = 6;

/** How long one may run before it is stopped and left out. */
export const LIBRARY_INSIGHT_LIMIT_MS = 4_000;

export type LibraryInsightQuestion = {
  id: string;
  key: string;
  title: string;
  sql: string;
  headline: string;
  body: string | null;
  onlyWhenRows: boolean;
  /** The source keys it reads. */
  reads: string[];
};

export type LibraryInsights = {
  questions: LibraryInsightQuestion[];
  /** The sources they read, with their columns, as the report database loads them. */
  tables: Array<SqlTable & { key: string }>;
  /** This person can open Explore, so each insight's question opens there. */
  explore: boolean;
};

export const NO_LIBRARY_INSIGHTS: LibraryInsights = { questions: [], tables: [], explore: false };

/** The published insights this person may run, out of those that reach the workspace: capped, newest first. */
export function runnableInsights(items: readonly ReachedItem[], readable: readonly Pick<ReportDefinition, "key" | "title" | "columns">[], explore: boolean): LibraryInsights {
  const byName = new Map(readable.map((definition) => [sqlName(definition.key), definition]));
  const names = new Set(byName.keys());
  const questions: LibraryInsightQuestion[] = [];
  for (const item of items) {
    if (questions.length >= LIBRARY_INSIGHT_CAP) break;
    const parsed = insightPayloadSchema.safeParse(item.payload);
    if (!parsed.success) continue;
    const checked = checkQuestion(parsed.data.sql, names);
    if (!checked.ok) continue;
    questions.push({
      id: item.id,
      key: item.key,
      title: item.title,
      sql: parsed.data.sql,
      headline: parsed.data.headline,
      body: parsed.data.body?.trim() || null,
      onlyWhenRows: parsed.data.onlyWhenRows,
      reads: checked.tables.map((name) => byName.get(name)!.key),
    });
  }
  const read = new Set(questions.flatMap((question) => question.reads));
  const tables = readable.filter((definition) => read.has(definition.key)).map((definition) => ({ ...sourceTable(definition), key: definition.key }));
  return { questions, tables, explore };
}

/** A value as a headline says it: money with its dollar sign, counts in figures. */
export function insightValue(value: ReportValue | undefined, column: Pick<ReportColumn, "kind" | "currency">): string {
  if (column.kind === "money" && typeof value === "number" && (!column.currency || column.currency === "USD")) return insightMoney(value);
  return formatValue(value, column);
}

/** The insight its answer makes, or null when there is nothing to say: it failed, or has no rows and only speaks when it has. */
export function insightFromResult(question: LibraryInsightQuestion, result: BlockResult | undefined, explore: boolean): WeekInsight | null {
  if (!result?.ok) return null;
  const row = result.rows[0];
  if (!row && question.onlyWhenRows) return null;
  const value = (name: string) => {
    const column = result.columns.find((candidate) => candidate.key === name);
    return column && row ? insightValue(row[name], column) : null;
  };
  const headline = fillSentence(question.headline, value).trim();
  if (!headline) return null;
  const rows = result.rows.length;
  return {
    id: `library:${question.key}`,
    vaneItemId: null,
    headline,
    body: question.body ? fillSentence(question.body, value).trim() : "",
    bars: [],
    question: explore
      ? { words: `${question.title.charAt(0).toLowerCase()}${question.title.slice(1)}, ${rows.toLocaleString("en-US")} ${rows === 1 ? "row" : "rows"}`, href: exploreHref({ sql: question.sql, title: question.title }) }
      : null,
    action: null,
    pin: null,
  };
}
