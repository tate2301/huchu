import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { ReceiptRefused } from "@/lib/accounting/payments";
import { guardBooks } from "@/lib/books/core";
import { refusedResponse } from "@/lib/books/core/refused";
import { draftPaymentSchema, draftSupplierPayment } from "@/lib/books/core/supplier-payments";
import { draftPayments, supplierPaymentSchema } from "@/lib/books/payment-out-create";

/**
 * Supplier payments as drafts (D5): nothing moves until each is approved and
 * paid. One payment (`billId`), or the form's several bills (`bills`), each a
 * draft, sent for approval at once with `send`.
 */
const formSchema = supplierPaymentSchema.extend({ send: z.boolean().default(false) });

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const body = (await request.json()) as Record<string, unknown>;
    const { actor, refused } = await guardBooks(sessionResult.session, "draft.create", { kind: "payment" });
    if (refused) return refused;
    if (Array.isArray(body.bills)) {
      const input = formSchema.parse(body);
      return successResponse(await draftPayments(actor, input, input.send), 201);
    }
    return successResponse(await draftSupplierPayment(actor, draftPaymentSchema.parse(body)), 201);
  } catch (error) {
    if (error instanceof ReceiptRefused) return errorResponse(error.message, error.status);
    const refused = refusedResponse(error, "Choose the supplier, the bills and the account it is paid from.");
    if (refused) return refused;
    console.error("[API] POST /api/books/payments-made/drafts error:", error);
    return errorResponse("Could not save the payment");
  }
}
