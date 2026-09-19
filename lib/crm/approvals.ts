/**
 * CRM public document approvals.
 *
 * A quotation or invoice can be sent to a client via a tokenized public link
 * (/a/[token]). The client approves or declines without logging in. Approving
 * a quotation marks the underlying SalesQuotation ACCEPTED. Every response
 * writes a CRM activity and notifies the lead's assignee.
 */
import { randomBytes } from "crypto";
import type { Prisma } from "@prisma/client";

import { NotificationType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { emitCrmNotification } from "@/lib/notifications";
import { getDocumentBranding } from "@/lib/documents/branding-snapshot";
import { buildPaymentRows, type PaymentRow } from "@/lib/documents/payment-details";

type Tx = Prisma.TransactionClient;

export function generateApprovalToken(): string {
  return randomBytes(32).toString("base64url");
}

export type ApprovalLink = {
  token: string;
  /** True when this call minted the token rather than returning the live one. */
  issued: boolean;
};

/**
 * The approval link for a lead document, minting one if it has none.
 *
 * Deliberately NOT a rotation. This used to replace the token on every call,
 * and both of the UI's two "share this" actions — copy the link, email the
 * client — went through it. So a rep who sent a quote on Monday and reopened
 * the menu on Tuesday to re-read the link silently revoked the one already in
 * the customer's inbox, and the customer got "Document not found". Worse, the
 * rewrite reset `status` to PENDING and cleared `respondedAt`, so a quote the
 * customer had already approved lost their answer.
 *
 * A live link is therefore returned as it is, and a new one is minted only
 * when there is none, or when the last one is no longer usable (revoked, or
 * expired unanswered) and the rep is asking for a fresh one. Deliberately
 * rotating a link that still works — because it leaked — is `rotateApproval`.
 */
export async function getOrCreateApproval(
  tx: Tx,
  params: { companyId: string; leadDocumentId: string; expiresInDays?: number },
): Promise<ApprovalLink> {
  const existing = await tx.crmDocumentApproval.findUnique({
    where: { leadDocumentId: params.leadDocumentId },
    select: { token: true, status: true, expiresAt: true },
  });

  // Anything the customer can still open, or has already answered, is the
  // link — handing back a second one would make the first a dead end.
  if (existing && existing.status !== "REVOKED" && !isExpired(existing.expiresAt)) {
    return { token: existing.token, issued: false };
  }

  return { token: await rotateApproval(tx, params), issued: true };
}

/**
 * Replace a lead document's approval token, invalidating whatever was sent
 * before. For a link that has to be withdrawn — it went to the wrong address,
 * or the quote has been revised — not for re-reading the current one.
 */
export async function rotateApproval(
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
    /**
     * The same rows the generated document prints, from the same helper, so a
     * customer is never told one thing on the PDF and another on the page they
     * sign. Empty on a quotation, which does not ask for money.
     */
    paymentRows: PaymentRow[];
    paymentTerms: string | null;
    footerText: string | null;
  };
  /**
   * Why the link no longer works, when it does not. A customer who is told
   * "document not found" about a quote they were sent an hour ago concludes
   * the business has lost it; "this link was replaced" tells them what to ask
   * for. Pricing is withheld for anything but `ACTIVE` either way.
   */
  linkState: "ACTIVE" | "EXPIRED" | "REVOKED";
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

  const revoked = approval.status === "REVOKED";

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
  // An expired or withdrawn link no longer discloses pricing — the client must
  // ask the rep for a fresh one. Both are withheld the same way; only the
  // sentence the page shows differs.
  const withheld = expired || revoked;

  const lines = withheld
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
    total: withheld ? 0 : doc.amount,
    subTotal: withheld ? 0 : (source?.subTotal ?? 0),
    taxTotal: withheld ? 0 : (source?.taxTotal ?? 0),
    issuedAt:
      doc.quotation?.quotationDate?.toISOString() ?? doc.invoice?.invoiceDate?.toISOString() ?? null,
    validUntil: doc.quotation?.validUntil?.toISOString() ?? null,
    dueDate: doc.invoice?.dueDate?.toISOString() ?? null,
    notes: withheld ? null : (source?.notes ?? null),
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
      paymentRows: doc.type === "INVOICE" ? buildPaymentRows(branding) : [],
      paymentTerms: branding.paymentTerms ?? null,
      footerText: branding.defaultFooterText ?? null,
    },
    linkState: revoked ? "REVOKED" : expired ? "EXPIRED" : "ACTIVE",
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
  if (approval.status === "REVOKED") {
    throw new Error("This link has been withdrawn. Please ask us for a current copy.");
  }
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
