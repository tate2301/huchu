/**
 * Sending a quotation or invoice to the client, from the app.
 *
 * This used to hand off to `mailto:` — the platform had no outbound mail, and
 * a button that appeared to send while doing nothing would have been worse
 * than an honest draft in the rep's own client. It has one now, so the rep
 * presses send and the customer gets the document.
 *
 * What lands in the customer's inbox is the PDF as an attachment *and* the
 * approval link in the body: the attachment is the copy they keep, the link is
 * the one they can act on. Both come from the same record, so they cannot
 * disagree.
 */
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getDocumentBranding } from "@/lib/documents/branding-snapshot";
import { renderDocumentSync } from "@/lib/documents/service";
import { getOrCreateApproval } from "@/lib/crm/approvals";
import { sendEmail } from "@/lib/email/send";
import { absoluteUrl } from "@/lib/site-url";

const SOURCE_KEYS = {
  QUOTATION: "accounting.sales.quotation",
  INVOICE: "accounting.sales.invoice",
  RECEIPT: "accounting.sales.receipt",
} as const;

const LABELS = {
  QUOTATION: "Quotation",
  INVOICE: "Invoice",
  RECEIPT: "Receipt",
} as const;

type DocumentKind = keyof typeof SOURCE_KEYS;

/** Everywhere a client's address might be recorded, best first. */
export type RecipientSources = {
  /** The customer on the accounting record — the party actually being billed. */
  customerEmail?: string | null;
  /** The CRM client the lead or deal belongs to. */
  clientEmail?: string | null;
  /** The named contact on the lead, before it became a client. */
  contactEmail?: string | null;
};

/**
 * Who to send to.
 *
 * The customer on the document wins: it is the party named on the paper, and
 * sending an invoice to a lead's original enquiry address after the account
 * has been set up is how a bill reaches the wrong desk.
 */
export function resolveRecipient(sources: RecipientSources): string | null {
  for (const candidate of [sources.customerEmail, sources.clientEmail, sources.contactEmail]) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function money(currency: string, amount: number): string {
  return `${currency} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export type DocumentEmailBody = { subject: string; text: string; html: string };

/**
 * The covering note. Deliberately plain: it is a business letter, not a
 * newsletter, and an HTML mail that renders as a marketing blast is the one a
 * finance department deletes.
 */
export function buildDocumentEmail(input: {
  kind: DocumentKind;
  number: string;
  companyName: string;
  amount: string;
  approvalUrl: string;
}): DocumentEmailBody {
  const label = LABELS[input.kind];
  const noun = label.toLowerCase();
  const subject = `${label} ${input.number} from ${input.companyName}`;

  const lines = [
    `Please find our ${noun} ${input.number} for ${input.amount} attached.`,
    "",
    input.kind === "RECEIPT"
      ? `You can view it here: ${input.approvalUrl}`
      : `You can review and respond to it here: ${input.approvalUrl}`,
    "",
    input.companyName,
  ];

  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#18181b">
  <p>Please find our ${escapeHtml(noun)} <strong>${escapeHtml(input.number)}</strong> for ${escapeHtml(input.amount)} attached.</p>
  <p><a href="${escapeHtml(input.approvalUrl)}">${input.kind === "RECEIPT" ? "View the " + escapeHtml(noun) : "Review and respond to the " + escapeHtml(noun)}</a></p>
  <p>${escapeHtml(input.companyName)}</p>
</div>`;

  return { subject, text: lines.join("\n"), html };
}

export class NoRecipientError extends Error {
  constructor() {
    super(
      "This record has no client email address. Add one to the customer or the contact, then send again.",
    );
    this.name = "NoRecipientError";
  }
}

export type SentDocument = { to: string; subject: string };

/**
 * Render, attach, send, and log it against the record.
 */
export async function emailDocumentToClient(params: {
  companyId: string;
  leadDocumentId: string;
}): Promise<SentDocument> {
  const doc = await prisma.crmLeadDocument.findFirst({
    where: { id: params.leadDocumentId, companyId: params.companyId },
    select: {
      id: true,
      type: true,
      amount: true,
      currency: true,
      quotationId: true,
      invoiceId: true,
      receiptId: true,
      renderTemplateId: true,
      quotation: { select: { quotationNumber: true, customer: { select: { email: true } } } },
      invoice: { select: { invoiceNumber: true, customer: { select: { email: true } } } },
      receipt: { select: { receiptNumber: true } },
      lead: { select: { id: true, contactEmail: true, client: { select: { email: true } } } },
      deal: { select: { id: true, client: { select: { email: true } } } },
    },
  });
  if (!doc) throw new Error("Document not found");

  const recordId = doc.quotationId ?? doc.invoiceId ?? doc.receiptId;
  if (!recordId) throw new Error("Document has no underlying record");

  const to = resolveRecipient({
    customerEmail: doc.quotation?.customer?.email ?? doc.invoice?.customer?.email,
    clientEmail: doc.deal?.client?.email ?? doc.lead?.client?.email,
    contactEmail: doc.lead?.contactEmail,
  });
  if (!to) throw new NoRecipientError();

  const branding = await getDocumentBranding(params.companyId);

  const rendered = await renderDocumentSync(params.companyId, {
    target: "RECORD",
    sourceKey: SOURCE_KEYS[doc.type],
    recordId,
    format: "pdf",
    mode: "SYNC",
    templateId: doc.renderTemplateId ?? undefined,
  });

  // The link is minted before the send, and never rotated by it: a rep who
  // emails the same quotation twice must not invalidate the copy the customer
  // is already looking at.
  const { token } = await prisma.$transaction((tx) =>
    getOrCreateApproval(tx, { companyId: params.companyId, leadDocumentId: doc.id }),
  );

  const number =
    doc.quotation?.quotationNumber ??
    doc.invoice?.invoiceNumber ??
    doc.receipt?.receiptNumber ??
    "";

  const { subject, text, html } = buildDocumentEmail({
    kind: doc.type,
    number,
    companyName: branding.displayName,
    amount: money(doc.currency, doc.amount),
    // Absolute, from the configured site URL: mail is read long after the
    // request that sent it, on a device that never saw it.
    approvalUrl: absoluteUrl(`/a/${token}`),
  });

  await sendEmail({
    to,
    subject,
    text,
    html,
    sender: { name: branding.displayName, replyTo: branding.email },
    attachments: [{ filename: rendered.fileName, content: rendered.data }],
  });

  await recordSendActivity({
    companyId: params.companyId,
    documentId: doc.id,
    leadId: doc.lead?.id ?? null,
    dealId: doc.deal?.id ?? null,
    to,
    subject,
  });

  return { to, subject };
}

async function recordSendActivity(input: {
  companyId: string;
  documentId: string;
  leadId: string | null;
  dealId: string | null;
  to: string;
  subject: string;
}) {
  const data: Prisma.CrmActivityUncheckedCreateInput = {
    companyId: input.companyId,
    type: "DOCUMENT_SENT",
    leadId: input.leadId ?? undefined,
    dealId: input.dealId ?? undefined,
    subject: `Emailed to ${input.to}`,
    body: input.subject,
    metadata: { leadDocumentId: input.documentId },
  };
  await prisma.crmActivity.create({ data });
}
