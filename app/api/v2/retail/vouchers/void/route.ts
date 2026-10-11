import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseVoucherBody, voucherActor, voucherFailure } from "@/lib/retail/vouchers/routes";
import { voidInput, voidVouchers } from "@/lib/retail/vouchers/void";
import { requireRetailSession } from "../../_helpers";

/**
 * Void it (W-18, asks `voidvoucher` first): `retail.promotions:delete`. Each
 * voucher still open is voided with the reason (3–300 characters, 400 under
 * `reason` "Say why you are voiding it."); what money was left on it is
 * written off in the books. `{ voided }`.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.promotions", "delete");
  if (gate) return gate;

  const parsed = await parseVoucherBody(request, voidInput);
  if ("response" in parsed) return parsed.response;
  try {
    const voided = await voidVouchers(voucherActor(session), parsed.data);
    return successResponse({ voided });
  } catch (error) {
    return voucherFailure(error, "POST /api/v2/retail/vouchers/void");
  }
}
