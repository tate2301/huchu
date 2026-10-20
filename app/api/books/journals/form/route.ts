import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { guardBooks } from "@/lib/books/core";
import { readJournalForm } from "@/lib/books/journals";
import { prisma } from "@/lib/prisma";

/** New journal's choices: accounts, cost centres, currencies and the second person limit. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { refused } = await guardBooks(sessionResult.session, "draft.create", { kind: "journal" });
    if (refused) return refused;
    return successResponse(await readJournalForm(prisma, sessionResult.session.user.companyId));
  } catch (error) {
    console.error("[API] GET /api/books/journals/form error:", error);
    return errorResponse("Could not read the accounts");
  }
}
