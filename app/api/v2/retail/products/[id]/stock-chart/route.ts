import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { loadStockChart } from "@/lib/retail/products/stock-chart-load";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";

import { requireRetailSession } from "../../../_helpers";

/**
 * When it runs out (PRD-04): a product's on hand day by day, the days ahead at
 * the rate it sells and what to order by when. `?days=` from 7 to 90, 30 by
 * default. Everyone who reads the product reads it.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.catalog", "view");
  if (gate) return gate;

  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;

  const typed = request.nextUrl.searchParams.get("days");
  const days = typed === null ? 30 : Number(typed);
  if (!Number.isInteger(days) || days < 7 || days > 90) return errorResponse("Ask for 7 to 90 days.", 400);

  const data = await loadStockChart(session.user.companyId, path.data.id, days);
  if (!data) return errorResponse("Product not found", 404);
  return successResponse({ data });
}
