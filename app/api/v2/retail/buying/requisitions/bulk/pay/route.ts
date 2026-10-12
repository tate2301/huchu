import { NextRequest, NextResponse } from "next/server";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { bulkPaySchema, requisitionIssues } from "@/lib/retail/buying/requisition-input";
import { loadRequisitionView } from "@/lib/retail/buying/requisition-view";
import { CANNOT_CHANGE, payOut } from "@/lib/retail/buying/requisitions";
import { buyingActor, buyingFailure } from "@/lib/retail/buying/routes";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";

import { requireRetailSession } from "../../../../_helpers";

/** The bulk "Pay out" sheet steps through the ticked ones; each step pays one, with its own amount, account and person. */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  if (!canRetailSessionDo(session, "retail.requisitions", "update")) return errorResponse(CANNOT_CHANGE, 403);
  const parsed = bulkPaySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return fieldErrorResponse("Validation failed", requisitionIssues(parsed.error));

  const actor = buyingActor(session);
  const { id, ...body } = parsed.data;
  try {
    const done = await payOut(actor, id, body, { requestUrl: request.url });
    const data = await loadRequisitionView(actor, id);
    return successResponse({ data, accountingStatus: done.accountingStatus, message: done.message });
  } catch (error) {
    return buyingFailure(error, "POST /api/v2/retail/buying/requisitions/bulk/pay");
  }
}
