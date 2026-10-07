import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { categoryShop } from "@/lib/retail/categories";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";

/**
 * What the New category sheet needs to know about the shop (**Defined here**):
 * `{ liquor, deposits }` — the 18+ hint is a liquor store's, and "Bottles are
 * returnable" shows only with empties and deposits on.
 */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.categories", "create");
  if (gate) return gate;

  return successResponse(await categoryShop(session.user.companyId));
}
