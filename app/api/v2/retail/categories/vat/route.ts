import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { setCategoriesVat, vatManyInput } from "@/lib/retail/categories";
import { categoryActor, categoryFailure, parseCategoryBody } from "@/lib/retail/category-routes";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";

/** Bulk "Change VAT" `{ ids, vat }` → `{ changed, products }`; products re-rated in the same transaction. */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.categories", "update");
  if (gate) return gate;

  const parsed = await parseCategoryBody(request, vatManyInput);
  if ("response" in parsed) return parsed.response;

  try {
    return successResponse(await setCategoriesVat(categoryActor(session), parsed.data.ids, parsed.data.vat));
  } catch (error) {
    return categoryFailure(error, "POST /api/v2/retail/categories/vat");
  }
}
