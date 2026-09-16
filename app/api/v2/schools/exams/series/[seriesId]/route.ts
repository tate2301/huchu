import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { deadlineRows, ExamError, seriesTallies } from "@/lib/schools/exams";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * One series: its dates, and the five numbers every screen under it draws.
 *
 * The deadline table is computed server-side against one clock, for the reason
 * the index gives: a date that says "7 days" on one machine and "8" on another
 * is the one error this page cannot afford.
 */
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
    const companyId = session.user.companyId;

    const series = await prisma.schoolExamSeries.findFirst({
      where: { id: seriesId, companyId },
      select: {
        id: true,
        name: true,
        year: true,
        level: true,
        status: true,
        cohortLevel: true,
        entriesOpenAt: true,
        entriesCloseAt: true,
        lateEntriesCloseAt: true,
        startsOn: true,
        endsOn: true,
        resultsDueOn: true,
        feePerSubject: true,
        lateFeePerSubject: true,
        currency: true,
        board: { select: { id: true, code: true, name: true } },
        centre: { select: { id: true, number: true } },
        entryFileRuns: {
          select: { id: true, builtAt: true, entryCount: true, candidateCount: true },
          orderBy: { builtAt: "desc" },
          take: 1,
        },
      },
    });
    if (!series) return errorResponse("That series is not this school's.", 404);

    const now = Date.now();
    const tallies = await seriesTallies({ companyId, seriesId, now });

    return successResponse({
      series: {
        ...series,
        feePerSubject: series.feePerSubject?.toFixed(2) ?? null,
        lateFeePerSubject: series.lateFeePerSubject?.toFixed(2) ?? null,
      },
      deadlines: deadlineRows(series, now),
      tallies,
      // What `Build the entry file` last produced. Not a submission receipt —
      // S-13.3 is deferred and a human uploads the file.
      lastEntryFile: series.entryFileRuns[0] ?? null,
    });
  } catch (error) {
    if (error instanceof ExamError) return errorResponse(error.message, 404);
    console.error("[API] GET /api/v2/schools/exams/series/[id] error:", error);
    return errorResponse("Failed to read the series");
  }
}
