/**
 * CRM public document approvals.
 *
 * A quotation or invoice can be sent to a client via a tokenized public link
 * (/a/[token]). The client approves or declines without logging in. Approving
 * a quotation marks the underlying SalesQuotation ACCEPTED. Every response
 * writes a CRM activity and notifies the lead's assignee.
 */
import { randomBytes } from "crypto";
import type { Prisma } from "@corelithzw/db";

import { NotificationType } from "@corelithzw/db";

import { prisma } from "@corelithzw/db/client";
import { emitCrmNotification } from "@/lib/notifications";
import { getDocumentBranding } from "@/lib/documents/branding-snapshot";

type Tx = Prisma.TransactionClient;

export function generateApprovalToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Create (or rotate) the approval token for a lead document. Returns the token.
 */
export async function createOrRotateApproval(
  tx: Tx,
  params: { companyId: string; leadDocumentId: string; expiresInDays?: number },
): Promise<string> {
  const token = generateApprovalToken();
  const expiresAt = params.expiresInDays
    ? new Date(Date.now() + params.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  await tx.crmDocumentApproval.upsert({
    where: { leadDocumentId: params.leadDocumentId },
    update: { token, status: "PENDING", expiresAt, respondedAt: null, responseNote: null, responderName: null, firstViewedAt: null },
    create: {
      companyId: params.companyId,
      leadDocumentId: params.leadDocumentId,
      token,
      expiresAt,
    },
  });
  return token;
}

/**
 * What a client sees at /a/[token]. Deliberately a hand-built projection
 * rather than the raw record: this is served without a session, so only what
 * belongs on the client's own copy of the document is included.
 */
export type PublicApprovalView = {
  companyName: string;
  documentType: "QUOTATION" | "INVOICE" | "RECEIPT";
  status: string;
  number: string;
  currency: string;
  total: number;
  subTotal: number;
  taxTotal: number;
  issuedAt: string | null;
  validUntil: string | null;
  dueDate: string | null;
  notes: string | null;
  billedTo: string | null;
  lines: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    taxRate: number;
    lineTotal: number;
  }>;
  branding: {
    logoUrl: string | null;
    primaryColor: string | null;
    email: string | null;
    phone: string | null;
    website: string | null;
    physicalAddress: string | null;
    registrationNumber: string | null;
    vatNumber: string | null;
    bankName: string | null;
    bankAccountName: string | null;
    bankAccountNumber: string | null;
    paymentTerms: string | null;
    footerText: string | null;
  };
  expired: boolean;
};

function isExpired(expiresAt: Date | null): boolean {
  return Boolean(expiresAt && expiresAt.getTime() < Date.now());
}

/**
 * Load the public view for an approval token and stamp firstViewedAt.
 */
export async function getApprovalByToken(token: string): Promise<PublicApprovalView | null> {
  const approval = await prisma.crmDocumentApproval.findUnique({
    where: { token },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      firstViewedAt: true,
      companyId: true,
      leadDocument: {
        select: {
          type: true,
          currency: true,
          amount: true,
          quotation: {
            select: {
              quotationNumber: true,
              quotationDate: true,
              validUntil: true,
              subTotal: true,
              taxTotal: true,
              notes: true,
              lines: true,
              customer: { select: { name: true } },
            },
          },
          invoice: {
            select: {
              invoiceNumber: true,
              invoiceDate: true,
              dueDate: true,
              subTotal: true,
              taxTotal: true,
              notes: true,
              lines: true,
              customer: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!approval) return null;
  // A revoked link must not leak the document's content — treat as not found.
  if (approval.status === "REVOKED") return null;

  if (!approval.firstViewedAt) {
    void prisma.crmDocumentApproval
      .update({ where: { id: approval.id }, data: { firstViewedAt: new Date() } })
      .catch(() => {});
  }

  const branding = await getDocumentBranding(approval.companyId);

  const doc = approval.leadDocument;
  const source = doc.quotation ?? doc.invoice;
  const number = doc.quotation?.quotationNumber ?? doc.invoice?.invoiceNumber ?? "";
  const expired = approval.status === "PENDING" && isExpired(approval.expiresAt);

  // An expired, never-actioned link no longer discloses pricing — the client
  // must request a fresh link from the rep.
  const lines = expired
    ? []
    : (source?.lines ?? []).map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxRate: l.taxRate ?? 0,
        lineTotal: l.lineTotal,
      }));

  return {
    companyName: branding.displayName,
    documentType: doc.type,
    status: approval.status,
    number,
    currency: doc.currency,
    total: expired ? 0 : doc.amount,
    subTotal: expired ? 0 : (source?.subTotal ?? 0),
    taxTotal: expired ? 0 : (source?.taxTotal ?? 0),
    issuedAt:
      doc.quotation?.quotationDate?.toISOString() ?? doc.invoice?.invoiceDate?.toISOString() ?? null,
    validUntil: doc.quotation?.validUntil?.toISOString() ?? null,
    dueDate: doc.invoice?.dueDate?.toISOString() ?? null,
    notes: expired ? null : (source?.notes ?? null),
    billedTo: source?.customer?.name ?? null,
    lines,
    branding: {
      logoUrl: branding.logoUrl ?? null,
      primaryColor: branding.primaryColor ?? null,
      email: branding.email ?? null,
      phone: branding.phone ?? null,
      website: branding.website ?? null,
      physicalAddress: branding.physicalAddress ?? null,
      registrationNumber: branding.registrationNumber ?? null,
      vatNumber: branding.vatNumber ?? null,
      // Bank details only belong on a document the client has to pay.
      bankName: doc.type === "INVOICE" ? (branding.bankName ?? null) : null,
      bankAccountName: doc.type === "INVOICE" ? (branding.bankAccountName ?? null) : null,
      bankAccountNumber: doc.type === "INVOICE" ? (branding.bankAccountNumber ?? null) : null,
      paymentTerms: branding.paymentTerms ?? null,
      footerText: branding.defaultFooterText ?? null,
    },
    expired,
  };
}

export type RespondInput = {
  token: string;
  action: "APPROVE" | "DECLINE";
  note?: string | null;
  name?: string | null;
};

/**
 * Record a client's approve/decline decision. Only a PENDING, non-expired
 * approval can be actioned. Returns the resulting status or throws.
 */
export async function respondToApproval(input: RespondInput): Promise<{ status: "APPROVED" | "DECLINED" }> {
  const approval = await prisma.crmDocumentApproval.findUnique({
    where: { token: input.token },
    select: {
      id: true,
      companyId: true,
      status: true,
      expiresAt: true,
      leadDocument: {
        select: {
          id: true,
          type: true,
          quotationId: true,
          lead: { select: { id: true, clientId: true, assignedToId: true } },
          deal: { select: { id: true, clientId: true, assignedToId: true } },
        },
      },
    },
  });
  if (!approval) throw new Error("Approval not found");
  if (approval.status !== "PENDING") throw new Error("This document has already been responded to");
  if (isExpired(approval.expiresAt)) {
    // Persist the expiry outside any transaction that later throws — a throw
    // inside a $transaction would roll this write back.
    await prisma.crmDocumentApproval.updateMany({
      where: { id: approval.id, status: "PENDING" },
      data: { status: "EXPIRED" },
    });
    throw new Error("This approval link has expired");
  }

  const result = await prisma.$transaction(async (tx) => {
    const nextStatus = input.action === "APPROVE" ? ("APPROVED" as const) : ("DECLINED" as const);
    // Atomic claim: only one concurrent responder can move PENDING → final.
    const claimed = await tx.crmDocumentApproval.updateMany({
      where: { id: approval.id, status: "PENDING" },
      data: {
        status: nextStatus,
        respondedAt: new Date(),
        responseNote: input.note ?? undefined,
        responderName: input.name ?? undefined,
      },
    });
    if (claimed.count === 0) {
      throw new Error("This document has already been responded to");
    }

    if (input.action === "APPROVE" && approval.leadDocument.type === "QUOTATION" && approval.leadDocument.quotationId) {
      await tx.salesQuotation.update({
        where: { id: approval.leadDocument.quotationId },
        data: { status: "ACCEPTED" },
      });
    }

    // A document hangs off a deal once the lead has been converted, and off
    // the lead before that. Log the response against whichever it has.
    const lead = approval.leadDocument.lead;
    const deal = approval.leadDocument.deal;
    const owner = deal ?? lead;
    await tx.crmActivity.create({
      data: {
        companyId: approval.companyId,
        type: input.action === "APPROVE" ? "DOCUMENT_APPROVED" : "DOCUMENT_DECLINED",
        leadId: lead?.id,
        dealId: deal?.id,
        clientId: owner?.clientId ?? undefined,
        subject: `Document ${input.action === "APPROVE" ? "approved" : "declined"} by client${input.name ? ` (${input.name})` : ""}`,
        body: input.note ?? undefined,
        metadata: { leadDocumentId: approval.leadDocument.id },
      },
    });

    return {
      companyId: approval.companyId,
      leadId: lead?.id ?? null,
      dealId: deal?.id ?? null,
      assignedToId: owner?.assignedToId ?? null,
      action: input.action,
      nextStatus,
    };
  });

  if (result.assignedToId) {
    await emitCrmNotification({
      companyId: result.companyId,
      recipientIds: [result.assignedToId],
      type: result.action === "APPROVE" ? NotificationType.CRM_DOCUMENT_APPROVED : NotificationType.CRM_DOCUMENT_DECLINED,
      title: result.action === "APPROVE" ? "Quote approved" : "Quote declined",
      summary: `A client ${result.action === "APPROVE" ? "approved" : "declined"} a document.`,
      leadId: result.leadId ?? undefined,
      viewPath: result.dealId ? `/crm/deals/${result.dealId}` : `/crm/leads/${result.leadId}`,
    });
  }

  return { status: result.nextStatus };
}
