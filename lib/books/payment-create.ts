import { z } from "zod";

import { recordSalesReceipt } from "@/lib/accounting/payments";
import { prisma } from "@/lib/prisma";

import type { BooksActor } from "./core";
import { ReceiptRefused } from "./core/receipt-facts";
import { invoiceBalance } from "./invoice-state";
import { onAccount, paymentFormErrors, type OpenInvoice } from "./payment-form";

/**
 * Books' Record a payment (BkPaymentNew), through the core. A receipt is on
 * one invoice or on account (`SalesReceipt.invoiceId`), so money put on two
 * invoices is recorded as one receipt per invoice and one for the rest on
 * account, all with the same reference, each posted with its bank transaction
 * into the chosen account (`recordSalesReceipt` → `postMoney`).
 */
export const booksPaymentSchema = z.object({
  customerId: z.string().uuid(),
  bankAccountId: z.string().uuid(),
  receivedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/),
  amount: z.number().positive(),
  reference: z.string().trim().max(200).optional(),
  allocations: z.array(z.object({ invoiceId: z.string().uuid(), amount: z.number().positive() })).max(50).default([]),
});

export type BooksPaymentInput = z.infer<typeof booksPaymentSchema>;

const METHOD: Record<string, string> = { CASH: "Cash", MOBILE: "Mobile money", BANK: "Bank transfer" };

export async function openInvoicesFor(companyId: string, customerId: string, today = new Date()): Promise<OpenInvoice[]> {
  const rows = await prisma.salesInvoice.findMany({
    where: { companyId, customerId, status: "ISSUED" },
    orderBy: [{ dueDate: "asc" }, { invoiceDate: "asc" }],
    select: { id: true, invoiceNumber: true, dueDate: true, currency: true, total: true, amountPaid: true, creditTotal: true, writeOffTotal: true },
  });
  const midnight = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return rows
    .map((row) => ({
      id: row.id,
      number: row.invoiceNumber ?? "Draft",
      due: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null,
      daysLate: row.dueDate ? Math.max(0, Math.round((midnight - row.dueDate.getTime()) / 86_400_000)) : 0,
      balance: invoiceBalance(row),
      currency: row.currency.toUpperCase(),
    }))
    .filter((row) => row.balance > 0.005);
}

export async function recordBooksPayment(actor: BooksActor, input: BooksPaymentInput) {
  const customer = await prisma.customer.findFirst({ where: { id: input.customerId, companyId: actor.companyId }, select: { id: true, name: true } });
  if (!customer) throw new ReceiptRefused("That customer is not here any more.", 404);
  const account = await prisma.bankAccount.findFirst({ where: { id: input.bankAccountId, companyId: actor.companyId, isActive: true }, select: { id: true, kind: true, currency: true } });
  if (!account) throw new ReceiptRefused("That money account is not here any more.", 404);
  const currency = input.currency.toUpperCase();
  if (account.currency.toUpperCase() !== currency) throw new ReceiptRefused(`That account holds ${account.currency}; this payment is in ${currency}.`);
  const invoices = await openInvoicesFor(actor.companyId, customer.id);
  const errors = paymentFormErrors(
    { customerId: customer.id, bankAccountId: account.id, receivedAt: input.receivedAt, currency, amount: String(input.amount), reference: input.reference ?? "", allocations: input.allocations },
    invoices,
  );
  const first = Object.values(errors)[0];
  if (first) throw new ReceiptRefused(first);

  const common = {
    companyId: actor.companyId,
    userId: actor.userId,
    role: actor.role ?? null,
    customerId: customer.id,
    currency,
    receivedAt: new Date(`${input.receivedAt}T00:00:00.000Z`),
    method: METHOD[account.kind] ?? "Bank transfer",
    reference: input.reference || undefined,
    bankAccountId: account.id,
  };
  const recorded: Array<{ id: string; number: string; invoiceId: string | null; amount: number }> = [];
  for (const row of input.allocations) {
    const receipt = await recordSalesReceipt({ ...common, invoiceId: row.invoiceId, amount: row.amount });
    recorded.push({ id: receipt.id, number: receipt.receiptNumber, invoiceId: row.invoiceId, amount: row.amount });
  }
  const rest = onAccount(input.amount, input.allocations);
  if (rest > 0.005) {
    const receipt = await recordSalesReceipt({ ...common, amount: rest });
    recorded.push({ id: receipt.id, number: receipt.receiptNumber, invoiceId: null, amount: rest });
  }
  return { customer: customer.name, currency, receipts: recorded, onAccount: rest > 0.005 ? rest : 0 };
}
