import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { parsePriceListBody, priceListActor, priceListFailure } from "@/lib/retail/price-lists/routes";
import { priceListIdsInput, setPriceListsState } from "@/lib/retail/price-lists/service";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";

/** Bulk and row "Switch on" (PRD-05): tills pick them up within a minute. `retail.prices:update`. */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.prices", "update");
  if (gate) return gate;

  const parsed = await parsePriceListBody(request, priceListIdsInput);
  if ("response" in parsed) return parsed.response;
  try {
    const changed = await setPriceListsState(priceListActor(session), parsed.data.ids, "ON");
    return successResponse({ changed });
  } catch (error) {
    return priceListFailure(error, "POST /api/v2/retail/price-lists/resume");
  }
}
