import { resolveBaseCurrency } from "@/lib/money";
import { prisma } from "@/lib/prisma";

import { freezeRate, realisedAdjustments, settle, type Frozen } from "./currency";
import type { MoneyEvent } from "./post-money";
import { quoteWithholding, type WithholdingQuote } from "./withholding";

/**
 * What paying a supplier posts (books-final §4.10, §5.9.3, D17): the whole
 * amount off payables; the supplier paid that less any tax withheld (30%
 * without a valid ITF263 over the threshold, a third of the VAT where we are
 * an agent), which is owed to ZIMRA; and the realised exchange difference
 * when the bill was recorded at another rate. A payment is in its bill's
 * currency (else its money account's).
 */

export type SupplierPaymentFacts = {
  currency: string;
  frozen: Frozen;
  withholding: WithholdingQuote;
  /** The fields to write on the payment as it is paid. */
  data: { exchangeRate: number | null; rateSource: string | null; baseTotal: number | null; withholdingAmount: number; withholdingType: string | null };
  /** The parts of the posting that follow from them. */
  posting: Pick<MoneyEvent, "sourceSubtype" | "netAmount" | "deductionsAmount" | "taxAmount" | "currency" | "rate" | "adjustments">;
  /** The cash that leaves the money account. */
  cash: number;
};

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export async function supplierPaymentFacts(
  companyId: string,
  payment: { id?: string | null; vendorId: string | null; billId: string | null; bankAccountId: string | null; amount: number; paidAt: Date },
  options: { withhold?: boolean } = {},
): Promise<SupplierPaymentFacts> {
  const [bill, bank, base] = await Promise.all([
    payment.billId ? prisma.purchaseBill.findFirst({ where: { id: payment.billId, companyId }, select: { currency: true, exchangeRate: true } }) : null,
    payment.bankAccountId ? prisma.bankAccount.findFirst({ where: { id: payment.bankAccountId, companyId }, select: { currency: true } }) : null,
    resolveBaseCurrency(companyId),
  ]);
  const currency = (bill?.currency ?? bank?.currency ?? base).toUpperCase();
  const frozen = await freezeRate(companyId, currency, payment.paidAt, payment.amount);
  const withholding =
    options.withhold === false
      ? { incomeTax: 0, vat: 0, total: 0, type: null, reasons: [] }
      : await quoteWithholding(companyId, { vendorId: payment.vendorId, billId: payment.billId, amount: payment.amount, currency, date: payment.paidAt, exceptPaymentId: payment.id ?? null });
  const adjustments =
    bill?.exchangeRate && frozen.exchangeRate
      ? realisedAdjustments("OUT", settle({ direction: "OUT", docCurrency: bill.currency, docRate: bill.exchangeRate, payCurrency: currency, payAmount: payment.amount, payRate: frozen.exchangeRate }).gain)
      : [];
  const cash = round2(payment.amount - withholding.total);
  return {
    currency,
    frozen,
    withholding,
    data: { ...frozen, withholdingAmount: withholding.total, withholdingType: withholding.type },
    posting: {
      sourceSubtype: withholding.total > 0 ? "WITHHELD" : null,
      netAmount: cash,
      deductionsAmount: withholding.incomeTax,
      taxAmount: withholding.vat,
      currency,
      rate: frozen.exchangeRate ?? undefined,
      adjustments: adjustments.length ? adjustments : undefined,
    },
    cash,
  };
}
