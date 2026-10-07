import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { sendSaleReceipt } from "@/lib/retail/floor/sales";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";
import { requireRetailSession } from "../../../_helpers";
import { SALES_REFUSAL, saleActor, saleRefusalResponse } from "../../_shared";

const bodySchema = z.object({ to: z.string().trim().max(40).optional() }).strict();

/**
 * "Send on WhatsApp": the receipt to the number given, else the customer's.
 * It waits in the outbox until WhatsApp is connected (98-decisions C-04):
 * `waiting` says so, and nothing fails.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const reads = canRetailSessionDo(session, "retail.sell", "view") || canRetailSessionDo(session, "retail.cash-control", "view");
  if (!reads) return errorResponse(SALES_REFUSAL, 403);

  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  const body = bodySchema.safeParse((await request.json().catch(() => ({}))) ?? {});
  if (!body.success) return errorResponse("Validation failed", 400, body.error.issues);

  try {
    return successResponse(await sendSaleReceipt(session.user.companyId, path.data.id, saleActor(session), body.data.to));
  } catch (error) {
    return saleRefusalResponse(error, "POST /api/v2/retail/sales/[id]/send");
  }
}
