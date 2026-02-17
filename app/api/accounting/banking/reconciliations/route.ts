import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  validateSession,
  successResponse,
  errorResponse,
  getPaginationParams,
  paginationResponse,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const reconciliationSchema = z.object({
  bankAccountId: z.string().uuid(),
  startDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  endDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  statementBalance: z.number(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const bankAccountId = searchParams.get("bankAccountId");
    const status = searchParams.get("status");
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = { companyId: session.user.companyId };
    if (bankAccountId) where.bankAccountId = bankAccountId;
    if (status) where.status = status;

    const [reconciliations, total] = await Promise.all([
      prisma.bankReconciliation.findMany({
        where,
        include: { bankAccount: { select: { id: true, name: true, currency: true } } },
        orderBy: [{ startDate: "desc" }],
        skip,
        take: limit,
      }),
      prisma.bankReconciliation.count({ where }),
    ]);

    return successResponse(paginationResponse(reconciliations, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/accounting/banking/reconciliations error:", error);
    return errorResponse("Failed to fetch reconciliations");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = reconciliationSchema.parse(body);

    const account = await prisma.bankAccount.findUnique({
      where: { id: validated.bankAccountId },
      select: { companyId: true },
    });

    if (!account || account.companyId !== session.user.companyId) {
      return errorResponse("Invalid bank account", 400);
    }

    const startDate = new Date(validated.startDate);
    const endDate = new Date(validated.endDate);
    if (startDate > endDate) {
      return errorResponse("Start date must be before end date", 400);
    }

    const reconciliation = await prisma.bankReconciliation.create({
      data: {
        companyId: session.user.companyId,
        bankAccountId: validated.bankAccountId,
        startDate,
        endDate,
        statementBalance: validated.statementBalance,
        status: "OPEN",
        createdById: session.user.id,
      },
      include: { bankAccount: { select: { id: true, name: true, currency: true } } },
    });

    return successResponse(reconciliation, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/banking/reconciliations error:", error);
    return errorResponse("Failed to create reconciliation");
  }
}
