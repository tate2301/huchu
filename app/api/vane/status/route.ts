import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { vaneStatus } from "@/lib/vane/status";

/** The Vane button's count, whether it is working, and its state. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    return successResponse(
      await vaneStatus(prisma, { companyId: session.user.companyId, userId: session.user.id, role: session.user.role }),
    );
  } catch (error) {
    console.error("[API] GET /api/vane/status error:", error);
    return errorResponse("Could not read Vane's state");
  }
}
