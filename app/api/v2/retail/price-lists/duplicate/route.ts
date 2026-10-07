import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { parsePriceListBody, priceListActor, priceListFailure } from "@/lib/retail/price-lists/routes";
import { duplicatePriceLists, priceListIdsInput } from "@/lib/retail/price-lists/service";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";

/** Bulk "Duplicate" (PRD-05): a draft "<name> (copy)" of each, rules and prices kept. `retail.prices:create`. */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.prices", "create");
  if (gate) return gate;

  const parsed = await parsePriceListBody(request, priceListIdsInput);
  if ("response" in parsed) return parsed.response;
  try {
    const created = await duplicatePriceLists(priceListActor(session), parsed.data.ids);
    return successResponse({ created });
  } catch (error) {
    return priceListFailure(error, "POST /api/v2/retail/price-lists/duplicate");
  }
}
