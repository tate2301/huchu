import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { fetchReport } from "@/lib/reports/request";
import type { ReportParams, ReportRow } from "@/lib/reports/types";

/** As many sources as one page of blocks can sensibly read at once. */
const MAX_SOURCES = 12;

const bodySchema = z.object({
  keys: z.array(z.string().min(1).max(64)).min(1).max(MAX_SOURCES),
  /** The custom report's dates, passed to every source that is dated. */
  params: z.record(z.string(), z.string().max(40)).default({}),
});

type SourceRows = { rows: ReportRow[]; truncated: boolean; params: ReportParams };

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
      [...new Set(keys)].map(async (key) => [key, await fetchReport(sessionResult.session, key, params)] as const),
    );
    const sources: Record<string, SourceRows> = {};
    const missing: string[] = [];
    for (const [key, report] of fetched) {
      if (report) sources[key] = { rows: report.rows, truncated: report.truncated, params: report.params };
      else missing.push(key);
    }
    return successResponse({ sources, missing });
  } catch (error) {
    console.error("[API] POST /api/v2/reports/sources/rows error:", error);
    return errorResponse("Failed to load the report's rows");
  }
}
