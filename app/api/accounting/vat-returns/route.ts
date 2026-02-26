import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { createOrRefreshVatReturnDraft, parseVatReturnPayload } from "@/lib/accounting/vat-return";

const createSchema = z.object({
  periodId: z.string().uuid().optional(),
  periodStart: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  periodEnd: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  notes: z.string().max(2000).optional(),
  adjustmentsTax: z.number().optional(),
  filingCategory: z.string().max(80).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { page, limit, skip } = getPaginationParams(request);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
      ...(status ? { status } : {}),
    };

    const [returns, total] = await Promise.all([
      prisma.vatReturn.findMany({
        where,
        orderBy: [{ periodStart: "desc" }],
        skip,
        take: limit,
      }),
      prisma.vatReturn.count({ where }),
    ]);

    return successResponse(paginationResponse(returns.map(parseVatReturnPayload), total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/accounting/vat-returns error:", error);
    return errorResponse("Failed to fetch VAT returns");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = createSchema.parse(body);

    let periodStart: Date;
    let periodEnd: Date;

    if (validated.periodId) {
      const period = await prisma.accountingPeriod.findUnique({
        where: { id: validated.periodId },
        select: { companyId: true, startDate: true, endDate: true },
      });
      if (!period || period.companyId !== session.user.companyId) {
        return errorResponse("Accounting period not found", 404);
      }
      periodStart = period.startDate;
      periodEnd = period.endDate;
    } else {
      if (!validated.periodStart || !validated.periodEnd) {
        return errorResponse("Provide periodId or periodStart + periodEnd", 400);
      }
      periodStart = new Date(validated.periodStart);
      periodEnd = new Date(validated.periodEnd);
      if (periodStart > periodEnd) {
        return errorResponse("Period start must be before period end", 400);
      }
    }

    const vatReturn = await createOrRefreshVatReturnDraft({
      companyId: session.user.companyId,
      periodStart,
      periodEnd,
      notes: validated.notes,
      preparedById: session.user.id,
      adjustmentsTax: validated.adjustmentsTax,
      filingCategory: validated.filingCategory,
    });

    return successResponse(parseVatReturnPayload(vatReturn), 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/vat-returns error:", error);
    return errorResponse(error instanceof Error ? error.message : "Failed to create VAT return");
  }
}
