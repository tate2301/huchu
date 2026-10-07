import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { TILL_NOT_FOUND, tillActor, tillFailure } from "@/lib/retail/till-routes";
import { isTillId, unpairTill } from "@/lib/retail/tills";
import { requireRetailSession } from "../../../_helpers";

type Context = { params: Promise<{ id: string }> };

/**
 * Unpair (W-76): the device stops being a till at its next request; the till
 * stays, ready for another. Refused while a shift is open on it (409
 * SHIFT_OPEN). Writes `RETAIL_DEVICE.UNPAIRED`. `retail.tills:update`.
 */
export async function POST(request: NextRequest, context: Context) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.tills", "update");
  if (gate) return gate;

  const { id } = await context.params;
  if (!isTillId(id)) return errorResponse(TILL_NOT_FOUND, 404);

  try {
    return successResponse({ data: await unpairTill(tillActor(session), id) });
  } catch (error) {
    return tillFailure(error, "POST /api/v2/retail/tills/[id]/unpair");
  }
}
