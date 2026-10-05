import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { cancelTransfers, transferIdsInput } from "@/lib/retail/stock/transfers";

import { requireRetailSession } from "../../../_helpers";

/**
 * Transfers › tick rows › Cancel (30-stock 4.5, ask `canceltransfers`).
 * `retail.transfers:delete` (owner, manager). `{ ids }` → `{ cancelled, skipped }`
 * by transfer number: everything still on the way goes back on the site it
 * came from; received and cancelled ones are skipped.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.transfers", "delete");
  if (gate) return gate;

  const parsed = transferIdsInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Tick a transfer first.", 400);

  try {
    const result = await cancelTransfers(
      {
        companyId: session.user.companyId,
        userId: session.user.id,
        userName: session.user.name ?? null,
        userRole: session.user.role ?? null,
      },
      parsed.data.ids,
    );
    return successResponse(result);
  } catch (error) {
    console.error("[API] POST /api/v2/retail/stock/transfers/cancel error:", error);
    return errorResponse("Those transfers were not cancelled. Nothing moved; try again.");
  }
}
