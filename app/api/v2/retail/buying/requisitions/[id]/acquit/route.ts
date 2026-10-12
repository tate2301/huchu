import { NextRequest, NextResponse } from "next/server";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { acquitSchema, requisitionIssues } from "@/lib/retail/buying/requisition-input";
import { loadRequisitionView } from "@/lib/retail/buying/requisition-view";
import { accountFor, CANNOT_CHANGE } from "@/lib/retail/buying/requisitions";
import { buyingActor, buyingFailure } from "@/lib/retail/buying/routes";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";

import { requireRetailSession } from "../../../../_helpers";

/** Account for a paid-out requisition: what was spent, the receipts, the change back (W-31 "Receipt attached"). The asker, or who may change requisitions. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  // The asker (anyone who may ask) for their own, or whoever may change requisitions; the service checks which.
  if (!canRetailSessionDo(session, "retail.requisitions", "create") && !canRetailSessionDo(session, "retail.requisitions", "update")) {
    return errorResponse(CANNOT_CHANGE, 403);
  }
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  const parsed = acquitSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return fieldErrorResponse("Validation failed", requisitionIssues(parsed.error));

  const actor = buyingActor(session);
  try {
    const done = await accountFor(actor, path.data.id, parsed.data, { requestUrl: request.url });
    const data = await loadRequisitionView(actor, path.data.id);
    return successResponse({ data, accountingStatus: done.accountingStatus, message: done.message });
  } catch (error) {
    return buyingFailure(error, "POST /api/v2/retail/buying/requisitions/[id]/acquit");
  }
}
