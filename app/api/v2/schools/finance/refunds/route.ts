import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    return successResponse({
      success: true,
      data: {
        resource: "schools-finance-refunds",
        companyId: session.user.companyId,
        data: [],
      },
    });
  } catch (error) {
    console.error("[API] GET /api/v2/schools/finance/refunds error:", error);
    return errorResponse("Failed to fetch refunds");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    return errorResponse(
      "Refund workflow is not enabled yet for this tenant. Use waivers or write-offs for current cycle corrections.",
      501,
    );
  } catch (error) {
    console.error("[API] POST /api/v2/schools/finance/refunds error:", error);
    return errorResponse("Failed to create refund request");
  }
}

