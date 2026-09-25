/**
 * When a quote or an invoice can still be edited, and what to say when not.
 *
 * Shared by the server, which enforces it, and the document list, which uses
 * it to disable "Edit" with the reason on it rather than hide it — a rep who
 * saw the button yesterday should be told why it is greyed out today, and
 * what to do instead.
 *
 * ── A quote ────────────────────────────────────────────────────────────────
 *
 * Editing a quote issues a new version and voids the old one; the client's
 * approval link moves to the new version. So it is open until the quote has
 * been accepted — at which point it is an agreement, and a change is a new
 * quote — or is already void or expired.
 *
 * ── An invoice ─────────────────────────────────────────────────────────────
 *
 * An invoice keeps its number when edited: its journal is reversed and the
 * new figures are posted. That is only honest while nothing else hangs off
 * the old figures. Money received, a credit note or a write-off is booked
 * against the total as it stood, and a fiscal receipt has told ZIMRA what it
 * was; after any of those, the correction is a credit note in Accounting.
 */

export type QuoteEditState = {
  /** `SalesQuotation.status`. */
  status: string;
};

/** Why a quote can no longer be edited, or null when it can. */
export function quoteEditLock(quote: QuoteEditState): string | null {
  switch (quote.status) {
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
  if (invoice.status !== "ISSUED") return "Not issued — finish it in Accounting";
  return null;
}
