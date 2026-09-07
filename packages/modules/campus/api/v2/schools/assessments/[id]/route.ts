import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "../../../../../permissions";
import { getTeacherProfile } from "../../../../../governance-v2";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  maxScore: z.number().positive().max(1000).optional(),
  weight: z.number().positive().max(100).optional(),
  assessedOn: z.string().date().nullish(),
  status: z.enum(["OPEN", "LOCKED"]).optional(),
});

/**
 * Whether the caller may change this assessment.
 *
 * The teacher whose class it is, or anyone with the wider results grant. The
 * second case is the office standing in for a teacher who is away, which is a
 * real part of the workflow and the reason mark entry is not portal-only.
 */
async function mayEdit(
  session: { user: { id: string; companyId: string; role?: string | null } },
  teacherProfileId: string,
) {
  if (!schoolPermissionDenial(session, "schools.results", "moderate")) return true;
  const profile = await getTeacherProfile(session.user.companyId, session.user.id);
  return profile?.id === teacherProfileId;
}

export async function PATCH(
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
    const existing = await prisma.schoolAssessment.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        status: true,
        maxScore: true,
        classSubject: { select: { teacherProfileId: true } },
      },
    });
    if (!existing) return errorResponse("Assessment not found", 404);
    if (!(await mayEdit(session, existing.classSubject.teacherProfileId))) {
      return errorResponse("That assessment is not yours to change", 403);
    }

    const validated = patchSchema.parse(await request.json());

    // Locking is the one change allowed on a locked assessment — specifically,
    // unlocking it. Everything else would edit marks somebody has closed.
    if (existing.status === "LOCKED") {
      const onlyStatus =
        Object.keys(validated).length === 1 && validated.status !== undefined;
      if (!onlyStatus) {
        return errorResponse(
          "This assessment is locked. Reopen it before changing it.",
          409,
        );
      }
    }

    // Lowering the paper's total below marks already entered would leave scores
    // the mark sheet itself would refuse. Reported with the offending mark, so
    // the person knows which script to look at.
    if (validated.maxScore !== undefined && validated.maxScore < Number(existing.maxScore)) {
      const highest = await prisma.schoolAssessmentScore.aggregate({
        where: { companyId, assessmentId: id },
        _max: { score: true },
      });
      const top = highest._max.score === null ? null : Number(highest._max.score);
      if (top !== null && top > validated.maxScore) {
        return errorResponse(
          `A mark of ${top} has already been entered — the paper cannot be worth ${validated.maxScore}`,
          409,
        );
      }
    }

    const updated = await prisma.schoolAssessment.update({
      where: { id },
      data: {
        ...(validated.title !== undefined ? { title: validated.title } : {}),
        ...(validated.maxScore !== undefined ? { maxScore: validated.maxScore } : {}),
        ...(validated.weight !== undefined ? { weight: validated.weight } : {}),
        ...(validated.assessedOn !== undefined
          ? { assessedOn: validated.assessedOn ? new Date(validated.assessedOn) : null }
          : {}),
        ...(validated.status !== undefined ? { status: validated.status } : {}),
      },
      select: { id: true, title: true, status: true },
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/v2/schools/assessments/[id] error:", error);
    return errorResponse("Failed to update the assessment");
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

    const denied = schoolPermissionDenial(session, "schools.results", "capture");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { id } = await context.params;
    const existing = await prisma.schoolAssessment.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        classSubject: { select: { teacherProfileId: true } },
        _count: { select: { scores: true } },
      },
    });
    if (!existing) return errorResponse("Assessment not found", 404);
    if (!(await mayEdit(session, existing.classSubject.teacherProfileId))) {
      return errorResponse("That assessment is not yours to remove", 403);
    }

    // Refused with a count rather than cascading the marks away, the same rule
    // as deleting a period with lessons in it. Somebody spent an evening
    // entering those.
    if (existing._count.scores > 0) {
      return errorResponse(
        `${existing._count.scores} mark${existing._count.scores === 1 ? " has" : "s have"} been entered — clear them first`,
        409,
      );
    }

    await prisma.schoolAssessment.delete({ where: { id } });
    return successResponse({ id });
  } catch (error) {
    console.error("[API] DELETE /api/v2/schools/assessments/[id] error:", error);
    return errorResponse("Failed to remove the assessment");
  }
}
