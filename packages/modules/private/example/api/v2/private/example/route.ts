import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";

/**
 * A client module's route reads the session through the kernel, never a
 * host's `authOptions`: composed into `apps/enterprise-<client>`, it answers
 * on `/api/v2/private/example` for that client's tenants and nobody else's.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    return successResponse({ module: "private-example", companyId: session.user.companyId });
  } catch (error) {
    console.error("[API] GET /api/v2/private/example error:", error);
    return errorResponse("Failed to read the example module");
  }
}
