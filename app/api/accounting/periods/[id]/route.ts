import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  status: z.enum(["OPEN", "CLOSED"]).optional(),
  endDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const period = await prisma.accountingPeriod.findUnique({
      where: { id },
    });

    if (!period || period.companyId !== session.user.companyId) {
      return errorResponse("Accounting period not found", 404);
    }

    return successResponse(period);
  } catch (error) {
    console.error("[API] GET /api/accounting/periods/[id] error:", error);
    return errorResponse("Failed to fetch accounting period");
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const body = await request.json();
    const validated = updateSchema.parse(body);

    const existing = await prisma.accountingPeriod.findUnique({
      where: { id },
      select: { companyId: true, status: true },
    });

    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Accounting period not found", 404);
    }

    const update: Record<string, unknown> = {};
    if (validated.endDate) update.endDate = new Date(validated.endDate);
    if (validated.status) {
      update.status = validated.status;
      if (validated.status === "CLOSED") {
        update.closedAt = new Date();
        update.closedById = session.user.id;
      } else {
        update.closedAt = null;
        update.closedById = null;
      }
    }

    const period = await prisma.accountingPeriod.update({
      where: { id },
      data: update,
    });

    return successResponse(period);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/accounting/periods/[id] error:", error);
    return errorResponse("Failed to update accounting period");
  }
}
