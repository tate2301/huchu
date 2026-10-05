import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { cancelTransfer } from "@/lib/retail/stock/transfer-changes";
import { loadTransferView } from "@/lib/retail/stock/transfer-record";

import { requireRetailSession } from "../../../../_helpers";
import { isId, NOT_FOUND, refusalResponse, transferActor } from "../respond";

/**
 * A transfer's ⋯ › Cancel the transfer (30-stock 4.5, ask `canceltransfer`).
 * `retail.transfers:delete` (owner, manager). → `{ data }`: what was still on
 * the way is back on From. 409 "TRF-0007 has been received.".
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.transfers", "delete");
  if (gate) return gate;

  const { id } = await params;
  if (!isId(id)) return errorResponse(NOT_FOUND, 404);
  try {
    const actor = transferActor(session);
    const { transferNo } = await cancelTransfer(actor, id);
    const data = await loadTransferView(actor.companyId, id, { canSeeCost: actor.canSeeCost });
    return successResponse({ data, message: `${transferNo} cancelled.` });
  } catch (error) {
    return refusalResponse(error, "POST /api/v2/retail/stock/transfers/[id]/cancel", "That transfer was not cancelled. Nothing moved; try again.");
  }
}
