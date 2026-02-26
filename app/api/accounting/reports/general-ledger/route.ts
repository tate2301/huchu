import { NextRequest, NextResponse } from "next/server";
import { errorResponse, getPaginationParams, successResponse, validateSession } from "@/lib/api-utils";
import { getGeneralLedger } from "@/lib/accounting/ledger";

function parseDateParam(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { page, limit, skip } = getPaginationParams(request);

    const { searchParams } = new URL(request.url);
    const startDate = parseDateParam(searchParams.get("startDate"));
    const endDate = parseDateParam(searchParams.get("endDate"));
    const accountId = searchParams.get("accountId");
    const periodId = searchParams.get("periodId");

    if ((searchParams.get("startDate") && !startDate) || (searchParams.get("endDate") && !endDate)) {
      return errorResponse("Invalid date range", 400);
    }

    const result = await getGeneralLedger({
      companyId: session.user.companyId,
      startDate,
      endDate,
      accountId: accountId || null,
      periodId: periodId || null,
      skip,
      take: limit,
    });

    return successResponse({
      data: result.rows,
      pagination: {
        page,
        limit,
        total: result.total,
        pages: Math.ceil(result.total / limit),
        hasMore: page * limit < result.total,
      },
    });
  } catch (error) {
    console.error("[API] GET /api/accounting/reports/general-ledger error:", error);
    return errorResponse("Failed to fetch general ledger");
  }
}

