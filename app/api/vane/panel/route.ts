import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { vanePanel } from "@/lib/vane/panel";
import { startOfWorkspaceDay } from "@/lib/vane/status";

/**
 * The Vane panel: its state, For you (this module's cards first), plans, and
 * what it did in the last day. `?today=1` is For you on `/vane`: what it did
 * since the workspace's day began.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const params = new URL(request.url).searchParams;
    const sourceModule = params.get("module");
    return successResponse(
      await vanePanel(prisma, {
        companyId: session.user.companyId,
        userId: session.user.id,
        role: session.user.role,
        module: sourceModule,
        doneSince: params.get("today") === "1" ? startOfWorkspaceDay(new Date()) : undefined,
      }),
    );
  } catch (error) {
    console.error("[API] GET /api/vane/panel error:", error);
    return errorResponse("Could not read Vane's panel");
  }
}
