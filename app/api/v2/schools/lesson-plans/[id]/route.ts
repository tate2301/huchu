import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";

import {
  errorResponse,
  isValidUUID,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
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

/**
 * Correcting a plan, one line at a time.
 *
 * A plan could already be rewritten — by posting it back through `save` with
 * its id — but only whole. That route rebuilds the row from the body, so two
 * things went wrong every time a teacher opened a draft to fix a typo in the
 * topic. The planner's dialog has no box for `resourcesNote`, so the field the
 * scheme of work had filled in came back empty and the week's reading list
 * quietly disappeared. And `save` re-reads the *current* term to file the plan
 * under, so tidying up last term's planner in the first week of the new one
 * dragged those lessons forward into a term they were never taught in.
 *
 * This writes only what was sent. An untouched field is not mentioned in the
 * update at all, and the term, the class and the timetable slot the plan was
 * laid out on are not its business: a plan belongs to the lesson it was written
 * for, and moving it to a different lesson is tearing it up and laying the week
 * out again, not a correction.
 *
 * The one thing that can be deliberately rubbed out is a note — objectives,
 * activities, resources, homework, the reflection. Sending null clears it;
 * leaving it out keeps it. A teacher who writes "ran out of time" after the
 * bell and then decides it was unfair on the class needs the second of those,
 * and it is a different act from never having said anything.
 *
 * Who may do it is who may tear one up: the same `schools.academics` edit
 * grant, which is how the module has drawn teaching authority throughout.
 */
const patchSchema = z.object({
  lessonDate: z.string().date().optional(),
  topic: z.string().trim().min(1).max(300).optional(),
  objectives: z.string().trim().max(2000).nullish(),
  activities: z.string().trim().max(4000).nullish(),
  resourcesNote: z.string().trim().max(2000).nullish(),
  homeworkNote: z.string().trim().max(2000).nullish(),
  reflection: z.string().trim().max(2000).nullish(),
});

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
    if (!isValidUUID(id)) return errorResponse("Invalid lesson plan id", 400);

    const body = patchSchema.parse(await request.json());

    // The id in the URL is a claim until it is resolved against the caller's
    // company. `update({ where: { id } })` cannot be company-scoped, so this
    // lookup is the tenant boundary.
    const existing = await prisma.schoolLessonPlan.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse("Lesson plan not found", 404);

    const plan = await prisma.schoolLessonPlan.update({
      where: { id: existing.id },
      data: {
        // Midnight UTC, the way every other write to this column lands, so a
        // lesson moved to Thursday is one row however the date arrived.
        ...(body.lessonDate !== undefined
          ? { lessonDate: new Date(`${body.lessonDate}T00:00:00.000Z`) }
          : {}),
        ...(body.topic !== undefined ? { topic: body.topic } : {}),
        ...(body.objectives !== undefined ? { objectives: body.objectives } : {}),
        ...(body.activities !== undefined ? { activities: body.activities } : {}),
        ...(body.resourcesNote !== undefined
          ? { resourcesNote: body.resourcesNote }
          : {}),
        ...(body.homeworkNote !== undefined ? { homeworkNote: body.homeworkNote } : {}),
        ...(body.reflection !== undefined ? { reflection: body.reflection } : {}),
      },
      select: { id: true, lessonDate: true, topic: true },
    });

    return successResponse(plan);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return errorResponse(
        "There is already a plan for that lesson. Open it rather than moving this one onto it.",
        409,
      );
    }
    console.error("[API] PATCH /api/v2/schools/lesson-plans/[id] error:", error);
    return errorResponse("Failed to correct the lesson plan");
  }
}
