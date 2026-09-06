import { NextRequest, NextResponse } from "next/server";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { getCashFlowReport } from "@/lib/accounting/ledger";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const periodId = searchParams.get("periodId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const report = await getCashFlowReport({
      companyId: session.user.companyId,
      periodId: periodId || undefined,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    });

    return successResponse(report);
  } catch (error) {
    console.error("[API] GET /api/accounting/reports/cash-flow error:", error);
    return errorResponse("Failed to fetch cash flow report");
  }
}
