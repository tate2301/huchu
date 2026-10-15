import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { getReportDefinition } from "@/lib/reports/registry";
import { fetchListExport, fetchReport } from "@/lib/reports/request";
import { REPORT_ROW_LIMIT, type ReportDefinition, type ReportParams, type ReportRow } from "@/lib/reports/types";

/**
 * The rows of several report sources at once, for SQL to be run over them in
 * the report database (`lib/reports/sql/engine.ts`).
 *
 * Each goes through the same fetch a report's own page does — its feature,
 * its roles, the workspace switching it off — so a source the session cannot
 * read comes back missing, never as rows.
 */

/** As many sources as one page of blocks can sensibly read at once. */
export const MAX_SOURCES = 12;

export type SourceRows = { rows: ReportRow[]; truncated: boolean; params: ReportParams };

export type SourceRowsAnswer = { sources: Record<string, SourceRows>; missing: string[] };

/**
 * A working list or a report face (a shop's sources) is read the way it is
 * exported: every filtered row this person could take away in a file, under
 * the list's own check and with cost stripped where their role may not see
 * it. The report's dates become the list's period; without them, any time.
 */
async function listRows(session: AuthenticatedSession, definition: ReportDefinition, params: ReportParams): Promise<SourceRows | null> {
  const face = definition.report ? "report" : "list";
  const spec = definition.report ?? definition.list;
  if (!spec) return null;
  const filters: Record<string, string> = {};
  const period = spec.filters.find((filter) => filter.type === "period");
  if (period) filters[period.key] = params.from || params.to ? `${params.from ?? ""}..${params.to ?? ""}` : "any";
  const exported = await fetchListExport(session, definition.key, { page: 1, size: REPORT_ROW_LIMIT, filters, face });
  if ("error" in exported) return null;
  return { rows: exported.ordered, truncated: exported.ordered.length >= REPORT_ROW_LIMIT, params: {} };
}

export async function readSourceRows(session: AuthenticatedSession, keys: readonly string[], params: ReportParams): Promise<SourceRowsAnswer> {
  const fetched = await Promise.all(
    [...new Set(keys)].map(async (key): Promise<readonly [string, SourceRows | null]> => {
      const definition = getReportDefinition(key);
      if (definition && (definition.list || definition.report)) return [key, await listRows(session, definition, params)];
      const report = await fetchReport(session, key, params);
      return [key, report ? { rows: report.rows, truncated: report.truncated, params: report.params } : null];
    }),
  );
  const sources: Record<string, SourceRows> = {};
  const missing: string[] = [];
  for (const [key, rows] of fetched) {
    if (rows) sources[key] = rows;
    else missing.push(key);
  }
  return { sources, missing };
}
