import type { PrismaClient } from "@prisma/client";

import { provisionalTax } from "@/lib/books/core/tax-calendar";
import { taxSettings } from "@/lib/books/core/tax-settings";
import { resolveBaseCurrency } from "@/lib/money";

import { dayOf, money, monthName, shortDay, storedDay, weekdayDay } from "./format";

/**
 * Books → Tax → Provisional tax (BkProvisionalTax): the year's estimate, its
 * four instalments (QPDs) with their dates and shares from the tax settings,
 * what the ledger says was paid against 2280 and which payment paid each.
 * Payment dates still to confirm say so.
 */

type Db = PrismaClient;

export type QpdRow = { number: number; name: string; date: string; share: number; amount: number | null; paidBy: string | null; state: "Paid" | "Due" | "Overdue" | "Part paid" | "No estimate"; toConfirm: boolean };

export type ProvisionalPage = {
  baseCurrency: string;
  year: number;
  years: number[];
  finding: { fact: string; rest: string | null };
  rows: QpdRow[];
  estimate: { taxUsd: number; incomeUsd: number | null; split5050: boolean; revisedAt: string | null; revisedBy: string | null } | null;
  paid: number;
  stillDue: number;
  toConfirm: boolean;
  why: string | null;
  /** The next instalment to pay, for Pay an instalment. */
  next: { name: string; amount: number } | null;
  rates: string;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const NAMES = ["1st", "2nd", "3rd", "4th"];

export async function readProvisional(db: Db, companyId: string, year: number, now = new Date()): Promise<ProvisionalPage> {
  const today = dayOf(now);
  const [qpd, settings, base, payments] = await Promise.all([
    provisionalTax(companyId, year, now, db),
    taxSettings(companyId, db),
    resolveBaseCurrency(companyId),
    db.journalLine.findMany({
      where: { debit: { gt: 0 }, account: { code: "2280" }, entry: { companyId, status: "POSTED", sourceType: "BANK_TRANSACTION", entryDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) }, reversedAt: null, voidedAt: null } },
      orderBy: { entry: { entryDate: "asc" } },
      select: { debit: true, entry: { select: { entryNumber: true, entryDate: true } } },
    }),
  ]);
  // Which payment paid which instalment: in order, as the core allocates them.
  const queue = payments.map((row) => ({ left: row.debit, label: `JE-${String(row.entry.entryNumber).padStart(4, "0")}, ${shortDay(storedDay(row.entry.entryDate))}` }));
  const why = settings.toConfirm.find((row) => row.key === "provisional.paymentDates")?.why ?? null;
  const rows: QpdRow[] = qpd.instalments.map((instalment, index) => {
    let need = instalment.paid;
    const by: string[] = [];
    while (need > 0.005 && queue.length) {
      const take = Math.min(queue[0].left, need);
      by.push(queue[0].label);
      queue[0].left = round2(queue[0].left - take);
      need = round2(need - take);
      if (queue[0].left <= 0.005) queue.shift();
    }
    const state: QpdRow["state"] = instalment.amount === null ? "No estimate" : instalment.outstanding <= 0.005 ? "Paid" : instalment.paid > 0 ? "Part paid" : instalment.paymentDue < today ? "Overdue" : "Due";
    return {
      number: instalment.number,
      name: `${NAMES[index]} instalment`,
      date: weekdayDay(instalment.paymentDue),
      share: instalment.share,
      amount: instalment.amount,
      paidBy: by.length ? by.join("; ") : null,
      state,
      toConfirm: qpd.toConfirm && state !== "Paid",
    };
  });
  const total = qpd.estimate?.taxUsd ?? 0;
  const stillDue = round2(Math.max(0, total - qpd.paid));
  const nextRow = qpd.instalments.find((instalment) => instalment.outstanding > 0.005);
  const last = qpd.instalments.at(-1);
  const fact = !qpd.estimate ? `No estimate for ${year} yet.` : `${money(qpd.paid, base)} of the year’s ${money(total, base)} is paid.`;
  const rest = !qpd.estimate
    ? "Revise the estimate to work out the four instalments."
    : nextRow
      ? `The ${nextRow === last ? "last" : NAMES[nextRow.number - 1]} instalment is due on ${Number(nextRow.paymentDue.slice(8))} ${monthName(nextRow.paymentDue)}.`
      : "Every instalment is paid.";
  const estimate = qpd.estimate
    ? { taxUsd: qpd.estimate.taxUsd, incomeUsd: qpd.estimate.incomeUsd ?? null, split5050: Boolean(qpd.estimate.split5050), revisedAt: qpd.estimate.revisedAt ? shortDay(qpd.estimate.revisedAt.slice(0, 10)) : null, revisedBy: qpd.estimate.revisedBy ?? null }
    : null;
  return {
    baseCurrency: base,
    year,
    years: [Number(today.slice(0, 4)), Number(today.slice(0, 4)) - 1],
    finding: { fact, rest },
    rows,
    estimate,
    paid: qpd.paid,
    stillDue,
    toConfirm: qpd.toConfirm,
    why,
    next: nextRow && nextRow.amount ? { name: `${NAMES[nextRow.number - 1]} instalment`, amount: nextRow.outstanding } : null,
    rates: "25%, and 3% AIDS levy",
  };
}
