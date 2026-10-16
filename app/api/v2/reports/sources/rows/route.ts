import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { MAX_SOURCES, readSourceRows } from "@/lib/reports/custom/source-rows";

const bodySchema = z.object({
  keys: z.array(z.string().min(1).max(64)).min(1).max(MAX_SOURCES),
  /** The custom report's dates, passed to every source that is dated. */
  params: z.record(z.string(), z.string().max(40)).default({}),
});

/**
 * The rows of several sources at once, for a custom report to query. A
 * source this person cannot read comes back missing, never as rows
 * (`lib/reports/custom/source-rows.ts`).
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "That request could not be read", 400);
    return successResponse(await readSourceRows(sessionResult.session, parsed.data.keys, parsed.data.params));
  } catch (error) {
    console.error("[API] POST /api/v2/reports/sources/rows error:", error);
    return errorResponse("Failed to load the report's rows");
  }
}
