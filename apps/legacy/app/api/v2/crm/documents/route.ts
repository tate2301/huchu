import { NextRequest, NextResponse } from "next/server";
import type { CrmDocumentType, Prisma } from "@corelithzw/db";

import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";

const TYPES: CrmDocumentType[] = ["QUOTATION", "INVOICE", "RECEIPT"];

/**
 * The paper the CRM has produced — quotes, invoices and receipts.
 *
 * These records existed only as a tab inside one lead, which meant "show me
 * everything we quoted this month" had no answer short of opening leads one at
 * a time. `CrmLeadDocument` is already the join between a lead or deal and the
 * accounting document it produced, so the list is a matter of reading it the
 * other way round.
 *
 * The underlying accounting row is the source of truth for number, status and
 * money; the CRM row carries the version chain and what it was raised against.
 */
function summarise(document: DocumentRow) {
  const { quotation, invoice, receipt } = document;

  if (quotation) {
    return {
      number: quotation.quotationNumber,
      status: quotation.status as string,
      issuedAt: quotation.quotationDate.toISOString(),
      dueAt: quotation.validUntil?.toISOString() ?? null,
      customer: quotation.customer?.name ?? null,
      total: quotation.total,
      // Only an invoice can carry a balance; the others are settled by
      // definition, and reporting `0` would read as "nothing outstanding"
      // rather than "not a thing that can be outstanding".
      balance: null as number | null,
    };
  }
  if (invoice) {
    return {
      number: invoice.invoiceNumber,
      status: invoice.status as string,
      issuedAt: invoice.invoiceDate.toISOString(),
      dueAt: invoice.dueDate?.toISOString() ?? null,
      customer: invoice.customer?.name ?? null,
      total: invoice.total,
      balance: invoice.total - invoice.amountPaid,
    };
  }
  if (receipt) {
    return {
      number: receipt.receiptNumber,
      status: "RECEIVED",
      issuedAt: receipt.receivedAt.toISOString(),
      dueAt: null,
      customer: receipt.invoice?.customer?.name ?? null,
      total: receipt.amount,
      balance: null as number | null,
    };
  }

  // The accounting row was deleted out from under the link. Say so rather than
  // dropping the row, because a quote that has lost its paperwork is exactly
  // the thing somebody needs to find.
  return {
    number: null,
    status: "MISSING",
    issuedAt: document.createdAt.toISOString(),
    dueAt: null,
    customer: null,
    total: document.amount,
    balance: null as number | null,
  };
}

const INCLUDE = {
  quotation: {
    select: {
      quotationNumber: true,
      quotationDate: true,
      validUntil: true,
      status: true,
      total: true,
      customer: { select: { name: true } },
    },
  },
  invoice: {
    select: {
      invoiceNumber: true,
      invoiceDate: true,
      dueDate: true,
      status: true,
      total: true,
      amountPaid: true,
      customer: { select: { name: true } },
    },
  },
  receipt: {
    select: {
      receiptNumber: true,
      receivedAt: true,
      amount: true,
      invoice: { select: { customer: { select: { name: true } } } },
    },
  },
  lead: { select: { id: true, leadNo: true, title: true } },
  deal: { select: { id: true, dealNo: true, title: true } },
  createdBy: { select: { id: true, name: true } },
  approval: { select: { status: true, token: true } },
} satisfies Prisma.CrmLeadDocumentInclude;

type DocumentRow = Prisma.CrmLeadDocumentGetPayload<{ include: typeof INCLUDE }>;

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);
    const requestedType = searchParams.get("type");
    const type = TYPES.find((value) => value === requestedType);
    const q = searchParams.get("q")?.trim();

    const clientId = searchParams.get("clientId")?.trim();
    const ownerId = searchParams.get("ownerId")?.trim();
    const recordFilters: Prisma.CrmLeadDocumentWhereInput[] = [];
    if (clientId) {
      recordFilters.push({
        OR: [{ lead: { clientId } }, { deal: { clientId } }],
      });
    }
    if (ownerId) {
      recordFilters.push({
        OR: [{ lead: { assignedToId: ownerId } }, { deal: { assignedToId: ownerId } }],
      });
    }

    const where: Prisma.CrmLeadDocumentWhereInput = {
      companyId: session.user.companyId,
      ...(type ? { type } : {}),
      ...(searchParams.get("leadId") ? { leadId: searchParams.get("leadId")! } : {}),
      ...(searchParams.get("dealId") ? { dealId: searchParams.get("dealId")! } : {}),
      // A document belongs to a lead or a deal, so "this company's paperwork"
      // has to be asked through them. Both sides are checked because a company
      // with quotes on leads and invoices on deals would otherwise show half
      // its history and look like it had lost the rest.
      //
      // Collected into AND rather than written as sibling ORs: two OR keys on
      // one object clobber each other, which would silently widen the filter.
      ...(recordFilters.length > 0 ? { AND: recordFilters } : {}),
      ...(q
        ? {
            OR: [
              { quotation: { quotationNumber: { contains: q, mode: "insensitive" } } },
              { invoice: { invoiceNumber: { contains: q, mode: "insensitive" } } },
              { receipt: { receiptNumber: { contains: q, mode: "insensitive" } } },
              { quotation: { customer: { name: { contains: q, mode: "insensitive" } } } },
              { invoice: { customer: { name: { contains: q, mode: "insensitive" } } } },
              { lead: { title: { contains: q, mode: "insensitive" } } },
              { deal: { title: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const [documents, total] = await Promise.all([
      prisma.crmLeadDocument.findMany({
        where,
        include: INCLUDE,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.crmLeadDocument.count({ where }),
    ]);

    const rows = documents.map((document) => ({
      id: document.id,
      type: document.type,
      version: document.version,
      revisionNote: document.revisionNote,
      supersedesId: document.supersedesId,
      currency: document.currency,
      createdAt: document.createdAt.toISOString(),
      createdBy: document.createdBy,
      lead: document.lead,
      deal: document.deal,
      approvalStatus: document.approval?.status ?? null,
      approvalToken: document.approval?.token ?? null,
      ...summarise(document),
    }));

    return successResponse(paginationResponse(rows, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/v2/crm/documents error:", error);
    return errorResponse("Failed to fetch documents");
  }
}
