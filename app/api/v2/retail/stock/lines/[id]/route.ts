import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";
import { readStockLines } from "@/lib/retail/stock/lines";

import { requireRetailSession } from "../../../_helpers";

/** One stock line (30-stock 4.2); 404 when it is not this shop's. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = canRetailSessionDo(session, "retail.adjustments", "create")
    ? null
    : requireRetailPermission(session, "retail.stock", "view");
  if (gate) return gate;

  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return errorResponse("That stock line is not this shop’s.", 404);

  const [line] = await readStockLines(session.user.companyId, { lineIds: [path.data.id] }, session.user.role);
  if (!line) return errorResponse("That stock line is not this shop’s.", 404);
  return successResponse({ data: line });
}
