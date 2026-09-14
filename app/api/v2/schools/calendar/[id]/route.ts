import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import {
  CALENDAR_EVENT_SELECT,
  calendarEventPatchSchema,
  checkCalendarEventWindow,
  defaultIsTeachingDay,
} from "@/lib/schools/calendar";

/**
 * Correcting a calendar entry.
 *
 * Without this the only way to move a holiday entered on the wrong day was to
 * delete it and type it again, and the calendar decides "not a school day" on
 * every register, so the gap between the two acts is a day the attendance
 * reports read as missing registers.
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
    const existing = await prisma.schoolCalendarEvent.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        kind: true,
        startDate: true,
        endDate: true,
        termId: true,
      },
    });
    if (!existing) return errorResponse("Calendar event not found", 404);

    const validated = calendarEventPatchSchema.parse(await request.json());

    const startDate = validated.startDate
      ? new Date(validated.startDate)
      : existing.startDate;
    const endDate = validated.endDate ? new Date(validated.endDate) : existing.endDate;
    const termId =
      validated.termId !== undefined ? (validated.termId ?? null) : existing.termId;

    const problem = await checkCalendarEventWindow({
      companyId,
      termId,
      startDate,
      endDate,
    });
    if (problem) return errorResponse(problem.message, problem.status);

    // Changing the kind moves the teaching flag with it unless the caller says
    // otherwise. Someone correcting an EVENT to a PUBLIC_HOLIDAY means the
    // school is shut; leaving the stored `true` alone would keep the day open
    // and go on counting every child absent on it.
    const nextKind = validated.kind;
    const isTeachingDay =
      validated.isTeachingDay !== undefined
        ? validated.isTeachingDay
        : nextKind !== undefined && nextKind !== existing.kind
          ? defaultIsTeachingDay(nextKind)
          : undefined;

    const updated = await prisma.schoolCalendarEvent.update({
      where: { id: existing.id },
      data: {
        ...(validated.title !== undefined ? { title: validated.title } : {}),
        ...(validated.kind !== undefined ? { kind: validated.kind } : {}),
        ...(validated.startDate !== undefined ? { startDate } : {}),
        ...(validated.endDate !== undefined ? { endDate } : {}),
        ...(validated.termId !== undefined ? { termId } : {}),
        ...(validated.notes !== undefined ? { notes: validated.notes ?? null } : {}),
        ...(isTeachingDay !== undefined ? { isTeachingDay } : {}),
      },
      select: CALENDAR_EVENT_SELECT,
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/v2/schools/calendar/[id] error:", error);
    return errorResponse("Failed to update the calendar event");
  }
}

/**
 * Removing a calendar entry.
 *
 * A hard delete rather than a soft one: a holiday entered on the wrong day is
 * a typo, not history, and leaving a tombstone behind would mean every
 * school-day check had to learn to ignore it.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    // `edit`, not `delete`: the persona catalogue has no delete action, and
    // striking a mistyped holiday off the calendar is editing the calendar
    // rather than destroying a record. A registrar has to be able to do it —
    // the story is "I can set the school calendar", and a calendar you can only
    // add to is not one you can set.
    const denied = schoolPermissionDenial(session, "schools.academics", "edit");
    if (denied) return errorResponse(denied, 403);

    const { id } = await context.params;
    const existing = await prisma.schoolCalendarEvent.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse("Calendar event not found", 404);

    await prisma.schoolCalendarEvent.delete({ where: { id } });
    return successResponse({ id });
  } catch (error) {
    console.error("[API] DELETE /api/v2/schools/calendar/[id] error:", error);
    return errorResponse("Failed to remove the calendar event");
  }
}
