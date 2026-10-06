import { NextRequest, NextResponse } from "next/server";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { productActor } from "@/lib/retail/products/routes";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";
import {
  LINE_NOT_FOUND,
  NOTHING_TO_CHANGE,
  stockLineFieldErrors,
  stockLinePatch,
  StockLineRefusal,
  updateStockLine,
} from "@/lib/retail/stock/level-changes";
import { readStockLines } from "@/lib/retail/stock/lines";

import { requireRetailSession } from "../../../_helpers";

/** One stock line (30-stock 4.2); 404 when it is not this shop's. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = canRetailSessionDo(session, "retail.adjustments", "create")
    ? null
    : requireRetailPermission(session, "retail.stock", "view");
  if (gate) return gate;

  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return errorResponse("That stock line is not this shop’s.", 404);

  const [line] = await readStockLines(session.user.companyId, { lineIds: [path.data.id] }, session.user.role);
  if (!line) return errorResponse("That stock line is not this shop’s.", 404);
  return successResponse({ data: line });
}

/**
 * Change one stock line (30-stock 4.3): any of `{ reorderAt, reorderQty,
 * shelf, placeId }`. `retail.stock:update`. `{ data: StockLineView, changed }`;
 * 400 under the field; 404 when the line is not this shop's.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.stock", "update");
  if (gate) return gate;

  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return errorResponse(LINE_NOT_FOUND, 404);

  const body: unknown = await request.json().catch(() => null);
  if (body === null || typeof body !== "object" || Array.isArray(body)) return errorResponse(NOTHING_TO_CHANGE, 400);
  const parsed = stockLinePatch.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = stockLineFieldErrors(parsed.error);
    return fieldErrorResponse(Object.values(fieldErrors)[0] ?? "Check the line.", fieldErrors);
  }
  if (Object.values(parsed.data).every((value) => value === undefined)) return errorResponse(NOTHING_TO_CHANGE, 400);

  try {
    const changed = await prisma.$transaction((tx) => updateStockLine(tx, productActor(session), path.data.id, parsed.data));
    const [data] = await readStockLines(session.user.companyId, { lineIds: [path.data.id] }, session.user.role);
    return successResponse({ data, changed });
  } catch (error) {
    if (error instanceof StockLineRefusal) {
      return error.field ? fieldErrorResponse(error.message, { [error.field]: error.message }, error.status) : errorResponse(error.message, error.status);
    }
    console.error("[API] PATCH /api/v2/retail/stock/lines/[id] error:", error);
    return errorResponse("That did not work. Nothing was saved; try again.");
  }
}
