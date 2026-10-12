import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { loadRequisitionView } from "@/lib/retail/buying/requisition-view";
import { cancelRequisition } from "@/lib/retail/buying/requisitions";
import { buyingActor, buyingFailure } from "@/lib/retail/buying/routes";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";

import { requireRetailSession } from "../../../../_helpers";

/** Cancel it before it is paid out (W-72): the asker, or an owner or manager. No money moves. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  if (!canRetailSessionDo(session, "retail.requisitions", "create") && !canRetailSessionDo(session, "retail.requisitions", "update")) {
    return errorResponse("Your role cannot cancel requisitions", 403);
  }
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;

  const actor = buyingActor(session);
  try {
    const done = await cancelRequisition(actor, path.data.id, { requestUrl: request.url });
    const data = await loadRequisitionView(actor, path.data.id);
    return successResponse({ data, message: done.message });
  } catch (error) {
    return buyingFailure(error, "POST /api/v2/retail/buying/requisitions/[id]/cancel");
  }
}
