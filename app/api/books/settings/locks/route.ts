import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { canDo, guardBooks } from "@/lib/books/core";
import { readLocks } from "@/lib/books/settings-pages";
import { prisma } from "@/lib/prisma";

/** Books → Settings → Locks & periods: the lock policy, the freeze date and each month's state. Changes go through the closing routes, owner only. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { actor, refused } = await guardBooks(sessionResult.session, "view", { area: "ledger" });
    if (refused) return refused;
    return successResponse(await readLocks(prisma, sessionResult.session.user.companyId, { freeze: canDo(actor, "period.freeze").allowed, reopen: canDo(actor, "period.reopen").allowed, close: canDo(actor, "period.close").allowed }));
  } catch (error) {
    console.error("[API] GET /api/books/settings/locks error:", error);
    return errorResponse("Could not read the locks");
  }
}
