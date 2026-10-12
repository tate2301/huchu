import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { postCountedDelivery } from "@/lib/retail/buying/deliveries";
import { buyingActor, buyingFailure } from "@/lib/retail/buying/routes";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";

import { postRetailJournal, requireRetailSession } from "../../../../_helpers";

type Params = { params: Promise<{ id: string }> };

/** "Post to stock" on a counted delivery: checked by whoever posts it; 409 once it is in stock. */
export async function POST(request: NextRequest, { params }: Params) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.purchasing", "approve");
  if (gate) return gate;
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  try {
    const { accountingStatus, accountingError, ...data } = await postCountedDelivery(buyingActor(session), path.data.id, (journal) => postRetailJournal(journal));
    return successResponse({
      data,
      accountingStatus,
      accountingError,
      message: `${data.receiptNo} posted. ${data.units} ${data.units === 1 ? "unit" : "units"} in stock.`,
    });
  } catch (error) {
    return buyingFailure(error, "POST /api/v2/retail/buying/deliveries/[id]/post");
  }
}
