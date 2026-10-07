import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { parsePriceListBody, priceListActor, priceListFailure } from "@/lib/retail/price-lists/routes";
import { createPriceList, priceListInput } from "@/lib/retail/price-lists/service";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../_helpers";

/**
 * Add a price list (PRD-05, W-16): `retail.prices:create` (Owner, Manager).
 * Starts from another list or the cost, less or plus a percentage, with its
 * rules; the server puts every product it takes on it with an ADDED history.
 * 400 `fieldErrors` under name, by, hours, between, siteId, categoryIds.
 * Reading the lists is the `retail-price-lists` list source.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.prices", "create");
  if (gate) return gate;

  const parsed = await parsePriceListBody(request, priceListInput);
  if ("response" in parsed) return parsed.response;
  try {
    return successResponse(await createPriceList(priceListActor(session), parsed.data), 201);
  } catch (error) {
    return priceListFailure(error, "POST /api/v2/retail/price-lists");
  }
}
