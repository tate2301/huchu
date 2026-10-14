import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { explainView } from "@/lib/vane/explain";

/** A figure this person asked Vane to explain: the answer, the rows it rests on and the SQL, or where it stands. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;
    const view = await explainView(prisma, { companyId: session.user.companyId, userId: session.user.id, id });
    if (!view) return errorResponse("That question is not one you asked", 404);
    return successResponse(view);
  } catch (error) {
    console.error("[API] GET /api/vane/jobs/[id] error:", error);
    return errorResponse("Could not read Vane's answer");
  }
}
