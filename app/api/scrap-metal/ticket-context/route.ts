import { NextRequest, NextResponse } from "next/server";

import {
  errorResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const companyId = session.user.companyId;
    const userId = session.user.id;

    const [sites, buyers, linkedEmployee] = await Promise.all([
      prisma.site.findMany({
        where: {
          companyId,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          code: true,
        },
        orderBy: { name: "asc" },
      }),
      prisma.employee.findMany({
        where: {
          companyId,
          isActive: true,
        },
        select: {
          id: true,
          employeeId: true,
          userId: true,
          name: true,
        },
        orderBy: { name: "asc" },
      }),
      prisma.employee.findFirst({
        where: {
          companyId,
          userId,
          isActive: true,
        },
        select: {
          id: true,
        },
      }),
    ]);

    return successResponse({
      buyers,
      sites,
      defaultBuyerId: linkedEmployee?.id ?? null,
      buyerLinkMissing: !linkedEmployee,
    });
  } catch (error) {
    console.error("[API] GET /api/scrap-metal/ticket-context error:", error);
    return errorResponse("Failed to fetch scrap ticket context");
  }
}
