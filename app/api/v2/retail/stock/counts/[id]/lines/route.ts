import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";
import { LINE_TABS, loadCountLines, type LineTab } from "@/lib/retail/stock/counts";

import { requireRetailSession } from "../../../../_helpers";
import { countActor, isId, NOT_FOUND, refusalResponse } from "../../respond";

/**
 * A count's lines in the phone's order (30-stock 4.4):
 * `?tab=differ|match|all|recount` → `{ lines, progress: { counted, total } }`.
 * The counter (any role) or `retail.counts:view`. The counter of a blind count
 * is never sent what is expected.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const { id } = await params;
  if (!isId(id)) return errorResponse(NOT_FOUND, 404);
  const asked = request.nextUrl.searchParams.get("tab") ?? "all";
  const tab: LineTab = (LINE_TABS as readonly string[]).includes(asked) ? (asked as LineTab) : "all";

  const grants = {
    view: canRetailSessionDo(session, "retail.counts", "view"),
    update: canRetailSessionDo(session, "retail.counts", "update"),
    approve: canRetailSessionDo(session, "retail.counts", "approve"),
    seeCost: canRetailSessionDo(session, "retail.catalog", "view-cost"),
  };
  try {
    return successResponse(await loadCountLines(countActor(session), grants, id, tab));
  } catch (error) {
    return refusalResponse(error, "GET /api/v2/retail/stock/counts/[id]/lines", "The lines could not be loaded.");
  }
}
