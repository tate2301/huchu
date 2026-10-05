import { NextRequest, NextResponse } from "next/server";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { sendTransfer, transferFieldErrors, transferInput, TransferRefusal } from "@/lib/retail/stock/transfers";

import { requireRetailSession } from "../../_helpers";

/**
 * Send stock to another site (30-stock W-24 step 2, 4.5). `retail.transfers:create`
 * (owner, manager, stock clerk).
 *
 * `{ fromSiteId, toSiteId, lines: [{ lineId, quantity }], takenById, arrives }`
 * → 201 `{ data: { id, transferNo, units, value?, to } }`. Refused field by
 * field (`from`, `to`, `lines.<i>`, `who`, `when`): "Pick a different site.",
 * "Only 9 at Harare Main Branch.". The list is the `retail-stock-transfers`
 * source.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.transfers", "create");
  if (gate) return gate;

  const parsed = transferInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const fieldErrors = transferFieldErrors(parsed.error);
    return fieldErrorResponse(Object.values(fieldErrors)[0] ?? "Check the transfer.", fieldErrors);
  }

  try {
    const data = await sendTransfer(
      {
        companyId: session.user.companyId,
        userId: session.user.id,
        userName: session.user.name ?? null,
        userRole: session.user.role ?? null,
        canSeeCost: canRetailSessionDo(session, "retail.catalog", "view-cost"),
      },
      parsed.data,
    );
    return successResponse({ data }, 201);
  } catch (error) {
    if (error instanceof TransferRefusal) {
      return error.fieldErrors
        ? fieldErrorResponse(error.message, error.fieldErrors, error.status)
        : errorResponse(error.message, error.status);
    }
    console.error("[API] POST /api/v2/retail/stock/transfers error:", error);
    return errorResponse("That transfer was not sent. Nothing moved; try again.");
  }
}
