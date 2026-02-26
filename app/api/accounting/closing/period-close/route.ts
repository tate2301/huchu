import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { closePeriodWithVoucher } from "@/lib/accounting/closing";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  periodId: z.string().uuid(),
  closingDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  retainedEarningsAccountId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = schema.parse(body);

    let retainedEarningsAccountId = validated.retainedEarningsAccountId;
    if (!retainedEarningsAccountId) {
      const settings = await prisma.accountingSettings.findUnique({
        where: { companyId: session.user.companyId },
        select: { retainedEarningsAccountId: true },
      });
      retainedEarningsAccountId = settings?.retainedEarningsAccountId ?? undefined;
    }

    if (!retainedEarningsAccountId) {
      return errorResponse("Retained earnings account is required for period close", 400);
    }

    const result = await closePeriodWithVoucher({
      companyId: session.user.companyId,
      periodId: validated.periodId,
      createdById: session.user.id,
      closingDate: validated.closingDate ? new Date(validated.closingDate) : undefined,
      retainedEarningsAccountId,
      notes: validated.notes,
    });

    return successResponse(result, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/closing/period-close error:", error);
    return errorResponse(error instanceof Error ? error.message : "Failed to create period close voucher");
  }
}

