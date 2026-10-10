import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { listWaiting } from "@/lib/retail/approvals/providers";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";

/**
 * "Waiting now" on Approvals (80-admin 4.2, W-58): what waits for a yes,
 * oldest first, five at most, and how many more. `retail.approvals:view`;
 * each area's items only for a caller who may approve them.
 */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.approvals", "view");
  if (gate) return gate;

  try {
    return successResponse(
      await listWaiting({ companyId: session.user.companyId, userId: session.user.id, session, now: new Date() }),
    );
  } catch (error) {
    console.error("[API] GET /api/v2/retail/approvals/waiting error:", error);
    return errorResponse("What is waiting did not load");
  }
}
