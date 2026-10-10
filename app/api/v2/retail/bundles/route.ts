import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { bundleActor, bundleFailure, parseBundleBody } from "@/lib/retail/bundles/routes";
import { bundleInput, createBundle, loadBundleView } from "@/lib/retail/bundles/service";
import { requireRetailPermission, retailRoleKey } from "@/lib/retail/permissions";
import { requireRetailSession } from "../_helpers";

/**
 * Make a bundle or a buy-more deal (W-13, PRD-08): `retail.promotions:create`
 * (Owner, Manager). 201 `{ data: BundleView, message }`; 400 under items
 * ("A bundle needs at least two items."), buyQuantity, price ("That is not
 * a saving: …"), days, until, barcode. Reading them is `retail-bundles`.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.promotions", "create");
  if (gate) return gate;

  const parsed = await parseBundleBody(request, bundleInput);
  if ("response" in parsed) return parsed.response;
  try {
    const made = await createBundle(bundleActor(session), parsed.data);
    const data = await loadBundleView(session.user.companyId, made.id, retailRoleKey(session));
    return successResponse({ data, message: made.message }, 201);
  } catch (error) {
    return bundleFailure(error, "POST /api/v2/retail/bundles");
  }
}
