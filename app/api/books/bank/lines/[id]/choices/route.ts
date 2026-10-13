import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { BankError, choicesFor } from "@/lib/books/bank";
import { prisma } from "@/lib/prisma";

/** Choose: what a bank line could be. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { id } = await params;
    return successResponse(await choicesFor(prisma, sessionResult.session.user.companyId, id));
  } catch (error) {
    if (error instanceof BankError) return errorResponse(error.message, error.status);
    console.error("[API] GET /api/books/bank/lines/[id]/choices error:", error);
    return errorResponse("Could not read what the line could be");
  }
}
