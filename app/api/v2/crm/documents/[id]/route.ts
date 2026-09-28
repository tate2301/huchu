/**
 * One quote, invoice or receipt, for its own page.
 *
 * The list route reads documents the other way round from a deal; this reads
 * one whole: its lines, what was paid against it, the chases, what the client
 * was asked to look at, and the versions either side of it. The accounting
 * row is the source of truth for number, status and money, as everywhere
 * else; the CRM row carries the version chain and what it was raised against.
 *
 * `basePath` is the record the document hangs off. Every verb a document has
 * — its PDF, its approval link, the email, a payment — lives under that
 * record's route, so the page hands it to the same actions the deal uses.
 */
import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const PERSON = { select: { id: true, name: true } } as const;
const LINE = {
  select: {
    id: true,
    description: true,
    quantity: true,
    unitPrice: true,
    taxRate: true,
    taxAmount: true,
    lineTotal: true,
  },
  orderBy: { createdAt: "asc" },
} as const;

/** Another document in the chain, named well enough to link to. */
const SIBLING = {
  select: {
    id: true,
    type: true,
    version: true,
    quotation: { select: { quotationNumber: true, status: true } },
    invoice: { select: { invoiceNumber: true, status: true } },
    receipt: { select: { receiptNumber: true } },
  },
} as const;

type Sibling = {
  id: string;
  type: string;
  version: number;
  quotation: { quotationNumber: string; status: string } | null;
  invoice: { invoiceNumber: string; status: string } | null;
  receipt: { receiptNumber: string } | null;
};

function named(sibling: Sibling | null | undefined) {
  if (!sibling) return null;
  return {
    id: sibling.id,
    type: sibling.type,
    version: sibling.version,
    number:
      sibling.quotation?.quotationNumber ??
      sibling.invoice?.invoiceNumber ??
      sibling.receipt?.receiptNumber ??
      null,
    status: sibling.quotation?.status ?? sibling.invoice?.status ?? (sibling.receipt ? "RECEIVED" : null),
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { id } = await params;

    const document = await prisma.crmLeadDocument.findFirst({
      where: { id, companyId },
      include: {
        createdBy: PERSON,
        lead: { select: { id: true, leadNo: true, title: true } },
        deal: {
          select: {
            id: true,
            dealNo: true,
            title: true,
            projects: { select: { id: true, projectNo: true, name: true }, take: 1 },
          },
        },
        approval: {
          select: {
            token: true,
            status: true,
            respondedAt: true,
            responseNote: true,
            responderName: true,
            firstViewedAt: true,
          },
        },
        quotation: {
          select: {
            id: true,
            quotationNumber: true,
            status: true,
            quotationDate: true,
            validUntil: true,
            subTotal: true,
            taxTotal: true,
            total: true,
            notes: true,
            customer: { select: { id: true, name: true, email: true } },
            lines: LINE,
            invoicesRaised: {
              select: { id: true, crmLeadDocuments: SIBLING },
            },
          },
        },
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            invoiceDate: true,
            dueDate: true,
            subTotal: true,
            taxTotal: true,
            total: true,
            amountPaid: true,
            creditTotal: true,
            writeOffTotal: true,
            notes: true,
            fiscalStatus: true,
            fiscalReceipt: { select: { id: true } },
            customer: { select: { id: true, name: true, email: true } },
            lines: LINE,
            receipts: {
              orderBy: { receivedAt: "asc" },
              select: {
                id: true,
                receiptNumber: true,
                receivedAt: true,
                amount: true,
                method: true,
                reference: true,
                crmLeadDocuments: { select: { id: true } },
              },
            },
            creditNotes: {
              where: { status: { not: "VOIDED" } },
              orderBy: { noteDate: "asc" },
              select: { id: true, noteNumber: true, noteDate: true, total: true, reason: true },
            },
            fromQuotation: { select: { id: true, crmLeadDocuments: SIBLING } },
            _count: {
              select: {
                receipts: true,
                creditNotes: { where: { status: { not: "VOIDED" } } },
                writeOffs: { where: { status: { not: "VOIDED" } } },
              },
            },
          },
        },
        receipt: {
          select: {
            id: true,
            receiptNumber: true,
            receivedAt: true,
            amount: true,
            method: true,
            reference: true,
            invoice: {
              select: {
                id: true,
                invoiceNumber: true,
                total: true,
                amountPaid: true,
                creditTotal: true,
                writeOffTotal: true,
                customer: { select: { id: true, name: true, email: true } },
                crmLeadDocuments: SIBLING,
              },
            },
          },
        },
        supersedes: SIBLING,
        supersededBy: SIBLING,
        collectionNotes: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            outcome: true,
            promisedAt: true,
            promisedAmount: true,
            notes: true,
            createdAt: true,
            createdBy: PERSON,
          },
        },
        resources: {
          select: {
            resource: {
              select: { id: true, title: true, description: true, kind: true, url: true, archivedAt: true },
            },
          },
        },
      },
    });
    if (!document) return errorResponse("Document not found", 404);

    const { quotation, invoice, receipt } = document;
    const accounting = quotation ?? invoice;
    const customer =
      quotation?.customer ?? invoice?.customer ?? receipt?.invoice?.customer ?? null;

    return successResponse({
      document: {
        // The shape the deal's document list reads, so the same verbs apply.
        id: document.id,
        type: document.type,
        quotationId: document.quotationId,
        invoiceId: document.invoiceId,
        receiptId: document.receiptId,
        amount: document.amount,
        currency: document.currency,
        isDeposit: document.isDeposit,
        version: document.version,
        supersedesId: document.supersedesId,
        revisionNote: document.revisionNote,
        createdAt: document.createdAt,
        approval: document.approval,
        quotation: quotation
          ? {
              id: quotation.id,
              quotationNumber: quotation.quotationNumber,
              status: quotation.status,
              validUntil: quotation.validUntil,
              total: quotation.total,
            }
          : null,
        invoice: invoice
          ? {
              id: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              status: invoice.status,
              dueDate: invoice.dueDate,
              total: invoice.total,
              amountPaid: invoice.amountPaid,
              creditTotal: invoice.creditTotal,
              writeOffTotal: invoice.writeOffTotal,
              fiscalStatus: invoice.fiscalStatus,
              fiscalReceipt: invoice.fiscalReceipt,
              _count: invoice._count,
            }
          : null,
        receipt: receipt
          ? {
              id: receipt.id,
              receiptNumber: receipt.receiptNumber,
              receivedAt: receipt.receivedAt,
              amount: receipt.amount,
              method: receipt.method,
            }
          : null,
      },
      detail: {
        customer,
        issuedAt: quotation?.quotationDate ?? invoice?.invoiceDate ?? receipt?.receivedAt ?? document.createdAt,
        lines: accounting?.lines ?? [],
        subTotal: accounting?.subTotal ?? null,
        taxTotal: accounting?.taxTotal ?? null,
        total: accounting?.total ?? receipt?.amount ?? document.amount,
        notes: accounting?.notes ?? null,
        reference: receipt?.reference ?? null,
        createdBy: document.createdBy,
        lead: document.lead,
        deal: document.deal
          ? { id: document.deal.id, dealNo: document.deal.dealNo, title: document.deal.title }
          : null,
        project: document.deal?.projects[0] ?? null,
        payments:
          invoice?.receipts.map((payment) => ({
            id: payment.id,
            documentId: payment.crmLeadDocuments[0]?.id ?? null,
            receiptNumber: payment.receiptNumber,
            receivedAt: payment.receivedAt,
            amount: payment.amount,
            method: payment.method,
            reference: payment.reference,
          })) ?? [],
        credits: invoice?.creditNotes ?? [],
        chases: document.collectionNotes,
        resources: document.resources
          .map((link) => link.resource)
          .filter((resource) => resource !== null),
        // The chain: what this replaced, what replaced it, what it became.
        supersedes: named(document.supersedes),
        supersededBy: document.supersededBy.map(named),
        raisedFrom: named(invoice?.fromQuotation?.crmLeadDocuments[0]),
        invoicedAs: (quotation?.invoicesRaised ?? [])
          .map((raised) => named(raised.crmLeadDocuments[0]))
          .filter((sibling) => sibling !== null),
        paidInvoice: named(receipt?.invoice?.crmLeadDocuments[0]),
        // Where the invoice a receipt paid stands now, this payment included.
        paidInvoiceBalance: receipt?.invoice
          ? {
              total: receipt.invoice.total,
              paid: receipt.invoice.amountPaid,
              credited: receipt.invoice.creditTotal,
              writtenOff: receipt.invoice.writeOffTotal,
            }
          : null,
      },
      basePath: document.dealId
        ? `/api/v2/crm/deals/${document.dealId}`
        : document.leadId
          ? `/api/v2/crm/leads/${document.leadId}`
          : null,
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/documents/[id] error:", error);
    return errorResponse("Failed to load the document");
  }
}
