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
import { recalcSalesInvoiceBalance } from "@/lib/accounting/balances";

const writeOffSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().min(0.01),
  reason: z.string().max(500).optional(),
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

    const [writeOffs, total] = await Promise.all([
      prisma.salesWriteOff.findMany({
        where,
        include: {
          invoice: { select: { invoiceNumber: true, customer: { select: { name: true } } } },
        },
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.salesWriteOff.count({ where }),
    ]);

    return successResponse(paginationResponse(writeOffs, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/accounting/sales/write-offs error:", error);
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

    const invoice = await prisma.salesInvoice.findUnique({
      where: { id: validated.invoiceId },
      select: { companyId: true, status: true, total: true, amountPaid: true, creditTotal: true, writeOffTotal: true },
    });
    if (!invoice || invoice.companyId !== session.user.companyId) {
      return errorResponse("Invalid invoice", 400);
    }
    if (invoice.status === "DRAFT" || invoice.status === "VOIDED") {
      return errorResponse("Invoice must be issued before writing off", 400);
    }

    const balance =
      invoice.total -
      (invoice.amountPaid ?? 0) -
      (invoice.creditTotal ?? 0) -
      (invoice.writeOffTotal ?? 0);

    if (validated.amount > balance) {
      return errorResponse("Write-off amount exceeds outstanding balance", 400);
    }

    const writeOff = await prisma.salesWriteOff.create({
      data: {
        companyId: session.user.companyId,
        invoiceId: validated.invoiceId,
        amount: validated.amount,
        reason: validated.reason,
        status: "POSTED",
        createdById: session.user.id,
      },
      include: {
        invoice: { select: { invoiceNumber: true, customer: { select: { name: true } } } },
      },
    });

    await recalcSalesInvoiceBalance(writeOff.invoiceId);

    try {
      await createJournalEntryFromSource({
        companyId: session.user.companyId,
        sourceType: "SALES_WRITE_OFF",
        sourceId: writeOff.id,
        entryDate: writeOff.createdAt,
        description: `Sales write-off ${writeOff.invoice?.invoiceNumber ?? ""}`.trim(),
        createdById: session.user.id,
        amount: writeOff.amount,
        netAmount: writeOff.amount,
        taxAmount: 0,
        grossAmount: writeOff.amount,
      });
    } catch (error) {
      console.error("[Accounting] Sales write-off auto-post failed:", error);
    }

    return successResponse(writeOff, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/sales/write-offs error:", error);
    return errorResponse("Failed to create write-off");
  }
}
