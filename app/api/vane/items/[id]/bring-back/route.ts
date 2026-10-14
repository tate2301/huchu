import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { audienceFilter } from "@/lib/vane/status";
import { bringBack } from "@/lib/vane/stops";

/** Bring back: a set-aside card goes back to For you, and its kind shows again to the person who stopped it. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;
    const back = await bringBack(prisma, {
      companyId: session.user.companyId,
      userId: session.user.id,
      audience: audienceFilter(session.user.id, session.user.role),
      itemId: id,
    });
    if (!back) return errorResponse("That card is not set aside any more", 404);
    return successResponse({ id, status: "open" });
  } catch (error) {
    console.error("[API] POST /api/vane/items/[id]/bring-back error:", error);
    return errorResponse("Could not bring the card back");
  }
}
