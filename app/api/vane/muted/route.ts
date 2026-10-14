import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { vaneMuted } from "@/lib/vane/pages";

/** The cards people set aside, with the reason each gave. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    return successResponse({
      rows: await vaneMuted(prisma, { companyId: session.user.companyId, userId: session.user.id, role: session.user.role }),
    });
  } catch (error) {
    console.error("[API] GET /api/vane/muted error:", error);
    return errorResponse("Could not read what was set aside");
  }
}
