import { NextRequest, NextResponse } from "next/server";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { bottlesBackInput, emptiesFieldErrors, payBottlesBack } from "@/lib/retail/stock/empties";

import { requireRetailSession } from "../../_helpers";
import { emptiesActor, emptiesRefusal } from "../_answer";

/**
 * Bottles back without a sale (30-stock W-27 step 2, STK-09): the customer's
 * empties go in the store and their deposit comes out of the caller's own
 * open drawer — an entry, a PAYOUT "Bottles back" on the shift and, after
 * commit, its journal. `retail.empties:create`; the till's "Bottles back · Pay"
 * (FLR-10) draws it.
 *
 * `{ shiftId, bottles, crates, customerId? }` → 201 `{ data: { paid: "8.40" } }`.
 * 409 "Open a shift to pay out." when the shift is not the caller's or not open.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.empties", "create");
  if (gate) return gate;

  const parsed = bottlesBackInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const fieldErrors = emptiesFieldErrors(parsed.error);
    return fieldErrorResponse(Object.values(fieldErrors)[0] ?? "Check the empties.", fieldErrors);
  }

  try {
    const paid = await payBottlesBack({ actor: emptiesActor(session), ...parsed.data });
    return successResponse({ data: { paid: paid.paid.toFixed(2) } }, 201);
  } catch (error) {
    const refused = emptiesRefusal(error);
    if (refused) return refused;
    console.error("[API] POST /api/v2/retail/empties/bottles-back error:", error);
    return errorResponse("Nothing was paid out. Try again.");
  }
}
