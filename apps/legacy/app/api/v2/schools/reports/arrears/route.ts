import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { schoolPermissionDenial } from "@corelithzw/module-campus/permissions";
import { generateArrearsAgingReport } from "@corelithzw/module-campus/reports";

const querySchema = z.object({
  termId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  streamId: z.string().uuid().optional(),
  /** "BOARDING" or "DAY". Absent is both, which is the board's default. */
  boarding: z.enum(["BOARDING", "DAY"]).optional(),
  minOutstanding: z.coerce.number().min(0).optional(),
  oldestAtLeast: z.enum(["days30", "days60", "days90", "days120Plus"]).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.reports", "view");
    if (denied) return errorResponse(denied, 403);

    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      termId: searchParams.get("termId") ?? undefined,
      classId: searchParams.get("classId") ?? undefined,
      streamId: searchParams.get("streamId") ?? undefined,
      boarding: searchParams.get("boarding") ?? undefined,
      minOutstanding: searchParams.get("minOutstanding") ?? undefined,
      oldestAtLeast: searchParams.get("oldestAtLeast") ?? undefined,
    });

    const report = await generateArrearsAgingReport(session.user.companyId, {
      ...(query.termId ? { termId: query.termId } : {}),
      ...(query.classId ? { classId: query.classId } : {}),
      ...(query.streamId ? { streamId: query.streamId } : {}),
      ...(query.boarding ? { isBoarding: query.boarding === "BOARDING" } : {}),
      ...(query.minOutstanding !== undefined
        ? { minOutstanding: query.minOutstanding }
        : {}),
      ...(query.oldestAtLeast ? { oldestAtLeast: query.oldestAtLeast } : {}),
    });

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
