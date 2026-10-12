import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { duplicateOrder } from "@/lib/retail/buying/orders";
import { buyingActor, buyingFailure } from "@/lib/retail/buying/routes";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";

import { requireRetailSession } from "../../../../_helpers";

/** "Duplicate order": a new draft of the same products at today's costs. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  if (!canRetailSessionDo(session, "retail.purchasing", "create")) return errorResponse("Your role cannot create purchase orders", 403);
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  try {
    const made = await duplicateOrder(buyingActor(session), path.data.id, { requestUrl: request.url });
    return successResponse({ data: { id: made.id, poNo: made.poNo }, message: `${made.poNo} made from ${made.from}. Check it and send.` }, 201);
  } catch (error) {
    return buyingFailure(error, "POST /api/v2/retail/buying/orders/[id]/duplicate");
  }
}
