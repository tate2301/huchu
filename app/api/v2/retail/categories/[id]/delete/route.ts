import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { deleteCategory, deleteInput } from "@/lib/retail/categories";
import { categoryActor, categoryFailure, isCategoryId, parseCategoryBody } from "@/lib/retail/category-routes";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../../_helpers";

/**
 * Delete a category (Owner, `retail.categories:delete`). `{ moveTo }` is
 * required when it has products or categories inside it ("Choose where its 61
 * products go." under `moveTo`): they move there first and take that
 * category's VAT, then it goes in the bin. `{ moved }`; writes
 * `RETAIL_CATEGORY.DELETED`. A restore from the bin brings it back empty.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.categories", "delete");
  if (gate) return gate;

  const { id } = await context.params;
  if (!isCategoryId(id)) return errorResponse("That category is not one of this shop's.", 404);

  const parsed = await parseCategoryBody(request, deleteInput);
  if ("response" in parsed) return parsed.response;

  try {
    const { moved, into } = await deleteCategory(categoryActor(session), id, parsed.data.moveTo);
    return successResponse({ moved, into });
  } catch (error) {
    return categoryFailure(error, "POST /api/v2/retail/categories/[id]/delete");
  }
}
