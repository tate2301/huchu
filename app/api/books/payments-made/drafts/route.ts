import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { guardBooks } from "@/lib/books/core";
import { refusedResponse } from "@/lib/books/core/refused";
import { draftPaymentSchema, draftSupplierPayment } from "@/lib/books/core/supplier-payments";

/** A supplier payment as a draft (D5): nothing moves until it is approved and paid. */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const input = draftPaymentSchema.parse(await request.json());
    const { actor, refused } = await guardBooks(sessionResult.session, "draft.create", { kind: "payment" });
    if (refused) return refused;
    return successResponse(await draftSupplierPayment(actor, input), 201);
  } catch (error) {
    const refused = refusedResponse(error, "Choose the supplier, the account and the amount.");
    if (refused) return refused;
    console.error("[API] POST /api/books/payments-made/drafts error:", error);
    return errorResponse("Could not save the payment");
  }
}
