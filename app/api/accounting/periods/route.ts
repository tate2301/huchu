import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse, getPaginationParams, paginationResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const periodSchema = z.object({
  startDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  endDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    };
    if (status) where.status = status;

    const [periods, total] = await Promise.all([
      prisma.accountingPeriod.findMany({
        where,
        orderBy: [{ startDate: "desc" }],
        skip,
        take: limit,
      }),
      prisma.accountingPeriod.count({ where }),
    ]);

    return successResponse(paginationResponse(periods, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/accounting/periods error:", error);
    return errorResponse("Failed to fetch accounting periods");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = periodSchema.parse(body);

    const startDate = new Date(validated.startDate);
    const endDate = new Date(validated.endDate);

    if (startDate > endDate) {
      return errorResponse("Start date must be before end date", 400);
    }

    const overlap = await prisma.accountingPeriod.findFirst({
      where: {
        companyId: session.user.companyId,
        OR: [
          { startDate: { lte: endDate }, endDate: { gte: startDate } },
        ],
      },
      select: { id: true },
    });

    if (overlap) {
      return errorResponse("Accounting period overlaps with an existing period", 409);
    }

    const period = await prisma.accountingPeriod.create({
      data: {
        companyId: session.user.companyId,
        startDate,
        endDate,
        status: "OPEN",
      },
    });

    return successResponse(period, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/periods error:", error);
    return errorResponse("Failed to create accounting period");
  }
}
