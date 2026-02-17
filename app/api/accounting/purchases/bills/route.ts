import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse, getPaginationParams, paginationResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { createJournalEntryFromSource } from "@/lib/accounting/posting";
import { findTaxCodesOutsideEffectiveWindow } from "@/lib/accounting/tax-selection";

const billSchema = z.object({
  vendorId: z.string().uuid(),
  billDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  dueDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  currency: z.string().min(1).max(10).optional(),
  notes: z.string().max(1000).optional(),
  receiveNow: z.boolean().optional(),
  lines: z
    .array(
      z.object({
        description: z.string().min(1).max(300),
        quantity: z.number().min(0.01),
        unitPrice: z.number().min(0),
        taxCodeId: z.string().uuid().optional(),
        taxRate: z.number().min(0).max(100).optional(),
      }),
    )
    .min(1),
});

function formatTwoDigits(value: number) {
  return String(value).padStart(2, "0");
}

function buildBillNumberCandidate() {
  const now = new Date();
  const datePart = `${now.getFullYear()}${formatTwoDigits(now.getMonth() + 1)}${formatTwoDigits(now.getDate())}`;
  const timePart = `${formatTwoDigits(now.getHours())}${formatTwoDigits(now.getMinutes())}`;
  const randomPart = Math.floor(100 + Math.random() * 900);
  return `BILL-${datePart}-${timePart}-${randomPart}`;
}

async function generateUniqueBillNumber() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = buildBillNumberCandidate();
    const existing = await prisma.purchaseBill.findFirst({
      where: { billNumber: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  return `BILL-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const vendorId = searchParams.get("vendorId");
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    };
    if (status) where.status = status;
    if (vendorId) where.vendorId = vendorId;

    const [bills, total] = await Promise.all([
      prisma.purchaseBill.findMany({
        where,
        include: {
          vendor: true,
          lines: true,
        },
        orderBy: [{ billDate: "desc" }],
        skip,
        take: limit,
      }),
      prisma.purchaseBill.count({ where }),
    ]);

    const enriched = bills.map((bill) => ({
      ...bill,
      balance:
        bill.total -
        (bill.amountPaid ?? 0) -
        (bill.debitNoteTotal ?? 0) -
        (bill.writeOffTotal ?? 0),
    }));

    return successResponse(paginationResponse(enriched, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/accounting/purchases/bills error:", error);
    return errorResponse("Failed to fetch purchase bills");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = billSchema.parse(body);

    const vendor = await prisma.vendor.findUnique({
      where: { id: validated.vendorId },
      select: { companyId: true },
    });
    if (!vendor || vendor.companyId !== session.user.companyId) {
      return errorResponse("Invalid vendor", 400);
    }

    const billNumber = await generateUniqueBillNumber();

    const taxCodeIds = validated.lines
      .map((line) => line.taxCodeId)
      .filter((value): value is string => Boolean(value));

    const taxCodes = taxCodeIds.length
      ? await prisma.taxCode.findMany({
        where: { id: { in: taxCodeIds }, companyId: session.user.companyId },
        select: { id: true, rate: true, effectiveFrom: true, effectiveTo: true },
      })
      : [];

    const billDate = new Date(validated.billDate);
    const taxCodesOutOfWindow = findTaxCodesOutsideEffectiveWindow(taxCodes, billDate);
    if (taxCodesOutOfWindow.length > 0) {
      return errorResponse("One or more tax codes are not effective on the bill date", 400, {
        taxCodeIds: taxCodesOutOfWindow,
      });
    }

    const taxById = new Map(taxCodes.map((tax) => [tax.id, tax.rate]));

    const computedLines = validated.lines.map((line) => {
      const taxRate = line.taxRate ?? taxById.get(line.taxCodeId ?? "") ?? 0;
      const lineNet = line.quantity * line.unitPrice;
      const taxAmount = (lineNet * taxRate) / 100;
      const total = lineNet + taxAmount;
      return {
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        taxCodeId: line.taxCodeId,
        taxRate,
        taxAmount,
        lineTotal: total,
      };
    });

    const subTotal = computedLines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
    const taxTotal = computedLines.reduce((sum, line) => sum + line.taxAmount, 0);
    const total = computedLines.reduce((sum, line) => sum + line.lineTotal, 0);

    const bill = await prisma.purchaseBill.create({
      data: {
        companyId: session.user.companyId,
        vendorId: validated.vendorId,
        billNumber,
        billDate,
        dueDate: validated.dueDate ? new Date(validated.dueDate) : undefined,
        status: validated.receiveNow ? "RECEIVED" : "DRAFT",
        currency: validated.currency ?? "USD",
        subTotal,
        taxTotal,
        total,
        notes: validated.notes,
        createdById: session.user.id,
        issuedById: validated.receiveNow ? session.user.id : undefined,
        issuedAt: validated.receiveNow ? new Date() : undefined,
        lines: { create: computedLines },
      },
      include: {
        vendor: true,
        lines: true,
      },
    });

    if (bill.status === "RECEIVED") {
      try {
        await createJournalEntryFromSource({
          companyId: session.user.companyId,
          sourceType: "PURCHASE_BILL",
          sourceId: bill.id,
          entryDate: bill.billDate,
          description: `Purchase bill ${bill.billNumber}`,
          createdById: session.user.id,
          amount: bill.total,
          netAmount: bill.subTotal,
          taxAmount: bill.taxTotal,
          grossAmount: bill.total,
        });
      } catch (error) {
        console.error("[Accounting] Purchase bill auto-post failed:", error);
      }
    }

    return successResponse(bill, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/purchases/bills error:", error);
    return errorResponse("Failed to create purchase bill");
  }
}
