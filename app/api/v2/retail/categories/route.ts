import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { categoryInput, createCategory } from "@/lib/retail/categories";
import { categoryActor, categoryFailure, parseCategoryBody } from "@/lib/retail/category-routes";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../_helpers";

/**
 * Add a category (20-products 4.11, W-19). `retail.categories:create` (Owner,
 * Manager). The name is unique among live categories (409 under Name), a
 * category goes inside a top-level one only (400 under Inside), the target
 * margin is 0–99.9. Writes `RETAIL_CATEGORY.CREATED`.
 *
 * Reading the list is the `retail-categories` list source; reading one is
 * `GET /categories/[id]`; category fields read the `category` lookup.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.categories", "create");
  if (gate) return gate;

  const parsed = await parseCategoryBody(request, categoryInput);
  if ("response" in parsed) return parsed.response;

  try {
    const data = await createCategory(categoryActor(session), parsed.data);
    return successResponse({ data }, 201);
  } catch (error) {
    return categoryFailure(error, "POST /api/v2/retail/categories");
  }
}
