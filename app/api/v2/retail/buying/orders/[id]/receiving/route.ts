import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { receivingView } from "@/lib/retail/buying/delivery-view";
import { buyingActor, buyingFailure } from "@/lib/retail/buying/routes";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";

import { requireRetailSession } from "../../../../_helpers";

type Params = { params: Promise<{ id: string }> };

/** What the Receive page draws for an order (40-buying 5.7); 409 with the sentence when nothing can come against it. */
export async function GET(request: NextRequest, { params }: Params) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.purchasing", "receive");
  if (gate) return gate;
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  try {
    return successResponse({ data: await receivingView(buyingActor(session), path.data.id) });
  } catch (error) {
    return buyingFailure(error, "GET /api/v2/retail/buying/orders/[id]/receiving");
  }
}
