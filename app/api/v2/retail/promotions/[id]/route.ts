import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { isPromotionId, parsePromotionBody, promotionActor, promotionFailure } from "@/lib/retail/promotions/routes";
import { loadPromotionView, promotionPatch, updatePromotion } from "@/lib/retail/promotions/service";
import { requireRetailSession } from "../../_helpers";

type Params = { params: Promise<{ id: string }> };

/** A promotion with its figures (the record, the edit sheet): `retail.promotions:view`. */
export async function GET(request: NextRequest, { params }: Params) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.promotions", "view");
  if (gate) return gate;

  const { id } = await params;
  if (!isPromotionId(id)) return errorResponse("Promotion not found", 404);
  const data = await loadPromotionView(session.user.companyId, id);
  if (!data) return errorResponse("Promotion not found", 404);
  return successResponse({ data });
}

/**
 * Change its rules (the edit sheet, the record's rail): `retail.promotions:update`.
 * Once it has started its Starts and its kind stay (409 "It has already
 * started. Change when it ends instead."; 400 "A running promotion keeps its
 * kind."); an ended one is refused (409 "It has ended. Duplicate it to run it again.").
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.promotions", "update");
  if (gate) return gate;

  const { id } = await params;
  if (!isPromotionId(id)) return errorResponse("Promotion not found", 404);
  const parsed = await parsePromotionBody(request, promotionPatch);
  if ("response" in parsed) return parsed.response;
  try {
    const saved = await updatePromotion(promotionActor(session), id, parsed.data);
    const data = await loadPromotionView(session.user.companyId, id);
    return successResponse({ data, changed: saved.changed, message: saved.message });
  } catch (error) {
    return promotionFailure(error, "PATCH /api/v2/retail/promotions/[id]");
  }
}
