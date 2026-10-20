import type { PrismaClient } from "@prisma/client";

import { revaluationPlan, type RevaluationPlan } from "@/lib/books/core/revaluation";
import { resolveBaseCurrency } from "@/lib/money";

import { asOf, dayOf, monthName, shortDay, storedDay, weekdayDay } from "./format";
import type { RatesTab } from "./rates-labels";

/**
 * Books → Close the month → Rates & revaluation (BkRates): every rate the
 * documents freeze, its source and who typed it; the month-end revaluation of
 * balances in other currencies (`revaluationPlan`), posted on the last day and
 * reversed on the 1st, and reversed by hand when it was run at a wrong rate.
 */

type Db = PrismaClient;

export type RateRow = { id: string; date: string; rate: number; currency: string; source: "RBZ" | "MANUAL"; time: string; by: string | null; monthEnd: boolean };

export type RevalRow = { month: string; label: string; gain: number; posted: string | null; reverses: string; entry: string | null; state: "Posted" | "Not posted" | "Void" };

export type RatesPage = {
  baseCurrency: string;
  tab: RatesTab;
  currency: string;
  currencies: string[];
  finding: { fact: string; rest: string | null };
  rows: RateRow[];
  range: { from: number; to: number; of: number; page: number };
  todayRate: number | null;
  revaluations: RevalRow[];
  /** The month due to be revalued, or the one asked for. */
  plan: (RevaluationPlan & { label: string; posted: { entry: string; date: string } | null; reverses: string; monthEndRate: number | null }) | null;
};

const PAGE = 30;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export async function readRates(db: Db, companyId: string, { tab = "rates", currency = "ZWG", page = 1, month = null }: { tab?: RatesTab; currency?: string; page?: number; month?: string | null } = {}, now = new Date()): Promise<RatesPage> {
  const base = (await resolveBaseCurrency(companyId)).toUpperCase();
  const today = dayOf(now);
  const where = { companyId, baseCurrency: base, quoteCurrency: currency };
  const [total, rates, codes, todays, entries] = await Promise.all([
    db.currencyRate.count({ where }),
    db.currencyRate.findMany({ where, orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }], skip: (Math.max(1, page) - 1) * PAGE, take: PAGE, select: { id: true, rate: true, effectiveDate: true, createdAt: true, source: true, quoteCurrency: true, createdBy: { select: { name: true } } } }),
    db.currencyRate.findMany({ where: { companyId, baseCurrency: base }, distinct: ["quoteCurrency"], select: { quoteCurrency: true } }),
    db.currencyRate.findFirst({ where: { ...where, effectiveDate: { lte: new Date(`${today}T23:59:59.999Z`) } }, orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }], select: { rate: true, effectiveDate: true, source: true, createdAt: true } }),
    db.journalEntry.findMany({ where: { companyId, sourceType: "FX_REVALUATION", sourceId: { startsWith: "reval:" } }, orderBy: { entryDate: "desc" }, select: { id: true, entryNumber: true, entryDate: true, sourceId: true, voidedAt: true, lines: { select: { debit: true, credit: true, account: { select: { code: true } } } } } }),
  ]);
  const rows: RateRow[] = rates.map((row) => {
    const day = storedDay(row.effectiveDate);
    const last = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0)).toISOString().slice(0, 10);
    return { id: row.id, date: weekdayDay(day), rate: row.rate, currency: row.quoteCurrency, source: row.source === "RBZ" ? "RBZ" : "MANUAL", time: asOf(row.createdAt, now).replace(/^(Today|Yesterday|\d+ \w+) /, ""), by: row.createdBy?.name ?? null, monthEnd: day === last };
  });
  // Revaluations by month: the entry on the last day, its gain on 4220 (credit is a gain).
  const byMonth = new Map<string, RevalRow>();
  for (const entry of entries) {
    const key = entry.sourceId!.slice("reval:".length, "reval:".length + 7);
    if (entry.sourceId!.includes(":reverse") || entry.sourceId!.includes(":void:")) continue;
    const fx = entry.lines.filter((line) => line.account.code === "4220").reduce((sum, line) => sum + line.credit - line.debit, 0);
    const voided = Boolean(entry.voidedAt);
    if (byMonth.has(key) && voided) continue;
    const [y, m] = key.split("-").map(Number);
    byMonth.set(key, {
      month: key,
      label: `${monthName(`${key}-01`)} ${y}`,
      gain: round2(fx),
      posted: shortDay(storedDay(entry.entryDate)),
      reverses: shortDay(new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)),
      entry: `JE-${String(entry.entryNumber).padStart(4, "0")}`,
      state: voided ? "Void" : "Posted",
    });
  }
  // The month due: the one asked for, else last month.
  const due = month ?? new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  let plan: RatesPage["plan"] = null;
  try {
    const raw = await revaluationPlan(companyId, due);
    const posted = byMonth.get(due);
    const [y, m] = due.split("-").map(Number);
    plan = {
      ...raw,
      label: monthName(`${due}-01`),
      posted: posted && posted.state === "Posted" ? { entry: posted.entry!, date: posted.posted! } : null,
      reverses: shortDay(new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)),
      monthEndRate: raw.rates[currency] ?? null,
    };
  } catch {
    plan = null;
  }
  const todayRate = todays?.rate ?? null;
  const code = currency;
  const fact = todays
    ? `Today’s documents use ${todays.rate.toFixed(2)}${storedDay(todays.effectiveDate) === today ? `, ${todays.source === "RBZ" ? "RBZ’s rate" : "the rate typed in"} at ${asOf(todays.createdAt, now).replace(/^Today /, "")}.` : `, the rate of ${shortDay(storedDay(todays.effectiveDate))}: there is none for today.`}`
    : `There is no ${code} rate yet.`;
  return {
    baseCurrency: base,
    tab,
    currency,
    currencies: [...new Set(["ZWG", ...codes.map((row) => row.quoteCurrency)])],
    finding: { fact, rest: todays ? "Each document keeps the rate of its own day." : `Enter one before a document in ${code} is made.` },
    rows,
    range: { from: total === 0 ? 0 : (Math.max(1, page) - 1) * PAGE + 1, to: Math.min(total, Math.max(1, page) * PAGE), of: total, page: Math.max(1, page) },
    todayRate,
    revaluations: [...byMonth.values()],
    plan,
  };
}

