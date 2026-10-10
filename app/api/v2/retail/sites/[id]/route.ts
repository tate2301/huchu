import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { isSiteId, parseSiteBody, siteActor, siteFailure } from "@/lib/retail/site-routes";
import { getSite, sitePatch, updateSite } from "@/lib/retail/sites";
import { requireRetailSession } from "../../_helpers";

const NOT_FOUND = "That site is not one of this shop's.";

type Context = { params: Promise<{ id: string }> };

/** One site, for its sheet. `retail.sites:view`. */
export async function GET(request: NextRequest, context: Context) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.sites", "view");
  if (gate) return gate;

  const { id } = await context.params;
  if (!isSiteId(id)) return errorResponse(NOT_FOUND, 404);
  const actor = siteActor(session);
  const data = await getSite(actor.companyId, id, actor.canSeeCost ?? false);
  if (!data) return errorResponse(NOT_FOUND, 404);
  return successResponse({ data });
}

/**
 * Change a site (W-66): any of its fields, its places `[{ id?, name }]`, and
 * `isDefault: true` to make it the default. Removed places move their stock
 * to the first place that remains (a TRANSFER per line). `isDefault: false`
 * on the default → 409 DEFAULT_SITE. `retail.sites:update` (Owner, Manager).
 * Writes `RETAIL_SITE.CHANGED`.
 */
export async function PATCH(request: NextRequest, context: Context) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.sites", "update");
  if (gate) return gate;

  const { id } = await context.params;
  if (!isSiteId(id)) return errorResponse(NOT_FOUND, 404);

  const parsed = await parseSiteBody(request, sitePatch);
  if ("response" in parsed) return parsed.response;

  try {
    return successResponse({ data: await updateSite(siteActor(session), id, parsed.data) });
  } catch (error) {
    return siteFailure(error, "PATCH /api/v2/retail/sites/[id]");
  }
}
