import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { TILL_NOT_FOUND, parseTillBody, tillActor, tillFailure } from "@/lib/retail/till-routes";
import { deleteTill, getTill, isTillId, tillPatch, updateTill } from "@/lib/retail/tills";
import { requireRetailSession } from "../../_helpers";

type Context = { params: Promise<{ id: string }> };

/** One till with everything its sheet shows. `retail.tills:view`. */
export async function GET(request: NextRequest, context: Context) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.tills", "view");
  if (gate) return gate;

  const { id } = await context.params;
  if (!isTillId(id)) return errorResponse(TILL_NOT_FOUND, 404);
  const data = await getTill(session.user.companyId, id);
  if (!data) return errorResponse(TILL_NOT_FOUND, 404);
  return successResponse({ data });
}

/**
 * Change a till: name, site, the device it is for, its price list and what is
 * plugged in. Moving it while a shift is open on it → 409 SHIFT_OPEN. The
 * first save after Pair a till writes `RETAIL_TILL.CREATED`, later ones
 * `RETAIL_TILL.CHANGED`. `retail.tills:update`.
 */
export async function PATCH(request: NextRequest, context: Context) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.tills", "update");
  if (gate) return gate;

  const { id } = await context.params;
  if (!isTillId(id)) return errorResponse(TILL_NOT_FOUND, 404);

  const parsed = await parseTillBody(request, tillPatch);
  if ("response" in parsed) return parsed.response;

  try {
    return successResponse({ data: await updateTill(tillActor(session), id, parsed.data) });
  } catch (error) {
    return tillFailure(error, "PATCH /api/v2/retail/tills/[id]");
  }
}

/**
 * Cancel on Pair a till: only a till that never paired and has no shifts
 * goes (409 TILL_USED otherwise). `retail.tills:delete`. 204.
 */
export async function DELETE(request: NextRequest, context: Context) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.tills", "delete");
  if (gate) return gate;

  const { id } = await context.params;
  if (!isTillId(id)) return errorResponse(TILL_NOT_FOUND, 404);

  try {
    await deleteTill(tillActor(session), id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return tillFailure(error, "DELETE /api/v2/retail/tills/[id]");
  }
}
