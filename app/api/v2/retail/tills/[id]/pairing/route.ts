import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { TILL_NOT_FOUND, tillFailure } from "@/lib/retail/till-routes";
import { isTillId, tillPairing } from "@/lib/retail/tills";
import { requireRetailSession } from "../../../_helpers";

type Context = { params: Promise<{ id: string }> };

/**
 * What the pairing sheets poll every 2 seconds:
 * `{ state: "waiting" | "paired" | "expired", expiresAt, device? }`.
 * `retail.tills:view`.
 */
export async function GET(request: NextRequest, context: Context) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.tills", "view");
  if (gate) return gate;

  const { id } = await context.params;
  if (!isTillId(id)) return errorResponse(TILL_NOT_FOUND, 404);

  try {
    return successResponse(await tillPairing(session.user.companyId, id));
  } catch (error) {
    return tillFailure(error, "GET /api/v2/retail/tills/[id]/pairing");
  }
}
