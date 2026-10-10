import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { remindCounter } from "@/lib/retail/stock/counts";

import { requireRetailSession } from "../../../../_helpers";
import { countActor, isId, NOT_FOUND, refusalResponse } from "../../respond";

/**
 * Tells the counter again (30-stock 4.4): `retail.counts:update`, while the
 * count is being counted. → `{ messaged }`; 409 "This count is not being counted.".
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.counts", "update");
  if (gate) return gate;

  const { id } = await params;
  if (!isId(id)) return errorResponse(NOT_FOUND, 404);

  try {
    return successResponse(await remindCounter(countActor(session), id, request.url));
  } catch (error) {
    return refusalResponse(error, "POST /api/v2/retail/stock/counts/[id]/remind", "They were not told. Try again.");
  }
}
