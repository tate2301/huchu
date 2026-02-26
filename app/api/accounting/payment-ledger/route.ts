import { NextRequest, NextResponse } from "next/server";
import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { searchParams } = new URL(request.url);
    const accountType = searchParams.get("accountType");
    const partyType = searchParams.get("partyType");
    const partyId = searchParams.get("partyId");
    const status = searchParams.get("status");
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
      ...(accountType ? { accountType } : {}),
      ...(partyType ? { partyType } : {}),
      ...(partyId ? { partyId } : {}),
      ...(status ? { status } : {}),
    };

    const [entries, total] = await Promise.all([
      prisma.paymentLedgerEntry.findMany({
        where,
        orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.paymentLedgerEntry.count({ where }),
    ]);

    return successResponse(paginationResponse(entries, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/accounting/payment-ledger error:", error);
    return errorResponse("Failed to fetch payment ledger");
  }
}

