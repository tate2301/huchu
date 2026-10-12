import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { approveCount } from "@/lib/retail/stock/count-review";

import { requireRetailSession } from "../../../../_helpers";
import { countActor, isId, NOT_FOUND, refusalResponse } from "../../respond";

/**
 * "Approve and adjust" (30-stock W-22 step 4): `retail.counts:approve`. Stock
 * on hand moves by each line's difference and the net posts to Breakage and
 * losses. → `{ data: { differenceValue, accountingStatus } }`; 403 "Over
 * US$100.00 needs the owner. Tendai Mhlanga has been told."; 409 "This count
 * is not waiting for approval." or a line that sold since it was counted.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.counts", "approve");
  if (gate) return gate;

  const { id } = await params;
  if (!isId(id)) return errorResponse(NOT_FOUND, 404);

  try {
    const approved = await approveCount(countActor(session), id, request.url);
    return successResponse({ data: { differenceValue: approved.differenceValue, accountingStatus: approved.accountingStatus } });
  } catch (error) {
    return refusalResponse(error, "POST /api/v2/retail/stock/counts/[id]/approve", "It was not approved. Nothing changed; try again.");
  }
}
