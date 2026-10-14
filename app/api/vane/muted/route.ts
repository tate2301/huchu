import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { listVaneMuted } from "@/lib/vane/lists";
import { monthBounds } from "@/lib/vane/settings";
import { stopOffers, stoppedTopics } from "@/lib/vane/topics";

/**
 * The cards set aside with Not now, with the reason, who and when; the
 * topics this person set aside often enough this month for Vane to offer to
 * stop them; and the topics they stopped.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const who = { companyId: session.user.companyId, userId: session.user.id };
    const [cards, offers, stopped] = await Promise.all([
      listVaneMuted(prisma, { ...who, role: session.user.role }),
      stopOffers(prisma, who, monthBounds().start),
      stoppedTopics(prisma, who),
    ]);
    return successResponse({ cards, offers, stopped });
  } catch (error) {
    console.error("[API] GET /api/vane/muted error:", error);
    return errorResponse("Could not read the muted cards");
  }
}
