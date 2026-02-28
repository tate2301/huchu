import { NextRequest, NextResponse } from "next/server";
import { errorResponse, validateSession } from "@/lib/api-utils";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { id } = await params;
    return errorResponse(
      `Refund settlement is not enabled yet for request ${id}.`,
      501,
    );
  } catch (error) {
    console.error("[API] POST /api/v2/schools/finance/refunds/[id]/pay error:", error);
    return errorResponse("Failed to settle refund request");
  }
}

