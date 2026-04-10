import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { requireRetailSession } from "../../_helpers";
import { getRetailSetupSnapshot } from "@/lib/retail/setup-snapshot";

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  try {
    const snapshot = await getRetailSetupSnapshot(session.user.companyId);
    return successResponse(snapshot);
  } catch (error) {
    console.error("[API] GET /api/v2/retail/setup/overview error:", error);
    return errorResponse("Failed to fetch retail setup overview");
  }
}

