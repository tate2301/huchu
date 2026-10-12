import { NextRequest, NextResponse } from "next/server";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { creditInput, emptiesFieldErrors, recordEmptiesCredit } from "@/lib/retail/stock/empties";
import { formatMoney } from "@/lib/workspace/format";

import { requireRetailSession } from "../../../../_helpers";
import { emptiesActor, emptiesRefusal } from "../../../_answer";

/**
 * Record a supplier's credit note against a return (30-stock W-27 step 4,
 * STK-09): what they owe on it falls by the amount. `retail.empties:update`.
 *
 * `{ creditNote, amount: "84.00", note? }` → 201 `{ data: { id }, message:
 * "Delta Beverages credited US$84.00." }`. More than they owe, or nothing, is
 * refused under `amount`: "Delta Beverages owes US$84.00 on this return.".
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.empties", "update");
  if (gate) return gate;

  const parsed = creditInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const fieldErrors = emptiesFieldErrors(parsed.error);
    return fieldErrorResponse(Object.values(fieldErrors)[0] ?? "Check the credit note.", fieldErrors);
  }

  const { id } = await params;
  try {
    const credited = await prisma.$transaction((tx) =>
      recordEmptiesCredit(tx, {
        actor: emptiesActor(session),
        returnId: id,
        creditNote: parsed.data.creditNote,
        amount: parsed.data.amount,
        note: parsed.data.note ?? null,
      }),
    );
    return successResponse(
      { data: { id: credited.id }, message: `${credited.supplier} credited ${formatMoney(credited.amount.toNumber())}.` },
      201,
    );
  } catch (error) {
    const refused = emptiesRefusal(error);
    if (refused) return refused;
    console.error("[API] POST /api/v2/retail/empties/returns/[id]/credit error:", error);
    return errorResponse("That credit note was not recorded. Try again.");
  }
}
