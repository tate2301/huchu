import type { Prisma, PrismaClient } from "@prisma/client";

import { fiscalise, type FiscaliseResult } from "./fiscalise";
import { postMoney, type PostMoneyResult } from "./post-money";

/**
 * What issuing a sales invoice does to the books (books-final §4.3), the same
 * whoever issues it — Books, Accounting, the CRM or a job's invoice: the
 * journal `SALES_INVOICE` (Dr receivable, Cr sales, Cr VAT output) with its
 * receivable sub-ledger line in the same write, on the cost centre the work
 * belongs to; then, once the invoice is committed, the fiscal device where the
 * workspace fiscalises. A posting that cannot go through waits for the drain
 * and a fiscal failure is the fiscal register's to retry: neither undoes the
 * invoice.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export type InvoiceToPost = {
  id: string;
  invoiceNumber: string | null;
  invoiceDate: Date;
  total: number;
  subTotal: number;
  taxTotal: number;
  currency?: string | null;
  /** The posting key when it is not the invoice's own id: a CRM edit's revision (`salesInvoicePostingKey`). */
  postingKey?: string;
};

export async function postInvoice(
  db: Db,
  input: { companyId: string; invoice: InvoiceToPost; actor: { userId: string; role?: string | null }; costCenterId?: string | null; description?: string; date?: Date },
): Promise<PostMoneyResult> {
  const { invoice } = input;
  return postMoney(db, {
    companyId: input.companyId,
    sourceType: "SALES_INVOICE",
    sourceId: invoice.postingKey ?? invoice.id,
    date: input.date ?? invoice.invoiceDate,
    description: input.description ?? `Sales invoice ${invoice.invoiceNumber ?? ""}`.trim(),
    amount: invoice.total,
    netAmount: invoice.subTotal,
    taxAmount: invoice.taxTotal,
    grossAmount: invoice.total,
    currency: invoice.currency ?? null,
    costCenterId: input.costCenterId ?? null,
    actor: input.actor,
  });
}

/** After the invoice is committed: the fiscal device, where the workspace fiscalises. Never throws. */
export async function fiscaliseIssuedInvoice(companyId: string, invoiceId: string, actorId: string): Promise<FiscaliseResult> {
  try {
    return await fiscalise(companyId, { kind: "invoice", invoiceId }, actorId);
  } catch (error) {
    console.error("[Books] Fiscalisation of an issued invoice failed:", error);
    return { sent: false, reason: error instanceof Error ? error.message : "Fiscalisation failed" };
  }
}
