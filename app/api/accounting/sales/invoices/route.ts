import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse, getPaginationParams, paginationResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { createSalesInvoice, InvoiceRefused, invoiceSchema } from "@/lib/books/create-invoice";
import { guardBooks } from "@/lib/books/core";

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
          // Where an invoice came from a quote, say so — otherwise the link is
          // recorded and never seen.
          fromQuotation: { select: { id: true, quotationNumber: true } },
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
    const validated = invoiceSchema.parse(await request.json());
    const { refused } = await guardBooks(session, validated.issueNow ? "issue" : "draft.create", { kind: "invoice" });
    if (refused) return refused;
    const invoice = await createSalesInvoice({ companyId: session.user.companyId, userId: session.user.id }, validated);
    return successResponse(invoice, 201);
  } catch (error) {
    if (error instanceof InvoiceRefused) return errorResponse(error.message, 400, error.details);
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/sales/invoices error:", error);
    return errorResponse("Failed to create sales invoice");
  }
}
