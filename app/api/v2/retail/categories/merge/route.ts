import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { mergeCategories, mergeInput } from "@/lib/retail/categories";
import { categoryActor, categoryFailure, parseCategoryBody } from "@/lib/retail/category-routes";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";

/**
 * Merge `{ ids, into }` (Owner, `retail.categories:delete`): each of `ids`
 * is deleted into `into` — its products move there and take its VAT, and it
 * goes in the bin. `{ merged, moved }`.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.categories", "delete");
  if (gate) return gate;

  const parsed = await parseCategoryBody(request, mergeInput);
  if ("response" in parsed) return parsed.response;

  try {
    return successResponse(await mergeCategories(categoryActor(session), parsed.data.ids, parsed.data.into));
  } catch (error) {
    return categoryFailure(error, "POST /api/v2/retail/categories/merge");
  }
}
