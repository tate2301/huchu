import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { checkAndSubscribe } from "@/lib/crm/facebook/connections";

import { requireCrmCapability } from "../../../../_helpers";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Prove the saved credentials work, and subscribe the Page to `leadgen`.
 *
 * Separate from create/update because the Meta side has to exist first: the
 * callback URL and verify token are generated here and pasted there, and the
 * Page cannot be subscribed to an app whose webhook is not configured yet.
 * This is the button pressed after that, and the only thing that turns a
 * configured connection into a working one.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!(await requireCrmCapability(session, "settings.manage"))) {
      return errorResponse("Manager access required", 403);
    }

    const { id } = await params;
    const result = await checkAndSubscribe(id, session.user.companyId);
    if (!result.ok) {
      return successResponse(result, 200);
    }
    return successResponse(result);
  } catch (error) {
    console.error("[API] POST /api/v2/crm/integrations/facebook/[id]/verify error:", error);
    return errorResponse("Failed to check the connection");
  }
}
