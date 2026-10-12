import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { reversalActorOf, reversalResponse } from "@/lib/retail/floor/reversal";
import { voidForm, voidInput, voidSale } from "@/lib/retail/floor/voids";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";
import { requireRetailSession } from "../../../_helpers";

/**
 * Void a sale from the back office (50-floor W-41, FLR-02), the same day
 * only: the sheet's form (`GET`, 409 once it can only be refunded) and the
 * void (`POST`), the same service the till's History posts to.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.sell", "void");
  if (gate) return gate;
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  try {
    return successResponse({ data: await voidForm(reversalActorOf(session), path.data.id) });
  } catch (error) {
    return reversalResponse(error, "GET /api/v2/retail/sales/[id]/void");
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.sell", "void");
  if (gate) return gate;
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  try {
    const input = voidInput.parse(await request.json().catch(() => null));
    // The manager's PIN rides in the body (`approver: input.approver`); the service asks the till rules.
    const voided = await voidSale({ actor: reversalActorOf(session), saleId: path.data.id, body: input });
    return successResponse({ data: { saleNo: voided.saleNo, voidNo: voided.voidNo } }, 201);
  } catch (error) {
    return reversalResponse(error, "POST /api/v2/retail/sales/[id]/void");
  }
}
