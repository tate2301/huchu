import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";
import { submitCount } from "@/lib/retail/stock/counts";

import { requireRetailSession } from "../../../../_helpers";
import { countActor, isId, NOT_FOUND, refusalResponse } from "../../respond";

/**
 * "Done, send for review" (30-stock W-22 step 2): the counter or
 * `retail.counts:update`. → `{ status: "TO_APPROVE" }`; 409 "Count every line
 * first: 35 to go." while lines are left.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const { id } = await params;
  if (!isId(id)) return errorResponse(NOT_FOUND, 404);

  const grants = {
    view: canRetailSessionDo(session, "retail.counts", "view"),
    update: canRetailSessionDo(session, "retail.counts", "update"),
    approve: canRetailSessionDo(session, "retail.counts", "approve"),
    seeCost: canRetailSessionDo(session, "retail.catalog", "view-cost"),
  };
  try {
    return successResponse(await submitCount(countActor(session), grants, id, request.url));
  } catch (error) {
    return refusalResponse(error, "POST /api/v2/retail/stock/counts/[id]/submit", "It was not sent. Try again.");
  }
}
