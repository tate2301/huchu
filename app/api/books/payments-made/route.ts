import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { ReceiptRefused } from "@/lib/accounting/payments";
import { canDo, guardBooks } from "@/lib/books/core";
import { paySupplier, supplierPaymentSchema } from "@/lib/books/payment-out-create";
import { paymentsOutCsv, readPaymentOutQuery, readPaymentsOut } from "@/lib/books/payments-out";
import { resolveBaseCurrency } from "@/lib/money";
import { prisma } from "@/lib/prisma";

/** Books → Payments made (BkPaymentsOut), filtered and paged; `format=csv` is Export, every page. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { actor, refused } = await guardBooks(sessionResult.session, "view", { area: "bills" });
    if (refused) return refused;
    const params = new URL(request.url).searchParams;
    const query = readPaymentOutQuery(params);
    const base = (await resolveBaseCurrency(actor.companyId)).toUpperCase();
    if (params.get("format") === "csv") {
      return new NextResponse(await paymentsOutCsv(prisma, actor.companyId, query, base), {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="payments-made.csv"' },
      });
    }
    const view = await readPaymentsOut(prisma, actor.companyId, query, base);
    return successResponse({
      ...view,
      can: {
        approve: canDo(actor, "approve", { kind: "payment" }).allowed,
        pay: canDo(actor, "pay", { kind: "payment" }).allowed,
        draft: canDo(actor, "draft.create", { kind: "payment" }).allowed,
        void: canDo(actor, "void", { kind: "payment" }).allowed,
      },
      me: actor.userId,
    });
  } catch (error) {
    console.error("[API] GET /api/books/payments-made error:", error);
    return errorResponse("Could not read the payments");
  }
}

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
