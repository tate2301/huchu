import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { markSaleReviewed } from "@/lib/retail/floor/sales";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";
import { requireRetailSession } from "../../../_helpers";
import { saleActor, saleRefusalResponse } from "../../_shared";

/** "Mark as looked at" (W-44): a manager has looked at a flagged sale. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.sell", "update");
  if (gate) return gate;

  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;

  try {
    return successResponse(await markSaleReviewed(session.user.companyId, path.data.id, saleActor(session)));
  } catch (error) {
    return saleRefusalResponse(error, "POST /api/v2/retail/sales/[id]/reviewed");
  }
}
