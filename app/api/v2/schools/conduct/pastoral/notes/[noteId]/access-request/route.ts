import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { PastoralError, requestAccess } from "@/lib/schools/pastoral";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * `Ask to see it`.
 *
 * Raised against a note whose content the requester has not seen. It notifies
 * the individuals named on the note; it grants nothing, and the response says
 * nothing about the note beyond that the request was taken.
 *
 * What happens next is school policy rather than product: who decides it, how
 * quickly, and whether the named individuals learn who asked are all left to
 * the school, which is why the outcome starts `PENDING` and nothing here
 * decides it. `conduct.md` open question 8 records that gap honestly.
 */

const schema = z.object({ reason: z.string().trim().max(500).optional() });

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ noteId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    // `view` is enough to ask. A reader who cannot read pastoral notes at all
    // has nothing to ask about — they cannot see that the note exists.
    const denied = schoolPermissionDenial(session, "schools.pastoral", "view");
    if (denied) return errorResponse(denied, 403);

    const { noteId } = await context.params;
    const body = schema.parse(await request.json().catch(() => ({})));
    const created = await requestAccess({
      companyId: session.user.companyId,
      actorId: session.user.id,
      noteId,
      reason: body.reason,
    });
    return successResponse({ id: created.id }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof PastoralError) return errorResponse(error.message, 422);
    console.error("[API] POST .../pastoral/notes/[id]/access-request error:", error);
    return errorResponse("Failed to raise the request");
  }
}
