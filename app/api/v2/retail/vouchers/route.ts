import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { issueVouchers, voucherInput } from "@/lib/retail/vouchers/issue";
import { parseVoucherBody, voucherActor, voucherFailure } from "@/lib/retail/vouchers/routes";
import { requireRetailSession } from "../_helpers";

/**
 * Issue vouchers (W-18, PRD-10): `retail.promotions:create` (Owner, Manager).
 * Gift vouchers and credit notes by the number asked for, or one discount
 * voucher printed that many times; given, so money vouchers post Dr
 * Promotions and gifts / Cr Vouchers owed. 201 `{ data: { vouchers, printUrl,
 * sent }, message }`; 400 under value, howMany, customerId, expires
 * ("Pick a date after today, within 3 years."), minSale or send ("Tapiwa
 * Marange has no WhatsApp number."). Reading them is `retail-vouchers`.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.promotions", "create");
  if (gate) return gate;

  const parsed = await parseVoucherBody(request, voucherInput);
  if ("response" in parsed) return parsed.response;
  try {
    const { message, ...data } = await issueVouchers(voucherActor(session), parsed.data);
    return successResponse({ data, message }, 201);
  } catch (error) {
    return voucherFailure(error, "POST /api/v2/retail/vouchers");
  }
}
