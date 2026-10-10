import { NextRequest, NextResponse } from "next/server";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { isSiteId, siteActor } from "@/lib/retail/site-routes";
import { LicenceRefusal, licenceWeekSchema, loadSiteLicence, saveLicenceHours } from "@/lib/retail/site-licence-hours";
import { requireRetailSession } from "../../../_helpers";

/**
 * A site's licence hours: when it may sell 18+ products, weekday by weekday.
 * A weekday with no row sells all day; a row whose start equals its end sells
 * none that day; an end before the start runs past midnight. Read by the till
 * only while the shop's licence-hours switch is on.
 */

const NOT_FOUND = "That site is not one of this shop's.";

type Context = { params: Promise<{ id: string }> };

/** The site's week, and whether the till enforces it. `retail.sites:view`. */
export async function GET(request: NextRequest, context: Context) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.sites", "view");
  if (gate) return gate;

  const { id } = await context.params;
  if (!isSiteId(id)) return errorResponse(NOT_FOUND, 404);
  const data = await loadSiteLicence(session.user.companyId, id);
  if (!data) return errorResponse(NOT_FOUND, 404);
  return successResponse({ data });
}

/**
 * Replace the site's week with `{ days: [{ weekday, alcoholFrom, alcoholUntil }] }`,
 * minutes after midnight. `retail.sites:update`. Writes `RETAIL_SITE.CHANGED`.
 */
export async function PUT(request: NextRequest, context: Context) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.sites", "update");
  if (gate) return gate;

  const { id } = await context.params;
  if (!isSiteId(id)) return errorResponse(NOT_FOUND, 404);

  const parsed = licenceWeekSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Check the hours.";
    return fieldErrorResponse(message, { days: message });
  }

  try {
    return successResponse({ data: await saveLicenceHours(siteActor(session), id, parsed.data.days) });
  } catch (error) {
    if (error instanceof LicenceRefusal) return errorResponse(error.message, error.status);
    console.error("[API] PUT /api/v2/retail/sites/[id]/licence-hours error:", error);
    return errorResponse("That did not work. Nothing was changed; try again.");
  }
}
