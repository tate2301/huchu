import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { loadAsks } from "@/lib/teams/asks";

/** GET /api/teams/asks: the offers and seat requests waiting on the reader. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    return successResponse(await loadAsks(session.user.companyId, session.user.id));
  } catch (error) {
    return errorResponse("Could not load", 500, error instanceof Error ? error.message : undefined);
  }
}
