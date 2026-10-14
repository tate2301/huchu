import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { listVaneWorking } from "@/lib/vane/lists";

/** What Vane is working on: running now, queued, and waiting to try again. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    return successResponse({ jobs: await listVaneWorking(prisma, { companyId: session.user.companyId, userId: session.user.id }) });
  } catch (error) {
    console.error("[API] GET /api/vane/working error:", error);
    return errorResponse("Could not read what Vane is working on");
  }
}
