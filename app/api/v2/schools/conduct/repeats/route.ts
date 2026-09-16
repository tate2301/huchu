import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { getCurrentTerm } from "@/lib/schools/calendar";
import { repeatOffenders } from "@/lib/schools/conduct";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * `Three or more this term`.
 *
 * Its own endpoint rather than a second array on the log, so the log stays
 * usable when this fails: `11-campus-states-and-motion.md` is explicit that a
 * failed section keeps its place and carries the fault while the ones that
 * loaded stay usable, and the repeats table going down must not take the
 * behaviour log with it.
 */

const query = z.object({
  termId: z.string().uuid().optional(),
  minimum: z.coerce.number().int().min(2).max(20).optional(),
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
    if (!termId) return successResponse({ rows: [], termId: null });

    const rows = await repeatOffenders({ companyId, termId, minimum: parsed.minimum });
    return successResponse({ rows, termId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/conduct/repeats error:", error);
    return errorResponse("Failed to read the repeat list");
  }
}
