import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { readMoney } from "@/lib/books/money";
import { prisma } from "@/lib/prisma";

/** Books → Money: what came in this month, what needs a person, where the money stands. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    return successResponse(await readMoney(prisma, sessionResult.session.user.companyId));
  } catch (error) {
    console.error("[API] GET /api/books/money error:", error);
    return errorResponse("Could not read the money");
  }
}
