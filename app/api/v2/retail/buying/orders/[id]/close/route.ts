import { NextRequest, NextResponse } from "next/server";

import { fieldErrorResponse, successResponse } from "@/lib/api-response";
import { closeSchema, issuesToFields } from "@/lib/retail/buying/order-input";
import { loadOrderView } from "@/lib/retail/buying/order-view";
import { closeOrder, reopenOrder } from "@/lib/retail/buying/orders";
import { buyingActor, buyingFailure } from "@/lib/retail/buying/routes";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";

import { requireRetailSession } from "../../../../_helpers";

type Params = { params: Promise<{ id: string }> };

/** "Close with what came" (W-70): what is still owed stops being expected. */
export async function POST(request: NextRequest, { params }: Params) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.purchasing", "update");
  if (gate) return gate;
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  const parsed = closeSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return fieldErrorResponse("Validation failed", issuesToFields(parsed.error));
  const actor = buyingActor(session);
  try {
    const closed = await closeOrder(actor, path.data.id, parsed.data.note ?? null);
    return successResponse({ data: await loadOrderView(actor.companyId, path.data.id), message: closed.message });
  } catch (error) {
    return buyingFailure(error, "POST /api/v2/retail/buying/orders/[id]/close");
  }
}

/** "Reopen the order": what was left is expected again. */
export async function DELETE(request: NextRequest, { params }: Params) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.purchasing", "update");
  if (gate) return gate;
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  const actor = buyingActor(session);
  try {
    const reopened = await reopenOrder(actor, path.data.id);
    return successResponse({ data: await loadOrderView(actor.companyId, path.data.id), message: reopened.message });
  } catch (error) {
    return buyingFailure(error, "DELETE /api/v2/retail/buying/orders/[id]/close");
  }
}
