import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { requirePosDevice } from "@/lib/retail/devices";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { tillMessages } from "@/lib/retail/till-messages";
import { requireRetailSession } from "../../_helpers";

/**
 * The signed-in person's unread messages at the till (FLR-09): staff
 * messages and cash-up sign-offs, `[{ id, title, summary, at }]`. Only after
 * their PIN, on a paired till.
 */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.sell", "create");
  if (gate) return gate;
  const { response: deviceResponse } = await requirePosDevice(request, session);
  if (deviceResponse) return deviceResponse;
  return successResponse({ data: await tillMessages(session.user.companyId, session.user.id) });
}
