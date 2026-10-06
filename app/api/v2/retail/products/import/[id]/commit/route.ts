import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { commitImport } from "@/lib/retail/import/commit";
import { importFailure } from "@/lib/retail/import/routes";
import { NOT_FOUND } from "@/lib/retail/import/words";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { productActor } from "@/lib/retail/products/routes";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";

import { postRetailJournal, requireRetailSession } from "../../../../_helpers";

/**
 * "Import {ok}, skip {n}" (W-08): the ready rows go into Products, the rest
 * are skipped. `{ data: { created, updated, skipped } }`; 409 once it is not
 * being checked (a second commit). `retail.catalog:create`.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.catalog", "create");
  if (gate) return gate;

  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return errorResponse(NOT_FOUND, 404);
  try {
    const data = await commitImport(productActor(session), path.data.id, postRetailJournal);
    return successResponse({ data });
  } catch (error) {
    return importFailure(error, "POST /api/v2/retail/products/import/[id]/commit");
  }
}
