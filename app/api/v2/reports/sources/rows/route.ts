import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { getReportDefinition } from "@/lib/reports/registry";
import { fetchListExport, fetchReport } from "@/lib/reports/request";
import { REPORT_ROW_LIMIT, type ReportDefinition, type ReportParams, type ReportRow } from "@/lib/reports/types";
import type { AuthenticatedSession } from "@/lib/auth-core/types";

/** As many sources as one page of blocks can sensibly read at once. */
const MAX_SOURCES = 12;

const bodySchema = z.object({
  keys: z.array(z.string().min(1).max(64)).min(1).max(MAX_SOURCES),
  /** The custom report's dates, passed to every source that is dated. */
  params: z.record(z.string(), z.string().max(40)).default({}),
});

type SourceRows = { rows: ReportRow[]; truncated: boolean; params: ReportParams };

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

/**
 * The rows of several sources at once, for a custom report to query.
 *
 * Each goes through the same fetch a report's own page does — its feature,
 * its roles, the workspace switching it off — so a source this person cannot
 * read comes back missing, never as rows.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "That request could not be read", 400);
    const { keys, params } = parsed.data;

    const fetched = await Promise.all(
      [...new Set(keys)].map(async (key): Promise<readonly [string, SourceRows | null]> => {
        const definition = getReportDefinition(key);
        if (definition && (definition.list || definition.report)) return [key, await listRows(sessionResult.session, definition, params)];
        const report = await fetchReport(sessionResult.session, key, params);
        return [key, report ? { rows: report.rows, truncated: report.truncated, params: report.params } : null];
      }),
    );
    const sources: Record<string, SourceRows> = {};
    const missing: string[] = [];
    for (const [key, rows] of fetched) {
      if (rows) sources[key] = rows;
      else missing.push(key);
    }
    return successResponse({ sources, missing });
  } catch (error) {
    console.error("[API] POST /api/v2/reports/sources/rows error:", error);
    return errorResponse("Failed to load the report's rows");
  }
}
