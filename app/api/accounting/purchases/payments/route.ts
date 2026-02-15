import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse, getPaginationParams, paginationResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { createJournalEntryFromSource } from "@/lib/accounting/posting";

const paymentSchema = z.object({
  billId: z.string().uuid().optional(),
  paidAt: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  amount: z.number().min(0.01),
  method: z.string().min(1).max(100),
  reference: z.string().max(200).optional(),
  bankAccountId: z.string().uuid().optional(),
});

function formatTwoDigits(value: number) {
  return String(value).padStart(2, "0");
}

function buildPaymentNumberCandidate() {
  const now = new Date();
  const datePart = `${now.getFullYear()}${formatTwoDigits(now.getMonth() + 1)}${formatTwoDigits(now.getDate())}`;
  const timePart = `${formatTwoDigits(now.getHours())}${formatTwoDigits(now.getMinutes())}`;
  const randomPart = Math.floor(100 + Math.random() * 900);
  return `PAY-${datePart}-${timePart}-${randomPart}`;
}

async function generateUniquePaymentNumber() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = buildPaymentNumberCandidate();
    const existing = await prisma.purchasePayment.findFirst({
      where: { paymentNumber: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  return `PAY-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const billId = searchParams.get("billId");
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = { companyId: session.user.companyId };
    if (billId) where.billId = billId;

    const [payments, total] = await Promise.all([
      prisma.purchasePayment.findMany({
        where,
        include: { bill: { select: { billNumber: true, vendor: { select: { name: true } } } } },
        orderBy: [{ paidAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.purchasePayment.count({ where }),
    ]);

    return successResponse(paginationResponse(payments, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/accounting/purchases/payments error:", error);
    return errorResponse("Failed to fetch purchase payments");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = paymentSchema.parse(body);

    if (validated.billId) {
      const bill = await prisma.purchaseBill.findUnique({
        where: { id: validated.billId },
        select: { companyId: true, total: true },
      });
      if (!bill || bill.companyId !== session.user.companyId) {
        return errorResponse("Invalid purchase bill", 400);
      }
    }

    const paymentNumber = await generateUniquePaymentNumber();

    const payment = await prisma.purchasePayment.create({
      data: {
        companyId: session.user.companyId,
        billId: validated.billId,
        paymentNumber,
        paidAt: new Date(validated.paidAt),
        amount: validated.amount,
        method: validated.method,
        reference: validated.reference,
        bankAccountId: validated.bankAccountId,
        createdById: session.user.id,
      },
      include: { bill: true },
    });

    if (payment.billId) {
      const paidTotal = await prisma.purchasePayment.aggregate({
        where: { billId: payment.billId },
        _sum: { amount: true },
      });
      const bill = await prisma.purchaseBill.findUnique({
        where: { id: payment.billId },
        select: { total: true },
      });
      if (bill && (paidTotal._sum.amount ?? 0) >= bill.total) {
        await prisma.purchaseBill.update({
          where: { id: payment.billId },
          data: { status: "PAID" },
        });
      }
    }

    try {
      await createJournalEntryFromSource({
        companyId: session.user.companyId,
        sourceType: "PURCHASE_PAYMENT",
        sourceId: payment.id,
        entryDate: payment.paidAt,
        description: `Purchase payment ${payment.paymentNumber}`,
        createdById: session.user.id,
        amount: payment.amount,
        netAmount: payment.amount,
        taxAmount: 0,
        grossAmount: payment.amount,
      });
    } catch (error) {
      console.error("[Accounting] Purchase payment auto-post failed:", error);
    }

    return successResponse(payment, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/purchases/payments error:", error);
    return errorResponse("Failed to create payment");
  }
}
