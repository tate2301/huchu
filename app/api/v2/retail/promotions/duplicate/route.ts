import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parsePromotionBody, promotionActor, promotionFailure } from "@/lib/retail/promotions/routes";
import { duplicatePromotions, promotionIdsInput } from "@/lib/retail/promotions/service";
import { requireRetailSession } from "../../_helpers";

/** Bulk "Duplicate" (PRD-09): "<name> (copy)", code "<CODE>-2", from tomorrow 00:00 with no end. `retail.promotions:create`. */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.promotions", "create");
  if (gate) return gate;

  const parsed = await parsePromotionBody(request, promotionIdsInput);
  if ("response" in parsed) return parsed.response;
  try {
    const created = await duplicatePromotions(promotionActor(session), parsed.data.ids);
    return successResponse({ created: created.length, data: created }, 201);
  } catch (error) {
    return promotionFailure(error, "POST /api/v2/retail/promotions/duplicate");
  }
}
