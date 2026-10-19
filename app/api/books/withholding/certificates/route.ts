import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor, issueWithholdingCertificate } from "@/lib/books/core";
import { refusedResponse } from "@/lib/books/core/refused";

const schema = z.object({ paymentId: z.string().uuid() });

/** A certificate for what was withheld from a paid payment: WHT- and the payment's number. */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { paymentId } = schema.parse(await request.json());
    const payment = await issueWithholdingCertificate(await booksActor(sessionResult.session), paymentId);
    return successResponse({ id: payment.id, certificateNo: payment.certificateNo });
  } catch (error) {
    const refusal = refusedResponse(error);
    if (refusal) return refusal;
    console.error("[API] POST /api/books/withholding/certificates error:", error);
    return errorResponse("The certificate was not issued");
  }
}
