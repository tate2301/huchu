import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { vaneNav } from "@/lib/vane/pages";

/** Vane's panel: the counts beside For you, Working on, Plans, Done and Muted, and what it watches. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    return successResponse(
      await vaneNav(prisma, {
        companyId: session.user.companyId,
        userId: session.user.id,
        role: session.user.role,
        enabledFeatures: session.user.enabledFeatures,
      }),
    );
  } catch (error) {
    console.error("[API] GET /api/vane/nav error:", error);
    return errorResponse("Could not read Vane's panel");
  }
}
