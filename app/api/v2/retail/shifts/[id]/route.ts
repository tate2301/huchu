import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { readsEveryCashier } from "@/lib/retail/own-rows";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";
import { loadShiftRecord } from "@/lib/retail/shift-record";
import { requireRetailSession } from "../../_helpers";

/**
 * One shift, as its record page reads it (`ShiftRecordView`).
 *
 * Cash control reads every drawer; a cashier holding `retail.sell` reads only
 * the drawers they opened (their Shifts item is "own", 00-foundations 5.3.4).
 * Someone else's shift answers as missing rather than confirming it exists.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const seesEveryDrawer = readsEveryCashier(session.user.role);
  if (!seesEveryDrawer) {
    const gate = requireRetailPermission(session, "retail.sell", "open-shift");
    if (gate) return gate;
  }

  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;

  const shift = await loadShiftRecord(session.user.companyId, path.data.id, {
    cashierId: seesEveryDrawer ? undefined : session.user.id,
  });
  if (!shift) {
    return errorResponse("Shift not found", 404);
  }
  return successResponse({ data: shift });
}
