import { NextRequest, NextResponse } from "next/server";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { changeSchema, issuesToFields } from "@/lib/retail/buying/order-input";
import { loadOrderView } from "@/lib/retail/buying/order-view";
import { changeOrder } from "@/lib/retail/buying/orders";
import { buyingActor, buyingFailure } from "@/lib/retail/buying/routes";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";

import { requireRetailSession } from "../../../_helpers";

type Params = { params: Promise<{ id: string }> };

/** An order's record (5.4). A binned draft still opens, for the bin banner. */
export async function GET(request: NextRequest, { params }: Params) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.purchasing", "view");
  if (gate) return gate;
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  const data = await loadOrderView(session.user.companyId, path.data.id);
  if (!data) return errorResponse("Order not found", 404);
  return successResponse({ data });
}

/**
 * Edit lines (the sheet: lines, expected, site, with or without telling the
 * supplier) or one field from the rail (expected, site, supplier on a draft,
 * how it is paid).
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.purchasing", "update");
  if (gate) return gate;
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;

  const parsed = changeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fieldErrorResponse("Validation failed", issuesToFields(parsed.error));

  const actor = buyingActor(session);
  try {
    const changed = await changeOrder(actor, path.data.id, parsed.data, { requestUrl: request.url });
    const data = await loadOrderView(actor.companyId, changed.id);
    const message = changed.told ? `${changed.poNo} changed. ${changed.supplier.split(/\s+/)[0]} has the new order.` : `${changed.poNo} changed.`;
    return successResponse({ data, changed: changed.changes, message });
  } catch (error) {
    return buyingFailure(error, "PATCH /api/v2/retail/buying/orders/[id]");
  }
}
