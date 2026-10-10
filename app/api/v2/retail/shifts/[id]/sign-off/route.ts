import { NextRequest, NextResponse } from "next/server";

import { answerSignOff } from "@/lib/retail/floor/sign-off";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";
import { requireRetailSession } from "../../../_helpers";

/**
 * Sign off a drawer that closed short, over or without a count (50-floor
 * W-40, FLR-05): accept it, recover a shortage from the cashier, or look
 * into it. Owners and managers, never on their own drawer unless the owner.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const refused = requireRetailPermission(session, "retail.cash-control", "approve");
  if (refused) return refused;
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  return answerSignOff({ session, shiftId: path.data.id, body: await request.json().catch(() => null) });
}
