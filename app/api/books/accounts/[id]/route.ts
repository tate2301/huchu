import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { readAccount, type AccountTab } from "@/lib/books/bank-accounts";
import { prisma } from "@/lib/prisma";

const TABS: AccountTab[] = ["transactions", "lines", "reconciliations"];

/** Books → Bank & cash → one account: its transactions with the running balance, its statement lines, its reconciliations. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { id } = await params;
    const search = new URL(request.url).searchParams;
    const tab = TABS.find((value) => value === search.get("tab")) ?? "transactions";
    const page = await readAccount(prisma, sessionResult.session.user.companyId, id, { tab, q: search.get("q") ?? "", range: search.get("range") === "all" ? "all" : "since" });
    if (!page) return errorResponse("That account is not in this workspace", 404);
    return successResponse(page);
  } catch (error) {
    console.error("[API] GET /api/books/accounts/[id] error:", error);
    return errorResponse("Could not read the account");
  }
}
