import { NextRequest, NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-response";
import { DEVICE_COOKIE } from "@/lib/retail/device-words";
import { requireHostDevice } from "@/lib/retail/devices";

/**
 * Forget a device key that no longer works: an unpaired or replaced device, a
 * till that was closed, or a key this shop never issued. Clears this device's
 * own cookie so it shows the pair screen again. No session: it takes nothing
 * away the server still honours, so a key `requireHostDevice` accepts is
 * refused (409) and kept.
 */
export async function POST(request: NextRequest) {
  const { device } = await requireHostDevice(request);
  if (device) return errorResponse("This device is still a till.", 409);
  const answer = new NextResponse(null, { status: 204 });
  answer.cookies.set(DEVICE_COOKIE, "", { path: "/", maxAge: 0 });
  return answer;
}
