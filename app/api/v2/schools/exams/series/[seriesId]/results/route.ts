import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { captureResults, ExamError, resultsForSeries } from "@/lib/schools/exams";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * Public results, by subject and by candidate.
 *
 * A pass is `C or better` at Ordinary Level and IGCSE, and the rule lives in
 * `lib/schools/exam-grades.ts` rather than in this query — so the column, the
 * stat and the comparison against last November all count the same thing.
 *
 * `Against 2024` compares pass rates rather than counts: a subject sat by 40
 * candidates this year and 60 last is not "down twenty", and a screen that said
 * so would send a head to interrogate a department about a timetable change.
 */

const listQuery = z.object({ compareSeriesId: z.string().uuid().optional() });

const captureSchema = z.object({
  rows: z
    .array(
      z.object({
        candidateId: z.string().uuid(),
        examSubjectId: z.string().uuid(),
        grade: z.string().trim().min(1).max(3),
        points: z.coerce.number().int().min(0).max(20).nullish(),
        isRemark: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(2000),
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

    const results = await resultsForSeries({
      companyId: session.user.companyId,
      seriesId,
      compareSeriesId: query.compareSeriesId,
    });
    return successResponse(results);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof ExamError) return errorResponse(error.message, 404);
    console.error("[API] GET /api/v2/schools/exams/series/[id]/results error:", error);
    return errorResponse("Failed to read the results");
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

    // `capture`, the same grant a subject teacher holds for internal marks. A
    // grade off a board statement is transcription, and the person doing it is
    // whoever is holding the envelope.
    const denied = schoolPermissionDenial(session, "schools.exams", "capture");
    if (denied) return errorResponse(denied, 403);

    const { seriesId } = await context.params;
    const body = captureSchema.parse(await request.json());

    const result = await captureResults({
      companyId: session.user.companyId,
      actorId: session.user.id,
      seriesId,
      rows: body.rows,
    });
    return successResponse(result, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof ExamError) return errorResponse(error.message, 422);
    console.error("[API] POST /api/v2/schools/exams/series/[id]/results error:", error);
    return errorResponse("Failed to capture the results");
  }
}
