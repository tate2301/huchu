import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import {
  blockerSummary,
  candidateRoll,
  ExamError,
  registerCohort,
  seriesTallies,
} from "@/lib/schools/exams";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * The candidate roll, and what is stopping an entry.
 *
 * `What is stopping an entry` comes before `The roll` on the screen, and the
 * blockers come back with the rows rather than as a second request: each one is
 * a NOT NULL requirement on the board's entry file, and a roll that showed
 * names without showing which of them cannot be registered would be a list
 * nobody could act on seven days before a deadline.
 */

const listQuery = z.object({
  classId: z.string().uuid().optional(),
  status: z.enum(["all", "ready", "blocked", "registered"]).optional(),
  search: z.string().trim().max(120).optional(),
});

const registerSchema = z.object({
  classId: z.string().uuid().nullish(),
  level: z.coerce.number().int().min(1).max(13).nullish(),
});

const patchSchema = z.object({
  candidateId: z.string().uuid(),
  candidateNumber: z.string().trim().max(12).nullish(),
  certifiedName: z.string().trim().max(160).nullish(),
  /** Corrections to the pupil the entry file needs, made where the blocker is. */
  student: z
    .object({
      nationalId: z.string().trim().max(40).nullish(),
      birthCertificateNo: z.string().trim().max(40).nullish(),
      certifiedName: z.string().trim().max(160).nullish(),
      dateOfBirth: z.string().datetime().nullish(),
      gender: z.string().trim().max(20).nullish(),
    })
    .optional(),
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ seriesId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.exams", "view");
    if (denied) return errorResponse(denied, 403);

    const { seriesId } = await context.params;
    const { searchParams } = new URL(request.url);
    const query = listQuery.parse(Object.fromEntries(searchParams.entries()));
    const companyId = session.user.companyId;

    const [rows, tallies, everyone] = await Promise.all([
      candidateRoll({ companyId, seriesId, ...query }),
      seriesTallies({ companyId, seriesId, now: Date.now() }),
      candidateRoll({ companyId, seriesId }),
    ]);

    return successResponse({
      rows,
      tallies,
      // Summarised over the whole roll rather than the filtered view: "nine
      // cannot be registered" is a fact about the series, and narrowing the
      // table must not change it.
      blockers: blockerSummary(everyone),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/exams/series/[id]/candidates error:", error);
    return errorResponse("Failed to read the candidate roll");
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ seriesId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.exams", "enter");
    if (denied) return errorResponse(denied, 403);

    const { seriesId } = await context.params;
    const body = registerSchema.parse(await request.json().catch(() => ({})));

    const result = await registerCohort({
      companyId: session.user.companyId,
      actorId: session.user.id,
      seriesId,
      classId: body.classId ?? undefined,
      level: body.level ?? undefined,
    });
    return successResponse(result, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof ExamError) return errorResponse(error.message, 422);
    console.error("[API] POST /api/v2/schools/exams/series/[id]/candidates error:", error);
    return errorResponse("Failed to register the cohort");
  }
}

/**
 * `Fix it` — the correction made where the blocker is drawn.
 *
 * It writes to the pupil as well as the candidate, because that is where the
 * missing fact lives: a birth certificate number is a property of the child,
 * not of this sitting, and correcting it on the candidate alone would leave the
 * June resit blocked all over again.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ seriesId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.exams", "edit");
    if (denied) return errorResponse(denied, 403);

    const { seriesId } = await context.params;
    const body = patchSchema.parse(await request.json());
    const companyId = session.user.companyId;

    const candidate = await prisma.schoolCandidate.findFirst({
      where: { id: body.candidateId, companyId, seriesId },
      select: { id: true, studentId: true },
    });
    if (!candidate) return errorResponse("That candidate is not on this series.", 404);

    await prisma.$transaction(async (tx) => {
      await tx.schoolCandidate.update({
        where: { id: candidate.id },
        data: {
          ...(body.candidateNumber !== undefined
            ? { candidateNumber: body.candidateNumber || null }
            : {}),
          ...(body.certifiedName !== undefined
            ? { certifiedName: body.certifiedName || null }
            : {}),
        },
      });
      if (body.student) {
        await tx.schoolStudent.update({
          where: { id: candidate.studentId },
          data: {
            ...(body.student.nationalId !== undefined
              ? { nationalId: body.student.nationalId || null }
              : {}),
            ...(body.student.birthCertificateNo !== undefined
              ? { birthCertificateNo: body.student.birthCertificateNo || null }
              : {}),
            ...(body.student.certifiedName !== undefined
              ? { certifiedName: body.student.certifiedName || null }
              : {}),
            ...(body.student.dateOfBirth !== undefined
              ? {
                  dateOfBirth: body.student.dateOfBirth
                    ? new Date(body.student.dateOfBirth)
                    : null,
                }
              : {}),
            ...(body.student.gender !== undefined
              ? { gender: body.student.gender || null }
              : {}),
          },
        });
      }
    });

    return successResponse({ id: candidate.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/v2/schools/exams/series/[id]/candidates error:", error);
    return errorResponse("Failed to correct the candidate");
  }
}
