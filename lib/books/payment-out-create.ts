import { z } from "zod";

import { draftSupplierPayment, payNowRefusal, submitSupplierPayment } from "./core/supplier-payments";
import { recordPurchasePayment, ReceiptRefused } from "@/lib/accounting/payments";
import { prisma } from "@/lib/prisma";

import type { BooksActor } from "./core";
import type { OpenInvoice } from "./payment-form";

/**
 * Books' Pay a supplier (BkPaymentOutNew): one payment per bill
 * (`PurchasePayment.billId`). The form saves drafts and sends them for
 * approval (D5, `draftPayments`): nothing moves until each is approved and
 * paid. `paySupplier` pays at once (under the limit, or the owner), as
 * Accounting's payments did. The ITF263 check, withholding and IMTT come with P3.
 */
export const supplierPaymentSchema = z.object({
  vendorId: z.string().uuid(),
  bankAccountId: z.string().uuid(),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reference: z.string().trim().max(200).optional(),
  bills: z.array(z.object({ billId: z.string().uuid(), amount: z.number().positive() })).min(1).max(50),
});

export type SupplierPaymentInput = z.infer<typeof supplierPaymentSchema>;

const METHOD: Record<string, string> = { CASH: "Cash", MOBILE: "Mobile money", BANK: "Bank transfer" };

/** A supplier's bills with money still owing, oldest first, in the shape the form allocates over. */
export async function openBillsFor(companyId: string, vendorId: string, today = new Date()): Promise<Array<OpenInvoice & { note: string | null; fti: string | null }>> {
  const rows = await prisma.purchaseBill.findMany({
    where: { companyId, vendorId, status: "RECEIVED" },
    orderBy: [{ dueDate: "asc" }, { billDate: "asc" }],
    select: { id: true, billNumber: true, dueDate: true, currency: true, total: true, amountPaid: true, debitNoteTotal: true, writeOffTotal: true, notes: true, supplierFtiNumber: true },
  });
  const midnight = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return rows
    .map((row) => ({
      id: row.id,
      number: row.billNumber ?? "Bill",
      due: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null,
      daysLate: row.dueDate ? Math.max(0, Math.round((midnight - row.dueDate.getTime()) / 86_400_000)) : 0,
      balance: Math.round(Math.max(0, row.total - row.amountPaid - row.debitNoteTotal - row.writeOffTotal) * 100) / 100,
      currency: row.currency.toUpperCase(),
      note: row.notes,
      fti: row.supplierFtiNumber,
    }))
    .filter((row) => row.balance > 0.005);
}

/** What is wrong with the payment, in a sentence, or null when it can go. */
export function supplierPaymentProblem(input: SupplierPaymentInput, bills: OpenInvoice[], accountCurrency: string): string | null {
  for (const row of input.bills) {
    const bill = bills.find((candidate) => candidate.id === row.billId);
    if (!bill) return "One of the bills is not this supplier's open bill any more.";
    if (row.amount > bill.balance + 0.005) return `${bill.number} owes less than that.`;
    if (bill.currency !== accountCurrency.toUpperCase()) return `${bill.number} is in ${bill.currency}; that account holds ${accountCurrency}.`;
  }
  return null;
}

export async function paySupplier(actor: BooksActor, input: SupplierPaymentInput) {
  const vendor = await prisma.vendor.findFirst({ where: { id: input.vendorId, companyId: actor.companyId }, select: { id: true, name: true } });
  if (!vendor) throw new ReceiptRefused("That supplier is not here any more.", 404);
  const account = await prisma.bankAccount.findFirst({ where: { id: input.bankAccountId, companyId: actor.companyId, isActive: true }, select: { id: true, kind: true, currency: true } });
  if (!account) throw new ReceiptRefused("That money account is not here any more.", 404);
  const problem = supplierPaymentProblem(input, await openBillsFor(actor.companyId, vendor.id), account.currency);
  if (problem) throw new ReceiptRefused(problem);
  const overLimit = await payNowRefusal(actor, input.bills.reduce((sum, row) => sum + row.amount, 0));
  if (overLimit) throw new ReceiptRefused(overLimit, 409);
  const paid: Array<{ number: string; billId: string; amount: number }> = [];
  for (const row of input.bills) {
    const payment = await recordPurchasePayment({
      companyId: actor.companyId,
      userId: actor.userId,
      role: actor.role ?? null,
      billId: row.billId,
      paidAt: new Date(`${input.paidAt}T00:00:00.000Z`),
      amount: row.amount,
      method: METHOD[account.kind] ?? "Bank transfer",
      reference: input.reference || undefined,
      bankAccountId: account.id,
    });
    paid.push({ number: payment.paymentNumber ?? "", billId: row.billId, amount: row.amount });
  }
  return { supplier: vendor.name, payments: paid, total: Math.round(input.bills.reduce((sum, row) => sum + row.amount, 0) * 100) / 100 };
}

/**
 * The form's Save draft and Send for approval (D5): a draft per bill through
 * the core, each sent for approval when `send` is set (over the limit it waits
 * for the owner; under it, it is approved). Checked first as a whole: the
 * bills are this supplier's and owing, in the account's currency.
 */
export async function draftPayments(actor: BooksActor, input: SupplierPaymentInput, send: boolean) {
  const vendor = await prisma.vendor.findFirst({ where: { id: input.vendorId, companyId: actor.companyId }, select: { id: true, name: true } });
  if (!vendor) throw new ReceiptRefused("That supplier is not here any more.", 404);
  const account = await prisma.bankAccount.findFirst({ where: { id: input.bankAccountId, companyId: actor.companyId, isActive: true }, select: { id: true, currency: true } });
  if (!account) throw new ReceiptRefused("That money account is not here any more.", 404);
  const problem = supplierPaymentProblem(input, await openBillsFor(actor.companyId, vendor.id), account.currency);
  if (problem) throw new ReceiptRefused(problem);
  const made: Array<{ id: string; billId: string; status: string; amount: number }> = [];
  for (const row of input.bills) {
    const draft = await draftSupplierPayment(actor, { vendorId: vendor.id, billId: row.billId, bankAccountId: account.id, amount: row.amount, paidAt: input.paidAt, reference: input.reference });
    const sent = send ? await submitSupplierPayment(actor, draft.id) : draft;
    made.push({ id: sent.id, billId: row.billId, status: sent.status, amount: row.amount });
  }
  return { supplier: vendor.name, payments: made, total: Math.round(input.bills.reduce((sum, row) => sum + row.amount, 0) * 100) / 100, waiting: made.some((row) => row.status === "TO_APPROVE") };
}
