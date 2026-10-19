import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { readAccounts, type AccountKindKey } from "@/lib/books/bank-accounts";
import { prisma } from "@/lib/prisma";

const VIEWS = ["all", "bank", "mobile", "cash"] as const;

/** Books → Bank & cash → Accounts: every money account's balance, last reconciliation and lines to match. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const params = new URL(request.url).searchParams;
    const view = (VIEWS as readonly string[]).includes(params.get("view") ?? "") ? (params.get("view") as "all" | AccountKindKey) : "all";
    const page = await readAccounts(prisma, sessionResult.session.user.companyId, { view, q: params.get("q") ?? "" });
    if (params.get("format") === "csv") {
      const cell = (value: string | number) => (/[",\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value));
      const rows = [["Account", "Kind", "Currency", "Balance", `In ${page.baseCurrency}`, "Last reconciled", "To match"], ...page.rows.map((row) => [row.name, row.kind, row.currency, row.balance.toFixed(2), row.inBase === null ? "" : row.inBase.toFixed(2), row.lastReconciled ?? "", row.toMatch])];
      return new NextResponse(`${rows.map((row) => row.map(cell).join(",")).join("\n")}\n`, { headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="accounts.csv"' } });
    }
    return successResponse(page);
  } catch (error) {
    console.error("[API] GET /api/books/accounts error:", error);
    return errorResponse("Could not read the accounts");
  }
}
