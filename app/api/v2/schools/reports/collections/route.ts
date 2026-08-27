import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import {
  collectionsByYearGroup,
  generateCollectionsReport,
} from "@/lib/schools/reports";

const querySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  termId: z.string().uuid().optional(),
  /** Every term in one year, for the board's "which year are we looking at". */
  academicYearId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  feeStructureId: z.string().uuid().optional(),
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
      startDate: searchParams.get("startDate") ?? undefined,
      endDate: searchParams.get("endDate") ?? undefined,
      termId: searchParams.get("termId") ?? undefined,
      academicYearId: searchParams.get("academicYearId") ?? undefined,
      classId: searchParams.get("classId") ?? undefined,
      feeStructureId: searchParams.get("feeStructureId") ?? undefined,
    });

    const options: Parameters<typeof generateCollectionsReport>[1] = {};
    if (query.startDate) options.startDate = new Date(query.startDate);
    if (query.endDate) options.endDate = new Date(query.endDate);
    if (query.termId) options.termId = query.termId;
    if (query.academicYearId) options.academicYearId = query.academicYearId;
    if (query.classId) options.classId = query.classId;
    if (query.feeStructureId) options.feeStructureId = query.feeStructureId;

    // Both cuts in one response. The board draws them side by side, and two
    // round trips would let the term table and the year-group panel disagree
    // for a frame after a filter changes.
    const [report, byYearGroup] = await Promise.all([
      generateCollectionsReport(session.user.companyId, options),
      collectionsByYearGroup(session.user.companyId, options),
    ]);

    return successResponse({
      data: report,
      summary: getSummary(report),
      byYearGroup,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/reports/collections error:", error);
    return errorResponse("Failed to generate collections report");
  }
}

function getSummary(rows: Awaited<ReturnType<typeof generateCollectionsReport>>) {
  const totalInvoiced = rows.reduce((sum, row) => sum + row.invoiced, 0);
  const totalCollected = rows.reduce((sum, row) => sum + row.collected, 0);
  const totalReceipts = rows.reduce((sum, row) => sum + row.receiptsCount, 0);
  const overallCollectionRate = totalInvoiced > 0 ? (totalCollected / totalInvoiced) * 100 : 0;

  return {
    totalInvoiced,
    totalCollected,
    totalReceipts,
    overallCollectionRate,
    periodsCount: rows.length,
  };
}
