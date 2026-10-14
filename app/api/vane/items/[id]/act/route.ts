import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { actOnVaneItem } from "@/lib/vane/panel";

/** The person pressed the card's act: it goes to Done with their name. The act itself is done on its own page. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;
    const done = await actOnVaneItem(prisma, {
      companyId: session.user.companyId,
      userId: session.user.id,
      role: session.user.role,
      id,
    });
    if (!done) return errorResponse("That card is not open any more", 404);
    return successResponse({ id, status: "done" });
  } catch (error) {
    console.error("[API] POST /api/vane/items/[id]/act error:", error);
    return errorResponse("Could not record the card as taken further");
  }
}
