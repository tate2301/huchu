import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({
  status: z.enum(["PENDING", "POSTED", "FAILED", "IGNORED"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  page: z.coerce.number().int().min(1).optional().default(1),
});

// GET /api/accounting/integration/events
// Lists accounting integration events with optional status filter
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      status: searchParams.get("status") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      page: searchParams.get("page") ?? undefined,
    });

    if (!parsed.success) {
      return errorResponse(parsed.error.flatten().fieldErrors, 400);
    }

    const { status, limit, page } = parsed.data;
    const skip = (page - 1) * limit;

    const where = {
      companyId,
      ...(status ? { status } : {}),
    };

    const [events, total] = await prisma.$transaction([
      prisma.accountingIntegrationEvent.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: limit,
        select: {
          id: true,
          companyId: true,
          sourceDomain: true,
          sourceAction: true,
          sourceType: true,
          sourceId: true,
          eventKey: true,
          entryDate: true,
          description: true,
          amount: true,
          status: true,
          attemptCount: true,
          nextRetryAt: true,
          lastError: true,
          journalEntryId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.accountingIntegrationEvent.count({ where }),
    ]);

    return successResponse({
      data: events,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("[API] GET /api/accounting/integration/events error:", error);
    return errorResponse("Failed to fetch integration events", 500);
  }
}
