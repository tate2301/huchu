import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse, getPaginationParams, paginationResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { createJournalEntryFromSource } from "@/lib/accounting/posting";
import { issueFiscalReceipt } from "@/lib/accounting/fiscalisation";
import { hasFeature } from "@/lib/platform/features";
import { findTaxCodesOutsideEffectiveWindow } from "@/lib/accounting/tax-selection";
import { resolveDefaultTaxTemplate } from "@/lib/accounting/tax-rules";

const invoiceSchema = z.object({
  customerId: z.string().uuid(),
  invoiceDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  dueDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  currency: z.string().min(1).max(10).optional(),
  notes: z.string().max(1000).optional(),
  issueNow: z.boolean().optional(),
  lines: z
    .array(
      z.object({
        description: z.string().min(1).max(300),
        quantity: z.number().min(0.01),
        unitPrice: z.number().min(0),
        taxCodeId: z.string().uuid().optional(),
        taxRate: z.number().min(0).max(100).optional(),
        debit: z.number().min(0).optional(),
        credit: z.number().min(0).optional(),
      }),
    )
    .min(1),
});

function formatTwoDigits(value: number) {
  return String(value).padStart(2, "0");
}

function buildInvoiceNumberCandidate() {
  const now = new Date();
  const datePart = `${now.getFullYear()}${formatTwoDigits(now.getMonth() + 1)}${formatTwoDigits(now.getDate())}`;
  const timePart = `${formatTwoDigits(now.getHours())}${formatTwoDigits(now.getMinutes())}`;
  const randomPart = Math.floor(100 + Math.random() * 900);
  return `INV-${datePart}-${timePart}-${randomPart}`;
}

async function generateUniqueInvoiceNumber() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = buildInvoiceNumberCandidate();
    const existing = await prisma.salesInvoice.findFirst({
      where: { invoiceNumber: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  return `INV-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const customerId = searchParams.get("customerId");
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    };
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;

    const [invoices, total] = await Promise.all([
      prisma.salesInvoice.findMany({
        where,
        include: {
          customer: true,
          lines: true,
          fiscalReceipt: true,
        },
        orderBy: [{ invoiceDate: "desc" }],
        skip,
        take: limit,
      }),
      prisma.salesInvoice.count({ where }),
    ]);

    const enriched = invoices.map((invoice) => ({
      ...invoice,
      balance:
        invoice.total -
        (invoice.amountPaid ?? 0) -
        (invoice.creditTotal ?? 0) -
        (invoice.writeOffTotal ?? 0),
    }));

    return successResponse(paginationResponse(enriched, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/accounting/sales/invoices error:", error);
    return errorResponse("Failed to fetch sales invoices");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = invoiceSchema.parse(body);

    const customer = await prisma.customer.findUnique({
      where: { id: validated.customerId },
      select: { companyId: true },
    });
    if (!customer || customer.companyId !== session.user.companyId) {
      return errorResponse("Invalid customer", 400);
    }

    const invoiceNumber = await generateUniqueInvoiceNumber();

    const resolvedTemplate = await resolveDefaultTaxTemplate({
      companyId: session.user.companyId,
      appliesTo: "SALES",
      partyType: "CUSTOMER",
      partyId: validated.customerId,
      documentDate: new Date(validated.invoiceDate),
      currency: validated.currency ?? "USD",
    });

    const linesWithResolvedTaxCode = validated.lines.map((line) => ({
      ...line,
      taxCodeId: line.taxCodeId ?? resolvedTemplate.defaultTaxCodeId ?? undefined,
    }));

    const taxCodeIds = linesWithResolvedTaxCode
      .map((line) => line.taxCodeId)
      .filter((value): value is string => Boolean(value));

    const taxCodes = taxCodeIds.length
      ? await prisma.taxCode.findMany({
        where: { id: { in: taxCodeIds }, companyId: session.user.companyId },
        select: { id: true, rate: true, effectiveFrom: true, effectiveTo: true },
      })
      : [];

    const invoiceDate = new Date(validated.invoiceDate);
    const taxCodesOutOfWindow = findTaxCodesOutsideEffectiveWindow(taxCodes, invoiceDate);
    if (taxCodesOutOfWindow.length > 0) {
      return errorResponse("One or more tax codes are not effective on the invoice date", 400, {
        taxCodeIds: taxCodesOutOfWindow,
      });
    }

    const taxById = new Map(taxCodes.map((tax) => [tax.id, tax.rate]));

    const computedLines = linesWithResolvedTaxCode.map((line) => {
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
        debit: line.debit,
        credit: line.credit,
      };
    });

    const subTotal = computedLines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
    const taxTotal = computedLines.reduce((sum, line) => sum + line.taxAmount, 0);
    const total = computedLines.reduce((sum, line) => sum + line.lineTotal, 0);

    const invoice = await prisma.salesInvoice.create({
      data: {
        companyId: session.user.companyId,
        customerId: validated.customerId,
        invoiceNumber,
        invoiceDate,
        dueDate: validated.dueDate ? new Date(validated.dueDate) : undefined,
        status: validated.issueNow ? "ISSUED" : "DRAFT",
        currency: validated.currency ?? "USD",
        subTotal,
        taxTotal,
        total,
        notes: validated.notes,
        createdById: session.user.id,
        issuedById: validated.issueNow ? session.user.id : undefined,
        issuedAt: validated.issueNow ? new Date() : undefined,
        lines: { create: computedLines },
      },
      include: {
        customer: true,
        lines: true,
      },
    });

    if (invoice.status === "ISSUED") {
      try {
        await createJournalEntryFromSource({
          companyId: session.user.companyId,
          sourceType: "SALES_INVOICE",
          sourceId: invoice.id,
          entryDate: invoice.invoiceDate,
          description: `Sales invoice ${invoice.invoiceNumber}`,
          createdById: session.user.id,
          amount: invoice.total,
          netAmount: invoice.subTotal,
          taxAmount: invoice.taxTotal,
          grossAmount: invoice.total,
        });
      } catch (error) {
        console.error("[Accounting] Sales invoice auto-post failed:", error);
      }

      const fiscalEnabled = await hasFeature(session.user.companyId, "accounting.zimra.fiscalisation");
      if (fiscalEnabled) {
        try {
          await issueFiscalReceipt(session.user.companyId, invoice.id, session.user.id);
        } catch (error) {
          console.error("[Accounting] Fiscalisation issue failed:", error);
        }
      }
    }

    return successResponse(invoice, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/sales/invoices error:", error);
    return errorResponse("Failed to create sales invoice");
  }
}
