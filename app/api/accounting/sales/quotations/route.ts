import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { findTaxCodesOutsideEffectiveWindow } from "@/lib/accounting/tax-selection";
import { resolveDefaultTaxTemplate } from "@/lib/accounting/tax-rules";

const quotationSchema = z.object({
  customerId: z.string().uuid(),
  quotationDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  validUntil: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  currency: z.string().min(1).max(10).optional(),
  notes: z.string().max(1000).optional(),
  sendNow: z.boolean().optional(),
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

function buildQuotationNumberCandidate() {
  const now = new Date();
  const datePart = `${now.getFullYear()}${formatTwoDigits(now.getMonth() + 1)}${formatTwoDigits(now.getDate())}`;
  const timePart = `${formatTwoDigits(now.getHours())}${formatTwoDigits(now.getMinutes())}`;
  const randomPart = Math.floor(100 + Math.random() * 900);
  return `QTN-${datePart}-${timePart}-${randomPart}`;
}

async function generateUniqueQuotationNumber() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = buildQuotationNumberCandidate();
    const existing = await prisma.salesQuotation.findFirst({
      where: { quotationNumber: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }

  return `QTN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
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

    const [quotations, total] = await Promise.all([
      prisma.salesQuotation.findMany({
        where,
        include: {
          customer: true,
          lines: true,
        },
        orderBy: [{ quotationDate: "desc" }],
        skip,
        take: limit,
      }),
      prisma.salesQuotation.count({ where }),
    ]);

    return successResponse(paginationResponse(quotations, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/accounting/sales/quotations error:", error);
    return errorResponse("Failed to fetch sales quotations");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = quotationSchema.parse(body);

    const customer = await prisma.customer.findUnique({
      where: { id: validated.customerId },
      select: { companyId: true },
    });

    if (!customer || customer.companyId !== session.user.companyId) {
      return errorResponse("Invalid customer", 400);
    }

    const quotationDate = new Date(validated.quotationDate);
    const quotationNumber = await generateUniqueQuotationNumber();

    const resolvedTemplate = await resolveDefaultTaxTemplate({
      companyId: session.user.companyId,
      appliesTo: "SALES",
      partyType: "CUSTOMER",
      partyId: validated.customerId,
      documentDate: quotationDate,
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

    const taxCodesOutOfWindow = findTaxCodesOutsideEffectiveWindow(taxCodes, quotationDate);
    if (taxCodesOutOfWindow.length > 0) {
      return errorResponse("One or more tax codes are not effective on the quotation date", 400, {
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
      };
    });

    const subTotal = computedLines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
    const taxTotal = computedLines.reduce((sum, line) => sum + line.taxAmount, 0);
    const total = computedLines.reduce((sum, line) => sum + line.lineTotal, 0);

    const quotation = await prisma.salesQuotation.create({
      data: {
        companyId: session.user.companyId,
        customerId: validated.customerId,
        quotationNumber,
        quotationDate,
        validUntil: validated.validUntil ? new Date(validated.validUntil) : undefined,
        status: validated.sendNow ? "SENT" : "DRAFT",
        currency: validated.currency ?? "USD",
        subTotal,
        taxTotal,
        total,
        notes: validated.notes,
        createdById: session.user.id,
        issuedById: validated.sendNow ? session.user.id : undefined,
        issuedAt: validated.sendNow ? new Date() : undefined,
        lines: { create: computedLines },
      },
      include: {
        customer: true,
        lines: true,
      },
    });

    return successResponse(quotation, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/sales/quotations error:", error);
    return errorResponse("Failed to create sales quotation");
  }
}
