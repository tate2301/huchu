import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseVoucherBody, voucherActor, voucherFailure } from "@/lib/retail/vouchers/routes";
import { extendInput, extendVouchers } from "@/lib/retail/vouchers/service";
import { requireRetailSession } from "../../_helpers";

/** Extend (W-18, `voucher-extend`): one new expiry for the ticked vouchers still open. `retail.promotions:update`. `{ changed, message }`. */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.promotions", "update");
  if (gate) return gate;

  const parsed = await parseVoucherBody(request, extendInput);
  if ("response" in parsed) return parsed.response;
  try {
    const { changed, message } = await extendVouchers(voucherActor(session), parsed.data);
    return successResponse({ changed, message });
  } catch (error) {
    return voucherFailure(error, "POST /api/v2/retail/vouchers/extend");
  }
}
