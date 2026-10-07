import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { siteNewContext } from "@/lib/retail/sites";
import { requireRetailSession } from "../../_helpers";

/**
 * What Add a site needs (10-setup W-03 step 1): the price lists with their
 * product counts, the open sites stock could come from (the default first),
 * the plan's room `{ name, maxSites, openSites }` (null without a limit), and
 * a suggested short code (`?name=`), with the codes already in use.
 * `retail.sites:create`.
 */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.sites", "create");
  if (gate) return gate;

  return successResponse(await siteNewContext(session.user.companyId, request.nextUrl.searchParams.get("name")));
}
