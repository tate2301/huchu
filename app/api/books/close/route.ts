import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { readClose } from "@/lib/books/close";
import { prisma } from "@/lib/prisma";

/** Books → Periods: the month due to close, its checks, every period and the closing controls. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    return successResponse(await readClose(prisma, sessionResult.session.user.companyId));
  } catch (error) {
    console.error("[API] GET /api/books/close error:", error);
    return errorResponse("Could not read the periods");
  }
}
