import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { ExamError } from "@/lib/schools/exams";
import {
  addPaper,
  listTimetable,
  removePaper,
  reschedulePaper,
} from "@/lib/schools/exam-timetable";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * The exam timetable: the papers this series sits, and when.
 *
 * The write path the seating screen was missing. `SchoolExamPaper` and
 * `SchoolExamSession` were read by `seatingPlan()` and created by nothing, so
 * Seating was a finished interface onto empty tables.
 *
 * On the grant: writing the timetable is `enter`, the exams officer's verb,
 * not `issue` or `seat`. Copying the board's dates down is the same job as
 * entering candidates for them, and it happens months before anybody is seated.
 */

const postSchema = z.object({
  examSubjectId: z.string().uuid(),
  paperNumber: z.coerce.number().int().min(1).max(20),
  code: z.string().trim().max(40).nullish(),
  sitsAt: z
    .string()
    .trim()
    .min(1)
    .refine((value) => !Number.isNaN(new Date(value).getTime()), {
      message: "sitsAt must be a date and a time",
    }),
  durationMinutes: z.coerce.number().int().min(5).max(600).nullish(),
});

const patchSchema = z.object({
  paperId: z.string().uuid(),
  sitsAt: z
    .string()
    .trim()
    .min(1)
    .refine((value) => !Number.isNaN(new Date(value).getTime()), {
      message: "sitsAt must be a date and a time",
    }),
  durationMinutes: z.coerce.number().int().min(5).max(600).nullish(),
});

const deleteQuery = z.object({ paperId: z.string().uuid() });

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
    const papers = await listTimetable({
      companyId: session.user.companyId,
      seriesId,
    });

    return successResponse({ papers });
  } catch (error) {
    console.error("[API] GET /api/v2/schools/exams/series/[id]/timetable error:", error);
    return errorResponse("Failed to read the timetable");
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
    const body = postSchema.parse(await request.json());

    const paper = await addPaper({
      companyId: session.user.companyId,
      seriesId,
      examSubjectId: body.examSubjectId,
      paperNumber: body.paperNumber,
      code: body.code ?? null,
      sitsAt: new Date(body.sitsAt),
      durationMinutes: body.durationMinutes ?? null,
    });

    return successResponse({ paper });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof ExamError) return errorResponse(error.message, error.status);
    console.error("[API] POST /api/v2/schools/exams/series/[id]/timetable error:", error);
    return errorResponse("Failed to write the paper");
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ seriesId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.exams", "enter");
    if (denied) return errorResponse(denied, 403);

    await context.params;
    const body = patchSchema.parse(await request.json());

    await reschedulePaper({
      companyId: session.user.companyId,
      paperId: body.paperId,
      sitsAt: new Date(body.sitsAt),
      durationMinutes: body.durationMinutes ?? undefined,
    });

    return successResponse({ paperId: body.paperId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof ExamError) return errorResponse(error.message, error.status);
    console.error("[API] PATCH /api/v2/schools/exams/series/[id]/timetable error:", error);
    return errorResponse("Failed to move the paper");
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ seriesId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.exams", "enter");
    if (denied) return errorResponse(denied, 403);

    await context.params;
    const { searchParams } = new URL(request.url);
    const query = deleteQuery.parse(Object.fromEntries(searchParams.entries()));

    await removePaper({ companyId: session.user.companyId, paperId: query.paperId });

    return successResponse({ paperId: query.paperId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof ExamError) return errorResponse(error.message, error.status);
    console.error("[API] DELETE /api/v2/schools/exams/series/[id]/timetable error:", error);
    return errorResponse("Failed to take the paper off the timetable");
  }
}
