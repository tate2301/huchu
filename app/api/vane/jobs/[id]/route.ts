import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { vaneJobView } from "@/lib/vane/pages";

/** One job given to Vane, and the plan it laid out once it has. Reading only. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;
    const job = await vaneJobView(prisma, {
      companyId: session.user.companyId,
      userId: session.user.id,
      role: session.user.role,
      id,
    });
    if (!job) return errorResponse("That job is not in this workspace", 404);
    return successResponse(job);
  } catch (error) {
    console.error("[API] GET /api/vane/jobs/[id] error:", error);
    return errorResponse("Could not read the job");
  }
}
