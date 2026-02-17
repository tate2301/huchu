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
import { findTaxCodesOutsideEffectiveWindow } from "@/lib/accounting/tax-selection";

const creditNoteSchema = z.object({
  invoiceId: z.string().uuid(),
  noteDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  currency: z.string().min(1).max(10).optional(),
  reason: z.string().max(500).optional(),
  issueNow: z.boolean().optional(),
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

function buildCreditNoteNumberCandidate() {
  const now = new Date();
  const datePart = `${now.getFullYear()}${formatTwoDigits(now.getMonth() + 1)}${formatTwoDigits(now.getDate())}`;
  const timePart = `${formatTwoDigits(now.getHours())}${formatTwoDigits(now.getMinutes())}`;
  const randomPart = Math.floor(100 + Math.random() * 900);
  return `CN-${datePart}-${timePart}-${randomPart}`;
}

async function generateUniqueCreditNoteNumber() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = buildCreditNoteNumberCandidate();
    const existing = await prisma.creditNote.findFirst({
      where: { noteNumber: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  return `CN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const invoiceId = searchParams.get("invoiceId");
    const status = searchParams.get("status");
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = { companyId: session.user.companyId };
    if (invoiceId) where.invoiceId = invoiceId;
    if (status) where.status = status;

    const [notes, total] = await Promise.all([
      prisma.creditNote.findMany({
        where,
        include: {
          invoice: { select: { invoiceNumber: true, customer: { select: { name: true } } } },
          lines: true,
        },
        orderBy: [{ noteDate: "desc" }],
        skip,
        take: limit,
      }),
      prisma.creditNote.count({ where }),
    ]);

    return successResponse(paginationResponse(notes, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/accounting/sales/credit-notes error:", error);
    return errorResponse("Failed to fetch credit notes");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = creditNoteSchema.parse(body);

    const invoice = await prisma.salesInvoice.findUnique({
      where: { id: validated.invoiceId },
      select: { companyId: true, status: true, currency: true },
    });
    if (!invoice || invoice.companyId !== session.user.companyId) {
      return errorResponse("Invalid invoice", 400);
    }
    if (invoice.status === "DRAFT" || invoice.status === "VOIDED") {
      return errorResponse("Invoice must be issued before creating a credit note", 400);
    }

    const noteNumber = await generateUniqueCreditNoteNumber();

    const taxCodeIds = validated.lines
      .map((line) => line.taxCodeId)
      .filter((value): value is string => Boolean(value));

    const taxCodes = taxCodeIds.length
      ? await prisma.taxCode.findMany({
        where: { id: { in: taxCodeIds }, companyId: session.user.companyId },
        select: { id: true, rate: true, effectiveFrom: true, effectiveTo: true },
      })
      : [];

    const noteDate = new Date(validated.noteDate);
    const taxCodesOutOfWindow = findTaxCodesOutsideEffectiveWindow(taxCodes, noteDate);
    if (taxCodesOutOfWindow.length > 0) {
      return errorResponse("One or more tax codes are not effective on the credit note date", 400, {
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

    const creditNote = await prisma.creditNote.create({
      data: {
        companyId: session.user.companyId,
        invoiceId: validated.invoiceId,
        noteNumber,
        noteDate,
        status: validated.issueNow ? "ISSUED" : "DRAFT",
        currency: validated.currency ?? invoice.currency ?? "USD",
        subTotal,
        taxTotal,
        total,
        reason: validated.reason,
        createdById: session.user.id,
        issuedById: validated.issueNow ? session.user.id : undefined,
        issuedAt: validated.issueNow ? new Date() : undefined,
        lines: { create: computedLines },
      },
      include: {
        invoice: { select: { invoiceNumber: true, customer: { select: { name: true } } } },
        lines: true,
      },
    });

    if (creditNote.status === "ISSUED") {
      await recalcSalesInvoiceBalance(creditNote.invoiceId);
      try {
        await createJournalEntryFromSource({
          companyId: session.user.companyId,
          sourceType: "SALES_CREDIT_NOTE",
          sourceId: creditNote.id,
          entryDate: creditNote.noteDate,
          description: `Credit note ${creditNote.noteNumber}`,
          createdById: session.user.id,
          amount: creditNote.total,
          netAmount: creditNote.subTotal,
          taxAmount: creditNote.taxTotal,
          grossAmount: creditNote.total,
        });
      } catch (error) {
        console.error("[Accounting] Sales credit note auto-post failed:", error);
      }
    }

    return successResponse(creditNote, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/sales/credit-notes error:", error);
    return errorResponse("Failed to create credit note");
  }
}
