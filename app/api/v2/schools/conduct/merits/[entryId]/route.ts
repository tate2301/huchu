import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { MeritError, reverseMeritEntry } from "@/lib/schools/merits";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * Take a merit point back.
 *
 * `POST`, not `DELETE`, and that is the design rather than a REST preference:
 * the entry is never deleted. Merit points are the thing in a school most often
 * recorded against the wrong child, and a row that vanishes tells a parent
 * asking about prize giving nothing. The entry stays, stops counting, and says
 * who reversed it and why — which is the reason the reason is required.
 */

const schema = z.object({ reason: z.string().trim().min(1).max(300) });

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ entryId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    // `edit`, not `award`: giving a point and taking one back are different
    // acts, and a teacher holds only the first.
    const denied = schoolPermissionDenial(session, "schools.conduct", "edit");
    if (denied) return errorResponse(denied, 403);

    const { entryId } = await context.params;
    const body = schema.parse(await request.json());
    const reversed = await reverseMeritEntry({
      companyId: session.user.companyId,
      actorId: session.user.id,
      entryId,
      reason: body.reason,
    });
    return successResponse(reversed);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof MeritError) return errorResponse(error.message, 422);
    console.error("[API] POST /api/v2/schools/conduct/merits/[id] error:", error);
    return errorResponse("Failed to reverse the entry");
  }
}
