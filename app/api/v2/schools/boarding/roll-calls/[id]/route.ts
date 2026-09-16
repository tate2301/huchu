import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { canSubmit } from "@/lib/schools/boarding-roll-call";
import {
  BoardingSessionError,
  findRollCall,
  presentRollCall,
  rollCallInclude,
} from "@/lib/schools/boarding-sessions";

const submitSchema = z.object({
  action: z.literal("submit"),
  notes: z.string().trim().min(1).max(2000).nullable().optional(),
});

/** One night's register for one house, with every child on it. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.boarding", "view");
    if (denied) return errorResponse(denied, 403);

    const { id } = await context.params;
    const rollCall = await findRollCall(session.user.companyId, id);
    if (!rollCall) return errorResponse("Roll call not found", 404);

    return successResponse(presentRollCall(rollCall));
  } catch (error) {
    if (error instanceof BoardingSessionError) {
      return errorResponse(error.message, error.status);
    }
    console.error(
      "[API] GET /api/v2/schools/boarding/roll-calls/[id] error:",
      error,
    );
    return errorResponse("Failed to fetch the roll call");
  }
}

/**
 * Sign the register off.
 *
 * Refused while anybody is still `NOT_SEEN`. Submitting then would record "we
 * checked" when nobody looked, which is worse than an unfinished count — and
 * the whole value of the screen is the number it drives to zero.
 *
 * `ABSENT` does not block. A child who has been looked for and not found is an
 * answer, and a bad one, but it is the warden's answer to give and the phone
 * call starts from there.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    // `edit` rather than `submit`: taking and signing off a house's own roll
    // call is the warden's core job, and the WARDEN persona does not carry
    // `submit` on `schools.boarding` — guarding on it would 403 exactly the
    // person the screen is built for.
    const denied = schoolPermissionDenial(session, "schools.boarding", "edit");
    if (denied) return errorResponse(denied, 403);

    const { id } = await context.params;
    const companyId = session.user.companyId;

    const body = await request.json();
    const validated = submitSchema.parse(body);

    const existing = await prisma.schoolRollCall.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        status: true,
        entries: { select: { status: true } },
      },
    });
    if (!existing) return errorResponse("Roll call not found", 404);

    if (existing.status === "SUBMITTED") {
      return errorResponse("This roll call has already been signed off", 409);
    }

    const statuses = existing.entries.map((entry) => entry.status);
    if (!canSubmit(statuses)) {
      const outstanding = statuses.filter((status) => status === "NOT_SEEN").length;
      return errorResponse(
        outstanding > 0
          ? `${outstanding} still to account for — the roll call cannot be signed off yet`
          : "There is nobody on this roll call to sign off",
        409,
      );
    }

    const submitted = await prisma.schoolRollCall.update({
      where: { id: existing.id },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        ...(validated.notes !== undefined ? { notes: validated.notes } : {}),
      },
      include: rollCallInclude,
    });

    return successResponse(presentRollCall(submitted));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof BoardingSessionError) {
      return errorResponse(error.message, error.status);
    }
    console.error(
      "[API] PATCH /api/v2/schools/boarding/roll-calls/[id] error:",
      error,
    );
    return errorResponse("Failed to submit the roll call");
  }
}
