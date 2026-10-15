import type { CustomDocument, CustomReport, CustomReportSummary } from "@/lib/reports/custom/document";

/**
 * A saved question is a custom report with one table and nothing else: its
 * SQL and, each time it opens, its rows. Reports store only SQL and rows, so
 * a question saved in Explore is also in All reports (as a table), shared
 * the way a report is shared, and scheduled the way a report is. No table of
 * its own.
 */

/** The block name a question's query goes by. */
export const QUESTION_BLOCK = "question";

/** The dates a question's sources are read over: a year back to today, unless the SQL narrows them. */
export const QUESTION_PERIOD: CustomDocument["period"] = { from: "-365d", to: "today" };

export function questionDocument(sql: string): CustomDocument {
  return {
    period: QUESTION_PERIOD,
    blocks: [{ id: "query-1", type: "query", name: QUESTION_BLOCK, query: sql, display: { type: "table" } }],
  };
}

/** The SQL of a report that is a question (one table block and nothing else); null for a board. */
export function questionSql(report: Pick<CustomReport, "document">): string | null {
  const [only, ...rest] = report.document.blocks;
  if (!only || rest.length || only.type !== "query" || only.display.type !== "table") return null;
  return only.query;
}

/** A saved question, as Explore's Saved tab lists it. */
export type SavedQuestion = Pick<CustomReportSummary, "id" | "title" | "audience" | "mine" | "updatedAt" | "madeBy">;

export function savedQuestions(reports: readonly CustomReportSummary[]): SavedQuestion[] {
  return reports
    .filter((report) => report.kind === "table")
    .map(({ id, title, audience, mine, updatedAt, madeBy }) => ({ id, title, audience, mine, updatedAt, madeBy }));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What `/explore/q/{slug}` names: a saved question by its id, or a template
 * by its slug ("open-quotes").
 */
export function readSlug(slug: string): { kind: "saved"; id: string } | { kind: "template"; slug: string } {
  return UUID.test(slug) ? { kind: "saved", id: slug } : { kind: "template", slug };
}

/** Where a saved question opens. */
export function questionHref(id: string): string {
  return `/explore/q/${id}`;
}

/** A Ctrl K answer, or any page's list, opened in Explore: `/explore?ask=…` or `/explore?sql=…&title=…`. */
export function exploreHref(input: { ask?: string; sql?: string; title?: string }): string {
  const params = new URLSearchParams();
  if (input.ask) params.set("ask", input.ask);
  if (input.sql) params.set("sql", input.sql);
  if (input.title) params.set("title", input.title);
  const query = params.toString();
  return query ? `/explore?${query}` : "/explore";
}
