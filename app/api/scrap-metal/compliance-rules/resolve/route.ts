import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { resolveScrapTicketComplianceRequirements } from "@/lib/scrap-metal/compliance-rules";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const direction = searchParams.get("direction");
    const materialId = searchParams.get("materialId");
    const category = searchParams.get("category");

    if (direction !== "INBOUND" && direction !== "OUTBOUND") {
      return errorResponse("direction must be INBOUND or OUTBOUND", 400);
    }

    const requirements = await resolveScrapTicketComplianceRequirements(prisma, {
      companyId: session.user.companyId,
      direction,
      materialId: materialId || null,
      category: category || null,
    });

    return successResponse(requirements);
  } catch (error) {
    console.error("[API] GET /api/scrap-metal/compliance-rules/resolve error:", error);
    return errorResponse("Failed to resolve scrap compliance requirements");
  }
}

