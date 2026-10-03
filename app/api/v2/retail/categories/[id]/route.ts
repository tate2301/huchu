import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { CategoryNameTaken, categoryPatch, updateRetailCategory } from "@/lib/retail/categories";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";

/**
 * Change a category, or archive or restore it.
 *
 * There is no DELETE. A category with products under it cannot simply go — the
 * products would lose their VAT and ID-check defaults — so it is archived:
 * hidden from every product field, still on the products filed under it, and
 * one click from coming back.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const gate = requireRetailPermission(session, "retail.catalog", "update");
  if (gate) return gate;

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return errorResponse("That category is not in this workspace", 404);
  }

  try {
    const patch = categoryPatch.parse(await request.json());
    const data = await updateRetailCategory(session.user.companyId, id, patch);
    if (!data) return errorResponse("That category is not in this workspace", 404);
    return successResponse({ data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof CategoryNameTaken) {
      return errorResponse(error.message, 409);
    }
    console.error("[API] PATCH /api/v2/retail/categories/[id] error:", error);
    return errorResponse("The category was not saved");
  }
}
