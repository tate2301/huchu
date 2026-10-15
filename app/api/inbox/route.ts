import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { listInbox, parseInboxFilters } from "@/lib/inbox/query";

/**
 * The reader's notifications as rows: `?view=needs|mentions|all`, `?module=`,
 * `?page=`. Each row says what it concerns, read from the record now.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { view, module, page, limit } = parseInboxFilters(request.nextUrl.searchParams);
    const result = await listInbox({
      userId: session.user.id,
      companyId: session.user.companyId,
      viewerName: session.user.name ?? null,
      filters: { view, module },
      page,
      limit,
    });
    return successResponse(result);
  } catch (error) {
    console.error("[API] GET /api/inbox error:", error);
    return errorResponse("Failed to load notifications");
  }
}
