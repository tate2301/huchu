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
    const employeeId = searchParams.get("employeeId");
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    };

    if (employeeId) where.employeeId = employeeId;

    const [balances, total] = await Promise.all([
      prisma.scrapMetalEmployeeBalance.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              name: true,
              employeeId: true,
              department: { select: { name: true } },
            },
          },
        },
        orderBy: [{ balance: "desc" }, { lastUpdated: "desc" }],
        skip,
        take: limit,
      }),
      prisma.scrapMetalEmployeeBalance.count({ where }),
    ]);

    return successResponse(paginationResponse(balances, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/scrap-metal/employee-balances error:", error);
    return errorResponse("Failed to fetch employee balances");
  }
}
