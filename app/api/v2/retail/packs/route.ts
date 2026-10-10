import { NextRequest, NextResponse } from "next/server";

import { fieldErrorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission, retailRoleKey } from "@/lib/retail/permissions";
import { createPack, packInput } from "@/lib/retail/products/packs";
import { productActor, productFailure } from "@/lib/retail/products/routes";
import { loadProductView } from "@/lib/retail/products/view";

import { requireRetailSession } from "../_helpers";

/**
 * Sell by the case (W-12, PRD-08, 20-products 4.6): a case made from its
 * single. `retail.catalog:create` (Owner, Manager). 201 `{ data: ProductView,
 * message }`; 400 under single (a case, or not the shop's), size (2 to
 * 1,000), price, barcode; 409 when the single already has a live case of
 * that size.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.catalog", "create");
  if (gate) return gate;

  const parsed = packInput.safeParse((await request.json().catch(() => null)) ?? {});
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "form") === "singleId" ? "single" : String(issue.path[0] ?? "form");
      fieldErrors[field] ??= issue.message;
    }
    return fieldErrorResponse(Object.values(fieldErrors)[0] ?? "Check the fields.", fieldErrors);
  }
  const actor = productActor(session);
  try {
    const created = await createPack(actor, parsed.data);
    const data = await loadProductView(actor.companyId, created.productId, retailRoleKey(session));
    return successResponse({ data, message: created.message }, 201);
  } catch (error) {
    return productFailure(error, "POST /api/v2/retail/packs");
  }
}
