import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "@corelithzw/module-campus/permissions";
import { getCurrentTerm } from "@corelithzw/module-campus/calendar";
import { autoFillTimetable } from "@corelithzw/module-campus/timetable";

const bodySchema = z.object({
  termId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  days: z.array(z.number().int().min(1).max(7)).min(1).max(7).optional(),
  periodsPerSubject: z.number().int().min(1).max(20).optional(),
});

/**
 * Build a timetable from the term's assignments.
 *
 * Greedy first-fit, not an optimiser — see the note on `autoFillTimetable`. It
 * adds to what is already there and never moves or deletes an existing lesson,
 * so it is safe to run on a half-built timetable and safe to run twice.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "create");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const validated = bodySchema.parse(await request.json().catch(() => ({})));

    const termId = validated.termId ?? (await getCurrentTerm(companyId))?.id;
    if (!termId) {
      return errorResponse(
        "This school has no active term. Open an academic year and term under Academics first.",
        409,
      );
    }

    if (validated.classId) {
      const schoolClass = await prisma.schoolClass.findFirst({
        where: { id: validated.classId, companyId },
        select: { id: true },
      });
      if (!schoolClass) return errorResponse("Class not found", 404);
    }

    const result = await autoFillTimetable({
      companyId,
      termId,
      classId: validated.classId,
      days: validated.days,
      periodsPerSubject: validated.periodsPerSubject,
    });

    return successResponse(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/schools/timetable/auto-fill error:", error);
    return errorResponse("Failed to build the timetable");
  }
}
