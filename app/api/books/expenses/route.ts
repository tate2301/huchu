import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { expensesCsv, readExpenseQuery, readExpenses } from "@/lib/books/expenses";
import { prisma } from "@/lib/prisma";

/** Books → Expenses, filtered and paged; `format=csv` is Export, every page. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const companyId = sessionResult.session.user.companyId;
    const params = new URL(request.url).searchParams;
    const query = readExpenseQuery(params);
    if (params.get("format") === "csv") {
      return new NextResponse(await expensesCsv(prisma, companyId, query), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="expenses.csv"',
        },
      });
    }
    return successResponse(await readExpenses(prisma, companyId, query));
  } catch (error) {
    console.error("[API] GET /api/books/expenses error:", error);
    return errorResponse("Could not read the expenses");
  }
}
