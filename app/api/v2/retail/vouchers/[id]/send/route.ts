import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { isVoucherId, voucherActor, voucherFailure } from "@/lib/retail/vouchers/routes";
import { sendVoucher } from "@/lib/retail/vouchers/service";
import { requireRetailSession } from "../../../_helpers";

type Params = { params: Promise<{ id: string }> };

/**
 * "Send to the holder" / "Resend" (W-18): queued on WhatsApp to its holder's
 * number. `retail.promotions:update`. 400 "Tapiwa Marange has no WhatsApp
 * number." / "Anyone holding it has no one to send to."; 409 "It was voided.".
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.promotions", "update");
  if (gate) return gate;

  const { id } = await params;
  if (!isVoucherId(id)) return errorResponse("Voucher not found", 404);
  try {
    const { message, sent } = await sendVoucher(voucherActor(session), id);
    return successResponse({ sent, message });
  } catch (error) {
    return voucherFailure(error, "POST /api/v2/retail/vouchers/[id]/send");
  }
}
