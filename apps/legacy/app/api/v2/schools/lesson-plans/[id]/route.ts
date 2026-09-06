import { NextRequest, NextResponse } from "next/server";
import {
  errorResponse,
  isValidUUID,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * Tearing a lesson out of the planner.
 *
 * The planner could write a plan and rewrite it, and that was all. A week laid
 * out from the timetable against the wrong subject left a fortnight of drafts
 * nobody could clear, and "lay out from timetable" skips a day that already
 * has a plan on it — so an unremovable wrong plan is also a lesson that can
 * never be laid out correctly.
 *
 * Cover goes with it, by the schema's own cascade: a cover assignment names
 * the lesson somebody else is taking, and with the lesson gone it names
 * nothing — leaving it behind would put a phantom class on a teacher's day.
 */
export async function DELETE(
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
    if (!isValidUUID(id)) return errorResponse("Invalid lesson plan id", 400);

    const existing = await prisma.schoolLessonPlan.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse("Lesson plan not found", 404);

    await prisma.schoolLessonPlan.delete({ where: { id: existing.id } });

    return successResponse({ id: existing.id });
  } catch (error) {
    console.error("[API] DELETE /api/v2/schools/lesson-plans/[id] error:", error);
    return errorResponse("Failed to remove the lesson plan");
  }
}
