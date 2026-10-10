import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseTillBody, tillActor, tillFailure } from "@/lib/retail/till-routes";
import { sendTillMessages, tillMessageInput } from "@/lib/retail/tills";
import { requireRetailSession } from "../../_helpers";

/**
 * Send a message (the Tills list's bulk action): one `RetailDeviceMessage`
 * per till, shown on it as a banner until dismissed. `{ tillIds, body }`
 * (1–280 characters) → `{ sent }`. `retail.tills:update`.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.tills", "update");
  if (gate) return gate;

  const parsed = await parseTillBody(request, tillMessageInput);
  if ("response" in parsed) return parsed.response;

  try {
    return successResponse(await sendTillMessages(tillActor(session), parsed.data.tillIds, parsed.data.body));
  } catch (error) {
    return tillFailure(error, "POST /api/v2/retail/tills/messages");
  }
}
