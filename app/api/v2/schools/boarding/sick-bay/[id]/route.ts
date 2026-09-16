import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import {
  BoardingSessionError,
  heldBeds,
  sickBayInclude,
} from "@/lib/schools/boarding-sessions";

const dischargeSchema = z.object({
  dischargedAt: z
    .string()
    .trim()
    .min(1)
    .refine((value) => !Number.isNaN(new Date(value).getTime()), {
      message: "Invalid date value",
    })
    .optional(),
  /** Where they went — back to the house, or home. */
  dischargedTo: z.string().trim().min(1).max(200).optional(),
  notes: z.string().trim().min(1).max(2000).nullable().optional(),
});

/**
 * Discharge a boarder from the sick bay.
 *
 * An update, never a delete: "who was in the sick bay on the night of the
 * twelfth" is a question schools get asked, and a school that answers it with a
 * shrug because the row was tidied away has a real problem.
 *
 * Nothing here touches the allocation either. The bed was held for them the
 * whole time, so going back to it needs no write — which is exactly why the
 * admission was modelled separately in the first place.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.boarding", "edit");
    if (denied) return errorResponse(denied, 403);

    const { id } = await context.params;
    const companyId = session.user.companyId;

    const body = await request.json();
    const validated = dischargeSchema.parse(body);

    const admission = await prisma.schoolSickBayAdmission.findFirst({
      where: { id, companyId },
      select: { id: true, admittedAt: true, dischargedAt: true },
    });
    if (!admission) return errorResponse("Sick bay admission not found", 404);
    if (admission.dischargedAt) {
      return errorResponse("That admission has already been discharged", 409);
    }

    const dischargedAt = validated.dischargedAt
      ? new Date(validated.dischargedAt)
      : new Date();
    if (dischargedAt < admission.admittedAt) {
      return errorResponse("Discharge cannot be before the admission", 400);
    }

    const discharged = await prisma.schoolSickBayAdmission.update({
      where: { id: admission.id },
      data: {
        dischargedAt,
        dischargedTo: validated.dischargedTo ?? "Back to the house",
        ...(validated.notes !== undefined ? { notes: validated.notes } : {}),
      },
      include: sickBayInclude,
    });

    const held = await heldBeds(companyId, [discharged.studentId]);

    return successResponse({
      ...discharged,
      heldBed: held.get(discharged.studentId) ?? null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof BoardingSessionError) {
      return errorResponse(error.message, error.status);
    }
    console.error(
      "[API] PATCH /api/v2/schools/boarding/sick-bay/[id] error:",
      error,
    );
    return errorResponse("Failed to discharge from the sick bay");
  }
}
