import { NextRequest, NextResponse } from "next/server";

import { fieldErrorResponse, successResponse } from "@/lib/api-response";
import { bulkOrdersSchema, issuesToFields } from "@/lib/retail/buying/order-input";
import { cancelOrders } from "@/lib/retail/buying/orders";
import { buyingActor, buyingFailure } from "@/lib/retail/buying/routes";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";
import { requireRetailPermission } from "@/lib/retail/permissions";

import { requireRetailSession } from "../../../../_helpers";

/**
 * Orders' bulk "Cancel": drafts to the bin (which also needs the right to
 * remove orders), what is left of sent ones cancelled, done ones left alone.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.purchasing", "update");
  if (gate) return gate;
  const parsed = bulkOrdersSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return fieldErrorResponse("Validation failed", issuesToFields(parsed.error));
  try {
    const done = await cancelOrders(buyingActor(session), parsed.data.ids, {
      canRemoveDrafts: canRetailSessionDo(session, "retail.purchasing", "delete"),
    });
    return successResponse({ binned: done.binned, cancelled: done.cancelled, skipped: done.skipped, message: done.message });
  } catch (error) {
    return buyingFailure(error, "POST /api/v2/retail/buying/orders/bulk/cancel");
  }
}
