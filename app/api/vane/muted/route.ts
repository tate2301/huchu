import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { listVaneMuted } from "@/lib/vane/lists";

/** The cards set aside with Not now, with the reason, who and when. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    return successResponse({
      cards: await listVaneMuted(prisma, { companyId: session.user.companyId, userId: session.user.id, role: session.user.role }),
    });
  } catch (error) {
    console.error("[API] GET /api/vane/muted error:", error);
    return errorResponse("Could not read the muted cards");
  }
}
