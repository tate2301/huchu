import type { PrismaClient } from "@prisma/client";

import { resolveBaseCurrency } from "@/lib/money";

/**
 * `moneyInOut`: what came in and what went out over a period, in one
 * currency, read one way for every screen and report (books-final §6.1 fix
 * 13). Money's month, Payments received, Payments made and the money report
 * all read this, so they cannot disagree.
 *
 * In: the tills (sales less refunds), every receipt that is not void, on an
 *     invoice or on account, and school fees received.
 * Out: every supplier payment paid (not a draft, one waiting or a void one),
 *     retail's included, and every payout to people: requisitions paid out,
 *     claims reimbursed, petty cash spent from a float and commission paid. A
 *     supplier payment made from a requisition's cash is that payout, so it is
 *     counted once, as the payout. A float's top-up is a transfer, not out.
 */

type Db = Pick<PrismaClient, "retailSale" | "salesReceipt" | "schoolFeeReceipt" | "purchasePayment" | "crmRequisition" | "expenseClaim" | "pettyCashVoucher" | "crmCommissionEntry">;

export type MoneyFlowKey = "tills" | "invoices" | "fees" | "supplier-payments" | "payouts";

export type MoneyFlow = { key: MoneyFlowKey; amount: number; count: number };

export type MoneyInOut = {
  currency: string;
  from: Date;
  /** The end, exclusive; null for "until now". */
  to: Date | null;
  in: MoneyFlow[];
  out: MoneyFlow[];
  totalIn: number;
  totalOut: number;
};

const round = (n: number) => Math.round(n * 100) / 100;
const num = (value: unknown) => Number(value ?? 0) || 0;

export async function moneyInOut(db: Db, companyId: string, period: { from: Date; to?: Date }, currency: string, base?: string): Promise<MoneyInOut> {
  const to = period.to ?? null;
  const baseCurrency = base ?? (await resolveBaseCurrency(companyId));
  const isBase = currency.toUpperCase() === baseCurrency.toUpperCase();
  const when = to ? { gte: period.from, lt: to } : { gte: period.from };

  const [sales, refunds, receipts, fees, payments, payouts, claims, vouchers, commission] = await Promise.all([
    db.retailSale.aggregate({ where: { companyId, status: "POSTED", saleType: "SALE", currency, createdAt: when }, _sum: { totalAmount: true }, _count: true }),
    db.retailSale.aggregate({ where: { companyId, status: "POSTED", saleType: "REFUND", currency, createdAt: when }, _sum: { totalAmount: true } }),
    // On an invoice or on account: every receipt that is not void, in the currency it came in (D2).
    db.salesReceipt.aggregate({
      where: {
        companyId,
        voidedAt: null,
        receivedAt: when,
        OR: [{ currency }, { currency: null, invoice: { currency } }, ...(isBase ? [{ currency: null, invoiceId: null }] : [])],
      },
      _sum: { amount: true },
      _count: true,
    }),
    db.schoolFeeReceipt.aggregate({ where: { companyId, status: "POSTED", currency, receiptDate: when }, _sum: { amountReceived: true }, _count: true }),
    db.purchasePayment.aggregate({
      where: { companyId, status: "PAID", requisitionId: null, paidAt: when, OR: [{ bill: { currency } }, ...(isBase ? [{ billId: null }] : [])] },
      _sum: { amount: true },
      _count: true,
    }),
    db.crmRequisition.findMany({
      where: { companyId, currency, status: { in: ["DISBURSED", "ACQUITTED"] }, disbursedAt: when },
      select: { paidAmount: true, approvedAmount: true, amount: true },
    }),
    db.expenseClaim.aggregate({ where: { companyId, currency, status: "PAID", paidAt: when }, _sum: { total: true }, _count: true }),
    db.pettyCashVoucher.aggregate({ where: { companyId, kind: "SPEND", status: "POSTED", spentAt: when, float: { currency } }, _sum: { amount: true }, _count: true }),
    db.crmCommissionEntry.aggregate({ where: { companyId, currency, status: "PAID", paidBankAccountId: { not: null }, paidAt: when }, _sum: { amount: true }, _count: true }),
  ]);

  const flowsIn: MoneyFlow[] = [];
  if (sales._count > 0) flowsIn.push({ key: "tills", amount: round(num(sales._sum.totalAmount) - Math.abs(num(refunds._sum.totalAmount))), count: sales._count });
  if (receipts._count > 0) flowsIn.push({ key: "invoices", amount: round(num(receipts._sum.amount)), count: receipts._count });
  if (fees._count > 0) flowsIn.push({ key: "fees", amount: round(num(fees._sum.amountReceived)), count: fees._count });

  const flowsOut: MoneyFlow[] = [];
  if (payments._count > 0) flowsOut.push({ key: "supplier-payments", amount: round(num(payments._sum.amount)), count: payments._count });
  const toPeople =
    payouts.reduce((sum, row) => sum + num(row.paidAmount ?? row.approvedAmount ?? row.amount), 0) +
    num(claims._sum.total) +
    num(vouchers._sum.amount) +
    num(commission._sum.amount);
  const paidOut = payouts.length + claims._count + vouchers._count + commission._count;
  if (paidOut > 0) flowsOut.push({ key: "payouts", amount: round(toPeople), count: paidOut });

  return {
    currency,
    from: period.from,
    to,
    in: flowsIn,
    out: flowsOut,
    totalIn: round(flowsIn.reduce((sum, flow) => sum + flow.amount, 0)),
    totalOut: round(flowsOut.reduce((sum, flow) => sum + flow.amount, 0)),
  };
}
