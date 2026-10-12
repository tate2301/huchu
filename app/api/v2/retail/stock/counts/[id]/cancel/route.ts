import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { cancelCount } from "@/lib/retail/stock/count-review";

import { requireRetailSession } from "../../../../_helpers";
import { countActor, isId, NOT_FOUND, refusalResponse } from "../../respond";

/**
 * "Cancel the count" (ask `cancelcount`): `retail.counts:delete`, while it is
 * counting or waits for approval. Nothing on hand changes; the counter is
 * told. → `{ status, countNo }`; 409 "Approved counts cannot be cancelled.".
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.counts", "delete");
  if (gate) return gate;

  const { id } = await params;
  if (!isId(id)) return errorResponse(NOT_FOUND, 404);

  try {
    return successResponse(await cancelCount(countActor(session), id, request.url));
  } catch (error) {
    return refusalResponse(error, "POST /api/v2/retail/stock/counts/[id]/cancel", "It was not cancelled. Try again.");
  }
}
