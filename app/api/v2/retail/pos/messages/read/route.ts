import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { requirePosDevice } from "@/lib/retail/devices";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { readTillMessages } from "@/lib/retail/till-messages";
import { requireRetailSession } from "../../../_helpers";

const readSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(50) });

/** "Got it" (FLR-09): marks the signed-in person's own till messages read. */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.sell", "create");
  if (gate) return gate;
  const { response: deviceResponse } = await requirePosDevice(request, session);
  if (deviceResponse) return deviceResponse;
  const parsed = readSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Say which messages were read.", 400);
  const read = await readTillMessages(session.user.companyId, session.user.id, parsed.data.ids);
  return successResponse({ data: { read } });
}
