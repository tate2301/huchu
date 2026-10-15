import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { getInboxDetail } from "@/lib/inbox/query";

/** One of the reader's notifications, opened: the record's facts, what changed, the thread, the one action. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const detail = await getInboxDetail({
      userId: session.user.id,
      companyId: session.user.companyId,
      viewerName: session.user.name ?? null,
      id,
    });
    if (!detail) return errorResponse("That notification is not yours, or it no longer exists", 404);
    return successResponse(detail);
  } catch (error) {
    console.error("[API] GET /api/inbox/[id] error:", error);
    return errorResponse("Failed to load the notification");
  }
}
