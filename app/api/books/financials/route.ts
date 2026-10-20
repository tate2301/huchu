import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { guardBooks } from "@/lib/books/core";
import { toCsv } from "@/lib/books/csv";
import { financialsQuery, readFinancials } from "@/lib/books/ledger-pages";
import { prisma } from "@/lib/prisma";

/** Books → Ledger → Financial statements: profit and loss, balance sheet and cash flow, by month and cost centre. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { refused } = await guardBooks(sessionResult.session, "view", { area: "ledger" });
    if (refused) return refused;
    const params = new URL(request.url).searchParams;
    const query = financialsQuery.parse(Object.fromEntries(["tab", "month", "compare", "cc"].map((key) => [key, params.get(key) ?? undefined])));
    const page = await readFinancials(prisma, sessionResult.session.user.companyId, query);
    if (params.get("format") === "csv") {
      const body = toCsv(["", ...page.columns], page.rows.map((row) => [row.kind === "group" ? row.label.toUpperCase() : row.label, ...row.amounts]));
      const name = { pl: "profit-and-loss", bs: "balance-sheet", cf: "cash-flow" }[page.query.tab];
      return new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}-${page.query.month}.csv"` } });
    }
    return successResponse(page);
  } catch (error) {
    console.error("[API] GET /api/books/financials error:", error);
    return errorResponse("Could not read the statements");
  }
}
