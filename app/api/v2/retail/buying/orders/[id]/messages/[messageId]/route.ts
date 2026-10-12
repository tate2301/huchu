import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { successResponse } from "@/lib/api-response";
import { sendAgain } from "@/lib/retail/buying/orders";
import { buyingActor, buyingFailure } from "@/lib/retail/buying/routes";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailParams } from "@/lib/retail/request";

import { requireRetailSession } from "../../../../../_helpers";

const paramsSchema = z.object({ id: z.string().uuid(), messageId: z.string().uuid() });

/** The Messages tab's "Send again": a failed message back in the outbox. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.purchasing", "update");
  if (gate) return gate;
  const path = await parseRetailParams(params, paramsSchema);
  if (path.response) return path.response;
  try {
    await sendAgain(buyingActor(session), path.data.id, path.data.messageId);
    return successResponse({ message: "It is queued to send again." });
  } catch (error) {
    return buyingFailure(error, "POST /api/v2/retail/buying/orders/[id]/messages/[messageId]");
  }
}
