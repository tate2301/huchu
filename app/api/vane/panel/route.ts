import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { vanePanel } from "@/lib/vane/panel";

/** The Vane panel: its state, For you (this module's cards first), plans, and what it did today. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const sourceModule = new URL(request.url).searchParams.get("module");
    return successResponse(
      await vanePanel(prisma, {
        companyId: session.user.companyId,
        userId: session.user.id,
        role: session.user.role,
        module: sourceModule,
      }),
    );
  } catch (error) {
    console.error("[API] GET /api/vane/panel error:", error);
    return errorResponse("Could not read Vane's panel");
  }
}
