import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { emptiesSummary } from "@/lib/retail/stock/empties";

import { requireRetailSession } from "../../_helpers";
import { emptiesRefusal } from "../_answer";

/**
 * The Empties ledger at a site (30-stock 4.6, STK-09): what is in the store,
 * the two deposit balances and the shop's bottle and crate deposits — the
 * Return sheet's sub and its "Deposit owed to you". `retail.empties:view`;
 * 409 "Empties and deposits is off for this shop." unless a liquor store
 * takes deposits.
 */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.empties", "view");
  if (gate) return gate;

  try {
    const data = await emptiesSummary(session.user.companyId, request.nextUrl.searchParams.get("siteId"));
    return successResponse({ data });
  } catch (error) {
    const refused = emptiesRefusal(error);
    if (refused) return refused;
    console.error("[API] GET /api/v2/retail/empties/summary error:", error);
    return errorResponse("The empties could not be read. Try again.");
  }
}
