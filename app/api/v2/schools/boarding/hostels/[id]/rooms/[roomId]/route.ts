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
import {
  isUniqueConstraintError,
  normalizeOptionalNullableString,
} from "../../../../../_helpers";

/** Renaming a room, closing it for the term, or removing one put up in error. */
const updateRoomSchema = z
  .object({
    code: z.string().trim().min(1).max(40).optional(),
    floor: z.string().trim().min(1).max(50).nullable().optional(),
    capacity: z.number().int().min(0).max(200).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

const roomSelect = {
  id: true,
  code: true,
  floor: true,
  capacity: true,
  isActive: true,
  beds: {
    select: { id: true, code: true, status: true, isActive: true },
    orderBy: { code: "asc" as const },
  },
  _count: { select: { beds: true, allocations: true } },
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; roomId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.boarding", "edit");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { id, roomId } = await params;
    if (!isValidUUID(id) || !isValidUUID(roomId)) {
      return errorResponse("Invalid hostel or room ID", 400);
    }

    const validated = updateRoomSchema.parse(await request.json());

    const existing = await prisma.schoolHostelRoom.findFirst({
      where: { id: roomId, hostelId: id, companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse("Room not found", 404);

    const updated = await prisma.schoolHostelRoom.update({
      where: { id: existing.id },
      data: {
        ...(validated.code !== undefined ? { code: validated.code } : {}),
        ...(validated.floor !== undefined
          ? { floor: normalizeOptionalNullableString(validated.floor) }
          : {}),
        ...(validated.capacity !== undefined ? { capacity: validated.capacity } : {}),
        ...(validated.isActive !== undefined ? { isActive: validated.isActive } : {}),
      },
      select: roomSelect,
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse("A room with that code already exists in this hostel", 409);
    }
    console.error(
      "[API] PATCH /api/v2/schools/boarding/hostels/[id]/rooms/[roomId] error:",
      error,
    );
    return errorResponse("Failed to update the room");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; roomId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.boarding", "archive");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { id, roomId } = await params;
    if (!isValidUUID(id) || !isValidUUID(roomId)) {
      return errorResponse("Invalid hostel or room ID", 400);
    }

    const existing = await prisma.schoolHostelRoom.findFirst({
      where: { id: roomId, hostelId: id, companyId },
      select: { id: true, _count: { select: { allocations: true } } },
    });
    if (!existing) return errorResponse("Room not found", 404);

    // A room somebody has slept in is history, not a typo. Closing it takes it
    // off the board without pretending it never existed.
    if (existing._count.allocations > 0) {
      return errorResponse(
        "Children have been allocated to this room. Close it instead of deleting it.",
        409,
      );
    }

    await prisma.schoolHostelRoom.delete({ where: { id: existing.id } });
    return successResponse({ id: existing.id, deleted: true });
  } catch (error) {
    console.error(
      "[API] DELETE /api/v2/schools/boarding/hostels/[id]/rooms/[roomId] error:",
      error,
    );
    return errorResponse("Failed to delete the room");
  }
}
