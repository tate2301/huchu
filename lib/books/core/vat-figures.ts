import type { AccountingSourceType, Prisma, PrismaClient } from "@prisma/client";

import { resolveBaseCurrency } from "@/lib/money";
import { prisma } from "@/lib/prisma";

import { documentIdOf } from "./currency";
import { taxSettings, type TaxSettings } from "./tax-settings";

/**
 * The VAT return's figures (books-final §5.10, fix 8): every source of output
 * and input VAT, each in its own currency and in the base currency, and a
 * tie-out against the movement on 2200 VAT output and 2210 VAT input.
 *
 * Output: issued sales invoices (and invoices voided by a mirror, the old
 * way, taken off when the void posted), less credit notes; the tills' VAT;
 * school fees, exempt; any other posting to 2200 (a journal).
 * Input: bills, once their FTI is Valid on FDMS (when their VAT reached
 * 2210), less debit notes; claims, requisition receipts and petty cash with
 * a valid FTI; any other posting to 2210.
 * Credits: VAT withheld by customers who are agents (1170). VAT we withheld
 * as an agent (2185) is shown, owed to ZIMRA on its own.
 *
 * Payments to ZIMRA (bank entries) are not movement for the tie-out.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export type VatSourceKey =
  | "invoices"
  | "invoice-voids"
  | "credit-notes"
  | "till"
  | "fees"
  | "other-output"
  | "bills"
  | "debit-notes"
  | "claims"
  | "other-input"
  | "withheld-by-customers"
  | "withheld-as-agent";

export type VatSourceRow = {
  key: VatSourceKey;
  side: "output" | "input" | "credit" | "agent";
  label: string;
  currency: string;
  count: number;
  /** Value excluding VAT, signed as it counts (credit notes negative). */
  value: number;
  vat: number;
  baseValue: number;
  baseVat: number;
};

export type VatFigures = {
  periodStart: string;
  periodEnd: string;
  baseCurrency: string;
  returnDue: string;
  paymentDue: string;
  sources: VatSourceRow[];
  byCurrency: Array<{ currency: string; output: number; input: number }>;
  totals: { output: number; input: number; withheldByCustomers: number; net: number; withheldAsAgent: number; exemptValue: number };
  tieOut: {
    output: { ledger: number; ret: number; difference: number };
    input: { ledger: number; ret: number; difference: number };
    withheld: { ledger: number; ret: number; difference: number };
    ties: boolean;
  };
  /** Documents in another currency with no frozen rate: counted at nothing in the base currency until one is entered. */
  missingRates: string[];
};

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const iso = (date: Date) => date.toISOString().slice(0, 10);
const endOfDay = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));

const RETAIL: ReadonlySet<string> = new Set(["RETAIL_SALE", "RETAIL_REFUND", "RETAIL_VOID", "RETAIL_LAYBY_PAYMENT", "RETAIL_LAYBY_CANCEL", "RETAIL_VOUCHER_ISSUE", "RETAIL_VOUCHER_EXPIRY", "RETAIL_VOUCHER_VOID", "RETAIL_DAY_BANKED"]);
const SCHOOL: ReadonlySet<string> = new Set(["SCHOOL_FEE_INVOICE", "SCHOOL_FEE_CREDIT_APPLIED", "SCHOOL_FEE_WAIVER", "SCHOOL_FEE_WRITE_OFF", "SCHOOL_FEE_REFUND"]);
const CLAIMS: ReadonlySet<string> = new Set(["EXPENSE_CLAIM", "REQUISITION_ACQUITTAL", "PETTY_CASH_VOUCHER", "CRM_COST_ENTRY_SPEND", "RETAIL_PETTY_CASH"]);

/** The VAT period a date falls in, for the workspace's category (§5.10.1). */
export function vatPeriodFor(date: Date, vat: Pick<TaxSettings["vat"], "category" | "periodMonths">): { start: Date; end: Date } {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth(); // 0-based
  if (vat.category === "C") return { start: new Date(Date.UTC(y, m, 1)), end: new Date(Date.UTC(y, m + 1, 0)) };
  if (vat.category === "A" || vat.category === "B") {
    // A's periods end in odd months (Jan, Mar…), B's in even months (Feb, Apr…).
    const endsOdd = vat.category === "A";
    const monthNo = m + 1;
    const isEnd = endsOdd ? monthNo % 2 === 1 : monthNo % 2 === 0;
    const endMonth = isEnd ? m : m + 1;
    return { start: new Date(Date.UTC(y, endMonth - 1, 1)), end: new Date(Date.UTC(y, endMonth + 1, 0)) };
  }
  const length = Math.max(1, Math.min(12, vat.periodMonths || 1));
  const first = Math.floor(m / length) * length;
  return { start: new Date(Date.UTC(y, first, 1)), end: new Date(Date.UTC(y, first + length, 0)) };
}

/** The return and payment due dates of a period ending on `end`. */
export function vatDueDates(end: Date, vat: Pick<TaxSettings["vat"], "returnDay" | "paymentDay">) {
  const y = end.getUTCFullYear();
  const m = end.getUTCMonth() + 1;
  return { returnDue: iso(new Date(Date.UTC(y, m, vat.returnDay))), paymentDue: iso(new Date(Date.UTC(y, m, vat.paymentDay))) };
}

type Row = Omit<VatSourceRow, "label" | "side"> & { side?: VatSourceRow["side"]; label?: string };

const LABELS: Record<VatSourceKey, { side: VatSourceRow["side"]; label: string }> = {
  invoices: { side: "output", label: "Sales invoices" },
  "invoice-voids": { side: "output", label: "Invoices voided" },
  "credit-notes": { side: "output", label: "Credit notes" },
  till: { side: "output", label: "Till sales" },
  fees: { side: "output", label: "School fees (exempt)" },
  "other-output": { side: "output", label: "Other postings to VAT output" },
  bills: { side: "input", label: "Bills with a valid FTI" },
  "debit-notes": { side: "input", label: "Debit notes" },
  claims: { side: "input", label: "Claims, requisitions and petty cash" },
  "other-input": { side: "input", label: "Other postings to VAT input" },
  "withheld-by-customers": { side: "credit", label: "VAT withheld by customers" },
  "withheld-as-agent": { side: "agent", label: "VAT withheld from suppliers, to pay over" },
};

function add(rows: Map<string, Row>, key: VatSourceKey, currency: string, value: number, vat: number, baseValue: number, baseVat: number) {
  const id = `${key}:${currency}`;
  const row = rows.get(id) ?? { key, currency, count: 0, value: 0, vat: 0, baseValue: 0, baseVat: 0 };
  row.count += 1;
  row.value = round2(row.value + value);
  row.vat = round2(row.vat + vat);
  row.baseValue = round2(row.baseValue + baseValue);
  row.baseVat = round2(row.baseVat + baseVat);
  rows.set(id, row);
}

export async function vatFigures(companyId: string, periodStart: Date, periodEnd: Date, db: Db = prisma): Promise<VatFigures> {
  const from = new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth(), periodStart.getUTCDate()));
  const to = endOfDay(periodEnd);
  const [base, settings] = await Promise.all([resolveBaseCurrency(companyId), taxSettings(companyId, db)]);
  const baseOf = (amount: number, currency: string, rate: number | null, label: string) => {
    if (currency.toUpperCase() === base.toUpperCase()) return amount;
    if (rate && rate > 0) return round2(amount / rate);
    missing.add(label);
    return 0;
  };
  const missing = new Set<string>();
  const rows = new Map<string, Row>();

  const [invoices, notes, debitNotes, withheldReceipts, agentPayments, lines] = await Promise.all([
    db.salesInvoice.findMany({
      where: { companyId, invoiceNumber: { not: null }, status: { in: ["ISSUED", "PAID", "VOIDED"] }, invoiceDate: { gte: from, lte: to } },
      select: { id: true, invoiceNumber: true, currency: true, subTotal: true, taxTotal: true, exchangeRate: true },
    }),
    db.creditNote.findMany({
      where: { companyId, status: "ISSUED", noteNumber: { not: null }, noteDate: { gte: from, lte: to } },
      select: { noteNumber: true, currency: true, subTotal: true, taxTotal: true, exchangeRate: true, invoice: { select: { exchangeRate: true } } },
    }),
    db.debitNote.findMany({
      where: { companyId, status: "ISSUED", noteDate: { gte: from, lte: to } },
      select: { noteNumber: true, currency: true, subTotal: true, taxTotal: true, exchangeRate: true, bill: { select: { exchangeRate: true } } },
    }),
    db.salesReceipt.findMany({
      where: { companyId, method: "VAT withheld", voidedAt: null, receivedAt: { gte: from, lte: to } },
      select: { receiptNumber: true, amount: true, currency: true, exchangeRate: true, baseAmount: true },
    }),
    db.purchasePayment.findMany({
      where: { companyId, status: "PAID", withholdingType: { in: ["VAT_THIRD", "BOTH"] }, paidAt: { gte: from, lte: to } },
      select: { paymentNumber: true, amount: true, withholdingAmount: true, withholdingType: true, exchangeRate: true, bill: { select: { currency: true, total: true, taxTotal: true } } },
    }),
    db.journalLine.findMany({
      where: {
        entry: { companyId, status: "POSTED", entryDate: { gte: from, lte: to } },
        account: { code: { in: ["2200", "2210", "1170"] } },
      },
      select: { debit: true, credit: true, account: { select: { code: true } }, entry: { select: { id: true, sourceType: true, sourceId: true } } },
    }),
  ]);

  // Output: invoices as issued, less credit notes.
  for (const invoice of invoices) {
    const label = invoice.invoiceNumber ?? invoice.id;
    add(rows, "invoices", invoice.currency, invoice.subTotal, invoice.taxTotal, baseOf(invoice.subTotal, invoice.currency, invoice.exchangeRate, label), baseOf(invoice.taxTotal, invoice.currency, invoice.exchangeRate, label));
  }
  for (const note of notes) {
    const rate = note.exchangeRate ?? note.invoice?.exchangeRate ?? null;
    const label = note.noteNumber ?? "credit note";
    add(rows, "credit-notes", note.currency, -note.subTotal, -note.taxTotal, -baseOf(note.subTotal, note.currency, rate, label), -baseOf(note.taxTotal, note.currency, rate, label));
  }

  // Invoices voided the old way: their mirror (`void:<id>`) took the VAT off when it posted.
  const voidKeys = lines.filter((line) => line.entry.sourceType === "SALES_INVOICE" && line.entry.sourceId?.startsWith("void:") && line.account.code === "2200");
  const voidIds = [...new Set(voidKeys.map((line) => documentIdOf(line.entry.sourceId!)))];
  const voided = voidIds.length ? await db.salesInvoice.findMany({ where: { companyId, id: { in: voidIds } }, select: { id: true, invoiceNumber: true, currency: true, subTotal: true, taxTotal: true, exchangeRate: true } }) : [];
  for (const invoice of voided) {
    const label = invoice.invoiceNumber ?? invoice.id;
    add(rows, "invoice-voids", invoice.currency, -invoice.subTotal, -invoice.taxTotal, -baseOf(invoice.subTotal, invoice.currency, invoice.exchangeRate, label), -baseOf(invoice.taxTotal, invoice.currency, invoice.exchangeRate, label));
  }

  // The ledger's own sources: the tills, fees, claims, bills reaching 2210, and anything else.
  const byEntry = new Map<string, { sourceType: AccountingSourceType | null; sourceId: string | null; out: number; in: number }>();
  for (const line of lines) {
    if (line.account.code === "1170") continue;
    const entry = byEntry.get(line.entry.id) ?? { sourceType: line.entry.sourceType, sourceId: line.entry.sourceId, out: 0, in: 0 };
    if (line.account.code === "2200") entry.out = round2(entry.out + line.credit - line.debit);
    else entry.in = round2(entry.in + line.debit - line.credit);
    byEntry.set(line.entry.id, entry);
  }
  const billIds = new Set<string>();
  for (const entry of byEntry.values()) {
    const type = entry.sourceType ?? "MANUAL";
    if (type === "BANK_TRANSACTION") continue;
    if (entry.out !== 0) {
      if (RETAIL.has(type)) add(rows, "till", base, 0, entry.out, 0, entry.out);
      else if (SCHOOL.has(type)) add(rows, "fees", base, 0, entry.out, 0, entry.out);
      else if (type !== "SALES_INVOICE" && type !== "SALES_CREDIT_NOTE") add(rows, "other-output", base, 0, entry.out, 0, entry.out);
    }
    if (entry.in !== 0) {
      if (type === "PURCHASE_BILL") billIds.add(documentIdOf(entry.sourceId ?? ""));
      else if (CLAIMS.has(type)) add(rows, "claims", base, 0, entry.in, 0, entry.in);
      else if (type !== "PURCHASE_DEBIT_NOTE") add(rows, "other-input", base, 0, entry.in, 0, entry.in);
    }
  }

  // Bills: claimed in the period their VAT reached 2210 (recorded valid, or found valid later); a void takes it back.
  const bills = billIds.size ? await db.purchaseBill.findMany({ where: { companyId, id: { in: [...billIds] } }, select: { id: true, billNumber: true, currency: true, subTotal: true, taxTotal: true, exchangeRate: true } }) : [];
  const billById = new Map(bills.map((bill) => [bill.id, bill]));
  for (const entry of byEntry.values()) {
    if (entry.sourceType !== "PURCHASE_BILL" || entry.in === 0) continue;
    const bill = billById.get(documentIdOf(entry.sourceId ?? ""));
    if (!bill) continue;
    const sign = entry.in < 0 ? -1 : 1;
    const label = bill.billNumber ?? bill.id;
    add(rows, "bills", bill.currency, sign * bill.subTotal, sign * bill.taxTotal, sign * baseOf(bill.subTotal, bill.currency, bill.exchangeRate, label), sign * baseOf(bill.taxTotal, bill.currency, bill.exchangeRate, label));
  }
  for (const note of debitNotes) {
    const rate = note.exchangeRate ?? note.bill?.exchangeRate ?? null;
    const label = note.noteNumber ?? "debit note";
    add(rows, "debit-notes", note.currency, -note.subTotal, -note.taxTotal, -baseOf(note.subTotal, note.currency, rate, label), -baseOf(note.taxTotal, note.currency, rate, label));
  }

  // Credits and what we hold as an agent.
  for (const receipt of withheldReceipts) {
    const currency = receipt.currency ?? base;
    add(rows, "withheld-by-customers", currency, 0, receipt.amount, 0, receipt.baseAmount ?? baseOf(receipt.amount, currency, receipt.exchangeRate, receipt.receiptNumber));
  }
  for (const payment of agentPayments) {
    const currency = payment.bill?.currency ?? base;
    const vatShare = payment.bill && payment.bill.total > 0 ? round2(((payment.bill.taxTotal * payment.amount) / payment.bill.total) * settings.vat.withholdingShare) : payment.withholdingAmount;
    const vat = payment.withholdingType === "VAT_THIRD" ? payment.withholdingAmount : Math.min(vatShare, payment.withholdingAmount);
    add(rows, "withheld-as-agent", currency, 0, vat, 0, baseOf(vat, currency, payment.exchangeRate, payment.paymentNumber ?? "payment"));
  }

  const sources: VatSourceRow[] = [...rows.values()].map((row) => ({ ...row, ...LABELS[row.key] }) as VatSourceRow);
  const sum = (side: VatSourceRow["side"], pick: (row: VatSourceRow) => number) => round2(sources.filter((row) => row.side === side).reduce((total, row) => total + pick(row), 0));
  const output = sum("output", (row) => row.baseVat);
  const input = sum("input", (row) => row.baseVat);
  const withheldByCustomers = sum("credit", (row) => row.baseVat);
  const withheldAsAgent = sum("agent", (row) => row.baseVat);
  const exemptValue = round2(sources.filter((row) => row.key === "fees").reduce((total, row) => total + row.baseValue, 0));

  const currencies = new Map<string, { currency: string; output: number; input: number }>();
  for (const row of sources) {
    if (row.side !== "output" && row.side !== "input") continue;
    const entry = currencies.get(row.currency) ?? { currency: row.currency, output: 0, input: 0 };
    entry[row.side] = round2(entry[row.side] + row.vat);
    currencies.set(row.currency, entry);
  }

  const ledgerMove = (code: string, sign: 1 | -1) =>
    round2(lines.filter((line) => line.account.code === code && line.entry.sourceType !== "BANK_TRANSACTION").reduce((total, line) => total + sign * (line.credit - line.debit), 0));
  const ledgerOutput = ledgerMove("2200", 1);
  const ledgerInput = ledgerMove("2210", -1);
  const ledgerWithheld = ledgerMove("1170", -1);
  const tie = (ledger: number, ret: number) => ({ ledger, ret, difference: round2(ret - ledger) });
  const tieOut = { output: tie(ledgerOutput, output), input: tie(ledgerInput, input), withheld: tie(ledgerWithheld, withheldByCustomers) };
  const dues = vatDueDates(periodEnd, settings.vat);

  return {
    periodStart: iso(from),
    periodEnd: iso(periodEnd),
    baseCurrency: base,
    ...dues,
    sources: sources.sort((a, b) => Object.keys(LABELS).indexOf(a.key) - Object.keys(LABELS).indexOf(b.key) || a.currency.localeCompare(b.currency)),
    byCurrency: [...currencies.values()],
    totals: { output, input, withheldByCustomers, net: round2(output - input - withheldByCustomers), withheldAsAgent, exemptValue },
    tieOut: { ...tieOut, ties: [tieOut.output, tieOut.input, tieOut.withheld].every((row) => Math.abs(row.difference) < 0.005) },
    missingRates: [...missing],
  };
}
