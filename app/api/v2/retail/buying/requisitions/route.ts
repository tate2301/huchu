import { NextRequest, NextResponse } from "next/server";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { askSchema, requisitionIssues } from "@/lib/retail/buying/requisition-input";
import { askForMoney } from "@/lib/retail/buying/requisitions";
import { buyingActor, buyingFailure } from "@/lib/retail/buying/routes";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";

import { requireRetailSession } from "../../_helpers";

/**
 * Ask for money (W-31, W-32): for an order or an expense, sent for approval
 * at once. Everyone on staff may ask; who decides it is told.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  if (!canRetailSessionDo(session, "retail.requisitions", "create")) return errorResponse("Your role cannot create requisitions", 403);

  const parsed = askSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fieldErrorResponse("Validation failed", requisitionIssues(parsed.error));

  try {
    const asked = await askForMoney(buyingActor(session), parsed.data, { requestUrl: request.url });
    return successResponse({ data: { id: asked.id, requisitionNo: asked.requisitionNo, waitsFor: asked.waitsFor }, message: asked.message }, 201);
  } catch (error) {
    return buyingFailure(error, "POST /api/v2/retail/buying/requisitions");
  }
}
