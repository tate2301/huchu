import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse, getPaginationParams, paginationResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { createJournalEntryFromSource } from "@/lib/accounting/posting";

const receiptSchema = z.object({
  invoiceId: z.string().uuid().optional(),
  receivedAt: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  amount: z.number().min(0.01),
  method: z.string().min(1).max(100),
  reference: z.string().max(200).optional(),
  bankAccountId: z.string().uuid().optional(),
});

function formatTwoDigits(value: number) {
  return String(value).padStart(2, "0");
}

function buildReceiptNumberCandidate() {
  const now = new Date();
  const datePart = `${now.getFullYear()}${formatTwoDigits(now.getMonth() + 1)}${formatTwoDigits(now.getDate())}`;
  const timePart = `${formatTwoDigits(now.getHours())}${formatTwoDigits(now.getMinutes())}`;
  const randomPart = Math.floor(100 + Math.random() * 900);
  return `REC-${datePart}-${timePart}-${randomPart}`;
}

async function generateUniqueReceiptNumber() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = buildReceiptNumberCandidate();
    const existing = await prisma.salesReceipt.findFirst({
      where: { receiptNumber: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  return `REC-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

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

    if (validated.invoiceId) {
      const invoice = await prisma.salesInvoice.findUnique({
        where: { id: validated.invoiceId },
        select: { companyId: true, status: true },
      });
      if (!invoice || invoice.companyId !== session.user.companyId) {
        return errorResponse("Invalid invoice", 400);
      }
    }

    const receiptNumber = await generateUniqueReceiptNumber();

    const receipt = await prisma.salesReceipt.create({
      data: {
        companyId: session.user.companyId,
        invoiceId: validated.invoiceId,
        receiptNumber,
        receivedAt: new Date(validated.receivedAt),
        amount: validated.amount,
        method: validated.method,
        reference: validated.reference,
        bankAccountId: validated.bankAccountId,
        createdById: session.user.id,
      },
      include: { invoice: true },
    });

    if (receipt.invoiceId) {
      const paidTotal = await prisma.salesReceipt.aggregate({
        where: { invoiceId: receipt.invoiceId },
        _sum: { amount: true },
      });
      const invoice = await prisma.salesInvoice.findUnique({
        where: { id: receipt.invoiceId },
        select: { total: true },
      });
      if (invoice && (paidTotal._sum.amount ?? 0) >= invoice.total) {
        await prisma.salesInvoice.update({
          where: { id: receipt.invoiceId },
          data: { status: "PAID" },
        });
      }
    }

    try {
      await createJournalEntryFromSource({
        companyId: session.user.companyId,
        sourceType: "SALES_RECEIPT",
        sourceId: receipt.id,
        entryDate: receipt.receivedAt,
        description: `Sales receipt ${receipt.receiptNumber}`,
        createdById: session.user.id,
        amount: receipt.amount,
        netAmount: receipt.amount,
        taxAmount: 0,
        grossAmount: receipt.amount,
      });
    } catch (error) {
      console.error("[Accounting] Sales receipt auto-post failed:", error);
    }

    return successResponse(receipt, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/sales/receipts error:", error);
    return errorResponse("Failed to create receipt");
  }
}
