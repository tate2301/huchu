import { NextRequest, NextResponse } from "next/server";
import {
  errorResponse,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

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
