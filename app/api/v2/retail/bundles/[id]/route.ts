import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { bundleActor, bundleFailure, isBundleId, parseBundleBody } from "@/lib/retail/bundles/routes";
import { bundlePatch, loadBundleView, updateBundle } from "@/lib/retail/bundles/service";
import { requireRetailPermission, retailRoleKey } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";

type Params = { params: Promise<{ id: string }> };

/** A bundle with its figures (the record, the edit sheet): `retail.promotions:view`. */
export async function GET(request: NextRequest, { params }: Params) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.promotions", "view");
  if (gate) return gate;

  const { id } = await params;
  if (!isBundleId(id)) return errorResponse("Bundle not found", 404);
  const data = await loadBundleView(session.user.companyId, id, retailRoleKey(session));
  if (!data) return errorResponse("Bundle not found", 404);
  return successResponse({ data });
}

/**
 * Change a bundle (the edit sheet, the record's rail): name, items, price,
 * days, until, barcode, category, site, till button. `retail.promotions:update`.
 * A stopped one is refused (409 "It was stopped. Duplicate it to sell it again.").
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.promotions", "update");
  if (gate) return gate;

  const { id } = await params;
  if (!isBundleId(id)) return errorResponse("Bundle not found", 404);
  const parsed = await parseBundleBody(request, bundlePatch);
  if ("response" in parsed) return parsed.response;
  try {
    const saved = await updateBundle(bundleActor(session), id, parsed.data);
    const data = await loadBundleView(session.user.companyId, id, retailRoleKey(session));
    return successResponse({ data, changed: saved.changed, message: saved.message });
  } catch (error) {
    return bundleFailure(error, "PATCH /api/v2/retail/bundles/[id]");
  }
}
