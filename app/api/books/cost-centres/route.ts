import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { canDo, guardBooks } from "@/lib/books/core";
import { costCentreQuery, readCostCentres } from "@/lib/books/ledger-setup";
import { prisma } from "@/lib/prisma";

/** Books → Ledger → Cost centres: each one, what uses it and what it carried this month. Changes go through the routes that make them, behind canDo("setup"). */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { actor, refused } = await guardBooks(sessionResult.session, "view", { area: "ledger" });
    if (refused) return refused;
    const params = new URL(request.url).searchParams;
    const query = costCentreQuery.parse(Object.fromEntries(["q", "view"].map((key) => [key, params.get(key) ?? undefined])));
    return successResponse(await readCostCentres(prisma, sessionResult.session.user.companyId, query, { change: canDo(actor, "setup").allowed }));
  } catch (error) {
    console.error("[API] GET /api/books/cost-centres error:", error);
    return errorResponse("Could not read this page");
  }
}
