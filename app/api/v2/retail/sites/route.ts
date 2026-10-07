import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseSiteBody, siteActor, siteFailure } from "@/lib/retail/site-routes";
import { createSite, listSites, siteInput, type SiteListState } from "@/lib/retail/sites";
import { requireRetailSession } from "../_helpers";

const STATES: SiteListState[] = ["open", "closed", "any"];

/**
 * The shop's sites (10-setup 4.2): `?state=open|closed|any&q=` →
 * `{ data: SiteRow[], totals: { count, tills, stockValue } }`. Each row's
 * `places` says whether a stock form asks where (more than one place). Stock
 * value is null for someone who may not see cost. `retail.sites:view`.
 */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.sites", "view");
  if (gate) return gate;

  const params = request.nextUrl.searchParams;
  const state = STATES.find((value) => value === params.get("state")) ?? "open";
  const actor = siteActor(session);
  return successResponse(
    await listSites(actor.companyId, { state, q: params.get("q"), canSeeCost: actor.canSeeCost ?? false }),
  );
}

/**
 * Add a site (W-03). `retail.sites:create` (Owner). Name unique among open
 * sites, short code 2–6 of A–Z 0–9 unique to the shop, a Zimbabwe phone, at
 * least one place, a price list of the shop's; 409 PLAN_LIMIT when the plan
 * has no room. Writes `RETAIL_SITE.CREATED`. 201 `{ data: SiteDetail }`.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.sites", "create");
  if (gate) return gate;

  const parsed = await parseSiteBody(request, siteInput);
  if ("response" in parsed) return parsed.response;

  try {
    return successResponse({ data: await createSite(siteActor(session), parsed.data) }, 201);
  } catch (error) {
    return siteFailure(error, "POST /api/v2/retail/sites");
  }
}
