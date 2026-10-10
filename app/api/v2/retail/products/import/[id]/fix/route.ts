import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { applyFix } from "@/lib/retail/import/fix";
import { importFailure } from "@/lib/retail/import/routes";
import { NOT_FOUND } from "@/lib/retail/import/words";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { productActor } from "@/lib/retail/products/routes";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";

import { requireRetailSession } from "../../../../_helpers";

const body = z.object({
  rowId: z.string().uuid("That row is not in this import."),
  fix: z.enum(["CREATE_CATEGORY", "UPDATE_MATCH"], { message: "Choose Create the category or Update that one." }),
});

/**
 * A flagged row's fix button (10-setup 4.11): "Create the category" (also
 * `retail.categories:create`) or "Update that one". `{ data: { rows, counts } }`,
 * every row it changed; 400, 409. `retail.catalog:create`.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.catalog", "create");
  if (gate) return gate;

  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return errorResponse(NOT_FOUND, 404);
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Choose a fix.", 400);

  if (parsed.data.fix === "CREATE_CATEGORY") {
    const categories = requireRetailPermission(session, "retail.categories", "create");
    if (categories) return categories;
  }

  try {
    const data = await applyFix(productActor(session), path.data.id, parsed.data);
    return successResponse({ data });
  } catch (error) {
    return importFailure(error, "POST /api/v2/retail/products/import/[id]/fix");
  }
}
