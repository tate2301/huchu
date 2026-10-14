import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { listVaneMuted } from "@/lib/vane/lists";
import { monthBounds } from "@/lib/vane/settings";
import { audienceFilter } from "@/lib/vane/status";
import { muteOffer } from "@/lib/vane/stops";

/**
 * The cards set aside with Not now, with the reason, who and when; and the
 * kind this person keeps setting aside, when Vane asks whether to stop
 * showing it to them.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const who = { companyId: session.user.companyId, userId: session.user.id, role: session.user.role };
    const [cards, offer] = await Promise.all([
      listVaneMuted(prisma, who),
      muteOffer(prisma, { ...who, audience: audienceFilter(who.userId, who.role) }, monthBounds().start),
    ]);
    return successResponse({ cards, offer });
  } catch (error) {
    console.error("[API] GET /api/vane/muted error:", error);
    return errorResponse("Could not read the muted cards");
  }
}
