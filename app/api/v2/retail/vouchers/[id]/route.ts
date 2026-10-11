import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { isVoucherId, parseVoucherBody, seesSecret, voucherActor, voucherFailure } from "@/lib/retail/vouchers/routes";
import { loadVoucherView, updateVoucher, voucherPatch } from "@/lib/retail/vouchers/service";
import { requireRetailSession } from "../../_helpers";

type Params = { params: Promise<{ id: string }> };

/** A voucher with what is left and where it was spent (the record, the edit sheet): `retail.promotions:view`; its secret to Owner and Manager only. */
export async function GET(request: NextRequest, { params }: Params) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.promotions", "view");
  if (gate) return gate;

  const { id } = await params;
  if (!isVoucherId(id)) return errorResponse("Voucher not found", 404);
  const data = await loadVoucherView(session.user.companyId, id, seesSecret(session));
  if (!data) return errorResponse("Voucher not found", 404);
  return successResponse({ data });
}

/**
 * Its expiry, who it is for and its site (the edit sheet, the rail):
 * `retail.promotions:update`. 409 "It was voided." on a voided one; 400 under
 * expiresOn ("Pick a date after today, within 3 years.").
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.promotions", "update");
  if (gate) return gate;

  const { id } = await params;
  if (!isVoucherId(id)) return errorResponse("Voucher not found", 404);
  const parsed = await parseVoucherBody(request, voucherPatch);
  if ("response" in parsed) return parsed.response;
  try {
    const saved = await updateVoucher(voucherActor(session), id, parsed.data);
    const data = await loadVoucherView(session.user.companyId, id, seesSecret(session));
    return successResponse({ data, changed: saved.changed, message: saved.message });
  } catch (error) {
    return voucherFailure(error, "PATCH /api/v2/retail/vouchers/[id]");
  }
}
