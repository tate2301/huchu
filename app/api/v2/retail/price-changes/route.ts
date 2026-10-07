import { NextRequest, NextResponse } from "next/server";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parsePriceListBody, priceListActor } from "@/lib/retail/price-lists/routes";
import { changeMany, changeManyInput, ChangeManyRefusal } from "@/lib/retail/prices/schedule";
import { requireRetailSession } from "../_helpers";

/**
 * Change many prices (W-15, PRD-07): one batch on one list, now, tonight
 * after closing or from a day, with new shelf labels when asked.
 * `{ data: { batchId, effectiveAt, applied, labelsJobId, pdfUrl }, message }`.
 * `retail.prices:update`.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.prices", "update");
  if (gate) return gate;

  const parsed = await parsePriceListBody(request, changeManyInput);
  if ("response" in parsed) return parsed.response;
  try {
    return successResponse(await changeMany(priceListActor(session), parsed.data));
  } catch (error) {
    if (error instanceof ChangeManyRefusal) {
      return Object.keys(error.fieldErrors).length
        ? fieldErrorResponse(error.message, error.fieldErrors, error.status)
        : errorResponse(error.message, error.status);
    }
    console.error("[API] POST /api/v2/retail/price-changes error:", error);
    return errorResponse("That did not work. Nothing was changed; try again.");
  }
}
