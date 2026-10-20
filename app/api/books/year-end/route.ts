import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { guardBooks } from "@/lib/books/core";
import { readYearEnd } from "@/lib/books/settings-pages";
import { prisma } from "@/lib/prisma";

/** Books → Close the month → Year end: the six steps to the year's end and their state. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { refused } = await guardBooks(sessionResult.session, "view", { area: "close" });
    if (refused) return refused;
    return successResponse(await readYearEnd(prisma, sessionResult.session.user.companyId));
  } catch (error) {
    console.error("[API] GET /api/books/year-end error:", error);
    return errorResponse("Could not read the year end");
  }
}
