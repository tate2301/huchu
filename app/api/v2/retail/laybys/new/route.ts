import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { laybyPlaceOf, laybyResponse } from "@/lib/retail/floor/layby-routes";
import { laybyForm } from "@/lib/retail/floor/laybys";
import { reversalActorOf } from "@/lib/retail/floor/reversal";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";

/** The New lay-by sheet's form (FLR-06): the site, the smallest deposit, the longest time to pay, the tenders and the drawer. */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.laybys", "create");
  if (gate) return gate;
  try {
    return successResponse({ data: await laybyForm(reversalActorOf(session), { place: await laybyPlaceOf(request, session) }) });
  } catch (error) {
    return laybyResponse(error, "GET /api/v2/retail/laybys/new");
  }
}
