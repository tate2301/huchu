import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  isValidUUID,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { isUniqueConstraintError } from "../../../../../_helpers";

/**
 * One bed.
 *
 * `status` is the board's own vocabulary — a bed can be out of use for a broken
 * frame without anybody being moved out of the hostel — and `isActive` is
 * whether it is on the board at all.
 */
const updateBedSchema = z
  .object({
    code: z.string().trim().min(1).max(40).optional(),
    status: z.enum(["AVAILABLE", "OCCUPIED", "OUT_OF_SERVICE"]).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; bedId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.boarding", "edit");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { id, bedId } = await params;
    if (!isValidUUID(id) || !isValidUUID(bedId)) {
      return errorResponse("Invalid hostel or bed ID", 400);
    }

    const validated = updateBedSchema.parse(await request.json());

    const existing = await prisma.schoolHostelBed.findFirst({
      where: { id: bedId, hostelId: id, companyId },
      select: {
        id: true,
        allocations: { where: { status: "ACTIVE" }, select: { id: true }, take: 1 },
      },
    });
    if (!existing) return errorResponse("Bed not found", 404);

    // Taking an occupied bed off the board would leave a child allocated to
    // somewhere the board cannot draw. Move them first.
    const occupied = existing.allocations.length > 0;
    if (occupied && (validated.isActive === false || validated.status === "OUT_OF_SERVICE")) {
      return errorResponse(
        "Somebody is in this bed. Free it before taking it out of use.",
        409,
      );
    }

    const updated = await prisma.schoolHostelBed.update({
      where: { id: existing.id },
      data: {
        ...(validated.code !== undefined ? { code: validated.code } : {}),
        ...(validated.status !== undefined ? { status: validated.status } : {}),
        ...(validated.isActive !== undefined ? { isActive: validated.isActive } : {}),
      },
      select: { id: true, code: true, status: true, isActive: true },
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse("A bed with that code already exists in the room", 409);
    }
    console.error(
      "[API] PATCH /api/v2/schools/boarding/hostels/[id]/beds/[bedId] error:",
      error,
    );
    return errorResponse("Failed to update the bed");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; bedId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.boarding", "archive");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { id, bedId } = await params;
    if (!isValidUUID(id) || !isValidUUID(bedId)) {
      return errorResponse("Invalid hostel or bed ID", 400);
    }

    const existing = await prisma.schoolHostelBed.findFirst({
      where: { id: bedId, hostelId: id, companyId },
      select: { id: true, _count: { select: { allocations: true } } },
    });
    if (!existing) return errorResponse("Bed not found", 404);

    if (existing._count.allocations > 0) {
      return errorResponse(
        "Children have been allocated to this bed. Take it out of use instead of deleting it.",
        409,
      );
    }

    await prisma.schoolHostelBed.delete({ where: { id: existing.id } });
    return successResponse({ id: existing.id, deleted: true });
  } catch (error) {
    console.error(
      "[API] DELETE /api/v2/schools/boarding/hostels/[id]/beds/[bedId] error:",
      error,
    );
    return errorResponse("Failed to delete the bed");
  }
}
