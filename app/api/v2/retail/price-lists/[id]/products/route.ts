import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { isPriceListId, parsePriceListBody, priceListActor, priceListFailure } from "@/lib/retail/price-lists/routes";
import { addProductsInput, addProductsToList } from "@/lib/retail/prices/list-products";
import { requireRetailSession } from "../../../_helpers";

type Params = { params: Promise<{ id: string }> };

/**
 * Add products to a price list (W-16, PRD-07): priced at its base, its base
 * less a percentage, or its base to set each one after; from a quantity.
 * Products already on it are skipped. `retail.prices:update`.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.prices", "update");
  if (gate) return gate;

  const { id } = await params;
  if (!isPriceListId(id)) return errorResponse("Price list not found", 404);
  const parsed = await parsePriceListBody(request, addProductsInput);
  if ("response" in parsed) return parsed.response;
  try {
    return successResponse(await addProductsToList(priceListActor(session), id, parsed.data));
  } catch (error) {
    return priceListFailure(error, "POST /api/v2/retail/price-lists/[id]/products");
  }
}
