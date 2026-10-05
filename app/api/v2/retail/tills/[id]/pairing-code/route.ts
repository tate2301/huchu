import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { TILL_NOT_FOUND, parseTillBody, tillActor, tillFailure } from "@/lib/retail/till-routes";
import { cancelTillCode, isTillId, issueTillCode, pairingCodeInput } from "@/lib/retail/tills";
import { requireRetailSession } from "../../../_helpers";

type Context = { params: Promise<{ id: string }> };

/**
 * A fresh six-digit code for the till, good once for 10 minutes; its older
 * codes stop. `PAIR` for a till with no device (409 PLAN_LIMIT when the plan
 * is full), `REPLACE` to swap the one it has. `retail.tills:update`.
 * `{ code, expiresAt }`.
 */
export async function POST(request: NextRequest, context: Context) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.tills", "update");
  if (gate) return gate;

  const { id } = await context.params;
  if (!isTillId(id)) return errorResponse(TILL_NOT_FOUND, 404);

  const parsed = await parseTillBody(request, pairingCodeInput);
  if ("response" in parsed) return parsed.response;

  try {
    return successResponse(await issueTillCode(tillActor(session), id, parsed.data.purpose));
  } catch (error) {
    return tillFailure(error, "POST /api/v2/retail/tills/[id]/pairing-code");
  }
}

/** Cancel: the till's live code stops working. `retail.tills:update`. 204. */
export async function DELETE(request: NextRequest, context: Context) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.tills", "update");
  if (gate) return gate;

  const { id } = await context.params;
  if (!isTillId(id)) return errorResponse(TILL_NOT_FOUND, 404);

  try {
    await cancelTillCode(tillActor(session), id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return tillFailure(error, "DELETE /api/v2/retail/tills/[id]/pairing-code");
  }
}
