import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { guardBooks } from "@/lib/books/core";
import { toCsv } from "@/lib/books/csv";
import { ledgerQuery, readLedger } from "@/lib/books/ledger-pages";
import { prisma } from "@/lib/prisma";

/** Books → Ledger → General ledger: one account's lines with the running balance. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { refused } = await guardBooks(sessionResult.session, "view", { area: "ledger" });
    if (refused) return refused;
    const params = new URL(request.url).searchParams;
    const query = ledgerQuery.parse(Object.fromEntries(["account", "from", "to", "cc"].map((key) => [key, params.get(key) ?? undefined])));
    const page = await readLedger(prisma, sessionResult.session.user.companyId, query);
    if (params.get("format") === "csv") {
      const body = toCsv(["Date", "Entry", "Memo", "Source", "Debit", "Credit", "Balance"], [["", "", "Opening balance", "", null, null, page.opening], ...page.rows.map((row) => [row.date, row.number, row.memo, row.source, row.debit || null, row.credit || null, row.balance]), ["", "", "Closing balance", "", page.debit, page.credit, page.closing]]);
      return new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="general-ledger-${page.account?.code ?? "account"}.csv"` } });
    }
    return successResponse(page);
  } catch (error) {
    console.error("[API] GET /api/books/ledger error:", error);
    return errorResponse("Could not read the general ledger");
  }
}
