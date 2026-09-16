import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { pastoralNoteCountForStudent } from "@/lib/schools/pastoral-access";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * How many pastoral notes exist on one pupil. An integer, and nothing else.
 *
 * This is what the incident page's violet alert calls: *One pastoral note on
 * Tadiwa is not shown here.* The sentence is a refusal that is precise about
 * what it refuses — it says a note exists, names the pupil, and shows no
 * author, no date, no band and no body.
 *
 * It is gated on `schools.conduct`, not `schools.pastoral`, and it deliberately
 * ignores clearance: the alert **must render identically** for a reader who is
 * cleared for the note and one who is not. If it did not, the presence or
 * absence of detail on a discipline page would become a side channel into the
 * pastoral record — which is why this endpoint returns something a clearance
 * could never change.
 */

const query = z.object({ studentId: z.string().uuid() });

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.conduct", "view");
    if (denied) return errorResponse(denied, 403);

    const { searchParams } = new URL(request.url);
    const { studentId } = query.parse(Object.fromEntries(searchParams.entries()));
    const count = await pastoralNoteCountForStudent({
      companyId: session.user.companyId,
      studentId,
    });
    return successResponse({ count });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/conduct/pastoral/count error:", error);
    return errorResponse("Failed to count the notes");
  }
}
