import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { isSiteId, siteActor, siteFailure } from "@/lib/retail/site-routes";
import { closeSite } from "@/lib/retail/sites";
import { requireRetailSession } from "../../../_helpers";

type Context = { params: Promise<{ id: string }> };

/**
 * Close a site. `retail.sites:delete` (Owner). Refused while it is the
 * default (409 DEFAULT_SITE), while a shift is open there (SHIFT_OPEN) or
 * while any product has stock there (HAS_STOCK, with the count). Its tills
 * stop; its history stays. Writes `RETAIL_SITE.CLOSED`.
 */
export async function POST(request: NextRequest, context: Context) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.sites", "delete");
  if (gate) return gate;

  const { id } = await context.params;
  if (!isSiteId(id)) return errorResponse("That site is not one of this shop's.", 404);

  try {
    return successResponse({ data: await closeSite(siteActor(session), id) });
  } catch (error) {
    return siteFailure(error, "POST /api/v2/retail/sites/[id]/close");
  }
}
