import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { listVanePlans } from "@/lib/vane/lists";

/** Vane's plans and their steps: open ones first, then those finished in the last 30 days. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    return successResponse({ plans: await listVanePlans(prisma, { companyId: session.user.companyId, userId: session.user.id }) });
  } catch (error) {
    console.error("[API] GET /api/vane/plans error:", error);
    return errorResponse("Could not read Vane's plans");
  }
}
