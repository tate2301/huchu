import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { generateArrearsAgingReport } from "@/lib/schools/reports";

const querySchema = z.object({
  termId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      termId: searchParams.get("termId") ?? undefined,
      classId: searchParams.get("classId") ?? undefined,
    });

    const report = await generateArrearsAgingReport(session.user.companyId, query);

    return successResponse({ data: report, summary: getSummary(report) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/reports/arrears error:", error);
    return errorResponse("Failed to generate arrears aging report");
  }
}

function getSummary(rows: Awaited<ReturnType<typeof generateArrearsAgingReport>>) {
  const totalOutstanding = rows.reduce((sum, row) => sum + row.totalOutstanding, 0);
  const totalCurrent = rows.reduce((sum, row) => sum + row.current, 0);
  const total30Days = rows.reduce((sum, row) => sum + row.days30, 0);
  const total60Days = rows.reduce((sum, row) => sum + row.days60, 0);
  const total90Days = rows.reduce((sum, row) => sum + row.days90, 0);
  const total120Plus = rows.reduce((sum, row) => sum + row.days120Plus, 0);

  return {
    studentsWithArrears: rows.length,
    totalOutstanding,
    aging: {
      current: totalCurrent,
      days30: total30Days,
      days60: total60Days,
      days90: total90Days,
      days120Plus: total120Plus,
    },
  };
}
