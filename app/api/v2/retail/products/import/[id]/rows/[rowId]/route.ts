import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { importFailure } from "@/lib/retail/import/routes";
import { editRow } from "@/lib/retail/import/store";
import { NOT_FOUND } from "@/lib/retail/import/words";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailParams } from "@/lib/retail/request";

import { requireRetailSession } from "../../../../../_helpers";

const cell = z.string().max(200, "Keep a cell to 200 characters.").nullable().optional();
const body = z.object({ name: cell, category: cell, price: cell, barcode: cell }).strict();
const ids = z.object({ id: z.string().uuid(), rowId: z.string().uuid() });

/**
 * A cell typed on the Check step (10-setup 4.11): the row as typed, then the
 * whole file checked again. `{ data: { row, counts } }`; 409 once the import
 * is not being checked. `retail.catalog:create`.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; rowId: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.catalog", "create");
  if (gate) return gate;

  const path = await parseRetailParams(params, ids);
  if (path.response) return errorResponse(NOT_FOUND, 404);
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Check the cells.", 400);

  try {
    const data = await editRow(session.user.companyId, path.data.id, path.data.rowId, parsed.data);
    return successResponse({ data });
  } catch (error) {
    return importFailure(error, "PATCH /api/v2/retail/products/import/[id]/rows/[rowId]");
  }
}
