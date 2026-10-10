import { NextRequest, NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-response";
import { refuseShiftElsewhere, requirePosDevice } from "@/lib/retail/devices";
import { answerClose } from "@/lib/retail/floor/shifts";
import { canAccessPosPortal } from "@/lib/retail/pos-host";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";
import { requireRetailSession } from "../../../../_helpers";

/**
 * Count and close at the till (FLR-04): the same `closeShift` as the back
 * office, under the till's feature key, on this device's own till. The
 * cashier counts blind; a difference over US$1.00 comes back as the 400 that
 * asks what happened.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  if (!canAccessPosPortal(session.user.role)) return errorResponse("POS access denied", 403);
  const { device, response: deviceResponse } = await requirePosDevice(request, session);
  if (deviceResponse) return deviceResponse;
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  const elsewhere = await refuseShiftElsewhere(device, path.data.id);
  if (elsewhere) return elsewhere;
  const body = await request.json().catch(() => null);
  return answerClose({ session, shiftId: path.data.id, body });
}
