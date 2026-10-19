import { issueFiscalCreditNote, issueFiscalReceipt } from "@/lib/accounting/fiscalisation";
import { hasFeature } from "@/lib/platform/features";

/**
 * `fiscalise`: send a document to the fiscal device (books-final §1.1), where
 * the workspace fiscalises: a sales invoice, or a credit note against a
 * fiscalised invoice, citing it (P3). A debit note here is a supplier's,
 * raised against their bill: the supplier fiscalises it, not us, so it is
 * reported as not sent rather than silently skipped.
 */

export type FiscalDocument =
  | { kind: "invoice"; invoiceId: string }
  | { kind: "credit-note"; creditNoteId: string }
  | { kind: "debit-note"; debitNoteId: string };

export type FiscaliseResult = { sent: boolean; reason?: string; status?: string };

export async function fiscalise(companyId: string, document: FiscalDocument, actorId: string): Promise<FiscaliseResult> {
  if (!(await hasFeature(companyId, "accounting.zimra.fiscalisation"))) return { sent: false, reason: "This workspace does not fiscalise." };
  if (document.kind === "debit-note") return { sent: false, reason: "A debit note on a supplier's bill is theirs to fiscalise." };
  const result = document.kind === "invoice" ? await issueFiscalReceipt(companyId, document.invoiceId, actorId) : await issueFiscalCreditNote(companyId, document.creditNoteId);
  return { sent: result.status !== "FAILED", status: result.status, reason: result.error };
}
