import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { guardBooks } from "@/lib/books/core";
import { toCsv } from "@/lib/books/csv";
import { readTrialBalance, trialBalanceQuery } from "@/lib/books/ledger-pages";
import { prisma } from "@/lib/prisma";

/** Books → Ledger → Trial balance: by month (as at its last day) or over a range, by cost centre. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { refused } = await guardBooks(sessionResult.session, "view", { area: "ledger" });
    if (refused) return refused;
    const params = new URL(request.url).searchParams;
    const query = trialBalanceQuery.parse(Object.fromEntries(["view", "month", "from", "to", "cc", "zero"].map((key) => [key, params.get(key) ?? undefined])));
    const page = await readTrialBalance(prisma, sessionResult.session.user.companyId, query);
    if (params.get("format") === "csv") {
      const body = toCsv(["Code", "Account", "Type", "Debit", "Credit"], [...page.rows.map((row) => [row.code, row.name, row.type, row.debit || null, row.credit || null]), ["", "Total", "", page.debit, page.credit]]);
      return new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="trial-balance-${page.query.to}.csv"` } });
    }
    return successResponse(page);
  } catch (error) {
    console.error("[API] GET /api/books/trial-balance error:", error);
    return errorResponse("Could not read the trial balance");
  }
}
