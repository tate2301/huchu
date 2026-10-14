import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { vaneCardDetail } from "@/lib/vane/pages";

/** One card and what Vane read for it: the tables, the question it ran, and the draft it made, if any. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;
    const card = await vaneCardDetail(prisma, {
      companyId: session.user.companyId,
      userId: session.user.id,
      role: session.user.role,
      id,
    });
    if (!card) return errorResponse("That card is not one of yours", 404);
    return successResponse(card);
  } catch (error) {
    console.error("[API] GET /api/vane/items/[id] error:", error);
    return errorResponse("Could not read the card");
  }
}
