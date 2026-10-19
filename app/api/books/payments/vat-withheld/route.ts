import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor, recordVatWithheldByCustomer } from "@/lib/books/core";
import { refusedResponse } from "@/lib/books/core/refused";

const schema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().positive(),
  certificateNo: z.string().trim().min(1).max(80),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * VAT a customer kept back as an appointed withholding agent (D17): it settles
 * that much of the invoice against their certificate and lands on 1170, a
 * credit on the VAT return. At most a third of the invoice's VAT.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const body = schema.parse(await request.json());
    const receipt = await recordVatWithheldByCustomer(await booksActor(sessionResult.session), { ...body, date: new Date(`${body.date}T00:00:00.000Z`) });
    return successResponse({ id: receipt.id }, 201);
  } catch (error) {
    const refusal = refusedResponse(error, "Enter what they kept and their certificate");
    if (refusal) return refusal;
    console.error("[API] POST /api/books/payments/vat-withheld error:", error);
    return errorResponse(error instanceof Error ? error.message : "The VAT withheld was not recorded");
  }
}
