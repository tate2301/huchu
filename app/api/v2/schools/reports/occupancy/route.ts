import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { generateOccupancyReport } from "@/lib/schools/reports";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const report = await generateOccupancyReport(session.user.companyId);

    return successResponse({ data: report, summary: getSummary(report) });
  } catch (error) {
    console.error("[API] GET /api/v2/schools/reports/occupancy error:", error);
    return errorResponse("Failed to generate occupancy report");
  }
}

function getSummary(rows: Awaited<ReturnType<typeof generateOccupancyReport>>) {
  const totalBeds = rows.reduce((sum, row) => sum + row.totalBeds, 0);
  const totalOccupied = rows.reduce((sum, row) => sum + row.occupiedBeds, 0);
  const totalHostels = rows.length;
  const overallOccupancyRate = totalBeds > 0 ? (totalOccupied / totalBeds) * 100 : 0;

  return {
    totalHostels,
    totalBeds,
    totalOccupied,
    totalAvailable: totalBeds - totalOccupied,
    overallOccupancyRate,
  };
}
