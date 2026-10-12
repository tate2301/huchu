import { NextRequest, NextResponse } from "next/server";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { issuesToFields, raiseSchema } from "@/lib/retail/buying/order-input";
import { loadOrderView } from "@/lib/retail/buying/order-view";
import { raiseOrder } from "@/lib/retail/buying/orders";
import { buyingActor, buyingFailure } from "@/lib/retail/buying/routes";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";

import { requireRetailSession } from "../../_helpers";

/**
 * Raise an order (W-30): a draft, or sent on WhatsApp or by email (or saved
 * to print when the supplier has neither). Owner and manager; a stock clerk
 * receives, they do not order.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  if (!canRetailSessionDo(session, "retail.purchasing", "create")) return errorResponse("Your role cannot create purchase orders", 403);

  const parsed = raiseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fieldErrorResponse("Validation failed", issuesToFields(parsed.error));

  const actor = buyingActor(session);
  try {
    const raised = await raiseOrder(actor, parsed.data, { requestUrl: request.url });
    const data = await loadOrderView(actor.companyId, raised.id);
    return successResponse(
      {
        data,
        message: raised.status === "DRAFT" ? `${raised.poNo} saved as a draft.` : null,
        sentVia: raised.sentVia,
        messages: raised.messages.map((message) => ({ id: message.id, to: message.to, channel: message.channel })),
      },
      201,
    );
  } catch (error) {
    return buyingFailure(error, "POST /api/v2/retail/buying/orders");
  }
}
