import { NextRequest, NextResponse } from "next/server";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parsePriceListBody } from "@/lib/retail/price-lists/routes";
import { byProblem, previewForList, previewInput } from "@/lib/retail/prices/preview";
import { requireRetailSession } from "../../_helpers";

/**
 * Change many prices' lines (W-15, PRD-07): each ticked product now and as it
 * will be, for a raise, a margin or one price, rounded up to 5 or 10 cents.
 * Changes nothing. `retail.prices:update`.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.prices", "update");
  if (gate) return gate;

  const parsed = await parsePriceListBody(request, previewInput);
  if ("response" in parsed) return parsed.response;
  const problem = byProblem(parsed.data.how, parsed.data.by);
  if (problem) return fieldErrorResponse(problem, { by: problem });
  const lines = await previewForList(session.user.companyId, { ...parsed.data, productIds: [...new Set(parsed.data.productIds)] });
  if (!lines) return errorResponse("Price list not found", 404);
  return successResponse({ lines });
}
