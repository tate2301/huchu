/**
 * Books → Sales → Record a payment (design/core-modules/boards/view/BkPaymentNew.html):
 * the allocation and its checks, the same in the browser and on the server.
 * The customer is always named (D2); what is not put on an invoice stays on
 * their account. Pure.
 */

export type OpenInvoice = { id: string; number: string; due: string | null; daysLate: number; balance: number; currency: string };

export type Allocation = { invoiceId: string; amount: number };

const cents = (n: number) => Math.round(n * 100) / 100;

export function readAmount(text: string): number {
  const value = Number(text.replace(/,/g, "").trim());
  return Number.isFinite(value) ? cents(value) : Number.NaN;
}

/** Oldest first: each invoice takes what it owes until the money runs out; the rest is on account. */
export function allocateOldestFirst(amount: number, invoices: OpenInvoice[]): Allocation[] {
  let left = cents(amount);
  const out: Allocation[] = [];
  for (const invoice of [...invoices].sort((a, b) => b.daysLate - a.daysLate || (a.due ?? "").localeCompare(b.due ?? ""))) {
    if (left <= 0) break;
    const take = cents(Math.min(left, invoice.balance));
    if (take > 0) out.push({ invoiceId: invoice.id, amount: take });
    left = cents(left - take);
  }
  return out;
}

export function onAccount(amount: number, allocations: Allocation[]): number {
  return cents(amount - allocations.reduce((sum, row) => sum + row.amount, 0));
}

export type PaymentForm = {
  customerId: string;
  bankAccountId: string;
  receivedAt: string;
  currency: string;
  amount: string;
  reference: string;
  allocations: Allocation[];
};

/** What is wrong, by field. Empty when it can go. */
export function paymentFormErrors(form: PaymentForm, invoices: OpenInvoice[]): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.customerId) errors.customerId = "Say who paid: every payment names its customer.";
  if (!form.bankAccountId) errors.bankAccountId = "Say which account it went into.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.receivedAt)) errors.receivedAt = "The day it came in.";
  const amount = readAmount(form.amount);
  if (!Number.isFinite(amount) || amount <= 0) errors.amount = "An amount more than nothing.";
  let put = 0;
  for (const row of form.allocations) {
    const invoice = invoices.find((candidate) => candidate.id === row.invoiceId);
    if (!invoice) {
      errors.allocations = "One of the invoices is not this customer's open invoice any more.";
      continue;
    }
    if (!(row.amount > 0)) errors[`allocation.${row.invoiceId}`] = "More than nothing, or untick it.";
    else if (row.amount > invoice.balance + 0.005) errors[`allocation.${row.invoiceId}`] = `${invoice.number} owes less than that.`;
    if (invoice.currency !== form.currency) errors.allocations = `${invoice.number} is in ${invoice.currency}; this payment is in ${form.currency}.`;
    put += row.amount;
  }
  if (Number.isFinite(amount) && put > amount + 0.005) errors.allocations = "More is put on invoices than was paid.";
  return errors;
}
