import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { loadOverview, OverviewRefused } from "@/lib/retail/floor/overview";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../_helpers";

/**
 * The Overview (50-floor §4.1, FLR-08): every tile of `/retail` for
 * `?period=today|week|month&siteId=<id>|all`, the caller's own site by
 * default. Owners, managers and the bookkeeper read it; a tile or a Needs
 * action row the caller cannot act on is left out.
 */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const denied = requireRetailPermission(session, "retail.reports", "view");
  if (denied) return denied;
  const params = new URL(request.url).searchParams;
  try {
    return successResponse({ data: await loadOverview(session, { period: params.get("period"), siteId: params.get("siteId") }) });
  } catch (error) {
    if (error instanceof OverviewRefused) return errorResponse(error.message, error.status);
    throw error;
  }
}
