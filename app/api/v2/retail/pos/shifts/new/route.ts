import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { requirePosDevice } from "@/lib/retail/devices";
import { openingDefaults, ShiftRefused } from "@/lib/retail/floor/shifts";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../../_helpers";

/**
 * What Open the shift fills in at the till (FLR-09): the back office's
 * `shifts/new` answer (FLR-03) for this device's own till — the float its
 * last close left, the hint, and whether the shop counts a ZiG float. A
 * till's door, like its cash movements, because `/api/v2/retail/shifts` is
 * the back office's screen of every drawer.
 */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.sell", "open-shift");
  if (gate) return gate;
  const { device, response: deviceResponse } = await requirePosDevice(request, session);
  if (deviceResponse) return deviceResponse;
  try {
    return successResponse({ data: await openingDefaults(session.user.companyId, device.registerId) });
  } catch (error) {
    if (error instanceof ShiftRefused) return errorResponse(error.message, error.status);
    throw error;
  }
}
