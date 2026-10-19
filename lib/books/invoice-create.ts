import { z } from "zod";

import { recordSalesReceipt } from "@/lib/accounting/payments";
import { prisma } from "@/lib/prisma";

import { canDo, type BooksActor } from "./core";
import { createSalesInvoice, InvoiceRefused, invoiceSchema } from "./create-invoice";

/**
 * Books' own New invoice (BkInvoiceNew): the invoice through the core —
 * a draft, or issued (numbered, posted on its cost centre, fiscalised) — and,
 * when it was paid at the counter, the payment recorded against it into the
 * chosen account in the same press (books-final §5.1, cash sale). Two
 * documents, each voidable on its own.
 */
export const booksInvoiceSchema = invoiceSchema.extend({
  costCenterId: z.string().uuid().optional(),
  paidNow: z.object({ bankAccountId: z.string().uuid() }).optional(),
});

export type BooksInvoiceInput = z.infer<typeof booksInvoiceSchema>;

const METHOD: Record<string, string> = { CASH: "Cash", MOBILE: "Mobile money", BANK: "Bank transfer" };

export async function createBooksInvoice(actor: BooksActor, input: BooksInvoiceInput) {
  if (input.paidNow && !input.issueNow) throw new InvoiceRefused("A draft is not paid yet. Issue it to record the payment with it.");
  if (input.costCenterId) {
    const centre = await prisma.costCenter.findFirst({ where: { id: input.costCenterId, companyId: actor.companyId, isActive: true }, select: { id: true } });
    if (!centre) throw new InvoiceRefused("That cost centre is not here any more.");
  }
  const account = input.paidNow
    ? await prisma.bankAccount.findFirst({ where: { id: input.paidNow.bankAccountId, companyId: actor.companyId, isActive: true }, select: { id: true, kind: true } })
    : null;
  if (input.paidNow) {
    if (!account) throw new InvoiceRefused("That money account is not here any more.");
    const decision = canDo(actor, "issue", { kind: "receipt" });
    if (!decision.allowed) throw new InvoiceRefused(decision.reason);
  }
  const invoice = await createSalesInvoice({ companyId: actor.companyId, userId: actor.userId }, input, { costCenterId: input.costCenterId ?? null });
  let receipt: { id: string; receiptNumber: string } | null = null;
  if (input.paidNow && account && invoice.status === "ISSUED") {
    const paid = await recordSalesReceipt({
      companyId: actor.companyId,
      userId: actor.userId,
      role: actor.role ?? null,
      invoiceId: invoice.id,
      currency: invoice.currency,
      receivedAt: invoice.invoiceDate,
      amount: invoice.total,
      method: METHOD[account.kind] ?? "Bank transfer",
      bankAccountId: account.id,
    });
    receipt = { id: paid.id, receiptNumber: paid.receiptNumber };
  }
  return { id: invoice.id, number: invoice.invoiceNumber, status: invoice.status, total: invoice.total, currency: invoice.currency, customer: invoice.customer.name, receipt };
}
