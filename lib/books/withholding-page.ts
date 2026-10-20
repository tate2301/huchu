import type { PrismaClient } from "@prisma/client";

import { itf263Valid, quoteWithholding, withholdingReturn } from "@/lib/books/core/withholding";
import { resolveBaseCurrency } from "@/lib/money";

import { dayOf, money, monthName, shortDay, storedDay } from "./format";
import type { WithholdingTab } from "./withholding-labels";

/**
 * Books → Tax → Withholding (BkWithholding): the 30% withheld from suppliers
 * without a valid ITF263 (paid, and waiting in a payment not yet made), VAT
 * withheld by customers who are agents and by us as one, the certificates
 * (`WHT-…`) and the monthly returns. The figures are the core's
 * (`quoteWithholding`, `withholdingReturn`); paying the withheld tax is a bank
 * entry that clears 2180.
 */

type Db = PrismaClient;

export type WhtRow = {
  id: string;
  number: string | null;
  date: string;
  supplier: { id: string; name: string };
  /** "ITF263 expired 30 Jun", "No ITF263 on file". */
  itf263: string;
  gross: number;
  withheld: number;
  currency: string;
  state: "Paid" | "To approve" | "Approved" | "Draft";
  certificateNo: string | null;
};

export type VatWithheldRow = { id: string; kind: "by-customer" | "as-agent"; number: string | null; date: string; party: string; amount: number; currency: string; certificate: string | null };

export type WhtReturnRow = { month: string; label: string; returnDue: string; paymentDue: string; incomeTax: number; vat: number; ledger: number; payments: number; missingCertificates: number; state: "Due" | "Overdue" | "Nothing to file" };

export type WithholdingPage = {
  baseCurrency: string;
  tab: WithholdingTab;
  finding: { fact: string; rest: string | null };
  counts: Record<WithholdingTab, number>;
  income: WhtRow[];
  vat: VatWithheldRow[];
  certificates: WhtRow[];
  returns: WhtReturnRow[];
  sums: { withheld: number; waiting: number; paymentsThisYear: number };
  /** The month whose return is made next: "October". */
  returnMonth: { key: string; name: string };
  suppliers: Array<{ id: string; name: string }>;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** "ITF263 expired 30 Jun", "Valid to 31 Dec 2026", "No ITF263 on file". */
export function itf263Words(vendor: { itf263Number: string | null; itf263ExpiresAt: Date | null }, on: Date): string {
  if (!vendor.itf263Number?.trim()) return "No ITF263 on file";
  if (!vendor.itf263ExpiresAt) return "ITF263 on file";
  const day = storedDay(vendor.itf263ExpiresAt);
  return itf263Valid(vendor, on) ? `Valid to ${shortDay(day)} ${day.slice(0, 4)}` : `ITF263 expired ${shortDay(day)}`;
}

export function withholdingFinding(waiting: WhtRow[], withheldYear: number, missing: number, base: string): { fact: string; rest: string | null } {
  const next = waiting[0];
  if (next) {
    const expired = next.itf263.startsWith("ITF263 expired") ? `Its ITF263 expired on ${next.itf263.replace("ITF263 expired ", "")}.` : "It has no valid ITF263 on file.";
    return { fact: `${money(next.withheld, next.currency)} will be withheld from ${next.supplier.name}.`, rest: expired };
  }
  if (withheldYear > 0) return { fact: `${money(withheldYear, base)} was withheld this year.`, rest: missing ? `${missing} ${missing === 1 ? "supplier has" : "suppliers have"} no valid ITF263.` : null };
  return { fact: "Nothing is withheld this year.", rest: missing ? `${missing} ${missing === 1 ? "supplier has" : "suppliers have"} no valid ITF263: paying them withholds 30%.` : "Every supplier paid has a valid ITF263." };
}

export async function readWithholding(db: Db, companyId: string, { tab = "income", q = "", supplier = null }: { tab?: WithholdingTab; q?: string; supplier?: string | null } = {}, now = new Date()): Promise<WithholdingPage> {
  const today = dayOf(now);
  const year = Number(today.slice(0, 4));
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const base = (await resolveBaseCurrency(companyId)).toUpperCase();
  const [payments, open, vendors, viaCustomers, ledger2180] = await Promise.all([
    db.purchasePayment.findMany({
      where: { companyId, status: "PAID", withholdingAmount: { gt: 0 }, paidAt: { gte: yearStart } },
      orderBy: { paidAt: "desc" },
      select: { id: true, paymentNumber: true, paidAt: true, amount: true, withholdingAmount: true, withholdingType: true, certificateNo: true, vendor: { select: { id: true, name: true, itf263Number: true, itf263ExpiresAt: true } }, bill: { select: { currency: true } }, bankAccount: { select: { currency: true } } },
    }),
    db.purchasePayment.findMany({
      where: { companyId, status: { in: ["DRAFT", "TO_APPROVE", "APPROVED"] }, vendorId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { id: true, paymentNumber: true, createdAt: true, paidAt: true, amount: true, status: true, billId: true, vendorId: true, vendor: { select: { id: true, name: true, itf263Number: true, itf263ExpiresAt: true } }, bill: { select: { currency: true } }, bankAccount: { select: { currency: true } } },
      take: 100,
    }),
    db.vendor.findMany({ where: { companyId, isActive: true }, select: { id: true, name: true, itf263Number: true, itf263ExpiresAt: true }, orderBy: { name: "asc" } }),
    db.salesReceipt.findMany({
      where: { companyId, method: "VAT withheld", receivedAt: { gte: yearStart } },
      orderBy: { receivedAt: "desc" },
      select: { id: true, receiptNumber: true, receivedAt: true, amount: true, reference: true, invoice: { select: { currency: true, customer: { select: { name: true } } } } },
    }),
    db.$queryRaw<Array<{ net: number }>>`
      SELECT COALESCE(SUM(l."credit" - l."debit"), 0)::float8 AS net
      FROM "JournalLine" l
      JOIN "JournalEntry" j ON j."id" = l."entryId" AND j."companyId" = ${companyId} AND j."status" = 'POSTED'
      JOIN "ChartOfAccount" a ON a."id" = l."accountId" AND a."code" = '2180'`,
  ]);
  const currencyOf = (row: { bill: { currency: string } | null; bankAccount: { currency: string } | null }) => (row.bill?.currency ?? row.bankAccount?.currency ?? base).toUpperCase();
  const paid: WhtRow[] = payments.map((row) => ({
    id: row.id,
    number: row.paymentNumber,
    date: shortDay(storedDay(row.paidAt)),
    supplier: { id: row.vendor?.id ?? "", name: row.vendor?.name ?? "Supplier" },
    itf263: row.vendor ? itf263Words(row.vendor, row.paidAt) : "No ITF263 on file",
    gross: row.amount,
    withheld: row.withholdingAmount,
    currency: currencyOf(row),
    state: "Paid",
    certificateNo: row.certificateNo,
  }));
  const waiting: WhtRow[] = [];
  for (const row of open) {
    if (!row.vendor || itf263Valid(row.vendor, now)) continue;
    const quote = await quoteWithholding(companyId, { vendorId: row.vendorId, billId: row.billId, amount: row.amount, currency: currencyOf(row), date: now, exceptPaymentId: row.id }, db);
    if (quote.incomeTax <= 0) continue;
    waiting.push({
      id: row.id,
      number: row.paymentNumber,
      date: shortDay(storedDay(row.createdAt)),
      supplier: { id: row.vendor.id, name: row.vendor.name },
      itf263: itf263Words(row.vendor, now),
      gross: row.amount,
      withheld: quote.incomeTax,
      currency: currencyOf(row),
      state: row.status === "TO_APPROVE" ? "To approve" : row.status === "APPROVED" ? "Approved" : "Draft",
      certificateNo: null,
    });
  }
  const needle = q.trim().toLowerCase();
  const match = (row: WhtRow) => (!supplier || row.supplier.id === supplier) && (!needle || `${row.supplier.name} ${row.number ?? ""}`.toLowerCase().includes(needle));
  const incomeAll = [...waiting, ...paid.filter((row) => row.withheld > 0)];
  const income = incomeAll.filter(match);
  const vat: VatWithheldRow[] = [
    ...viaCustomers.map((row) => ({ id: row.id, kind: "by-customer" as const, number: row.receiptNumber, date: shortDay(storedDay(row.receivedAt)), party: row.invoice?.customer.name ?? "Customer", amount: row.amount, currency: (row.invoice?.currency ?? base).toUpperCase(), certificate: row.reference })),
    ...payments.filter((row) => row.withholdingType === "VAT_THIRD" || row.withholdingType === "BOTH").map((row) => ({ id: row.id, kind: "as-agent" as const, number: row.paymentNumber, date: shortDay(storedDay(row.paidAt)), party: row.vendor?.name ?? "Supplier", amount: row.withholdingType === "VAT_THIRD" ? row.withholdingAmount : 0, currency: currencyOf(row), certificate: row.certificateNo })),
  ];
  // Returns: each month of the year so far, the last first.
  const months: string[] = [];
  for (let m = Number(today.slice(5, 7)) - 1; m >= 1; m--) months.push(`${year}-${String(m).padStart(2, "0")}`);
  const returns: WhtReturnRow[] = [];
  for (const month of months.slice(0, 12)) {
    const ret = await withholdingReturn(companyId, month, db);
    const income = round2(ret.byCurrency.reduce((sum, row) => sum + row.incomeTax, 0));
    const vatPart = round2(ret.byCurrency.reduce((sum, row) => sum + row.vat, 0));
    returns.push({
      month,
      label: `${monthName(`${month}-01`)} ${month.slice(0, 4)}`,
      returnDue: shortDay(ret.returnDue),
      paymentDue: shortDay(ret.paymentDue),
      incomeTax: income,
      vat: vatPart,
      ledger: ret.ledger.withholding,
      payments: ret.rows.length,
      missingCertificates: ret.missingCertificates,
      state: ret.rows.length === 0 ? "Nothing to file" : ret.returnDue < today ? "Overdue" : "Due",
    });
  }
  const missing = vendors.filter((vendor) => !itf263Valid(vendor, now)).length;
  const withheldYear = round2(paid.reduce((sum, row) => sum + row.withheld, 0));
  // The next return to make: this month's, due on the 5th of the next.
  const returnKey = today.slice(0, 7);
  return {
    baseCurrency: base,
    tab,
    finding: withholdingFinding(waiting, withheldYear, missing, base),
    counts: { income: incomeAll.length, vat: vat.length, rent: 0, certificates: paid.length, returns: returns.filter((row) => row.payments > 0).length },
    income,
    vat,
    certificates: paid.filter(match),
    returns,
    sums: { withheld: withheldYear, waiting: round2(ledger2180[0]?.net ?? 0), paymentsThisYear: paid.length },
    returnMonth: { key: returnKey, name: monthName(`${returnKey}-01`) },
    suppliers: vendors.map((vendor) => ({ id: vendor.id, name: vendor.name })),
  };
}
