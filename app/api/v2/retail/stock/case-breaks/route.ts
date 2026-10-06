import { NextRequest, NextResponse } from "next/server";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { breakCase, breakCaseInput, CaseBreakRefused } from "@/lib/retail/stock/cases";

import { requireRetailSession } from "../../_helpers";

/**
 * Break a case (30-stock W-26): `{ caseProductId, siteId?, cases }` → 201
 * `{ data: { reference, cases, singles, caseOnHand, singleOnHand }, message }`.
 * `retail.adjustments:create`; a cashier (`retail.sell:create`) only on an
 * open shift at that branch with no singles left, the till's prompt. No
 * journal: the same goods on the same account.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = canRetailSessionDo(session, "retail.adjustments", "create")
    ? null
    : requireRetailPermission(session, "retail.sell", "create");
  if (gate) return gate;

  const parsed = breakCaseInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = String(issue?.path[0] ?? "");
    const message = issue?.message ?? "Say how many cases to open";
    return fieldErrorResponse(message, field ? { [field]: message } : {});
  }

  try {
    const result = await breakCase({
      actor: {
        companyId: session.user.companyId,
        userId: session.user.id,
        userName: session.user.name ?? null,
        userRole: session.user.role ?? null,
      },
      ...parsed.data,
    });
    const { message, ...data } = result;
    return successResponse({ data, message }, 201);
  } catch (error) {
    if (error instanceof CaseBreakRefused) return errorResponse(error.message, error.status);
    console.error("[API] POST /api/v2/retail/stock/case-breaks error:", error);
    return errorResponse("That case was not opened. Nothing moved; try again.");
  }
}
