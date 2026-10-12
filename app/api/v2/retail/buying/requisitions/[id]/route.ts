import { NextRequest, NextResponse } from "next/server";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { patchSchema, requisitionIssues } from "@/lib/retail/buying/requisition-input";
import { loadRequisitionView } from "@/lib/retail/buying/requisition-view";
import { changeRequisition } from "@/lib/retail/buying/requisitions";
import { buyingActor, buyingFailure } from "@/lib/retail/buying/routes";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";

import { requireRetailSession } from "../../../_helpers";

type Params = { params: Promise<{ id: string }> };

/** A requisition's record (5.9). A cashier or stock clerk reads only their own; another's is not found. */
export async function GET(request: NextRequest, { params }: Params) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  if (!canRetailSessionDo(session, "retail.requisitions", "view") && !canRetailSessionDo(session, "retail.requisitions", "view-own")) {
    return errorResponse("Your role cannot view requisitions", 403);
  }
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  const data = await loadRequisitionView(buyingActor(session), path.data.id);
  if (!data) return errorResponse("Requisition not found", 404);
  return successResponse({ data });
}

/** One value from the rail, by the asker or a manager, while it waits (Pay from also once approved). */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  if (!canRetailSessionDo(session, "retail.requisitions", "view") && !canRetailSessionDo(session, "retail.requisitions", "view-own")) {
    return errorResponse("Your role cannot change requisitions", 403);
  }
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fieldErrorResponse("Validation failed", requisitionIssues(parsed.error, false));

  const actor = buyingActor(session);
  try {
    const changed = await changeRequisition(actor, path.data.id, parsed.data);
    const data = await loadRequisitionView(actor, changed.id);
    return successResponse({ data, changed: changed.changes, message: `${changed.requisitionNo} changed.` });
  } catch (error) {
    return buyingFailure(error, "PATCH /api/v2/retail/buying/requisitions/[id]");
  }
}
