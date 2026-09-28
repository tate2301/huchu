import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import {
  DetentionError,
  DetentionNotFoundError,
  cancelSession,
  updateSession,
} from "@/lib/schools/detention";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * One sitting: correct it, or call it off.
 *
 * A detention session is a date, a room and a member of staff, and all three
 * were permanent. The hall gets taken for prize-giving, the supervisor is away
 * on the Friday, the deputy head typed 14:00 for a session that starts at 15:00
 * — and the product's answer to every one of those was to schedule a second
 * sitting and leave the first in `The coming sessions` with the pupils still
 * named on it. This is the correction that was missing.
 *
 * ## Correcting is the same authority as scheduling
 *
 * `create` here, which is what the POST on the collection asks for. Whoever the
 * school lets put a sitting in the diary may move it: a correction is not a
 * larger act than the booking it corrects, and a school where the person who
 * schedules detention has to find somebody else to change the room would go
 * back to scheduling a second one.
 *
 * ## Calling one off is a delete, and only while nobody is named
 *
 * The model has no cancelled state, and `cancelSession` explains why this does
 * not fake one in a column that does not exist. An empty sitting is a booking
 * and goes; a sitting pupils were told to attend must not vanish under them, so
 * the refusal counts them and says to move them first.
 */

const patchSchema = z.object({
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  // `nullish`, because clearing the room or the supervisor is a thing a school
  // means to do — the register draws `Not yet supervised` in red on purpose —
  // and it must not be confused with a request that simply did not mention it.
  roomId: z.string().uuid().nullish(),
  supervisorTeacherProfileId: z.string().uuid().nullish(),
  label: z.string().trim().max(80).nullish(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.conduct", "create");
    if (denied) return errorResponse(denied, 403);

    const { sessionId } = await context.params;
    const body = patchSchema.parse(await request.json());

    // The id in the URL is a claim. `updateSession` resolves it against this
    // company before it writes anything, and the room and the supervisor with
    // it; a miss comes back as `DetentionNotFoundError` and is answered 404.
    const updated = await updateSession({
      companyId: session.user.companyId,
      sessionId,
      ...(body.startsAt !== undefined ? { startsAt: new Date(body.startsAt) } : {}),
      ...(body.endsAt !== undefined ? { endsAt: new Date(body.endsAt) } : {}),
      ...(body.roomId !== undefined ? { roomId: body.roomId } : {}),
      ...(body.supervisorTeacherProfileId !== undefined
        ? { supervisorTeacherProfileId: body.supervisorTeacherProfileId }
        : {}),
      ...(body.label !== undefined ? { label: body.label } : {}),
    });
    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof DetentionNotFoundError) return errorResponse(error.message, 404);
    if (error instanceof DetentionError) return errorResponse(error.message, 422);
    console.error("[API] PATCH /api/v2/schools/conduct/detention/sessions/[id] error:", error);
    return errorResponse("Failed to change the session");
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.conduct", "create");
    if (denied) return errorResponse(denied, 403);

    const { sessionId } = await context.params;
    const cancelled = await cancelSession({
      companyId: session.user.companyId,
      sessionId,
    });
    return successResponse(cancelled);
  } catch (error) {
    if (error instanceof DetentionNotFoundError) return errorResponse(error.message, 404);
    // The count of who is named, in a sentence the screen shows as it stands.
    if (error instanceof DetentionError) return errorResponse(error.message, 409);
    console.error("[API] DELETE /api/v2/schools/conduct/detention/sessions/[id] error:", error);
    return errorResponse("Failed to call the session off");
  }
}
