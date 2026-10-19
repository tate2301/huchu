import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { canDo, guardBooks } from "@/lib/books/core";
import { readSpending, readSpendingQuery, spendingCsv } from "@/lib/books/spending";
import { resolveBaseCurrency } from "@/lib/money";
import { prisma } from "@/lib/prisma";

/** Books → All spending (BkSpending): every money-out document this month, from the core's money-out rule; `format=csv` is Export. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { actor, refused } = await guardBooks(sessionResult.session, "view", { area: "bills" });
    if (refused) return refused;
    const params = new URL(request.url).searchParams;
    const query = readSpendingQuery(params);
    const base = (await resolveBaseCurrency(actor.companyId)).toUpperCase();
    const page = await readSpending(prisma, actor.companyId, query, base, {
      bill: canDo(actor, "draft.create", { kind: "bill" }).allowed,
      claim: true,
      voucher: true,
      requisition: canDo(actor, "draft.create", { kind: "requisition", module: "crm" }).allowed,
    });
    if (params.get("format") === "csv") {
      return new NextResponse(spendingCsv(page.rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="spending.csv"' } });
    }
    return successResponse(page);
  } catch (error) {
    console.error("[API] GET /api/books/expenses error:", error);
    return errorResponse("Could not read the spending");
  }
}
