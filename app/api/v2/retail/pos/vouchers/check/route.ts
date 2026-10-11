import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { successResponse } from "@/lib/api-response";
import { requirePosDevice } from "@/lib/retail/devices";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailQuery } from "@/lib/retail/request";
import { checkVoucher, parseScan } from "@/lib/retail/vouchers/redeem";
import { requireRetailSession } from "../../../_helpers";

const checkQuery = z.object({
  code: z.string().trim().max(40).optional(),
  secret: z.string().trim().max(20).optional(),
  /** The printed barcode, which carries the code and its secret: a scan needs no typing. */
  scan: z.string().trim().max(60).optional(),
  /** What the basket comes to, for "It works on sales of US$20.00 or more.". */
  basket: z.coerce.number().min(0).optional(),
});

/**
 * Check a voucher at the till (W-18): `retail.sell:create` on a paired till.
 * `{ data: VoucherCheck | null, usable, reason }` — reasons "That code and
 * secret do not match.", "Too many wrong codes. Try again in 15 minutes.",
 * "Nothing is left on it.", "It expired on 9 October 2026.", "It was voided.",
 * "It cannot be used at this shop.", "It works on sales of US$20.00 or more.".
 */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.sell", "create");
  if (gate) return gate;
  const { device, response: deviceResponse } = await requirePosDevice(request, session);
  if (deviceResponse) return deviceResponse;

  const query = parseRetailQuery(request, checkQuery);
  if (query.response) return query.response;
  const scanned = query.data.scan ? parseScan(query.data.scan) : null;
  const code = scanned?.code ?? query.data.code ?? "";
  const secret = scanned?.secret ?? query.data.secret ?? "";
  if (!code || !secret) {
    return successResponse({ data: null, usable: false, reason: "Type the code and the secret printed on it." });
  }
  const { check, reason } = await checkVoucher(session.user.companyId, {
    code,
    secret,
    siteId: device.register.site.id,
    basketTotal: query.data.basket ?? null,
  });
  return successResponse({ data: check, usable: reason === null, reason });
}
