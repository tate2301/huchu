import { NextRequest, NextResponse } from "next/server";
import { errorResponse, validateSession } from "@/lib/api-utils";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { buildV2CollectionResponse } from "../_shared";

/**
 * A stub. It authenticates, then answers with an empty collection.
 *
 * R-2.3 gates it anyway. The handler returns no rows today, so the gate protects
 * nothing — which is exactly why it is here: this is the shape every other v2
 * collection route grew into, and the day somebody fills this one in, the door
 * should already be the right shape rather than something to remember.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;

    const gate = requireRetailPermission(sessionResult.session, "retail.sell", "view");
    if (gate) return gate;

    return await buildV2CollectionResponse(request, "pos");
  } catch (error) {
    console.error("[API] GET /api/v2/pos error:", error);
    return errorResponse("Failed to fetch pos v2 data");
  }
}
