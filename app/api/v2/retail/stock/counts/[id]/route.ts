import { NextRequest, NextResponse } from "next/server";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { countPatch, renameCount } from "@/lib/retail/stock/count-review";
import { loadCountView } from "@/lib/retail/stock/counts";

import { requireRetailSession } from "../../../_helpers";
import { countActor, isId, NOT_FOUND, refusalResponse } from "../respond";

/**
 * One count (30-stock 4.4 `CountView`): `retail.counts:view`, or its counter
 * whatever their role (a cashier asked to count). Its value at cost only for
 * roles that may see cost, and so is `history` (the chart and the review aside).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const { id } = await params;
  if (!isId(id)) return errorResponse(NOT_FOUND, 404);

  const grants = {
    view: canRetailSessionDo(session, "retail.counts", "view"),
    update: canRetailSessionDo(session, "retail.counts", "update"),
    approve: canRetailSessionDo(session, "retail.counts", "approve"),
    seeCost: canRetailSessionDo(session, "retail.catalog", "view-cost"),
  };
  try {
    return successResponse({ data: await loadCountView(countActor(session), grants, id) });
  } catch (error) {
    return refusalResponse(error, "GET /api/v2/retail/stock/counts/[id]", "This count could not be loaded.");
  }
}

/**
 * The rail's Shelf (STK-06): `{ name }` (1–80), `retail.counts:update`.
 * → `{ data: CountView, changed }`; 409 "Approved counts do not change.".
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.counts", "update");
  if (gate) return gate;

  const { id } = await params;
  if (!isId(id)) return errorResponse(NOT_FOUND, 404);
  const parsed = countPatch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Name the shelf.";
    return fieldErrorResponse(message, { name: message });
  }

  const grants = {
    view: true,
    update: true,
    approve: canRetailSessionDo(session, "retail.counts", "approve"),
    seeCost: canRetailSessionDo(session, "retail.catalog", "view-cost"),
  };
  try {
    const actor = countActor(session);
    const { changed } = await renameCount(actor, id, parsed.data.name);
    return successResponse({ data: await loadCountView(actor, grants, id), changed });
  } catch (error) {
    return refusalResponse(error, "PATCH /api/v2/retail/stock/counts/[id]", "That change was not saved. Try again.");
  }
}
