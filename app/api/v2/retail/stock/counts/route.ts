import { NextRequest, NextResponse } from "next/server";

import { fieldErrorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { countFieldErrors, countStartInput, startCount } from "@/lib/retail/stock/counts";

import { requireRetailSession } from "../../_helpers";
import { countActor, refusalResponse } from "./respond";

/**
 * Start a count (30-stock W-22 step 1, 4.4). `retail.counts:create` (owner,
 * manager, stock clerk).
 *
 * `{ scope, categoryIds?, lineIds?, placeId?, siteId?, counterId, blind, keepSelling }`
 * → 201 `{ data: { id, countNo, lines, counter, messaged } }`. Refused under
 * the sheet's fields (`cats`, `lines`, `place`, `site`, `who`): "Nothing to
 * count there.", "Pick who counts."; 409 when a line is in an open count. The
 * list is the `retail-stock-counts` source.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.counts", "create");
  if (gate) return gate;

  const parsed = countStartInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const fieldErrors = countFieldErrors(parsed.error);
    return fieldErrorResponse(Object.values(fieldErrors)[0] ?? "Check the count.", fieldErrors);
  }

  try {
    const data = await startCount(countActor(session), parsed.data, request.url);
    return successResponse({ data }, 201);
  } catch (error) {
    return refusalResponse(error, "POST /api/v2/retail/stock/counts", "That count was not started. Try again.");
  }
}
