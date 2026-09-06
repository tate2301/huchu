import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  isValidUUID,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { findSlotConflicts, isDayOfWeek } from "@/lib/schools/timetable";

const updateSchema = z
  .object({
    periodId: z.string().uuid().optional(),
    dayOfWeek: z.number().int().min(1).max(7).optional(),
    roomId: z.string().uuid().nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

const slotSelect = {
  id: true,
  dayOfWeek: true,
  termId: true,
  periodId: true,
  period: {
    select: {
      id: true,
      code: true,
      name: true,
      startMinute: true,
      endMinute: true,
      sequence: true,
    },
  },
  room: { select: { id: true, code: true, name: true } },
  classSubject: {
    select: {
      id: true,
      subject: { select: { id: true, code: true, name: true } },
      class: { select: { id: true, code: true, name: true } },
      stream: { select: { id: true, code: true, name: true } },
      teacherProfile: {
        select: {
          id: true,
          employeeCode: true,
          user: { select: { id: true, name: true } },
        },
      },
    },
  },
};

/**
 * Move a lesson. Only where it sits changes — day, period, room. Which class,
 * subject and teacher it is belongs to the assignment, and editing that here
 * would give the timetable a second opinion on it.
 */
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
    const companyId = session.user.companyId;

    const { id } = await context.params;
    if (!isValidUUID(id)) return errorResponse("Invalid timetable slot id", 400);

    const existing = await prisma.schoolTimetableSlot.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        termId: true,
        classSubjectId: true,
        periodId: true,
        dayOfWeek: true,
        roomId: true,
      },
    });
    if (!existing) return errorResponse("Timetable slot not found", 404);

    const validated = updateSchema.parse(await request.json());

    const dayOfWeek = validated.dayOfWeek ?? existing.dayOfWeek;
    if (!isDayOfWeek(dayOfWeek)) {
      return errorResponse("Day must be 1 (Monday) to 7 (Sunday)", 400);
    }
    const periodId = validated.periodId ?? existing.periodId;
    const roomId =
      validated.roomId === undefined ? existing.roomId : (validated.roomId ?? null);

    const conflicts = await findSlotConflicts({
      companyId,
      termId: existing.termId,
      classSubjectId: existing.classSubjectId,
      periodId,
      dayOfWeek,
      roomId,
      // Without this the slot clashes with where it already is, so nudging the
      // room of a lesson that is not moving would be refused by itself.
      excludeSlotId: existing.id,
    });
    if (conflicts.length > 0) {
      return errorResponse(
        conflicts.map((conflict) => conflict.message).join(" "),
        409,
        conflicts,
      );
    }

    const updated = await prisma.schoolTimetableSlot.update({
      where: { id: existing.id },
      data: { periodId, dayOfWeek, roomId },
      select: slotSelect,
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/v2/schools/timetable/[id] error:", error);
    return errorResponse("Failed to move the lesson");
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
    if (!isValidUUID(id)) return errorResponse("Invalid timetable slot id", 400);

    const existing = await prisma.schoolTimetableSlot.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse("Timetable slot not found", 404);

    await prisma.schoolTimetableSlot.delete({ where: { id: existing.id } });
    return successResponse({ id: existing.id });
  } catch (error) {
    console.error("[API] DELETE /api/v2/schools/timetable/[id] error:", error);
    return errorResponse("Failed to remove the lesson");
  }
}
