import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseSellingIds, SellingRefusal, setProductsSelling } from "@/lib/retail/products/selling";

import { requireRetailSession } from "../../_helpers";

/**
 * Sell the ticked products again: back on every till
 * (20-products 4.2). `{ ids }` (at most 500) → `{ unarchived: n }`, the products
 * that changed. `retail.catalog:update`; every id must be the caller's
 * company's or nothing changes (404 "Product not found"); a product in the bin
 * is refused (409).
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.catalog", "update");
  if (gate) return gate;

  const parsed = parseSellingIds(await request.json().catch(() => null));
  if ("error" in parsed) return errorResponse(parsed.error, 400, { fieldErrors: parsed.fieldErrors });

  try {
    const changed = await setProductsSelling({
      actor: {
        companyId: session.user.companyId,
        userId: session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
      },
      ids: parsed.ids,
      selling: true,
    });
    return successResponse({ unarchived: changed });
  } catch (error) {
    if (error instanceof SellingRefusal) return errorResponse(error.message, error.status);
    console.error("[API] POST /api/v2/retail/products/unarchive error:", error);
    return errorResponse("That did not work. Nothing was changed; try again.");
  }
}
