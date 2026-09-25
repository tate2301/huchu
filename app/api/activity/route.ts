import { NextRequest, NextResponse } from "next/server";

import { listActivity, parseActivityFilters } from "@/lib/activity/query";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { isOrgAdminRole } from "@/lib/preferences/nav";

/**
 * The workspace's activity log: who changed what, newest first, one page at a
 * time. `?cursor=` continues from the last page's `nextCursor`; the filters
 * are `actorId`, `module`, `action`, `from`, `to`, `q`, and `entityType` with
 * `entityId` for one record's trail.
 *
 * Managers and superadmins only. The log covers every module, so it answers
 * to the same people who administer the workspace, not to a module's role.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!isOrgAdminRole(session.user.role)) {
      return errorResponse("Only managers can review the activity log", 403);
    }

    const params = request.nextUrl.searchParams;
    const page = await listActivity({
      companyId: session.user.companyId,
      filters: parseActivityFilters(params),
      cursor: params.get("cursor"),
    });
    return successResponse(page);
  } catch (error) {
    console.error("[API] GET /api/activity error:", error);
    return errorResponse("Failed to load activity");
  }
}
