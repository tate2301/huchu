import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { z } from "zod";

import { booksActor, canDo, guardBooks } from "@/lib/books/core";
import { ReceiptRefused } from "@/lib/books/core/receipt-facts";
import { booksPaymentSchema, recordBooksPayment } from "@/lib/books/payment-create";
import { paymentsCsv, readPaymentQuery, readPayments } from "@/lib/books/payments";
import { prisma } from "@/lib/prisma";

/** Books → Payments, filtered and paged, with what this person may do from a row; `format=csv` is Export, every page. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const companyId = sessionResult.session.user.companyId;
    const params = new URL(request.url).searchParams;
    const query = readPaymentQuery(params);
    if (params.get("format") === "csv") {
      return new NextResponse(await paymentsCsv(prisma, companyId, query), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="payments.csv"',
        },
      });
    }
    const can = { void: canDo(await booksActor(sessionResult.session), "void", { kind: "receipt" }).allowed };
    return successResponse({ ...(await readPayments(prisma, companyId, query)), can });
  } catch (error) {
    console.error("[API] GET /api/books/payments error:", error);
    return errorResponse("Could not read the payments");
  }
}

/** Books' Record a payment: one customer's money, put on their invoices oldest first, the rest on account. */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const input = booksPaymentSchema.parse(await request.json());
    const { actor, refused } = await guardBooks(sessionResult.session, "issue", { kind: "receipt" });
    if (refused) return refused;
    return successResponse(await recordBooksPayment(actor, input), 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Check the payment: something in it is not filled in right.", 400, error.issues);
    if (error instanceof ReceiptRefused) return errorResponse(error.message, error.status);
    console.error("[API] POST /api/books/payments error:", error);
    return errorResponse("Could not record the payment");
  }
}
