/**
 * Credit or write off, from an invoice (books-final §5.1): the checks and the
 * body each sends. Pure, so the drawer imports it and a test walks it.
 */

export type CreditKind = "credit" | "write-off";

type Target = { id: string; number: string; currency: string; creditLeft: number; balance: number; taxRate: number };

const cents = (n: number) => Math.round(n * 100) / 100;

/** What is wrong, by field. Empty when it can go. */
export function creditNoteErrors(kind: CreditKind, invoice: Target | null, amount: string, reason: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!invoice) errors.invoice = "Choose the invoice it is against.";
  const value = Number(amount.replace(/,/g, ""));
  const limit = invoice ? (kind === "credit" ? invoice.creditLeft : invoice.balance) : Number.POSITIVE_INFINITY;
  if (!amount.trim() || !Number.isFinite(value) || value <= 0) errors.amount = "An amount more than nothing.";
  else if (value > limit + 0.005) errors.amount = kind === "credit" ? "More than is left to credit on it." : "More than is still owed on it.";
  if (reason.trim().length < 3) errors.reason = "Say why, in a few words.";
  return errors;
}

/**
 * The credit note's body: one line for the amount, its VAT worked back out of
 * it at the invoice's rate, issued now (numbered, posted, and fiscalised where
 * the invoice was).
 */
export function creditNoteBody(invoice: Target, amount: string, reason: string, today = new Date()) {
  const gross = cents(Number(amount.replace(/,/g, "")));
  const net = cents(gross / (1 + invoice.taxRate / 100));
  return {
    invoiceId: invoice.id,
    noteDate: today.toISOString().slice(0, 10),
    currency: invoice.currency,
    reason: reason.trim(),
    issueNow: true,
    lines: [{ description: `Credit on ${invoice.number}: ${reason.trim()}`.slice(0, 300), quantity: 1, unitPrice: net, taxRate: invoice.taxRate }],
  };
}
