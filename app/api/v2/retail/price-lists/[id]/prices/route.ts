import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { isPriceListId, parsePriceListBody, priceListActor } from "@/lib/retail/price-lists/routes";
import { PriceRefusal } from "@/lib/retail/prices/change";
import { notSavedSentence } from "@/lib/retail/prices/words";
import { saveWorksheet, WorksheetMissing, worksheetInput } from "@/lib/retail/prices/worksheet";
import { requireRetailSession } from "../../../_helpers";

type Params = { params: Promise<{ id: string }> };

/**
 * The worksheet's "Save prices" (W-14, PRD-07): ListFrame's edit contract,
 * `{ changes: [{ id: productId, value: "18.99", was: "18.25" }] }`, saved as
 * one batch, all or nothing → `{ data: { saved, batchId }, message }`. 400
 * `{ error, details: { rows: [{ id, message }] } }` names each refused row.
 * `retail.prices:update`.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.prices", "update");
  if (gate) return gate;

  const { id } = await params;
  if (!isPriceListId(id)) return errorResponse("Price list not found", 404);
  const parsed = await parsePriceListBody(request, worksheetInput);
  if ("response" in parsed) return parsed.response;
  try {
    return successResponse(await saveWorksheet(priceListActor(session), id, parsed.data.changes));
  } catch (error) {
    if (error instanceof WorksheetMissing) return errorResponse(error.message, 404);
    if (error instanceof PriceRefusal) {
      const rows = Object.entries(error.refused).map(([rowId, message]) => ({ id: rowId, message }));
      return errorResponse(notSavedSentence(rows.length), 400, { rows });
    }
    console.error("[API] PATCH /api/v2/retail/price-lists/[id]/prices error:", error);
    return errorResponse("That did not work. Nothing was saved; try again.");
  }
}
