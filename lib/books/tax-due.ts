import type { PrismaClient } from "@prisma/client";

import { whatsDue, type DueItem, type DueKind } from "@/lib/books/core/tax-calendar";
import { taxSettings } from "@/lib/books/core/tax-settings";
import { resolveBaseCurrency } from "@/lib/money";

import { dayOf, money, monthName, shortDay, storedDay, weekdayDay } from "./format";
import { DUE_TAX_OF, type DueTax } from "./tax-labels";

/**
 * Books → Tax → What's due (BkTaxDue, BkTaxDuePhone): every date ZIMRA
 * expects a return or a payment in the window, a row per date grouped by
 * month, with the amount the books know, what settles it, and its state. The
 * dates are the core's (`whatsDue`, from the tax settings); a date resting on a
 * value the research could not confirm says "To confirm". A return is Filed
 * when its VAT return is; a payment is Paid when a payment to ZIMRA (a bank
 * entry) cleared the tax's account after the period ended.
 */

type Db = PrismaClient;

export type DueRow = {
  date: string;
  /** "Thu 15 Oct". */
  day: string;
  kind: DueKind;
  tax: DueTax;
  /** "Pay VAT", "File the VAT 7 return". */
  what: string;
  /** "September", "October, so far". */
  period: string;
  amount: number | null;
  settledBy: string;
  state: "Paid" | "Filed" | "Due" | "Overdue" | "Draft" | "Reviewed" | "Finalised";
  toConfirm: boolean;
  why: string | null;
};

export type DuePage = {
  baseCurrency: string;
  finding: { fact: string; rest: string | null };
  from: string;
  to: string;
  /** "Oct to Dec". */
  monthsWords: string;
  tax: DueTax | "all";
  groups: Array<{ month: string; note: string; rows: DueRow[] }>;
  count: number;
  dueCount: number;
  sums: Array<{ label: string; value: number }>;
  /** The next calendar month's total, for the phone's heading. */
  nextMonth: { name: string; total: number };
  /** The last open date in the window: "7 due by 20 Dec". */
  lastDue: string | null;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** What a due date asks for, in the board's words. */
export function dueWhat(item: Pick<DueItem, "kind" | "label">): string {
  switch (item.kind) {
    case "VAT_RETURN":
      return "File the VAT 7 return";
    case "VAT_PAYMENT":
      return "Pay VAT";
    case "PAYE_RETURN":
      return "File the PAYE return";
    case "PAYE_PAYMENT":
      return "Pay PAYE and AIDS levy";
    case "WHT_RETURN":
      return "File the 30% withholding return";
    case "WHT_PAYMENT":
      return "Pay the 30% withheld";
    case "QPD_RETURN":
      return "File the provisional tax return";
    case "QPD_PAYMENT": {
      const ordinal = item.label.split(" ")[0];
      const nth = { First: "1st", Second: "2nd", Third: "3rd", Fourth: "4th" }[ordinal] ?? ordinal;
      return `Provisional tax, ${nth} instalment`;
    }
    case "ITF12C":
      return "File the income tax return, ITF12C";
  }
}

/** The finding: the next thing due, and what the next month asks to be paid. */
export function dueFinding(rows: DueRow[], today: string, baseCurrency: string): { fact: string; rest: string | null } {
  const open = rows.filter((row) => row.state === "Due" || row.state === "Overdue" || row.state === "Draft" || row.state === "Reviewed" || row.state === "Finalised");
  const overdue = open.filter((row) => row.date < today);
  if (open.length === 0) return { fact: "Nothing is due in these months.", rest: "Every return is filed and every tax paid." };
  if (overdue.length) {
    return { fact: `${overdue.length === 1 ? `${overdue[0].what}` : `${overdue.length} dates`} ${overdue.length === 1 ? "was" : "were"} due ${overdue.length === 1 ? `on ${shortDay(overdue[0].date)}` : "already"}.`, rest: overdue.length === 1 ? `For ${overdue[0].period}.` : null };
  }
  const next = open[0];
  const sameDay = open.filter((row) => row.date === next.date);
  const names = sameDay.map((row) => row.what.replace(/^File the /, "").replace(/^Pay /, "")).slice(0, 2);
  const fact = sameDay.length > 1 ? `Next: the ${names.join(" and ")} on ${dayWords(next.date)}.` : `Next: ${next.what.charAt(0).toLowerCase()}${next.what.slice(1)} on ${dayWords(next.date)}.`;
  const month = next.date.slice(0, 7);
  const toPay = round2(open.filter((row) => row.date.slice(0, 7) === month && /^Pay|instalment/.test(row.what)).reduce((sum, row) => sum + (row.amount ?? 0), 0));
  return { fact, rest: toPay > 0 ? `${money(toPay, baseCurrency)} is due in ${monthName(next.date)}.` : null };
}

const dayWords = (date: string) => `${Number(date.slice(8))} ${monthName(date)}`;

async function taxPayments(db: Db, companyId: string, from: Date) {
  // Payments to ZIMRA: bank entries (and supplier-style payments) that debit a tax account.
  const rows = await db.journalLine.findMany({
    where: {
      debit: { gt: 0 },
      account: { code: { in: ["2200", "2180", "2185", "2280", "2110", "2120", "2130", "2140"] } },
      entry: { companyId, status: "POSTED", sourceType: "BANK_TRANSACTION", entryDate: { gte: from }, reversedAt: null, voidedAt: null },
    },
    select: { debit: true, account: { select: { code: true } }, entry: { select: { entryNumber: true, entryDate: true } } },
  });
  return rows.map((row) => ({ code: row.account.code, amount: row.debit, date: storedDay(row.entry.entryDate), number: `JE-${String(row.entry.entryNumber).padStart(4, "0")}` }));
}

const CODES: Partial<Record<DueKind, string[]>> = {
  VAT_PAYMENT: ["2200"],
  PAYE_PAYMENT: ["2110", "2130", "2120", "2140"],
  WHT_PAYMENT: ["2180", "2185"],
  QPD_PAYMENT: ["2280"],
};

export async function readWhatsDue(db: Db, companyId: string, { from, to, tax = "all", q = "" }: { from?: string; to?: string; tax?: DueTax | "all"; q?: string } = {}, now = new Date()): Promise<DuePage> {
  const today = dayOf(now);
  const start = from ?? `${today.slice(0, 7)}-01`;
  const endMonth = new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)) + 2, 0));
  const end = to ?? storedDay(endMonth);
  const [items, settings, baseCurrency, returns, payments] = await Promise.all([
    whatsDue(companyId, new Date(`${start}T00:00:00.000Z`), new Date(`${end}T00:00:00.000Z`), db),
    taxSettings(companyId, db),
    resolveBaseCurrency(companyId),
    db.vatReturn.findMany({ where: { companyId, status: { not: "VOIDED" } }, select: { periodStart: true, periodEnd: true, status: true, filedAt: true, referenceNumber: true, netTax: true } }),
    taxPayments(db, companyId, new Date(Date.UTC(Number(start.slice(0, 4)) - 1, 0, 1))),
  ]);
  const used = new Set<number>();
  const rows: DueRow[] = items.map((item) => {
    const periodEnd = item.period?.end ?? null;
    const ret = item.period ? returns.find((row) => storedDay(row.periodStart) === item.period!.start && storedDay(row.periodEnd) === item.period!.end) : null;
    const so = periodEnd && periodEnd >= today ? ", so far" : "";
    const period = item.period ? `${monthName(item.period.end)}${so}` : item.kind === "ITF12C" ? `${Number(item.date.slice(0, 4)) - 1}` : `${item.date.slice(0, 4)}${item.amount ? "" : ", no estimate yet"}`;
    let state: DueRow["state"] = item.date < today ? "Overdue" : "Due";
    let settledBy = "A payment to ZIMRA";
    if (item.kind === "VAT_RETURN") {
      settledBy = ret ? (ret.status === "FILED" ? `TaRMS${ret.filedAt ? `, ${shortDay(storedDay(ret.filedAt))}` : ""}` : "Draft return") : "No return yet";
      if (ret?.status === "FILED") state = "Filed";
      else if (ret?.status === "DRAFT") state = "Draft";
      else if (ret?.status === "REVIEWED") state = "Reviewed";
      else if (ret?.status === "FINALIZED") state = "Finalised";
    } else if (item.kind === "PAYE_RETURN" || item.kind === "WHT_RETURN" || item.kind === "QPD_RETURN" || item.kind === "ITF12C") {
      settledBy = item.kind === "PAYE_RETURN" ? "The pay run’s return" : item.kind === "WHT_RETURN" ? "The withholding return" : item.kind === "ITF12C" ? "Your accountant, in TaRMS" : "In TaRMS";
    } else {
      const codes = CODES[item.kind] ?? [];
      const after = periodEnd ?? `${item.date.slice(0, 4)}-01-01`;
      const paid = payments.findIndex((row, index) => !used.has(index) && codes.includes(row.code) && row.date > after && row.date <= storedDay(new Date(new Date(`${item.date}T00:00:00Z`).getTime() + 45 * 86_400_000)));
      if (paid >= 0) {
        used.add(paid);
        state = "Paid";
        settledBy = `${payments[paid].number}, ${shortDay(payments[paid].date)}`;
      } else if (item.kind === "VAT_PAYMENT") {
        settledBy = ret?.status === "FILED" ? "A payment to ZIMRA" : "When the return is filed";
      }
    }
    const confirmKey = item.toConfirm ? settings.toConfirm.find((row) => (item.kind.startsWith("VAT") ? row.key.startsWith("vat.") : item.kind.startsWith("QPD") ? row.key.startsWith("provisional.") : false)) : null;
    const weekend = [0, 6].includes(new Date(`${item.date}T00:00:00Z`).getUTCDay()) ? ` · a ${new Date(`${item.date}T00:00:00Z`).getUTCDay() === 0 ? "Sunday" : "Saturday"}` : "";
    return {
      date: item.date,
      day: weekdayDay(item.date),
      kind: item.kind,
      tax: DUE_TAX_OF[item.kind],
      what: dueWhat(item),
      period: `${period}${weekend}`,
      amount: item.amount,
      settledBy,
      state,
      toConfirm: item.toConfirm,
      why: confirmKey?.why ?? null,
    };
  });
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((row) => (tax === "all" || row.tax === tax) && (!needle || `${row.what} ${row.period}`.toLowerCase().includes(needle)));
  const months = [...new Set(shown.map((row) => row.date.slice(0, 7)))];
  const groups = months.map((month) => {
    const list = shown.filter((row) => row.date.slice(0, 7) === month);
    const done = list.filter((row) => row.state === "Paid" || row.state === "Filed").length;
    const due = list.length - done;
    return { month: monthName(`${month}-01`), note: due ? `${due} due` : `${done} done`, rows: list };
  });
  const open = shown.filter((row) => row.state !== "Paid" && row.state !== "Filed");
  const payable = (row: DueRow) => /^Pay|instalment/.test(row.what);
  const byMonth = new Map<string, number>();
  for (const row of open.filter(payable)) byMonth.set(row.date.slice(0, 7), round2((byMonth.get(row.date.slice(0, 7)) ?? 0) + (row.amount ?? 0)));
  const sums = [...byMonth.entries()].slice(0, 2).map(([month, value], index) => ({ label: index === 0 ? `To pay in ${monthName(`${month}-01`)}` : monthName(`${month}-01`), value }));
  const nextKey = [...byMonth.keys()][0] ?? today.slice(0, 7);
  const lastDue = open.at(-1)?.date ?? null;
  return {
    baseCurrency,
    finding: dueFinding(shown, today, baseCurrency),
    from: start,
    to: end,
    monthsWords: `${MONTH_SHORT[Number(start.slice(5, 7)) - 1]} to ${MONTH_SHORT[Number(end.slice(5, 7)) - 1]}`,
    tax,
    groups,
    count: shown.length,
    dueCount: open.length,
    sums,
    nextMonth: { name: monthName(`${nextKey}-01`), total: byMonth.get(nextKey) ?? 0 },
    lastDue: lastDue ? shortDay(lastDue) : null,
  };
}

