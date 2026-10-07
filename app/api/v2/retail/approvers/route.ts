import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse } from "@/lib/api-response";
import { listApprovers } from "@/lib/retail/approvers";
import { canRetailSessionDo, RETAIL_ACTIONS, RETAIL_RESOURCES, type RetailAction, type RetailResource } from "@/lib/retail/permission-matrix";
import { requireRetailSession } from "../_helpers";

/**
 * `GET /api/v2/retail/approvers?can=retail.cash-control:approve` (FLR-03): who
 * can approve that act with their till PIN, for a sheet's Manager PIN field.
 * Any retail session may ask: the names are who to call over, not a record.
 */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }
  if (!RETAIL_RESOURCES.some((resource) => canRetailSessionDo(session, resource, "view"))) {
    return errorResponse("Your role cannot use retail", 403);
  }
  const [resource, action] = (new URL(request.url).searchParams.get("can") ?? "").split(":");
  if (!(RETAIL_RESOURCES as readonly string[]).includes(resource ?? "") || !(RETAIL_ACTIONS as readonly string[]).includes(action ?? "")) {
    return errorResponse("Say which right, like retail.cash-control:approve.", 400);
  }
  return successResponse({ data: await listApprovers(session.user.companyId, [resource as RetailResource, action as RetailAction]) });
}
