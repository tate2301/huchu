import { NextRequest, NextResponse } from "next/server";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { patchTransfer, transferPatch } from "@/lib/retail/stock/transfer-changes";
import { loadTransferView } from "@/lib/retail/stock/transfer-record";

import { requireRetailSession } from "../../../_helpers";
import { isId, NOT_FOUND, refusalResponse, transferActor } from "./respond";

/**
 * One transfer (30-stock 4.5, 5.14). `GET` → `TransferView` (`retail.transfers:view`;
 * cost and value only for roles that see cost). `PATCH { toSiteId?, vehicle?,
 * driver?, note? }` → `{ data, changed }` (`retail.transfers:update`): To only
 * while nothing has been received (409 "Part of it has been received, so it is
 * going to Borrowdale."), one `RETAIL_RECORD.EDITED` per field.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.transfers", "view");
  if (gate) return gate;

  const { id } = await params;
  if (!isId(id)) return errorResponse(NOT_FOUND, 404);
  try {
    const view = await loadTransferView(session.user.companyId, id, { canSeeCost: transferActor(session).canSeeCost });
    if (!view) return errorResponse(NOT_FOUND, 404);
    return successResponse({ data: view });
  } catch (error) {
    return refusalResponse(error, "GET /api/v2/retail/stock/transfers/[id]", "That transfer would not load. Try again.");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.transfers", "update");
  if (gate) return gate;

  const { id } = await params;
  if (!isId(id)) return errorResponse(NOT_FOUND, 404);
  const parsed = transferPatch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = String(issue?.path[0] ?? "body");
    const message = issue?.message ?? "Check what you changed.";
    return fieldErrorResponse(message, { [field]: message });
  }

  try {
    const actor = transferActor(session);
    const changed = await patchTransfer(actor, id, parsed.data);
    const data = await loadTransferView(actor.companyId, id, { canSeeCost: actor.canSeeCost });
    return successResponse({ data, changed });
  } catch (error) {
    return refusalResponse(error, "PATCH /api/v2/retail/stock/transfers/[id]", "That change was not saved. Try again.");
  }
}
