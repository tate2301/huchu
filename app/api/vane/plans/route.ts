import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { vanePlans } from "@/lib/vane/pages";

/** Vane's plans: the open ones due soonest first, then the ones finished this month. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    return successResponse({ plans: await vanePlans(prisma, session.user.companyId) });
  } catch (error) {
    console.error("[API] GET /api/vane/plans error:", error);
    return errorResponse("Could not read Vane's plans");
  }
}
