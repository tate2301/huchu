import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  isValidUUID,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "../../../../../../permissions";
import { isUniqueConstraintError } from "../../../_helpers";

/**
 * One stop on a route.
 *
 * Times are stored as minutes past midnight rather than a clock string, which
 * is what makes "before the next stop" a comparison rather than a parse. The
 * route the stop belongs to is not editable here: moving a stop to another
 * route would take its riders with it, and that is an act on the riders.
 */
const updateStopSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    sequence: z.number().int().min(1).max(200).optional(),
    pickupMinute: z.number().int().min(0).max(1439).nullable().optional(),
    dropMinute: z.number().int().min(0).max(1439).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.students", "edit");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { id } = await params;
    if (!isValidUUID(id)) return errorResponse("Invalid stop ID", 400);

    const validated = updateStopSchema.parse(await request.json());

    const existing = await prisma.schoolTransportStop.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse("Stop not found", 404);

    const updated = await prisma.schoolTransportStop.update({
      where: { id: existing.id },
      data: {
        ...(validated.name !== undefined ? { name: validated.name } : {}),
        ...(validated.sequence !== undefined ? { sequence: validated.sequence } : {}),
        ...(validated.pickupMinute !== undefined
          ? { pickupMinute: validated.pickupMinute }
          : {}),
        ...(validated.dropMinute !== undefined ? { dropMinute: validated.dropMinute } : {}),
      },
      select: {
        id: true,
        name: true,
        sequence: true,
        pickupMinute: true,
        dropMinute: true,
      },
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse("Another stop on this route is already in that position", 409);
    }
    console.error("[API] PATCH /api/v2/schools/transport/stops/[id] error:", error);
    return errorResponse("Failed to update the stop");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.students", "edit");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { id } = await params;
    if (!isValidUUID(id)) return errorResponse("Invalid stop ID", 400);

    const existing = await prisma.schoolTransportStop.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse("Stop not found", 404);

    // The rider relation is `SetNull`, so deleting a stop with children on it
    // would quietly turn them into "no stop set" on tomorrow's register. Make
    // somebody move them instead.
    const waiting = await prisma.schoolTransportRider.count({
      where: { companyId, stopId: existing.id, endedAt: null },
    });
    if (waiting > 0) {
      return errorResponse(
        `${waiting} child${waiting === 1 ? " is" : "ren are"} picked up here. Move them to another stop first.`,
        409,
      );
    }

    await prisma.schoolTransportStop.delete({ where: { id: existing.id } });
    return successResponse({ id: existing.id, deleted: true });
  } catch (error) {
    console.error("[API] DELETE /api/v2/schools/transport/stops/[id] error:", error);
    return errorResponse("Failed to delete the stop");
  }
}
