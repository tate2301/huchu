import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor } from "@/lib/books/core";
import { floatSchema, setUpFloat, spentSinceTopUp, topUpFloat, voucherSchema, writeVoucher } from "@/lib/books/core/petty-cash";
import { refusedResponse } from "@/lib/books/core/refused";

/**
 * Petty cash (D13, books-final §5.4): set a cash account up as a float, write
 * a voucher against it, see what a top-up would bring back, and top it up.
 */
const bodySchema = z.discriminatedUnion("action", [
  floatSchema.extend({ action: z.literal("float") }),
  voucherSchema.extend({ action: z.literal("voucher") }),
  z.object({ action: z.literal("top-up"), floatId: z.string().uuid(), fromBankAccountId: z.string().uuid() }),
]);

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const floatId = new URL(request.url).searchParams.get("floatId");
    if (!floatId) return errorResponse("Which float?", 400);
    return successResponse(await spentSinceTopUp(sessionResult.session.user.companyId, floatId));
  } catch (error) {
    console.error("[API] GET /api/books/petty-cash error:", error);
    return errorResponse("Could not read the float");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const body = bodySchema.parse(await request.json());
    const actor = await booksActor(sessionResult.session);
    switch (body.action) {
      case "float":
        return successResponse(await setUpFloat(actor, body));
      case "voucher":
        return successResponse(await writeVoucher(actor, body), 201);
      case "top-up":
        return successResponse(await topUpFloat(actor, body), 201);
    }
  } catch (error) {
    const refused = refusedResponse(error);
    if (refused) return refused;
    console.error("[API] POST /api/books/petty-cash error:", error);
    return errorResponse("Could not save it");
  }
}
