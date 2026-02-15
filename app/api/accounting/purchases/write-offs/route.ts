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
import { createJournalEntryFromSource } from "@/lib/accounting/posting";
import { recalcPurchaseBillBalance } from "@/lib/accounting/balances";

const writeOffSchema = z.object({
  billId: z.string().uuid(),
  amount: z.number().min(0.01),
  reason: z.string().max(500).optional(),
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

    const [writeOffs, total] = await Promise.all([
      prisma.purchaseWriteOff.findMany({
        where,
        include: {
          bill: { select: { billNumber: true, vendor: { select: { name: true } } } },
        },
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.purchaseWriteOff.count({ where }),
    ]);

    return successResponse(paginationResponse(writeOffs, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/accounting/purchases/write-offs error:", error);
    return errorResponse("Failed to fetch write-offs");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = writeOffSchema.parse(body);

    const bill = await prisma.purchaseBill.findUnique({
      where: { id: validated.billId },
      select: { companyId: true, status: true, total: true, amountPaid: true, debitNoteTotal: true, writeOffTotal: true },
    });
    if (!bill || bill.companyId !== session.user.companyId) {
      return errorResponse("Invalid purchase bill", 400);
    }
    if (bill.status === "DRAFT" || bill.status === "VOIDED") {
      return errorResponse("Bill must be received before writing off", 400);
    }

    const balance =
      bill.total -
      (bill.amountPaid ?? 0) -
      (bill.debitNoteTotal ?? 0) -
      (bill.writeOffTotal ?? 0);

    if (validated.amount > balance) {
      return errorResponse("Write-off amount exceeds outstanding balance", 400);
    }

    const writeOff = await prisma.purchaseWriteOff.create({
      data: {
        companyId: session.user.companyId,
        billId: validated.billId,
        amount: validated.amount,
        reason: validated.reason,
        status: "POSTED",
        createdById: session.user.id,
      },
      include: {
        bill: { select: { billNumber: true, vendor: { select: { name: true } } } },
      },
    });

    await recalcPurchaseBillBalance(writeOff.billId);

    try {
      await createJournalEntryFromSource({
        companyId: session.user.companyId,
        sourceType: "PURCHASE_WRITE_OFF",
        sourceId: writeOff.id,
        entryDate: writeOff.createdAt,
        description: `Purchase write-off ${writeOff.bill?.billNumber ?? ""}`.trim(),
        createdById: session.user.id,
        amount: writeOff.amount,
        netAmount: writeOff.amount,
        taxAmount: 0,
        grossAmount: writeOff.amount,
      });
    } catch (error) {
      console.error("[Accounting] Purchase write-off auto-post failed:", error);
    }

    return successResponse(writeOff, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/purchases/write-offs error:", error);
    return errorResponse("Failed to create write-off");
  }
}
