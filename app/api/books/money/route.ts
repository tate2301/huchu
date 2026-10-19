import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { readMoneyBoard } from "@/lib/books/money-board";
import { prisma } from "@/lib/prisma";

/** Books → Money (BkMoney): the month in and out, the tax due, what needs a person, where the money stands. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    return successResponse(await readMoneyBoard(prisma, sessionResult.session.user.companyId));
  } catch (error) {
    console.error("[API] GET /api/books/money error:", error);
    return errorResponse("Could not read the money");
  }
}
