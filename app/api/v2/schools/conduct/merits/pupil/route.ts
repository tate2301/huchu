import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { getCurrentTerm } from "@/lib/schools/calendar";
import { pupilMeritLedger } from "@/lib/schools/merits";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * One pupil's ledger.
 *
 * The row that opens it is the verb `conduct.md` open question 4 says is
 * missing: *"Nothing opens a pupil's ledger from the list."* A net of −7 is not
 * a fact anybody can act on; the entries behind it are.
 *
 * Reversed entries come back, marked. They stopped counting and they did not
 * stop happening.
 */

const query = z.object({
  studentId: z.string().uuid(),
  termId: z.string().uuid().optional(),
  /** `all` reads every term, for a leaving reference. */
  scope: z.enum(["term", "all"]).optional(),
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
    const termId =
      parsed.scope === "all"
        ? undefined
        : (parsed.termId ?? (await getCurrentTerm(companyId))?.id ?? undefined);

    const rows = await pupilMeritLedger({
      companyId,
      studentId: parsed.studentId,
      termId,
    });
    return successResponse({ rows });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/conduct/merits/pupil error:", error);
    return errorResponse("Failed to read the ledger");
  }
}
