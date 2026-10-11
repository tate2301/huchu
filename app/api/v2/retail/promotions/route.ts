import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parsePromotionBody, promotionActor, promotionFailure } from "@/lib/retail/promotions/routes";
import { createPromotion, loadPromotionView, promotionInput } from "@/lib/retail/promotions/service";
import { requireRetailSession } from "../_helpers";

/**
 * Make a promotion (W-17, PRD-09): `retail.promotions:create` (Owner,
 * Manager). 201 `{ data: PromotionView, message }` ("Month-end two for US$5
 * ciders starts 25 October." or "… is running now."); 400 under its field:
 * name, value, buyQuantity, productIds, categoryIds, starts ("Write it as 25
 * October, 00:00."), ends ("It ends before it starts."), code ("There is
 * already a promotion called MONTHEND-CIDER."). Reading them is `retail-promotions`.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.promotions", "create");
  if (gate) return gate;

  const parsed = await parsePromotionBody(request, promotionInput);
  if ("response" in parsed) return parsed.response;
  try {
    const made = await createPromotion(promotionActor(session), parsed.data);
    const data = await loadPromotionView(session.user.companyId, made.id);
    return successResponse({ data, message: made.message }, 201);
  } catch (error) {
    return promotionFailure(error, "POST /api/v2/retail/promotions");
  }
}
