import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { commitImport, commitStoppedSentence } from "@/lib/retail/import/commit";
import { ImportRefusal } from "@/lib/retail/import/refusal";
import { importFailure } from "@/lib/retail/import/routes";
import { NOT_FOUND } from "@/lib/retail/import/words";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { productActor } from "@/lib/retail/products/routes";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";

import { postRetailJournal, requireRetailSession } from "../../../../_helpers";

/** One batch of 200 rows takes about half a minute on a slow database; never more than one per call. */
export const maxDuration = 120;

/**
 * "Import {ok}, skip {n}" (W-08): the next batch of up to 200 ready rows goes
 * into Products; the page calls again while `left` is above 0, and the call
 * that leaves none finishes the import. `{ data: { created, updated, skipped,
 * left } }`, the counts so far; 409 once it is imported or thrown away (a
 * second commit). A call that fails part way says how many rows are in.
 * `retail.catalog:create`.
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
    if (!(error instanceof ImportRefusal)) {
      const sentence = await commitStoppedSentence(session.user.companyId, path.data.id).catch(() => null);
      if (sentence) {
        console.error("[API] POST /api/v2/retail/products/import/[id]/commit error:", error);
        return errorResponse(sentence, 500);
      }
    }
    return importFailure(error, "POST /api/v2/retail/products/import/[id]/commit");
  }
}
