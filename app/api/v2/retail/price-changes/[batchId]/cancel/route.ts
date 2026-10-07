import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { priceListActor } from "@/lib/retail/price-lists/routes";
import { cancelBatch, ChangeManyRefusal } from "@/lib/retail/prices/schedule";
import { requireRetailSession } from "../../../_helpers";

type Params = { params: Promise<{ batchId: string }> };

/**
 * Undo a scheduled Change many prices (W-15, PRD-07): the batch's rows not
 * yet applied are cancelled; applied rows stay. `retail.prices:update`.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.prices", "update");
  if (gate) return gate;

  const { batchId } = await params;
  if (!z.string().uuid().safeParse(batchId).success) return errorResponse("Price change not found", 404);
  try {
    return successResponse(await cancelBatch(priceListActor(session), batchId));
  } catch (error) {
    if (error instanceof ChangeManyRefusal) return errorResponse(error.message, error.status);
    console.error("[API] POST /api/v2/retail/price-changes/[batchId]/cancel error:", error);
    return errorResponse("That did not work. Nothing was changed; try again.");
  }
}
