import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { getCurrentTerm } from "@/lib/schools/calendar";
import { meritSummary } from "@/lib/schools/merits";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * `What gets written down` and `By year group`.
 *
 * Two aggregations over the same ledger the by-pupil table reads, on their own
 * endpoint so either summary failing leaves the pupil list usable.
 *
 * The group headers carry two numbers each because they are not the same
 * number: the reasons shown are a slice of the whole, and a school records
 * demerits for a handful of things and merits for many more.
 */

const query = z.object({
  termId: z.string().uuid().optional(),
  topReasons: z.coerce.number().int().min(1).max(20).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.conduct", "view");
    if (denied) return errorResponse(denied, 403);

    const { searchParams } = new URL(request.url);
    const parsed = query.parse(Object.fromEntries(searchParams.entries()));
    const companyId = session.user.companyId;
    const termId = parsed.termId ?? (await getCurrentTerm(companyId))?.id;
    if (!termId) {
      return successResponse({
        merit: { rows: [], shown: 0, total: 0 },
        demerit: { rows: [], shown: 0, total: 0 },
        byYearGroup: [],
        recordedThisTerm: 0,
        termId: null,
      });
    }

    const summary = await meritSummary({
      companyId,
      termId,
      topReasons: parsed.topReasons,
    });
    return successResponse({ ...summary, termId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/conduct/merits/summary error:", error);
    return errorResponse("Failed to read the summary");
  }
}
