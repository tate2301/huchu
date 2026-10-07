import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { isPromotionId } from "@/lib/retail/promotions/routes";
import { promotionChart } from "@/lib/retail/promotions/service";
import { parseRetailQuery } from "@/lib/retail/request";
import { requireRetailSession } from "../../../_helpers";

type Params = { params: Promise<{ id: string }> };

const chartQuery = z.object({ range: z.enum(["3m", "12m", "all"]).default("12m") });

/** "Bottles sold per week" (the record's chart): `{ weeks: [{ start, units, onPromotion }] }`. `retail.promotions:view`. */
export async function GET(request: NextRequest, { params }: Params) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.promotions", "view");
  if (gate) return gate;

  const { id } = await params;
  if (!isPromotionId(id)) return errorResponse("Promotion not found", 404);
  const query = parseRetailQuery(request, chartQuery);
  if (query.response) return query.response;
  const data = await promotionChart(session.user.companyId, id, query.data.range);
  if (!data) return errorResponse("Promotion not found", 404);
  return successResponse({ data });
}
