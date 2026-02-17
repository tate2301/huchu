import { NextRequest, NextResponse } from "next/server";
import { validateSession, successResponse, errorResponse, getPaginationParams, paginationResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = { companyId: session.user.companyId };
    if (status) where.status = status;

    const [receipts, total] = await Promise.all([
      prisma.fiscalReceipt.findMany({
        where,
        include: { invoice: { select: { invoiceNumber: true } } },
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.fiscalReceipt.count({ where }),
    ]);

    return successResponse(paginationResponse(receipts, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/accounting/fiscalisation/receipts error:", error);
    return errorResponse("Failed to fetch fiscal receipts");
  }
}
