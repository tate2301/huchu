import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { productActor } from "@/lib/retail/products/routes";
import { parseRetailQuery } from "@/lib/retail/request";
import {
  NOTHING_TO_CHANGE,
  readReorderLines,
  reorderLevelsBody,
  saveReorderLevels,
  stockLineFieldErrors,
  StockLineRefusal,
} from "@/lib/retail/stock/level-changes";
import { KEEP_DAYS } from "@/lib/retail/stock/reorder";

import { requireRetailSession } from "../../_helpers";

const linesQuery = z.object({
  lineIds: z
    .string()
    .transform((value) => value.split(",").map((id) => id.trim()).filter(Boolean))
    .pipe(z.array(z.string().uuid()).min(1).max(500)),
});

/**
 * What Change reorder levels works from (30-stock 4.4): `?lineIds=` (500 at
 * most) → `{ data: ReorderLine[], keepDays }`. `retail.stock:update`.
 */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.stock", "update");
  if (gate) return gate;

  const query = parseRetailQuery(request, linesQuery);
  if (query.response) return errorResponse("Tick the products to change, 500 at most.", 400);

  const data = await readReorderLines(session.user.companyId, query.data.lineIds, session.user.role);
  return successResponse({ data, keepDays: KEEP_DAYS });
}

/**
 * Save the levels (30-stock 4.4): `{ levels: [{ lineId, reorderAt }] }`, 1 to
 * 500, all or none. `retail.stock:update`. `{ saved }`; 400 under
 * `levels.<i>`; 404 when any line is not this shop's.
 */
export async function PUT(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.stock", "update");
  if (gate) return gate;

  const body: unknown = await request.json().catch(() => null);
  if (body === null || typeof body !== "object" || Array.isArray(body)) return errorResponse(NOTHING_TO_CHANGE, 400);
  const parsed = reorderLevelsBody.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = stockLineFieldErrors(parsed.error);
    return fieldErrorResponse(Object.values(fieldErrors)[0] ?? "Check the levels.", fieldErrors);
  }

  try {
    const saved = await prisma.$transaction((tx) => saveReorderLevels(tx, productActor(session), parsed.data.levels));
    return successResponse({ saved });
  } catch (error) {
    if (error instanceof StockLineRefusal) return errorResponse(error.message, error.status);
    console.error("[API] PUT /api/v2/retail/stock/reorder error:", error);
    return errorResponse("That did not work. Nothing was saved; try again.");
  }
}
