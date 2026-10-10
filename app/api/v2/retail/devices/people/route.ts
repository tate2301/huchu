import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { requireHostDevice, tillPeople } from "@/lib/retail/devices";

/** The chips on "Who is selling?": people with a PIN who may sell at this till, "Chipo D.". */
export async function GET(request: NextRequest) {
  const { device, response } = await requireHostDevice(request);
  if (response) return response as NextResponse;
  return successResponse({ data: await tillPeople(device) });
}
