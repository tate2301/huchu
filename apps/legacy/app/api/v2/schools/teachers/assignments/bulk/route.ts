import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { getCurrentTerm } from "@/lib/schools/calendar";
import { allocateTeacherToClasses } from "@/lib/schools/timetable";

const bodySchema = z.object({
  termId: z.string().uuid().optional(),
  subjectId: z.string().uuid(),
  teacherProfileId: z.string().uuid(),
  targets: z
    .array(
      z.object({
        classId: z.string().uuid(),
        streamId: z.string().uuid().nullish(),
      }),
    )
    .min(1)
    .max(200),
});

/**
 * Allocate one teacher to a subject across several classes in one request.
 *
 * See `allocateTeacherToClasses`: creating an assignment and moving one are
 * deliberately the same operation, because "who teaches Form 2 maths" is the
 * question being answered either way.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.teachers", "create");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const validated = bodySchema.parse(await request.json());

    const termId = validated.termId ?? (await getCurrentTerm(companyId))?.id;
    if (!termId) {
      return errorResponse(
        "This school has no active term. Open an academic year and term under Academics first.",
        409,
      );
    }

    // Every id checked against this company before anything is written, so a
    // partly-applied allocation cannot be produced by naming one bad class in
    // an otherwise valid list.
    const [subject, teacher, classCount] = await Promise.all([
      prisma.schoolSubject.findFirst({
        where: { id: validated.subjectId, companyId },
        select: { id: true },
      }),
      prisma.schoolTeacherProfile.findFirst({
        where: { id: validated.teacherProfileId, companyId },
        select: { id: true },
      }),
      prisma.schoolClass.count({
        where: {
          companyId,
          id: { in: validated.targets.map((target) => target.classId) },
        },
      }),
    ]);

    if (!subject) return errorResponse("Subject not found", 404);
    if (!teacher) return errorResponse("Teacher not found", 404);

    const distinctClassIds = new Set(validated.targets.map((t) => t.classId));
    if (classCount !== distinctClassIds.size) {
      return errorResponse("One or more classes were not found", 404);
    }

    const result = await allocateTeacherToClasses({
      companyId,
      termId,
      subjectId: validated.subjectId,
      teacherProfileId: validated.teacherProfileId,
      targets: validated.targets,
    });

    return successResponse(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/schools/teachers/assignments/bulk error:", error);
    return errorResponse("Failed to allocate the teacher");
  }
}
