import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { unmuteVaneItem } from "@/lib/vane/lists";

/** Bring back: a muted card goes back to For you. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;
    const back = await unmuteVaneItem(prisma, {
      companyId: session.user.companyId,
      userId: session.user.id,
      role: session.user.role,
      id,
    });
    if (!back) return errorResponse("That card is not in Muted any more", 404);
    return successResponse({ id, status: "open" });
  } catch (error) {
    console.error("[API] POST /api/vane/items/[id]/unmute error:", error);
    return errorResponse("Could not bring the card back");
  }
}
