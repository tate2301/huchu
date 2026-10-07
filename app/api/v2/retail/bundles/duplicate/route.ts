import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { bundleActor, bundleFailure, parseBundleBody } from "@/lib/retail/bundles/routes";
import { bundleIdsInput, duplicateBundles } from "@/lib/retail/bundles/service";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";

/** Bulk "Duplicate" (PRD-08): each bundle as "<name> (copy)"; packs are left out. `retail.promotions:create`. */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.promotions", "create");
  if (gate) return gate;

  const parsed = await parseBundleBody(request, bundleIdsInput);
  if ("response" in parsed) return parsed.response;
  try {
    const created = await duplicateBundles(bundleActor(session), parsed.data.ids);
    return successResponse({ created });
  } catch (error) {
    return bundleFailure(error, "POST /api/v2/retail/bundles/duplicate");
  }
}
