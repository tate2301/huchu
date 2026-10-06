import { NextRequest, NextResponse } from "next/server";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";
import { countedInput, saveCountLine } from "@/lib/retail/stock/counts";

import { requireRetailSession } from "../../../../../_helpers";
import { countActor, isId, NOT_FOUND, refusalResponse } from "../../../respond";

/**
 * Saves one figure (30-stock W-22 step 2): `{ counted: "7" }` → `{ line, progress }`.
 * The counter while counting (or `retail.counts:update`); an approver
 * (`retail.counts:approve`) while it waits for approval. 400
 * `fieldErrors.counted` "Type how many are there."; 409 "This count is closed.".
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string; lineId: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const { id, lineId } = await params;
  if (!isId(id) || !isId(lineId)) return errorResponse(NOT_FOUND, 404);

  const parsed = countedInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const message = "Type how many are there.";
    return fieldErrorResponse(message, { counted: message });
  }

  const grants = {
    view: canRetailSessionDo(session, "retail.counts", "view"),
    update: canRetailSessionDo(session, "retail.counts", "update"),
    approve: canRetailSessionDo(session, "retail.counts", "approve"),
    seeCost: canRetailSessionDo(session, "retail.catalog", "view-cost"),
  };
  try {
    return successResponse(await saveCountLine(countActor(session), grants, id, lineId, parsed.data.counted));
  } catch (error) {
    return refusalResponse(error, "PUT /api/v2/retail/stock/counts/[id]/lines/[lineId]", "Not saved. Try again.");
  }
}
