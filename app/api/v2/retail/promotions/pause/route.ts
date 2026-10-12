import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parsePromotionBody, promotionActor, promotionFailure } from "@/lib/retail/promotions/routes";
import { movePromotions, promotionIdsInput } from "@/lib/retail/promotions/service";
import { requireRetailSession } from "../../_helpers";

/** Bulk, row and record "Pause" (PRD-09): the tills stop applying it until it is resumed. `retail.promotions:update`. */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.promotions", "update");
  if (gate) return gate;

  const parsed = await parsePromotionBody(request, promotionIdsInput);
  if ("response" in parsed) return parsed.response;
  try {
    const changed = await movePromotions(promotionActor(session), parsed.data.ids, "pause");
    return successResponse({ changed });
  } catch (error) {
    return promotionFailure(error, "POST /api/v2/retail/promotions/pause");
  }
}
