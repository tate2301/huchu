import {
  invoiceOutstanding,
  type LeadDocument,
} from "@/components/crm/documents/document-types";

/**
 * Where the money on a deal actually stands.
 *
 * The documents were all there — quotes, invoices, receipts — and the answer
 * to "how much of this have we been paid?" was to open each invoice and do the
 * arithmetic. That is the question a deal exists to answer, so it is computed
 * once, here, and shown on the record.
 *
 * Deposits are called out separately because they are the one payment whose
 * meaning is not "some of the bill": a deposit is the reason the work started,
 * and a deal with a deposit taken is in a different position from one with the
 * same amount collected against a completed job.
 */

export type BillingSummary = {
  currency: string;
  /** The most recent quotation's value — what was offered. */
  quoted: number;
  /** Everything invoiced, voided invoices excluded. */
  invoiced: number;
  /** Everything collected against those invoices. */
  paid: number;
  /** What is still to collect. */
  outstanding: number;
  /** Collected before any invoice existed — money down. */
  deposits: number;
  /** How many invoices are not fully settled. */
  openInvoices: number;
  /** Whether every invoice raised is settled and at least one exists. */
  settled: boolean;
};

/** Payments recorded against an invoice a caller can no longer collect on. */
function isLive(document: LeadDocument): boolean {
  if (document.type !== "INVOICE") return true;
  return document.invoice?.status !== "VOIDED";
}

export function summariseBilling(
  documents: LeadDocument[],
  fallbackCurrency: string,
): BillingSummary {
  const invoices = documents.filter((doc) => doc.type === "INVOICE" && isLive(doc));
  const quotes = documents.filter((doc) => doc.type === "QUOTATION");
  const receipts = documents.filter((doc) => doc.type === "RECEIPT");

  const invoiced = invoices.reduce((sum, doc) => sum + (doc.invoice?.total ?? doc.amount), 0);
  const paid = invoices.reduce((sum, doc) => sum + (doc.invoice?.amountPaid ?? 0), 0);
  const outstanding = invoices.reduce(
    (sum, doc) => sum + (doc.invoice ? invoiceOutstanding(doc.invoice) : 0),
    0,
  );

  // Two ways money counts as a deposit. The flagged way: the "Request a
  // deposit" flow raises an invoice that knows it is one, and whatever has
  // been collected against it is deposit money — the flow raises its invoice
  // first, so no date heuristic can see it. The legacy way: a receipt dated
  // before any invoice existed was money taken up front, and receipts with no
  // invoice at all are exactly "deposit taken, billed later".
  const depositInvoicePaid = invoices
    .filter((doc) => doc.isDeposit)
    .reduce((sum, doc) => sum + (doc.invoice?.amountPaid ?? 0), 0);

  const nonDepositInvoiceTimes = invoices
    .filter((doc) => !doc.isDeposit)
    .map((doc) => new Date(doc.createdAt).getTime())
    .filter((time) => !Number.isNaN(time))
    .sort((a, b) => a - b);
  const firstInvoiceAt = nonDepositInvoiceTimes[0];

  const preInvoiceReceipts = receipts
    .filter((doc) => {
      if (firstInvoiceAt === undefined) return true;
      const at = new Date(doc.createdAt).getTime();
      return !Number.isNaN(at) && at < firstInvoiceAt;
    })
    .reduce((sum, doc) => sum + (doc.receipt?.amount ?? doc.amount), 0);

  // A receipt against the deposit invoice is also dated before the balance
  // invoice, so counting both would report the same money twice — the flagged
  // figure wins and the heuristic only adds what predates ALL invoices.
  const deposits = depositInvoicePaid > 0 ? depositInvoicePaid : preInvoiceReceipts;

  // The latest quote supersedes the ones before it — a deal that was requoted
  // twice was not offered three times over.
  const latestQuote = quotes
    .slice()
    .sort((a, b) => b.version - a.version || b.createdAt.localeCompare(a.createdAt))[0];

  const openInvoices = invoices.filter(
    (doc) => doc.invoice && invoiceOutstanding(doc.invoice) > 0,
  ).length;

  return {
    currency: documents[0]?.currency ?? fallbackCurrency,
    quoted: round(latestQuote?.quotation?.total ?? latestQuote?.amount ?? 0),
    invoiced: round(invoiced),
    paid: round(paid),
    outstanding: round(outstanding),
    deposits: round(deposits),
    openInvoices,
    settled: invoices.length > 0 && openInvoices === 0,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
