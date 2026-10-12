import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { refundForm, refundInput, refundSale } from "@/lib/retail/floor/refunds";
import { reversalActorOf, reversalResponse } from "@/lib/retail/floor/reversal";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";
import { requireRetailSession } from "../../../_helpers";

/**
 * Refund a sale from the back office (50-floor W-41, FLR-02): the sheet's
 * form (`GET`, with the sale's state refusals) and the refund (`POST`), the
 * same service the till's History posts to.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.sell", "refund");
  if (gate) return gate;
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  try {
    return successResponse({ data: await refundForm(reversalActorOf(session), path.data.id) });
  } catch (error) {
    return reversalResponse(error, "GET /api/v2/retail/sales/[id]/refund");
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.sell", "refund");
  if (gate) return gate;
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  try {
    const input = refundInput.parse(await request.json().catch(() => null));
    // The manager's PIN rides in the body (`approver: input.approver`); the service asks the till rules.
    const refund = await refundSale({ actor: reversalActorOf(session), saleId: path.data.id, body: input });
    const { id, saleNo, value, currency, to, tender, till, voucherCode } = refund;
    return successResponse({ data: { id, saleNo, value, currency, to, tender, till, voucherCode } }, 201);
  } catch (error) {
    return reversalResponse(error, "POST /api/v2/retail/sales/[id]/refund");
  }
}
