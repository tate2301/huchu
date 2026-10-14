import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { vaneOrders } from "@/lib/retail/buying/vane-orders";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";

import { requireRetailSession } from "../../../_helpers";

/** Orders Vane drafted, waiting to be sent, and the latest others (PageVaneRetail). Read only. */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  if (!canRetailSessionDo(session, "retail.purchasing", "view")) return errorResponse("Your role cannot see purchase orders", 403);
  try {
    return successResponse(await vaneOrders(session.user.companyId));
  } catch (error) {
    console.error("[API] GET /api/v2/retail/buying/orders/vane error:", error);
    return errorResponse("Could not read the orders", 500);
  }
}
