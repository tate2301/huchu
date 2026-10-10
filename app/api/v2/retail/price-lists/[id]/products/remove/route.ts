import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { isPriceListId, parsePriceListBody, priceListActor, priceListFailure } from "@/lib/retail/price-lists/routes";
import { removeProductsFromList, removeProductsInput } from "@/lib/retail/prices/list-products";
import { requireRetailSession } from "../../../../_helpers";

type Params = { params: Promise<{ id: string }> };

/**
 * "Remove from this list" (PRD-07): the products leave the list, their price
 * history stays. The default list refuses (409). `retail.prices:update`.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.prices", "update");
  if (gate) return gate;

  const { id } = await params;
  if (!isPriceListId(id)) return errorResponse("Price list not found", 404);
  const parsed = await parsePriceListBody(request, removeProductsInput);
  if ("response" in parsed) return parsed.response;
  try {
    return successResponse(await removeProductsFromList(priceListActor(session), id, parsed.data.productIds));
  } catch (error) {
    return priceListFailure(error, "POST /api/v2/retail/price-lists/[id]/products/remove");
  }
}
