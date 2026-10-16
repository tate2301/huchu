import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { isWorkspaceOwner } from "@/lib/books/owner";
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
    const can = { void: isWorkspaceOwner(sessionResult.session.user.role) };
    return successResponse({ ...(await readPayments(prisma, companyId, query)), can });
  } catch (error) {
    console.error("[API] GET /api/books/payments error:", error);
    return errorResponse("Could not read the payments");
  }
}
