import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse } from "@corelithzw/platform/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";
import { getRetailSetupSnapshot } from "@/lib/retail/setup-snapshot";

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  // R-2.3. Setup is the shop's configuration, not a cashier's business.
  const gate = requireRetailPermission(session, "retail.setup", "view");
  if (gate) return gate;

  try {
    const snapshot = await getRetailSetupSnapshot(session.user.companyId);
    return successResponse(snapshot);
  } catch (error) {
    console.error("[API] GET /api/v2/retail/setup/overview error:", error);
    return errorResponse("Failed to fetch retail setup overview");
  }
}

