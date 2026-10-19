import type { Prisma, PrismaClient } from "@prisma/client";

import { resolveBaseCurrency, UnknownExchangeRateError } from "@/lib/money";

import { rateFor } from "./rate";

/**
 * What a receipt freezes when it is recorded (D2, books-final §4.5): whose
 * money it is, the currency it came in, the rate on its day and its amount in
 * the base currency. The customer is the invoice's when it pays one, else the
 * one named; the currency is the one it came in when given, else the
 * invoice's, else the money account's, else the base currency. With no rate on the day the rate and base amount stay
 * empty: a receipt is never refused for want of a rate, and a rate is never
 * invented.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export type ReceiptFacts = {
  customerId: string | null;
  currency: string;
  exchangeRate: number | null;
  baseAmount: number | null;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

export class ReceiptRefused extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 400,
  ) {
    super(message);
    this.name = "ReceiptRefused";
  }
}

export async function receiptFacts(
  db: Db,
  input: { companyId: string; invoiceId?: string | null; customerId?: string | null; bankAccountId?: string | null; currency?: string | null; date: Date; amount: number },
): Promise<ReceiptFacts> {
  const invoice = input.invoiceId
    ? await db.salesInvoice.findFirst({ where: { id: input.invoiceId, companyId: input.companyId }, select: { customerId: true, currency: true } })
    : null;
  if (input.invoiceId && !invoice) throw new ReceiptRefused("That invoice is not here any more.", 404);
  if (invoice && input.customerId && input.customerId !== invoice.customerId) {
    throw new ReceiptRefused("That invoice belongs to another customer.");
  }
  let customerId = invoice?.customerId ?? null;
  if (!customerId && input.customerId) {
    const customer = await db.customer.findFirst({ where: { id: input.customerId, companyId: input.companyId }, select: { id: true } });
    if (!customer) throw new ReceiptRefused("That customer is not here any more.", 404);
    customerId = customer.id;
  }
  const bank = !input.currency && !invoice?.currency && input.bankAccountId
    ? await db.bankAccount.findFirst({ where: { id: input.bankAccountId, companyId: input.companyId }, select: { currency: true } })
    : null;
  // The currency the money came in: as given (a US dollar payment on a ZiG invoice stays US dollars,
  // books-final §5.9.3), else the invoice's, else the money account's, else the base currency.
  const currency = (input.currency ?? invoice?.currency ?? bank?.currency ?? (await resolveBaseCurrency(input.companyId))).trim().toUpperCase();
  try {
    const frozen = await rateFor(input.companyId, currency, input.date);
    return { customerId, currency, exchangeRate: frozen.rate, baseAmount: round2(input.amount / frozen.rate) };
  } catch (error) {
    if (error instanceof UnknownExchangeRateError) return { customerId, currency, exchangeRate: null, baseAmount: null };
    throw error;
  }
}

