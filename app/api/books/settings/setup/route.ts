import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { canDo, guardBooks } from "@/lib/books/core";
import { readSetup } from "@/lib/books/settings-pages";
import { prisma } from "@/lib/prisma";

/** Books → Settings → Set up the books: each step and its state, and the opening balances. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { actor, refused } = await guardBooks(sessionResult.session, "view", { area: "ledger" });
    if (refused) return refused;
    return successResponse(await readSetup(prisma, sessionResult.session.user.companyId, { change: canDo(actor, "setup").allowed }));
  } catch (error) {
    console.error("[API] GET /api/books/settings/setup error:", error);
    return errorResponse("Could not read the set-up");
  }
}
