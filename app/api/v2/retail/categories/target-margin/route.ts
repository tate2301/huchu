import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { marginManyInput, setCategoriesMargin } from "@/lib/retail/categories";
import { categoryActor, categoryFailure, parseCategoryBody } from "@/lib/retail/category-routes";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";

/** Bulk "Set target margin" `{ ids, targetMargin }` → `{ changed }`. An empty margin clears it. */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.categories", "update");
  if (gate) return gate;

  const parsed = await parseCategoryBody(request, marginManyInput);
  if ("response" in parsed) return parsed.response;

  try {
    return successResponse(
      await setCategoriesMargin(categoryActor(session), parsed.data.ids, parsed.data.targetMargin),
    );
  } catch (error) {
    return categoryFailure(error, "POST /api/v2/retail/categories/target-margin");
  }
}
