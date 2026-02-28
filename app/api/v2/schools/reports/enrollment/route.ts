import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { generateEnrollmentStatsReport } from "@/lib/schools/reports";

const querySchema = z.object({
  termId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      termId: searchParams.get("termId") ?? undefined,
      startDate: searchParams.get("startDate") ?? undefined,
      endDate: searchParams.get("endDate") ?? undefined,
    });

    const options: Parameters<typeof generateEnrollmentStatsReport>[1] = {};
    if (query.termId) options.termId = query.termId;
    if (query.startDate) options.startDate = new Date(query.startDate);
    if (query.endDate) options.endDate = new Date(query.endDate);

    const report = await generateEnrollmentStatsReport(session.user.companyId, options);

    return successResponse({ data: report, summary: getSummary(report) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/reports/enrollment error:", error);
    return errorResponse("Failed to generate enrollment statistics report");
  }
}

function getSummary(rows: Awaited<ReturnType<typeof generateEnrollmentStatsReport>>) {
  if (rows.length === 0) {
    return {
      totalTerms: 0,
      averageEnrollment: 0,
      totalBoardingStudents: 0,
      boardingRate: 0,
    };
  }

  const totalEnrollment = rows.reduce((sum, row) => sum + row.totalEnrolled, 0);
  const totalBoarding = rows.reduce((sum, row) => sum + row.boardingCount, 0);

  return {
    totalTerms: rows.length,
    averageEnrollment: Math.round(totalEnrollment / rows.length),
    totalBoardingStudents: totalBoarding,
    boardingRate: totalEnrollment > 0 ? (totalBoarding / totalEnrollment) * 100 : 0,
  };
}
