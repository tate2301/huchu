import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { askContext } from "@/lib/retail/buying/requisitions";
import { buyingActor } from "@/lib/retail/buying/routes";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";

import { requireRetailSession } from "../../../_helpers";

/**
 * What "Ask for money" starts from (5.18): the owner limit and approver for
 * the note, the first cash account, the order's total and expected day
 * (`?orderId=`), and a rejected one's values (`?from=`, "Change and ask again").
 */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  if (!canRetailSessionDo(session, "retail.requisitions", "create")) return errorResponse("Your role cannot create requisitions", 403);
  const params = request.nextUrl.searchParams;
  const uuid = (value: string | null) => (value && /^[0-9a-f-]{36}$/i.test(value) ? value : null);
  try {
    const data = await askContext(buyingActor(session), { orderId: uuid(params.get("orderId")), from: uuid(params.get("from")) });
    return successResponse({ data });
  } catch (error) {
    console.error("[API] GET /api/v2/retail/buying/requisitions/new error:", error);
    return errorResponse("That could not be read. Close it and try again.");
  }
}
