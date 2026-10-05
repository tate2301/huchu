import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { categoryPatch, getCategory, updateCategory } from "@/lib/retail/categories";
import { categoryActor, categoryFailure, isCategoryId, parseCategoryBody } from "@/lib/retail/category-routes";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";

const NOT_FOUND = "That category is not one of this shop's.";

type Context = { params: Promise<{ id: string }> };

/** One category, for its edit sheet. `retail.categories:view`. */
export async function GET(request: NextRequest, context: Context) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.categories", "view");
  if (gate) return gate;

  const { id } = await context.params;
  if (!isCategoryId(id)) return errorResponse(NOT_FOUND, 404);
  const data = await getCategory(session.user.companyId, id);
  if (!data) return errorResponse(NOT_FOUND, 404);
  return successResponse({ data });
}

/**
 * Change a category: any of name, Inside, VAT, target margin, the age check,
 * returnable. A VAT change rewrites every product's VAT in it in the same
 * transaction. `{ data, changed }`; writes `RETAIL_CATEGORY.CHANGED`.
 */
export async function PATCH(request: NextRequest, context: Context) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.categories", "update");
  if (gate) return gate;

  const { id } = await context.params;
  if (!isCategoryId(id)) return errorResponse(NOT_FOUND, 404);

  const parsed = await parseCategoryBody(request, categoryPatch);
  if ("response" in parsed) return parsed.response;

  try {
    const { data, changed } = await updateCategory(categoryActor(session), id, parsed.data);
    return successResponse({ data, changed });
  } catch (error) {
    return categoryFailure(error, "PATCH /api/v2/retail/categories/[id]");
  }
}
