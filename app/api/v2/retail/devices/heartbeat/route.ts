import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { successResponse } from "@/lib/api-response";
import { noteSeen, requireHostDevice, tillMessages } from "@/lib/retail/devices";

const heartbeatInput = z.object({ appVersion: z.string().trim().max(40).optional() }).catch({});

/**
 * The till calling in: it was seen now (so the Tills list knows it is on),
 * with the version its shell reports, and here are the messages the back
 * office sent it that nobody has dismissed.
 */
export async function POST(request: NextRequest) {
  const { device, response } = await requireHostDevice(request);
  if (response) return response as NextResponse;
  const input = heartbeatInput.parse(await request.json().catch(() => ({})));
  if (input.appVersion) await noteSeen(device, input.appVersion);
  return successResponse({ messages: await tillMessages(device) });
}
