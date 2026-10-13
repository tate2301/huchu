import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AccountingSourceType } from "@prisma/client";
import { validateSession, successResponse, errorResponse, getPaginationParams, paginationResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { recordBankTransaction } from "@/lib/accounting/payments";

const transactionSchema = z.object({
  bankAccountId: z.string().uuid(),
  txnDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  description: z.string().min(1).max(300),
  reference: z.string().max(200).optional(),
  amount: z.number().min(0.01),
  direction: z.enum(["DEBIT", "CREDIT"]),
  sourceType: z.nativeEnum(AccountingSourceType).optional(),
  sourceId: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const bankAccountId = searchParams.get("bankAccountId");
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = { companyId: session.user.companyId };
    if (bankAccountId) where.bankAccountId = bankAccountId;

    const [transactions, total] = await Promise.all([
      prisma.bankTransaction.findMany({
        where,
        include: { bankAccount: { select: { name: true, currency: true } } },
        orderBy: [{ txnDate: "desc" }],
        skip,
        take: limit,
      }),
      prisma.bankTransaction.count({ where }),
    ]);

    return successResponse(paginationResponse(transactions, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/accounting/banking/transactions error:", error);
    return errorResponse("Failed to fetch bank transactions");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = transactionSchema.parse(body);
    if (validated.sourceType && validated.sourceType !== "BANK_TRANSACTION") {
      return errorResponse("Bank transactions can only be posted as BANK_TRANSACTION source type", 400);
    }

    const account = await prisma.bankAccount.findUnique({
      where: { id: validated.bankAccountId },
      select: { companyId: true },
    });

    if (!account || account.companyId !== session.user.companyId) {
      return errorResponse("Invalid bank account", 400);
    }

    const transaction = await recordBankTransaction({
      companyId: session.user.companyId,
      userId: session.user.id,
      role: session.user.role,
      bankAccountId: validated.bankAccountId,
      txnDate: new Date(validated.txnDate),
      description: validated.description,
      reference: validated.reference,
      amount: validated.amount,
      direction: validated.direction,
      tag: validated.sourceId,
    });

    return successResponse(transaction, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/banking/transactions error:", error);
    return errorResponse("Failed to create bank transaction");
  }
}
