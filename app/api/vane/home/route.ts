import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { vaneForYou } from "@/lib/vane/pages";

/** `/vane`: For you across every module (or one, with `?module=`), what Vane is doing, and its state. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const sourceModule = new URL(request.url).searchParams.get("module")?.trim() || null;
    return successResponse(
      await vaneForYou(prisma, {
        companyId: session.user.companyId,
        userId: session.user.id,
        role: session.user.role,
        module: sourceModule,
      }),
    );
  } catch (error) {
    console.error("[API] GET /api/vane/home error:", error);
    return errorResponse("Could not read what Vane has for you");
  }
}
