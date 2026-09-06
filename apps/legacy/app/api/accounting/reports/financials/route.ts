import { NextRequest, NextResponse } from "next/server";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { getFinancialStatements } from "@/lib/accounting/ledger";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const periodId = searchParams.get("periodId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const result = await getFinancialStatements({
      companyId: session.user.companyId,
      periodId,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    });

    return successResponse(result);
  } catch (error) {
    console.error("[API] GET /api/accounting/reports/financials error:", error);
    return errorResponse("Failed to fetch financial statements");
  }
}
