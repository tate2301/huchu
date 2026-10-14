import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { audienceFilter } from "@/lib/vane/status";
import { chooseForKind, chooseSchema } from "@/lib/vane/stops";

/**
 * Stop it for me (`stopped: true`) or Keep showing it (`stopped: false`), for
 * this card's kind and this person only. Everyone else still gets it.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;
    const body = chooseSchema.safeParse(await request.json().catch(() => ({})));
    if (!body.success) return errorResponse("Say whether to stop showing it", 400);
    const chosen = await chooseForKind(prisma, {
      companyId: session.user.companyId,
      userId: session.user.id,
      audience: audienceFilter(session.user.id, session.user.role),
      itemId: id,
      stopped: body.data.stopped,
    });
    if (!chosen) return errorResponse("That card is not yours to choose for", 404);
    return successResponse({ id, stopped: body.data.stopped });
  } catch (error) {
    console.error("[API] PUT /api/vane/items/[id]/stop error:", error);
    return errorResponse("Could not keep your choice");
  }
}
