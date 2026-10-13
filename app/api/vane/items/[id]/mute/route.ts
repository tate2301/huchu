import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { muteVaneItem } from "@/lib/vane/panel";

const bodySchema = z.object({ reason: z.string().trim().max(500).optional() });

/** Not now: the card leaves For you and goes to Muted, with the reason if given. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;
    const body = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!body.success) return errorResponse("The reason is too long", 400);
    const muted = await muteVaneItem(prisma, {
      companyId: session.user.companyId,
      userId: session.user.id,
      role: session.user.role,
      id,
      reason: body.data.reason,
    });
    if (!muted) return errorResponse("That card is not open any more", 404);
    return successResponse({ id, status: "muted" });
  } catch (error) {
    console.error("[API] POST /api/vane/items/[id]/mute error:", error);
    return errorResponse("Could not move the card to Muted");
  }
}
