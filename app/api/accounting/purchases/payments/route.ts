import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse, getPaginationParams, paginationResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { recordPurchasePayment } from "@/lib/accounting/payments";

const paymentSchema = z.object({
  billId: z.string().uuid().optional(),
  paidAt: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  amount: z.number().min(0.01),
  method: z.string().min(1).max(100),
  reference: z.string().max(200).optional(),
  bankAccountId: z.string().uuid().optional(),
});

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

    const payment = await recordPurchasePayment({
      companyId: session.user.companyId,
      userId: session.user.id,
      billId: validated.billId,
      paidAt: new Date(validated.paidAt),
      amount: validated.amount,
      method: validated.method,
      reference: validated.reference,
      bankAccountId: validated.bankAccountId,
    });

    return successResponse(payment, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/purchases/payments error:", error);
    return errorResponse("Failed to create payment");
  }
}
