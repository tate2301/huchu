import { NextRequest, NextResponse } from "next/server";

import { DEVICE_COOKIE } from "@/lib/retail/device-words";
import { requirePosDevice } from "@/lib/retail/devices";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { tillActor, tillFailure } from "@/lib/retail/till-routes";
import { unpairTill } from "@/lib/retail/tills";
import { requireRetailSession } from "../../_helpers";

/**
 * Unpair this device from the till itself (W-76), as Management › Tills and
 * devices does: a manager signed in here, `retail.tills:update`, with no
 * shift open on the till (409 SHIFT_OPEN). `unpairTill` writes
 * `RETAIL_DEVICE.UNPAIRED` and ends the till's live codes. The key stops
 * working at once and its cookie is cleared, so the device shows the pair
 * screen next.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.tills", "update");
  if (gate) return gate;
  const { device, response: deviceResponse } = await requirePosDevice(request, session);
  if (deviceResponse) return deviceResponse;

  try {
    const till = await unpairTill(tillActor(session), device.registerId);
    const answer = NextResponse.json({ data: { till: { id: till.id, name: till.name } } });
    answer.cookies.set(DEVICE_COOKIE, "", { path: "/", maxAge: 0 });
    return answer;
  } catch (error) {
    return tillFailure(error, "POST /api/v2/retail/devices/unpair");
  }
}
