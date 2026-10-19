import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { ReceiptRefused } from "@/lib/accounting/payments";
import { guardBooks } from "@/lib/books/core";
import { paySupplier, supplierPaymentSchema } from "@/lib/books/payment-out-create";

/** Books' Pay a supplier (BkPaymentOutNew): one payment per bill, out of the chosen account, through the core. */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const input = supplierPaymentSchema.parse(await request.json());
    const total = input.bills.reduce((sum, row) => sum + row.amount, 0);
    const { actor, refused } = await guardBooks(sessionResult.session, "pay", { kind: "payment", amount: total });
    if (refused) return refused;
    return successResponse(await paySupplier(actor, input), 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Choose the supplier, the bills and the account it is paid from.", 400, error.issues);
    if (error instanceof ReceiptRefused) return errorResponse(error.message, error.status);
    console.error("[API] POST /api/books/payments-made error:", error);
    return errorResponse("Could not record the payment");
  }
}
