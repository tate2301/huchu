import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { readVat } from "@/lib/books/vat";
import { prisma } from "@/lib/prisma";

/** Books → VAT returns: each month's return, and the chosen one's boxes. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const selected = new URL(request.url).searchParams.get("return");
    return successResponse(await readVat(prisma, sessionResult.session.user.companyId, selected));
  } catch (error) {
    console.error("[API] GET /api/books/vat error:", error);
    return errorResponse("Could not read the VAT returns");
  }
}
