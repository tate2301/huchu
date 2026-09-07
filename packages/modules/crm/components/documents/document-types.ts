import type { CanonicalUiStatus } from "@corelithzw/ui/lib/ui/status-map";

export type CrmDocumentKind = "QUOTATION" | "INVOICE" | "RECEIPT";

export type LeadDocument = {
  id: string;
  type: CrmDocumentKind;
  quotationId: string | null;
  invoiceId: string | null;
  receiptId: string | null;
  amount: number;
  currency: string;
  /** Raised as money down against the quote. Reported apart in billing. */
  isDeposit?: boolean;
  /** Quote revisions: v1 is the first thing sent, each later one supersedes it. */
  version: number;
  supersedesId: string | null;
  revisionNote: string | null;
  createdAt: string;
  approval: {
    token: string;
    status: string;
    respondedAt: string | null;
    /** What the customer wrote when they accepted or declined. */
    responseNote?: string | null;
    responderName?: string | null;
    /** Whether they have opened it at all — the answer to "have they seen it?". */
    firstViewedAt?: string | null;
  } | null;
  quotation: {
    id: string;
    quotationNumber: string;
    status: string;
    validUntil: string | null;
    total: number;
  } | null;
  invoice: {
    id: string;
    invoiceNumber: string;
    status: string;
    dueDate: string | null;
    total: number;
    amountPaid: number;
    creditTotal: number;
    writeOffTotal: number;
  } | null;
  receipt: {
    id: string;
    receiptNumber: string;
    receivedAt: string;
    amount: number;
    method: string;
  } | null;
};

export const DOCUMENT_KIND_LABELS: Record<CrmDocumentKind, string> = {
  QUOTATION: "Quotation",
  INVOICE: "Invoice",
  RECEIPT: "Receipt",
};

/** The export pipeline's source key for each document kind. */
export const DOCUMENT_SOURCE_KEYS: Record<CrmDocumentKind, string> = {
  QUOTATION: "accounting.sales.quotation",
  INVOICE: "accounting.sales.invoice",
  RECEIPT: "accounting.sales.receipt",
};

/** What still has to be collected on an invoice, after credits and write-offs. */
export function invoiceOutstanding(invoice: NonNullable<LeadDocument["invoice"]>): number {
  const balance =
    invoice.total - invoice.amountPaid - (invoice.creditTotal ?? 0) - (invoice.writeOffTotal ?? 0);
  return Math.max(0, Math.round(balance * 100) / 100);
}

export function documentNumber(doc: LeadDocument): string {
  return (
    doc.quotation?.quotationNumber ??
    doc.invoice?.invoiceNumber ??
    doc.receipt?.receiptNumber ??
    "—"
  );
}

export function documentRecordId(doc: LeadDocument): string | null {
  return doc.quotationId ?? doc.invoiceId ?? doc.receiptId;
}

/**
 * The status a user cares about, which is not always the stored one: an
 * approved quotation reads "Accepted", and a part-paid invoice reads
 * "Part paid" rather than the blunt "Issued".
 */
export function documentStatus(doc: LeadDocument): { label: string; status: CanonicalUiStatus } {
  if (doc.type === "QUOTATION") {
    if (doc.approval?.status === "APPROVED") return { label: "Accepted", status: "passing" };
    if (doc.approval?.status === "DECLINED") return { label: "Declined", status: "failing" };
    const status = doc.quotation?.status ?? "DRAFT";
    if (status === "ACCEPTED") return { label: "Accepted", status: "passing" };
    if (status === "EXPIRED") return { label: "Expired", status: "inactive" };
    if (status === "VOIDED") return { label: "Voided", status: "inactive" };
    if (doc.approval?.status === "PENDING") return { label: "Awaiting client", status: "in_review" };
    if (status === "SENT") return { label: "Sent", status: "in_review" };
    return { label: "Draft", status: "pending" };
  }

  if (doc.type === "INVOICE") {
    const invoice = doc.invoice;
    if (!invoice) return { label: "Issued", status: "in_progress" };
    if (invoice.status === "PAID") return { label: "Paid", status: "passing" };
    if (invoice.status === "VOIDED") return { label: "Voided", status: "inactive" };
    if (invoice.amountPaid > 0) return { label: "Part paid", status: "in_progress" };
    if (invoice.dueDate && new Date(invoice.dueDate).getTime() < Date.now()) {
      return { label: "Overdue", status: "failing" };
    }
    return { label: "Issued", status: "in_review" };
  }

  return { label: "Received", status: "passing" };
}

export function formatMoney(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
