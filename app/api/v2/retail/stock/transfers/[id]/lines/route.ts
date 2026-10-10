import { NextRequest, NextResponse } from "next/server";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { changeTransferLines, transferLinesInput } from "@/lib/retail/stock/transfer-changes";
import { transferFieldErrors } from "@/lib/retail/stock/transfers";

import { requireRetailSession } from "../../../../_helpers";
import { isId, NOT_FOUND, refusalResponse, transferActor } from "../respond";

/**
 * Change the lines (30-stock 5.16, W-24 step 4). `retail.transfers:update`.
 * `{ lines: [{ lineId, quantity }] }` → `{ data: { id, transferNo, units, message } }`;
 * each difference leaves or comes back to From now. 409 "Part of it has been
 * received. Receive the rest or cancel it."; a line beyond what From holds
 * "Only 9 at Harare Main Branch." under `lines.<i>`.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.transfers", "update");
  if (gate) return gate;

  const { id } = await params;
  if (!isId(id)) return errorResponse(NOT_FOUND, 404);
  const parsed = transferLinesInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const fieldErrors = transferFieldErrors(parsed.error);
    return fieldErrorResponse(Object.values(fieldErrors)[0] ?? "Check the lines.", fieldErrors);
  }

  try {
    const data = await changeTransferLines(transferActor(session), id, parsed.data);
    return successResponse({ data });
  } catch (error) {
    return refusalResponse(error, "PUT /api/v2/retail/stock/transfers/[id]/lines", "The lines were not changed. Nothing moved; try again.");
  }
}
