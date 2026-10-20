import type { Prisma, PrismaClient } from "@prisma/client";

import { resolveBaseCurrency } from "@/lib/money";
import { prisma } from "@/lib/prisma";

import { canDo, type BooksActor } from "./can-do";
import { freezeRate } from "./currency";
import { taxSettings, type TaxSettings } from "./tax-settings";

/**
 * Withholding (D17, books-final §5.10, zw-research §2 and §4):
 *
 * - **30% on contracts.** A payment to a supplier without a valid tax
 *   clearance (ITF263) has 30% withheld once the supplier's payments in the
 *   calendar year, this one included, come to the threshold ($1,000, a
 *   setting to confirm). It is withheld from this payment on: payments made
 *   before the threshold was reached are not reopened.
 * - **VAT withholding.** Where this workspace is an appointed VAT withholding
 *   agent (a setting), a third of the VAT in a payment to a VAT-registered
 *   supplier is withheld, unless the supplier is an agent too.
 * - A payment's `amount` is what it settles on the bill; the supplier is paid
 *   that less what was withheld, which is owed to ZIMRA (2180, 2185).
 * - **VAT withheld by a customer** who is an agent comes in as a receipt that
 *   lands on 1170, with their certificate, and is claimed on the VAT return.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export class WithholdingRefused extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 = 400,
  ) {
    super(message);
    this.name = "WithholdingRefused";
  }
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export type WithholdingType = "INCOME_30" | "VAT_THIRD" | "BOTH";

/** A tax clearance is valid with a number, and an expiry on or after the day (none recorded counts as valid). */
export function itf263Valid(vendor: { itf263Number: string | null; itf263ExpiresAt: Date | null }, on: Date): boolean {
  if (!vendor.itf263Number?.trim()) return false;
  return !vendor.itf263ExpiresAt || vendor.itf263ExpiresAt.getTime() >= Date.UTC(on.getUTCFullYear(), on.getUTCMonth(), on.getUTCDate());
}

export type WithholdingQuote = { incomeTax: number; vat: number; total: number; type: WithholdingType | null; reasons: string[] };

/** What to withhold from one payment, pure. */
export function withholdingFor(input: {
  gross: number;
  /** The payment in the base currency, for the threshold. */
  grossBase: number;
  /** The supplier's payments already made this calendar year, in the base currency. */
  paidThisYearBase: number;
  hasValidItf263: boolean;
  /** The VAT in what this payment settles. */
  vatInPayment: number;
  weAreVatAgent: boolean;
  supplierIsVatAgent: boolean;
  supplierVatRegistered: boolean;
  settings: Pick<TaxSettings, "withholding" | "vat">;
}): WithholdingQuote {
  const reasons: string[] = [];
  let incomeTax = 0;
  if (!input.hasValidItf263 && input.paidThisYearBase + input.grossBase >= input.settings.withholding.thresholdUsd - 0.005) {
    incomeTax = round2(input.gross * input.settings.withholding.contractRate);
    reasons.push(`No valid tax clearance (ITF263), and this year's payments come to ${round2(input.paidThisYearBase + input.grossBase)}: ${Math.round(input.settings.withholding.contractRate * 100)}% is withheld.`);
  }
  let vat = 0;
  if (input.weAreVatAgent && !input.supplierIsVatAgent && input.supplierVatRegistered && input.vatInPayment > 0) {
    vat = round2(input.vatInPayment * input.settings.vat.withholdingShare);
    reasons.push("As a VAT withholding agent, a third of the VAT is withheld.");
  }
  const type: WithholdingType | null = incomeTax > 0 && vat > 0 ? "BOTH" : incomeTax > 0 ? "INCOME_30" : vat > 0 ? "VAT_THIRD" : null;
  return { incomeTax, vat, total: round2(incomeTax + vat), type, reasons };
}

const yearStart = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
const yearEnd = (date: Date) => new Date(Date.UTC(date.getUTCFullYear() + 1, 0, 1));

/** What a payment to this supplier would have withheld, from the books as they stand. */
export async function quoteWithholding(
  companyId: string,
  input: { vendorId: string | null; billId?: string | null; amount: number; currency: string; date: Date; exceptPaymentId?: string | null },
  db: Db = prisma,
): Promise<WithholdingQuote> {
  if (!input.vendorId) return { incomeTax: 0, vat: 0, total: 0, type: null, reasons: [] };
  const [vendor, bill, settings, base] = await Promise.all([
    db.vendor.findFirst({ where: { id: input.vendorId, companyId }, select: { itf263Number: true, itf263ExpiresAt: true, isVatWithholdingAgent: true, vatNumber: true } }),
    input.billId ? db.purchaseBill.findFirst({ where: { id: input.billId, companyId }, select: { total: true, taxTotal: true } }) : null,
    taxSettings(companyId, db),
    resolveBaseCurrency(companyId),
  ]);
  if (!vendor) return { incomeTax: 0, vat: 0, total: 0, type: null, reasons: [] };
  const paid = await db.purchasePayment.findMany({
    where: { companyId, vendorId: input.vendorId, status: "PAID", paidAt: { gte: yearStart(input.date), lt: yearEnd(input.date) }, ...(input.exceptPaymentId ? { id: { not: input.exceptPaymentId } } : {}) },
    select: { amount: true, baseTotal: true },
  });
  const paidThisYearBase = round2(paid.reduce((sum, row) => sum + (row.baseTotal ?? row.amount), 0));
  const grossBase =
    input.currency.toUpperCase() === base.toUpperCase()
      ? input.amount
      : ((await freezeRate(companyId, input.currency, input.date, input.amount)).baseTotal ?? input.amount);
  const vatInPayment = bill && bill.total > 0 ? round2((bill.taxTotal * input.amount) / bill.total) : 0;
  return withholdingFor({
    gross: input.amount,
    grossBase,
    paidThisYearBase,
    hasValidItf263: itf263Valid(vendor, input.date),
    vatInPayment,
    weAreVatAgent: settings.vat.withholdingAgent,
    supplierIsVatAgent: vendor.isVatWithholdingAgent,
    supplierVatRegistered: Boolean(vendor.vatNumber?.trim()),
    settings,
  });
}

/** A certificate for what was withheld from a paid payment: WHT- and the payment's number. */
export async function issueWithholdingCertificate(actor: BooksActor, paymentId: string) {
  const allowed = canDo(actor, "pay", { kind: "payment" });
  if (!allowed.allowed) throw new WithholdingRefused(allowed.reason, 403);
  const payment = await prisma.purchasePayment.findFirst({ where: { id: paymentId, companyId: actor.companyId }, select: { id: true, status: true, paymentNumber: true, withholdingAmount: true, certificateNo: true } });
  if (!payment) throw new WithholdingRefused("That payment is not here any more.", 404);
  if (payment.status !== "PAID") throw new WithholdingRefused("Only a paid payment has a certificate.", 409);
  if (!(payment.withholdingAmount > 0)) throw new WithholdingRefused("Nothing was withheld from this payment.", 409);
  if (payment.certificateNo) return payment;
  return prisma.purchasePayment.update({ where: { id: payment.id }, data: { certificateNo: `WHT-${payment.paymentNumber ?? payment.id.slice(0, 8)}` } });
}

export type WithholdingReturn = {
  month: string;
  returnDue: string;
  paymentDue: string;
  rows: Array<{ paymentId: string; paymentNumber: string | null; supplier: string; paidOn: string; currency: string; gross: number; incomeTax: number; vat: number; certificateNo: string | null }>;
  byCurrency: Array<{ currency: string; incomeTax: number; vat: number }>;
  /** Credits less debits on 2180 and 2185 in the month, from the ledger. */
  ledger: { withholding: number; vatWithheld: number };
  missingCertificates: number;
};

const iso = (date: Date) => date.toISOString().slice(0, 10);
const dayOfNextMonth = (month: string, dayOfMonth: number) => {
  const [y, m] = month.split("-").map(Number);
  return iso(new Date(Date.UTC(y, m, dayOfMonth)));
};

/** The month's withholding return (§5.10, ZIMRA's monthly return due the 5th, paid the 10th): what was withheld, from whom, and what the ledger says. */
export async function withholdingReturn(companyId: string, month: string, db: Db = prisma): Promise<WithholdingReturn> {
  const [y, m] = month.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 1));
  const [payments, settings, ledger] = await Promise.all([
    db.purchasePayment.findMany({
      where: { companyId, status: "PAID", withholdingAmount: { gt: 0 }, paidAt: { gte: from, lt: to } },
      select: { id: true, paymentNumber: true, paidAt: true, amount: true, withholdingAmount: true, withholdingType: true, certificateNo: true, bill: { select: { currency: true, total: true, taxTotal: true } }, bankAccount: { select: { currency: true } }, vendor: { select: { name: true } } },
      orderBy: { paidAt: "asc" },
    }),
    taxSettings(companyId, db),
    db.$queryRaw<Array<{ code: string; net: number }>>`
      SELECT a."code", COALESCE(SUM(l."credit" - l."debit"), 0)::float8 AS net
      FROM "JournalLine" l
      JOIN "JournalEntry" j ON j."id" = l."entryId" AND j."companyId" = ${companyId} AND j."status" = 'POSTED' AND j."entryDate" >= ${from} AND j."entryDate" < ${to}
      JOIN "ChartOfAccount" a ON a."id" = l."accountId" AND a."code" IN ('2180', '2185')
      GROUP BY a."code"`,
  ]);
  const rows = payments.map((payment) => {
    const currency = payment.bill?.currency ?? payment.bankAccount?.currency ?? "USD";
    const vatShare = payment.bill && payment.bill.total > 0 ? round2(((payment.bill.taxTotal * payment.amount) / payment.bill.total) * settings.vat.withholdingShare) : 0;
    const vat = payment.withholdingType === "VAT_THIRD" ? payment.withholdingAmount : payment.withholdingType === "BOTH" ? Math.min(vatShare, payment.withholdingAmount) : 0;
    return {
      paymentId: payment.id,
      paymentNumber: payment.paymentNumber,
      supplier: payment.vendor?.name ?? "Supplier",
      paidOn: iso(payment.paidAt),
      currency,
      gross: payment.amount,
      incomeTax: round2(payment.withholdingAmount - vat),
      vat: round2(vat),
      certificateNo: payment.certificateNo,
    };
  });
  const totals = new Map<string, { currency: string; incomeTax: number; vat: number }>();
  for (const row of rows) {
    const total = totals.get(row.currency) ?? { currency: row.currency, incomeTax: 0, vat: 0 };
    total.incomeTax = round2(total.incomeTax + row.incomeTax);
    total.vat = round2(total.vat + row.vat);
    totals.set(row.currency, total);
  }
  const net = (code: string) => round2(ledger.find((row) => row.code === code)?.net ?? 0);
  return {
    month,
    returnDue: dayOfNextMonth(month, settings.withholding.returnDay),
    paymentDue: dayOfNextMonth(month, settings.withholding.paymentDay),
    rows,
    byCurrency: [...totals.values()],
    ledger: { withholding: net("2180"), vatWithheld: net("2185") },
    missingCertificates: rows.filter((row) => !row.certificateNo).length,
  };
}

/** Suppliers paid this year with no valid ITF263: "suppliers missing an ITF263" for the owner. */
export async function suppliersWithoutItf263(companyId: string, on = new Date(), db: Db = prisma) {
  const vendors = await db.vendor.findMany({ where: { companyId, isActive: true }, select: { id: true, name: true, itf263Number: true, itf263ExpiresAt: true } });
  return vendors.filter((vendor) => !itf263Valid(vendor, on)).map((vendor) => ({ id: vendor.id, name: vendor.name, expired: Boolean(vendor.itf263Number && vendor.itf263ExpiresAt) }));
}
