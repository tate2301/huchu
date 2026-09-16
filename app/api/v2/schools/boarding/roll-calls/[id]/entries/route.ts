import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import {
  BoardingSessionError,
  findRollCall,
  presentRollCall,
} from "@/lib/schools/boarding-sessions";

/**
 * `NOT_SEEN` is absent from what a warden may set.
 *
 * It means one thing — nobody has looked yet — and it is the count the screen
 * drives to zero. Letting a tap put it back would make "we have not counted"
 * something a person can assert, and the submit gate would stop meaning
 * anything.
 */
const entryStatusSchema = z.enum(["PRESENT", "SIGNED_OUT", "SICK_BAY", "ABSENT"]);

const patchEntrySchema = z.object({
  studentId: z.string().uuid(),
  status: entryStatusSchema,
  notes: z.string().trim().min(1).max(1000).nullable().optional(),
});

/**
 * Mark one child on a register.
 *
 * Addressed by `studentId` rather than by the entry's own id: the warden is
 * looking at a child's name on a list, and the pair (roll call, pupil) is
 * already unique in the database. One fewer id for the screen to carry, and no
 * way to aim an update at an entry belonging to another night.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    // See the submit handler: `edit` is what the WARDEN persona actually holds
    // on `schools.boarding`, and ticking a name is warden work by definition.
    const denied = schoolPermissionDenial(session, "schools.boarding", "edit");
    if (denied) return errorResponse(denied, 403);

    const { id } = await context.params;
    const companyId = session.user.companyId;

    const body = await request.json();
    const validated = patchEntrySchema.parse(body);

    const rollCall = await prisma.schoolRollCall.findFirst({
      where: { id, companyId },
      select: { id: true, status: true },
    });
    if (!rollCall) return errorResponse("Roll call not found", 404);

    // A signed-off register is the record of what was true that night. An
    // amendment reopens it deliberately rather than being slipped in.
    if (rollCall.status === "SUBMITTED") {
      return errorResponse(
        "This roll call has been signed off and can no longer be changed",
        409,
      );
    }

    const entry = await prisma.schoolRollCallEntry.findFirst({
      where: {
        companyId,
        rollCallId: rollCall.id,
        studentId: validated.studentId,
      },
      select: { id: true },
    });
    if (!entry) {
      return errorResponse("That pupil is not on this roll call", 404);
    }

    await prisma.schoolRollCallEntry.update({
      where: { id: entry.id },
      data: {
        status: validated.status,
        recordedAt: new Date(),
        ...(validated.notes !== undefined ? { notes: validated.notes } : {}),
      },
    });

    const updated = await findRollCall(companyId, rollCall.id);
    if (!updated) return errorResponse("Roll call not found", 404);

    return successResponse(presentRollCall(updated));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof BoardingSessionError) {
      return errorResponse(error.message, error.status);
    }
    console.error(
      "[API] PATCH /api/v2/schools/boarding/roll-calls/[id]/entries error:",
      error,
    );
    return errorResponse("Failed to update the roll call entry");
  }
}
