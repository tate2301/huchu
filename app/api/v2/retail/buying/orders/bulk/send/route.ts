import { NextRequest, NextResponse } from "next/server";

import { fieldErrorResponse, successResponse } from "@/lib/api-response";
import { bulkOrdersSchema, issuesToFields } from "@/lib/retail/buying/order-input";
import { sendOrders } from "@/lib/retail/buying/orders";
import { buyingActor, buyingFailure } from "@/lib/retail/buying/routes";
import { requireRetailPermission } from "@/lib/retail/permissions";

import { requireRetailSession } from "../../../../_helpers";

/** Orders' bulk "Send to suppliers": each ticked draft with lines goes to its supplier. */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.purchasing", "create");
  if (gate) return gate;
  const parsed = bulkOrdersSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return fieldErrorResponse("Validation failed", issuesToFields(parsed.error));
  try {
    const done = await sendOrders(buyingActor(session), parsed.data.ids, { requestUrl: request.url });
    return successResponse({ sent: done.sent, skipped: done.skipped, message: done.message });
  } catch (error) {
    return buyingFailure(error, "POST /api/v2/retail/buying/orders/bulk/send");
  }
}
