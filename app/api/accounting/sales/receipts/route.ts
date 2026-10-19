import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse, getPaginationParams, paginationResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { recordSalesReceipt } from "@/lib/accounting/payments";
import { guardBooks } from "@/lib/books/core";

const receiptSchema = z.object({
  invoiceId: z.string().uuid().optional(),
  receivedAt: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
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
    const invoiceId = searchParams.get("invoiceId");
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = { companyId: session.user.companyId };
    if (invoiceId) where.invoiceId = invoiceId;

    const [receipts, total] = await Promise.all([
      prisma.salesReceipt.findMany({
        where,
        include: { invoice: { select: { invoiceNumber: true, customer: { select: { name: true } } } } },
        orderBy: [{ receivedAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.salesReceipt.count({ where }),
    ]);

    return successResponse(paginationResponse(receipts, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/accounting/sales/receipts error:", error);
    return errorResponse("Failed to fetch receipts");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = receiptSchema.parse(body);
    const { refused } = await guardBooks(session, "issue", { kind: "receipt" });
    if (refused) return refused;

    if (validated.invoiceId) {
      const invoice = await prisma.salesInvoice.findUnique({
        where: { id: validated.invoiceId },
        select: { companyId: true, status: true },
      });
      if (!invoice || invoice.companyId !== session.user.companyId) {
        return errorResponse("Invalid invoice", 400);
      }
    }

    const receipt = await recordSalesReceipt({
      companyId: session.user.companyId,
      userId: session.user.id,
      invoiceId: validated.invoiceId,
      receivedAt: new Date(validated.receivedAt),
      amount: validated.amount,
      method: validated.method,
      reference: validated.reference,
      bankAccountId: validated.bankAccountId,
    });

    return successResponse(receipt, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/sales/receipts error:", error);
    return errorResponse("Failed to create receipt");
  }
}
