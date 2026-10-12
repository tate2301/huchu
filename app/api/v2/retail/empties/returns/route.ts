import { NextRequest, NextResponse } from "next/server";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { bookEmptiesReturn, emptiesFieldErrors, returnInput, shortName } from "@/lib/retail/stock/empties";
import { formatMoney } from "@/lib/workspace/format";

import { requireRetailSession } from "../../_helpers";
import { emptiesActor, emptiesRefusal } from "../_answer";

/**
 * Return empties to a supplier (30-stock W-27 step 3, STK-09): the bottles and
 * crates leave the store and their deposit is owed by the supplier until their
 * credit note arrives. `retail.empties:view` and `create`: a cashier, who
 * may only take bottles back at the till, cannot book one.
 *
 * `{ supplierId, bottles, crates, goingBackWith, siteId? }` → 201
 * `{ data: { id, deposit }, message: "Return booked. Delta owes US$84.00 in deposits." }`.
 * Refused under its field: "Only 412 bottles in the store.", "Say how many
 * bottles or crates.", "Pick the supplier."; 409 when empties are off.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.empties", "view") ?? requireRetailPermission(session, "retail.empties", "create");
  if (gate) return gate;

  const parsed = returnInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const fieldErrors = emptiesFieldErrors(parsed.error);
    return fieldErrorResponse(Object.values(fieldErrors)[0] ?? "Check the return.", fieldErrors);
  }

  try {
    const booked = await prisma.$transaction((tx) =>
      bookEmptiesReturn(tx, {
        actor: emptiesActor(session),
        siteId: parsed.data.siteId ?? null,
        supplierId: parsed.data.supplierId,
        bottles: parsed.data.bottles,
        crates: parsed.data.crates,
        note: parsed.data.goingBackWith,
      }),
    );
    const deposit = booked.deposit.toFixed(2);
    return successResponse(
      {
        data: { id: booked.id, deposit },
        message: `Return booked. ${shortName(booked.supplierName)} owes ${formatMoney(Number(deposit))} in deposits.`,
      },
      201,
    );
  } catch (error) {
    const refused = emptiesRefusal(error);
    if (refused) return refused;
    console.error("[API] POST /api/v2/retail/empties/returns error:", error);
    return errorResponse("That return was not booked. Nothing moved; try again.");
  }
}
