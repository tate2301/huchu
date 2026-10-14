import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { readBank, type BankTab } from "@/lib/books/bank";
import { prisma } from "@/lib/prisma";

const TABS: BankTab[] = ["to-match", "matched", "everything"];

/** Books → Bank: an account's statement lines, each with Vane's match or why there is none. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const params = new URL(request.url).searchParams;
    const tab = TABS.find((value) => value === params.get("tab")) ?? "to-match";
    return successResponse(await readBank(prisma, sessionResult.session.user.companyId, { accountId: params.get("account"), tab }));
  } catch (error) {
    console.error("[API] GET /api/books/bank error:", error);
    return errorResponse("Could not read the bank");
  }
}
