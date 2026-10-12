import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { searchPosCustomers } from "@/lib/retail/customers/pos";
import { canRetailSessionDo, retailPermissionDenial } from "@/lib/retail/permissions";
import { parseRetailQuery } from "@/lib/retail/request";
import { requireRetailSession } from "../../_helpers";

const query = z.object({
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(30).optional(),
});

/**
 * The till's customer search (CUS-02): `?q=&limit=8` → `{ data: PosCustomer[] }`.
 * Phone digits (four or more, the end of the number), the card number, the
 * code or the name; live customers only. Fewer than two characters finds
 * nobody. Customers' view or the till's.
 */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  if (!canRetailSessionDo(session, "retail.customers", "view") && !canRetailSessionDo(session, "retail.sell", "view")) {
    return errorResponse(retailPermissionDenial(session, "retail.customers", "view") ?? "Your role cannot view customers", 403);
  }
  const parsed = parseRetailQuery(request, query);
  if (parsed.response) return parsed.response;
  const q = parsed.data.q ?? "";
  if (q.length < 2) return successResponse({ data: [] });
  return successResponse({ data: await searchPosCustomers(session.user.companyId, q, parsed.data.limit ?? 8) });
}
