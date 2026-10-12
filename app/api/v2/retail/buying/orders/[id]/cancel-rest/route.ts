import { NextRequest, NextResponse } from "next/server";

import { fieldErrorResponse, successResponse } from "@/lib/api-response";
import { cancelRestSchema, issuesToFields } from "@/lib/retail/buying/order-input";
import { loadOrderView } from "@/lib/retail/buying/order-view";
import { cancelRest } from "@/lib/retail/buying/orders";
import { buyingActor, buyingFailure } from "@/lib/retail/buying/routes";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";

import { requireRetailSession } from "../../../../_helpers";

/** "Cancel what is left" (W-34): nothing more is expected and the supplier is asked to cancel the rest. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.purchasing", "update");
  if (gate) return gate;
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  const parsed = cancelRestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return fieldErrorResponse("Validation failed", issuesToFields(parsed.error));
  const actor = buyingActor(session);
  try {
    const done = await cancelRest(actor, path.data.id);
    return successResponse({ data: await loadOrderView(actor.companyId, done.id), message: done.message });
  } catch (error) {
    return buyingFailure(error, "POST /api/v2/retail/buying/orders/[id]/cancel-rest");
  }
}
