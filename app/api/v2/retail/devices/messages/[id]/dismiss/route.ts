import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/lib/api-response";
import { dismissTillMessage, requirePosDevice } from "@/lib/retail/devices";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../../../_helpers";

type Context = { params: Promise<{ id: string }> };

/** The banner's ×: this till's message is read. Device and a signed-in person. */
export async function POST(request: NextRequest, context: Context) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.sell", "view");
  if (gate) return gate;
  const { device, response: deviceResponse } = await requirePosDevice(request, session);
  if (deviceResponse) return deviceResponse;

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success || !(await dismissTillMessage(device, id))) {
    return errorResponse("That message is not one of this till's.", 404);
  }
  return new NextResponse(null, { status: 204 });
}
