import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import {
  CategoryNameTaken,
  categoryInput,
  createRetailCategory,
  listRetailCategories,
} from "@/lib/retail/categories";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailQuery } from "@/lib/retail/request";
import { requireRetailSession } from "../_helpers";

const listQuery = z.object({
  /** `true` lists archived categories too, for Products › Categories. */
  archived: z.enum(["true", "false"]).optional(),
});

/**
 * The shop's categories — the list every product field picks from.
 *
 * Reading them is the range's gate: anyone who can see products can see what
 * they are filed under. Adding one is the range's `create`, so a manager can
 * add "Mixers" from inside the product form without leaving it.
 */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const gate = requireRetailPermission(session, "retail.catalog", "view");
  if (gate) return gate;

  const query = parseRetailQuery(request, listQuery);
  if (query.response) return query.response;

  const data = await listRetailCategories(session.user.companyId, {
    includeArchived: query.data.archived === "true",
  });
  return successResponse({ data });
}

export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const gate = requireRetailPermission(session, "retail.categories", "create");
  if (gate) return gate;

  try {
    const input = categoryInput.parse(await request.json());
    const data = await createRetailCategory(session.user.companyId, input);
    return successResponse({ data }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof CategoryNameTaken) {
      return errorResponse(error.message, 409);
    }
    console.error("[API] POST /api/v2/retail/categories error:", error);
    return errorResponse("The category was not added");
  }
}
