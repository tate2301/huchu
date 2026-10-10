import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { requireHostDevice, tillContext } from "@/lib/retail/devices";

/**
 * What the till knows about itself (10-setup 4.4 `TillContext`): its till,
 * site, device and price list. The device key is the credential; 409
 * NOT_A_TILL without one, 401 DEVICE_UNPAIRED once unpaired.
 */
export async function GET(request: NextRequest) {
  const { device, response } = await requireHostDevice(request);
  if (response) return response as NextResponse;
  return successResponse({ data: await tillContext(device) });
}
