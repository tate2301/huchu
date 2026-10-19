import { issueFiscalReceipt } from "@/lib/accounting/fiscalisation";
import { hasFeature } from "@/lib/platform/features";

/**
 * `fiscalise`: send a document to the fiscal device (books-final §1.1), where
 * the workspace fiscalises. It wraps today's issuer, which knows sales
 * invoices; credit and debit notes get theirs in P3, and until then they are
 * reported as not sent rather than silently skipped.
 */

export type FiscalDocument =
  | { kind: "invoice"; invoiceId: string }
  | { kind: "credit-note"; creditNoteId: string }
  | { kind: "debit-note"; debitNoteId: string };

export type FiscaliseResult = { sent: boolean; reason?: string; status?: string };

export async function fiscalise(companyId: string, document: FiscalDocument, actorId: string): Promise<FiscaliseResult> {
  if (!(await hasFeature(companyId, "accounting.zimra.fiscalisation"))) return { sent: false, reason: "This workspace does not fiscalise." };
  if (document.kind !== "invoice") return { sent: false, reason: "Credit and debit notes are not sent to the fiscal device yet." };
  const result = await issueFiscalReceipt(companyId, document.invoiceId, actorId);
  return { sent: result.status !== "FAILED", status: result.status, reason: result.error };
}
