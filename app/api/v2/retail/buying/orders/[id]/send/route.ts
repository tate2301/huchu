import { NextRequest, NextResponse } from "next/server";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { issuesToFields, sendSchema } from "@/lib/retail/buying/order-input";
import { loadOrderView } from "@/lib/retail/buying/order-view";
import { sendOrder } from "@/lib/retail/buying/orders";
import { buyingActor, buyingFailure } from "@/lib/retail/buying/routes";
import { sentWords } from "@/lib/retail/buying/words";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";

import { requireRetailSession } from "../../../../_helpers";

/** "Send to Delta": a draft goes to its supplier, the way the supplier takes orders. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  if (!canRetailSessionDo(session, "retail.purchasing", "create")) return errorResponse("Your role cannot create purchase orders", 403);
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  const parsed = sendSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return fieldErrorResponse("Validation failed", issuesToFields(parsed.error));

  const actor = buyingActor(session);
  try {
    const sent = await sendOrder(actor, path.data.id, parsed.data.via ?? null, { requestUrl: request.url });
    const data = await loadOrderView(actor.companyId, sent.id);
    return successResponse({
      data,
      message: sentWords(sent.poNo, sent.supplier, sent.sentVia),
      messages: sent.messages.map((message) => ({ id: message.id, to: message.to, channel: message.channel })),
    });
  } catch (error) {
    return buyingFailure(error, "POST /api/v2/retail/buying/orders/[id]/send");
  }
}
