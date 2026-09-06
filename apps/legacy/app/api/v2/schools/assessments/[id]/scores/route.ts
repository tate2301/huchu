import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "@corelithzw/module-campus/permissions";
import { getTeacherProfile } from "@corelithzw/module-campus/governance-v2";
import {
  AssessmentLockedError,
  saveAssessmentScores,
  ScoreOutOfRangeError,
} from "@corelithzw/module-campus/assessments";

const putSchema = z.object({
  scores: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        score: z.number().min(0).max(1000).nullable(),
        isAbsent: z.boolean().optional(),
        comment: z.string().trim().max(300).nullish(),
      }),
    )
    .min(1)
    .max(500),
});

/**
 * The mark sheet for one assessment: every child in the class, marked or not.
 *
 * Built from the class roll outward rather than from the scores that exist —
 * the same rule as the attendance oversight page. A sheet listing only the
 * children who have been marked cannot show you the ones who have not, which is
 * the reason a teacher opens it on the second evening.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.results", "view");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { id } = await context.params;
    const assessment = await prisma.schoolAssessment.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        title: true,
        kind: true,
        maxScore: true,
        weight: true,
        status: true,
        assessedOn: true,
        classSubject: {
          select: {
            id: true,
            classId: true,
            streamId: true,
            teacherProfileId: true,
            subject: { select: { id: true, code: true, name: true } },
            class: { select: { id: true, code: true, name: true } },
            stream: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });
    if (!assessment) return errorResponse("Assessment not found", 404);

    const [students, scores] = await Promise.all([
      prisma.schoolStudent.findMany({
        where: {
          companyId,
          status: "ACTIVE",
          currentClassId: assessment.classSubject.classId,
          ...(assessment.classSubject.streamId
            ? { currentStreamId: assessment.classSubject.streamId }
            : {}),
        },
        select: {
          id: true,
          studentNo: true,
          firstName: true,
          lastName: true,
        },
        // Surname first, as every other roll in the pack is ordered.
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      }),
      prisma.schoolAssessmentScore.findMany({
        where: { companyId, assessmentId: id },
        select: {
          studentId: true,
          score: true,
          isAbsent: true,
          comment: true,
        },
      }),
    ]);

    const byStudent = new Map(scores.map((row) => [row.studentId, row]));

    return successResponse({
      assessment,
      rows: students.map((student) => {
        const existing = byStudent.get(student.id);
        return {
          student,
          score: existing?.score ?? null,
          isAbsent: existing?.isAbsent ?? false,
          comment: existing?.comment ?? null,
          marked: existing !== undefined,
        };
      }),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/schools/assessments/[id]/scores error:", error);
    return errorResponse("Failed to fetch the mark sheet");
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.results", "capture");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { id } = await context.params;
    const assessment = await prisma.schoolAssessment.findFirst({
      where: { id, companyId },
      select: { id: true, classSubject: { select: { teacherProfileId: true } } },
    });
    if (!assessment) return errorResponse("Assessment not found", 404);

    // Their own class, or the wider grant. A teacher must not be able to mark
    // another teacher's class by knowing an assessment id.
    if (schoolPermissionDenial(session, "schools.results", "moderate")) {
      const profile = await getTeacherProfile(companyId, session.user.id);
      if (!profile || profile.id !== assessment.classSubject.teacherProfileId) {
        return errorResponse("That mark sheet is not yours", 403);
      }
    }

    const validated = putSchema.parse(await request.json());

    await saveAssessmentScores({
      companyId,
      assessmentId: id,
      scores: validated.scores,
      markedById: session.user.id,
    });

    return successResponse({ saved: validated.scores.length });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof AssessmentLockedError) {
      return errorResponse(error.message, 409);
    }
    if (error instanceof ScoreOutOfRangeError) {
      return errorResponse(error.message, 400);
    }
    console.error("[API] PUT /api/v2/schools/assessments/[id]/scores error:", error);
    return errorResponse("Failed to save the marks");
  }
}
