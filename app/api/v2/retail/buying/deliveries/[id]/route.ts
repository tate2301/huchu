import { NextRequest, NextResponse } from "next/server";

import { fieldErrorResponse, successResponse } from "@/lib/api-response";
import { changeDelivery } from "@/lib/retail/buying/deliveries";
import { deliveryPatchSchema } from "@/lib/retail/buying/delivery-input";
import { deliveryView } from "@/lib/retail/buying/delivery-view";
import { buyingActor, buyingFailure } from "@/lib/retail/buying/routes";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";

import { requireRetailSession } from "../../../_helpers";

type Params = { params: Promise<{ id: string }> };

/** The delivery record (40-buying 5.6). */
export async function GET(request: NextRequest, { params }: Params) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.purchasing", "view");
  if (gate) return gate;
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  try {
    return successResponse({ data: await deliveryView(buyingActor(session), path.data.id) });
  } catch (error) {
    return buyingFailure(error, "GET /api/v2/retail/buying/deliveries/[id]");
  }
}

/** One value on the rail: Note number, Driver, or Counted by while it waits to be checked. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.purchasing", "update");
  if (gate) return gate;
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  const parsed = deliveryPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fieldErrorResponse("Validation failed", { form: "Change one value at a time." });
  const actor = buyingActor(session);
  try {
    const { changed } = await changeDelivery(actor, path.data.id, parsed.data);
    return successResponse({ data: await deliveryView(actor, path.data.id), changed });
  } catch (error) {
    return buyingFailure(error, "PATCH /api/v2/retail/buying/deliveries/[id]");
  }
}
