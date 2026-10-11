import { NextRequest, NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { voucherCardsPdf } from "@/lib/retail/vouchers/print";
import { isVoucherId, voucherFailure } from "@/lib/retail/vouchers/routes";
import { requireRetailSession } from "../../_helpers";

/** The vouchers as A6 cards to print (`?ids=a,b`): `retail.promotions:view`. */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.promotions", "view");
  if (gate) return gate;

  const ids = (request.nextUrl.searchParams.get("ids") ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  if (ids.length === 0 || ids.length > 200 || !ids.every(isVoucherId)) return errorResponse("Pick the vouchers to print.", 400);
  try {
    const pdf = await voucherCardsPdf(session.user.companyId, ids);
    if (!pdf) return errorResponse("Voucher not found", 404);
    return new NextResponse(pdf, {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="vouchers.pdf"`, "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return voucherFailure(error, "GET /api/v2/retail/vouchers/print");
  }
}
