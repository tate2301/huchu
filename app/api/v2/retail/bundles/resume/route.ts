import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { bundleActor, bundleFailure, parseBundleBody } from "@/lib/retail/bundles/routes";
import { bundleIdsInput, setBundlesPaused } from "@/lib/retail/bundles/service";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";

/** "Put on sale" (PRD-08): paused bundles and packs back on every till. `retail.promotions:update`. */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.promotions", "update");
  if (gate) return gate;

  const parsed = await parseBundleBody(request, bundleIdsInput);
  if ("response" in parsed) return parsed.response;
  try {
    const changed = await setBundlesPaused(bundleActor(session), parsed.data.ids, false);
    return successResponse({ changed });
  } catch (error) {
    return bundleFailure(error, "POST /api/v2/retail/bundles/resume");
  }
}
