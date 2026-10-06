import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";
import { loadCountView } from "@/lib/retail/stock/counts";

import { requireRetailSession } from "../../../_helpers";
import { countActor, isId, NOT_FOUND, refusalResponse } from "../respond";

/**
 * One count (30-stock 4.4 `CountView`): `retail.counts:view`, or its counter
 * whatever their role (a cashier asked to count). Its value at cost only for
 * roles that may see cost; `history` is STK-06's.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const { id } = await params;
  if (!isId(id)) return errorResponse(NOT_FOUND, 404);

  const grants = {
    view: canRetailSessionDo(session, "retail.counts", "view"),
    update: canRetailSessionDo(session, "retail.counts", "update"),
    approve: canRetailSessionDo(session, "retail.counts", "approve"),
    seeCost: canRetailSessionDo(session, "retail.catalog", "view-cost"),
  };
  try {
    return successResponse({ data: await loadCountView(countActor(session), grants, id) });
  } catch (error) {
    return refusalResponse(error, "GET /api/v2/retail/stock/counts/[id]", "This count could not be loaded.");
  }
}
