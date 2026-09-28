/**
 * When a quote or an invoice can still be edited, and what to say when not.
 *
 * Shared by the server, which enforces it, and the document list, which uses
 * it to disable "Edit" with the reason on it rather than hide it — a rep who
 * saw the button yesterday should be told why it is greyed out today, and
 * what to do instead.
 *
 * ── The client's answer ────────────────────────────────────────────────────
 *
 * A document sent to the client is changed in place until they answer: the
 * same number and the same approval link, which shows the new figures the
 * next time it is opened. Once they have approved or declined, what they
 * answered is on record, and it is not rewritten underneath them.
 *
 * ── A quote ────────────────────────────────────────────────────────────────
 *
 * Edited in place while nobody has answered it. A declined quote is revised
 * instead: the next version, under a new number, which the same link asks
 * about afresh — the declined figures stay on record as what was declined.
 * An accepted quote is an agreement, and a change is a new quote; a void or
 * expired one is finished.
 *
 * ── An invoice ─────────────────────────────────────────────────────────────
 *
 * An invoice keeps its number when edited: its journal is reversed and the
 * new figures are posted. That is only honest while nothing else hangs off
 * the old figures. Money received, a credit note or a write-off is booked
 * against the total as it stood, and a fiscal receipt has told ZIMRA what it
 * was; after any of those, or once the client has answered it, the
 * correction is a credit note in Accounting.
 */

export type QuoteEditState = {
  /** `SalesQuotation.status`. */
  status: string;
  /** `CrmDocumentApproval.status`, when it was sent for approval. */
  approvalStatus?: string | null;
};

/** The quote's own end states, which no edit or revision gets past. */
function quoteClosed(status: string): string | null {
  switch (status) {
    case "ACCEPTED":
      return "Accepted — raise a new quote for any change";
    case "VOIDED":
      return "Voided — it has been replaced or withdrawn";
    case "EXPIRED":
      return "Expired — raise a new quote";
    default:
      return null;
  }
}

/** Why a quote can no longer be edited in place, or null when it can. */
export function quoteEditLock(quote: QuoteEditState): string | null {
  const closed = quoteClosed(quote.status);
  if (closed) return closed;
  if (quote.approvalStatus === "APPROVED") return "Approved by the client — raise a new quote for any change";
  if (quote.approvalStatus === "DECLINED") return "Declined by the client — revise it as a new version";
  return null;
}

/**
 * Why a quote cannot be revised as its next version, or null when it can:
 * only once the client has declined it. Until they answer it is edited in
 * place, and there is nothing to keep a record of.
 */
export function quoteReviseLock(quote: QuoteEditState): string | null {
  const closed = quoteClosed(quote.status);
  if (closed) return closed;
  if (quote.approvalStatus !== "DECLINED") return "Not declined — edit it instead";
  return null;
}

export type InvoiceEditState = {
  /** `SalesInvoice.status`. */
  status: string;
  amountPaid: number;
  creditTotal?: number | null;
  writeOffTotal?: number | null;
  /** Receipts recorded against it, whatever their amount. */
  receiptCount?: number;
  /** Credit notes that are not void. A draft one is still a claim on the total. */
  creditNoteCount?: number;
  /** Write-offs that are not void. */
  writeOffCount?: number;
  /**
   * Sent to the fiscal device. `fiscalStatus` alone cannot say this: it
   * defaults to PENDING on every invoice ever raised, fiscalised or not, so
   * the question is whether a fiscal receipt exists.
   */
  fiscalised?: boolean;
  /** `CrmDocumentApproval.status`, when it was sent for approval. */
  approvalStatus?: string | null;
};

/** Why an invoice can no longer be edited, or null when it can. */
export function invoiceEditLock(invoice: InvoiceEditState): string | null {
  if (invoice.status === "VOIDED") return "Voided — raise a new invoice instead";
  if (invoice.status === "PAID") return "Paid — issue a credit note in Accounting";
  if (invoice.fiscalised) return "Sent to ZIMRA — issue a credit note in Accounting";
  if (invoice.amountPaid > 0 || (invoice.receiptCount ?? 0) > 0) {
    return "Part paid — issue a credit note in Accounting";
  }
  if ((invoice.creditTotal ?? 0) > 0 || (invoice.creditNoteCount ?? 0) > 0) {
    return "Credited — adjust it with a credit note in Accounting";
  }
  if ((invoice.writeOffTotal ?? 0) > 0 || (invoice.writeOffCount ?? 0) > 0) {
    return "Written off — adjust it in Accounting";
  }
  if (invoice.approvalStatus === "APPROVED") {
    return "Approved by the client — adjust it with a credit note in Accounting";
  }
  if (invoice.approvalStatus === "DECLINED") {
    return "Declined by the client — credit it in Accounting and raise a new one";
  }
  if (invoice.status !== "ISSUED") return "Not issued — finish it in Accounting";
  return null;
}
