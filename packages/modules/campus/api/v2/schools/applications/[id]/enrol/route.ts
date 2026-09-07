import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "../../../../../../permissions";
import { getCurrentTerm } from "../../../../../../calendar";
import { enrolApplicant, StageTransitionError } from "../../../../../../admissions";

const enrolSchema = z.object({
  studentNo: z.string().trim().min(1).max(40).optional(),
  classId: z.string().uuid().optional(),
  streamId: z.string().uuid().nullish(),
  termId: z.string().uuid().optional(),
  isBoarding: z.boolean().optional(),
});

/**
 * The next student number for a school.
 *
 * Same shape as `nextApplicationNo` and for the same reason: counting rows
 * would reissue the number of a child who has left.
 */
async function nextStudentNo(companyId: string, year: number) {
  const prefix = `S${year}-`;
  const latest = await prisma.schoolStudent.findFirst({
    where: { companyId, studentNo: { startsWith: prefix } },
    select: { studentNo: true },
    orderBy: { studentNo: "desc" },
  });
  const previous = latest ? Number(latest.studentNo.slice(prefix.length)) : 0;
  const next = Number.isFinite(previous) ? previous + 1 : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

/**
 * Turn an accepted applicant into a child on the roll.
 *
 * Separate from the stage endpoint because it is not a stage change: it creates
 * a student and an enrolment, and doing that by moving a dropdown would be an
 * irreversible act behind a reversible-looking control.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.admissions", "approve");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const validated = enrolSchema.parse(body ?? {});

    const application = await prisma.schoolApplication.findFirst({
      where: { id, companyId },
      select: { id: true, appliedForClassId: true, intendedTermId: true },
    });
    if (!application) return errorResponse("Application not found", 404);

    const classId = validated.classId ?? application.appliedForClassId;
    if (!classId) {
      return errorResponse(
        "This applicant has no year group. Choose one before enrolling.",
        400,
      );
    }

    const termId =
      validated.termId ??
      application.intendedTermId ??
      (await getCurrentTerm(companyId))?.id;
    if (!termId) {
      return errorResponse("This school has no active term", 400);
    }

    const studentNo =
      validated.studentNo ??
      (await nextStudentNo(companyId, new Date().getUTCFullYear()));

    const result = await enrolApplicant({
      companyId,
      applicationId: id,
      studentNo,
      classId,
      streamId: validated.streamId ?? null,
      termId,
      isBoarding: validated.isBoarding,
      actorUserId: session.user.id,
    });

    return successResponse(result, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof StageTransitionError) {
      return errorResponse(error.message, 409);
    }
    console.error("[API] POST /api/v2/schools/applications/[id]/enrol error:", error);
    return errorResponse("Failed to enrol the applicant");
  }
}
