import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { fieldErrorResponse, successResponse } from "@/lib/api-response";
import { closeRefusal, closeUncounted } from "@/lib/retail/floor/shifts";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";
import { requireRetailSession } from "../../../_helpers";

/**
 * Close without counting (50-floor W-39, a lost handheld): cash control
 * only. The shift closes "Not counted" with why, no journal, and owners and
 * managers are told so one of them signs it off.
 */
const body = z.object({ reason: z.string() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fieldErrorResponse("Say why it was not counted.", { why: "Say why it was not counted." });
  try {
    return successResponse({ data: await closeUncounted({ session, shiftId: path.data.id, reason: parsed.data.reason }) });
  } catch (error) {
    return closeRefusal(error);
  }
}
