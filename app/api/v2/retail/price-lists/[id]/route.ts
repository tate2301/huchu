import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { isPriceListId, parsePriceListBody, priceListActor, priceListFailure } from "@/lib/retail/price-lists/routes";
import { priceListRulesInput, priceListView, updatePriceList } from "@/lib/retail/price-lists/service";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";

type Params = { params: Promise<{ id: string }> };

/** One price list with its words (the rules sheet, the worksheet's header): `retail.prices:view`. */
export async function GET(request: NextRequest, { params }: Params) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.prices", "view");
  if (gate) return gate;

  const { id } = await params;
  if (!isPriceListId(id)) return errorResponse("Price list not found", 404);
  const data = await priceListView(session.user.companyId, id);
  if (!data) return errorResponse("Price list not found", 404);
  return successResponse({ data });
}

/**
 * Edit the rules (PRD-05): name, default, VAT, currency, who and where.
 * `retail.prices:update`. Turning the default off is refused (400); the
 * currency of a list with prices stays (409).
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.prices", "update");
  if (gate) return gate;

  const { id } = await params;
  if (!isPriceListId(id)) return errorResponse("Price list not found", 404);
  const parsed = await parsePriceListBody(request, priceListRulesInput);
  if ("response" in parsed) return parsed.response;
  try {
    return successResponse(await updatePriceList(priceListActor(session), id, parsed.data));
  } catch (error) {
    return priceListFailure(error, "PATCH /api/v2/retail/price-lists/[id]");
  }
}
