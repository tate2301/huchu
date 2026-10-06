import { NextRequest, NextResponse } from "next/server";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { tillRuleResponse } from "@/lib/retail/manager-pin";
import { adjustInput, adjustmentJournal, adjustStock, AdjustRefused } from "@/lib/retail/stock/adjustments";

import { postRetailJournal, requireRetailSession } from "../../_helpers";

/**
 * Adjust stock (30-stock W-23): `{ productId, siteId?, why, n, note, photoUrl?,
 * approver? }` → 201 `{ data: { reference, movementId, lineId, delta, onHand,
 * value? }, message }`. `retail.adjustments:create` (owner, manager, stock
 * clerk). Over the shop's limit a manager's PIN is asked (409 `needsApprover`,
 * 423 while locked). `value` only for roles that may see cost. The books
 * follow after the commit, keyed by the movement's id.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.adjustments", "create");
  if (gate) return gate;

  const parsed = adjustInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = String(issue?.path[0] ?? "");
    const message = issue?.message ?? "Check the adjustment.";
    return fieldErrorResponse(message, field ? { [field]: message } : {});
  }

  const actor = {
    companyId: session.user.companyId,
    userId: session.user.id,
    userName: session.user.name ?? null,
    userRole: session.user.role ?? null,
  };
  let result: Awaited<ReturnType<typeof adjustStock>>;
  try {
    result = await adjustStock({ actor, ...parsed.data });
  } catch (error) {
    const approval = tillRuleResponse(error);
    if (approval) return approval;
    if (error instanceof AdjustRefused) {
      return error.field
        ? fieldErrorResponse(error.message, { [error.field]: error.message }, error.status)
        : errorResponse(error.message, error.status);
    }
    console.error("[API] POST /api/v2/retail/stock/adjustments error:", error);
    return errorResponse("That adjustment was not saved. Nothing moved; try again.");
  }

  // The stock has moved and its ADJ number is taken, so the answer is the
  // saved adjustment, never "try again" (a retry would take it off twice). A
  // posting that fails stays PENDING or FAILED as its accounting event, which
  // the posting run retries.
  const journal = adjustmentJournal(result, actor);
  if (journal) {
    try {
      await postRetailJournal(journal);
    } catch (error) {
      console.error(`[API] POST /api/v2/retail/stock/adjustments: ${result.reference} saved, its journal did not post:`, error);
    }
  }
  const seeCost = canRetailSessionDo(session, "retail.catalog", "view-cost");
  return successResponse(
    {
      data: {
        reference: result.reference,
        movementId: result.movementId,
        lineId: result.lineId,
        delta: result.delta,
        onHand: result.onHand,
        ...(seeCost ? { value: result.value } : {}),
      },
      message: result.message,
    },
    201,
  );
}
