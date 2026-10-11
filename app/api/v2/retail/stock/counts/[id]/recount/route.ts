import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { recountInput, recountLines } from "@/lib/retail/stock/count-review";

import { requireRetailSession } from "../../../../_helpers";
import { countActor, isId, NOT_FOUND, refusalResponse } from "../../respond";

/**
 * "Recount the 3" (30-stock W-22 step 3): `{ lineIds? }`, `retail.counts:approve`.
 * No ids: every differing line. Those lines lose their figures, the count is
 * counting again and the counter is told. → `{ lines, counter }`; 409 "This
 * count is not waiting for approval.".
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.counts", "approve");
  if (gate) return gate;

  const { id } = await params;
  if (!isId(id)) return errorResponse(NOT_FOUND, 404);
  const parsed = recountInput.safeParse((await request.json().catch(() => null)) ?? {});
  if (!parsed.success) return errorResponse("Tick the lines to count again.", 400);

  try {
    return successResponse(await recountLines(countActor(session), id, parsed.data.lineIds, request.url));
  } catch (error) {
    return refusalResponse(error, "POST /api/v2/retail/stock/counts/[id]/recount", "They were not sent back. Try again.");
  }
}
