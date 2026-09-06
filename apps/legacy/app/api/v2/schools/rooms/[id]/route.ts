import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  isValidUUID,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { isUniqueConstraintError } from "../../_helpers";

const updateSchema = z
  .object({
    code: z.string().trim().min(1).max(40).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    capacity: z.number().int().min(0).max(10_000).nullish(),
    kind: z.string().trim().min(1).max(60).nullish(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

const roomSelect = {
  id: true,
  code: true,
  name: true,
  capacity: true,
  kind: true,
  isActive: true,
  _count: { select: { slots: true } },
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "view");
    if (denied) return errorResponse(denied, 403);
    const { id } = await context.params;
    if (!isValidUUID(id)) return errorResponse("Invalid room id", 400);

    const record = await prisma.schoolRoom.findFirst({
      where: { id, companyId: session.user.companyId },
      select: roomSelect,
    });
    if (!record) return errorResponse("Room not found", 404);

    return successResponse(record);
  } catch (error) {
    console.error("[API] GET /api/v2/schools/rooms/[id] error:", error);
    return errorResponse("Failed to fetch room");
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "edit");
    if (denied) return errorResponse(denied, 403);

    const { id } = await context.params;
    if (!isValidUUID(id)) return errorResponse("Invalid room id", 400);

    const existing = await prisma.schoolRoom.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse("Room not found", 404);

    const validated = updateSchema.parse(await request.json());

    const updated = await prisma.schoolRoom.update({
      where: { id: existing.id },
      data: validated,
      select: roomSelect,
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse("A room with this code already exists", 409);
    }
    console.error("[API] PATCH /api/v2/schools/rooms/[id] error:", error);
    return errorResponse("Failed to update room");
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "archive");
    if (denied) return errorResponse(denied, 403);

    const { id } = await context.params;
    if (!isValidUUID(id)) return errorResponse("Invalid room id", 400);

    const existing = await prisma.schoolRoom.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true, name: true, _count: { select: { slots: true } } },
    });
    if (!existing) return errorResponse("Room not found", 404);

    // Deleting a room in use sets `roomId` to null on its lessons rather than
    // cascading, so nothing is lost — but a timetable quietly losing its rooms
    // is not something to do on the timetabler's behalf. Deactivating keeps it
    // off the picker while the existing lessons keep their room.
    if (existing._count.slots > 0) {
      return errorResponse(
        `${existing.name} is used by ${existing._count.slots} lesson${existing._count.slots === 1 ? "" : "s"}. Mark it inactive instead, or move those lessons first.`,
        409,
      );
    }

    await prisma.schoolRoom.delete({ where: { id: existing.id } });
    return successResponse({ id: existing.id });
  } catch (error) {
    console.error("[API] DELETE /api/v2/schools/rooms/[id] error:", error);
    return errorResponse("Failed to delete room");
  }
}
