import { NextRequest, NextResponse } from "next/server";

import { fieldErrorResponse, successResponse } from "@/lib/api-response";
import { chaseSchema, issuesToFields } from "@/lib/retail/buying/order-input";
import { loadOrderView } from "@/lib/retail/buying/order-view";
import { chaseOrder } from "@/lib/retail/buying/orders";
import { buyingActor, buyingFailure } from "@/lib/retail/buying/routes";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";

import { requireRetailSession } from "../../../../_helpers";

/** "Send a reminder" (W-34): the message to the supplier, and the day they promise moves the expected date. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.purchasing", "update");
  if (gate) return gate;
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  const parsed = chaseSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return fieldErrorResponse("Validation failed", issuesToFields(parsed.error));
  const actor = buyingActor(session);
  try {
    const chased = await chaseOrder(actor, path.data.id, parsed.data);
    return successResponse({ data: await loadOrderView(actor.companyId, chased.id), message: { id: chased.message.id }, toast: chased.toast });
  } catch (error) {
    return buyingFailure(error, "POST /api/v2/retail/buying/orders/[id]/chase");
  }
}
