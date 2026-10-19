import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { taxSettings, type ResolvedTaxSettings, type TaxSettings } from "./tax-settings";
import { vatDueDates, vatPeriodFor } from "./vat-figures";

/**
 * Tax → What's due and Provisional tax (books-final §5.10.1, §5.11, the
 * research's calendar): every date ZIMRA expects something in a window, with
 * the amount where the books know it, and the year's four provisional tax
 * instalments against what has been paid. The dates come from the settings,
 * and each one the research FLAGged says "to confirm".
 */

type Db = PrismaClient | Prisma.TransactionClient;

export type DueKind = "VAT_RETURN" | "VAT_PAYMENT" | "PAYE_RETURN" | "PAYE_PAYMENT" | "WHT_RETURN" | "WHT_PAYMENT" | "QPD_RETURN" | "QPD_PAYMENT" | "ITF12C";

export type DueItem = {
  date: string;
  kind: DueKind;
  /** "VAT return for September 2026". */
  label: string;
  /** The period it is for, `YYYY-MM-DD` to `YYYY-MM-DD`. */
  period: { start: string; end: string } | null;
  /** What the books say is due, in the base currency; null when they cannot know yet. */
  amount: number | null;
  /** The date or amount rests on a value still to confirm. */
  toConfirm: boolean;
};

const iso = (date: Date) => date.toISOString().slice(0, 10);
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthWords = (date: Date) => `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
const periodWords = (start: Date, end: Date) =>
  start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear() ? monthWords(end) : `${MONTHS[start.getUTCMonth()]} to ${monthWords(end)}`;
const flagged = (settings: ResolvedTaxSettings, key: string) => settings.toConfirm.some((item) => item.key === key);

/** The instalments of a year, pure: dates from the settings, amounts from the estimate, the 50/50 split where it applies. */
export function provisionalInstalments(year: number, provisional: TaxSettings["provisional"]) {
  const estimate = provisional.estimates[String(year)] ?? null;
  let cumulative = 0;
  return provisional.shares.map((share, index) => {
    cumulative += share;
    const amount = estimate ? round2((estimate.taxUsd * share) / 100) : null;
    const foreign = estimate?.split5050 ? (estimate.foreignShare ?? 0.5) : null;
    return {
      number: index + 1,
      share,
      cumulativeShare: cumulative,
      returnDue: `${year}-${provisional.returnDates[index]}`,
      paymentDue: `${year}-${provisional.paymentDates[index]}`,
      amount,
      /** Under the 50/50 basis: the US dollar part and the ZiG part (in US dollars, paid in ZiG at the rate on the day). */
      split: amount !== null && foreign !== null ? { usd: round2(amount * foreign), zwgInUsd: round2(amount - round2(amount * foreign)) } : null,
    };
  });
}

/** Credits less debits on accounts in a window, from the ledger. */
async function movement(db: Db, companyId: string, codes: string[], from: Date, to: Date): Promise<number> {
  const [row] = await db.$queryRaw<Array<{ net: number }>>`
    SELECT COALESCE(SUM(l."credit" - l."debit"), 0)::float8 AS net
    FROM "JournalLine" l
    JOIN "JournalEntry" j ON j."id" = l."entryId" AND j."companyId" = ${companyId} AND j."status" = 'POSTED'
      AND j."entryDate" >= ${from} AND j."entryDate" < ${to} AND (j."sourceType" IS NULL OR j."sourceType" <> 'BANK_TRANSACTION')
    JOIN "ChartOfAccount" a ON a."id" = l."accountId" AND a."code" = ANY(${codes})`;
  return round2(row?.net ?? 0);
}

/**
 * The year's provisional tax (§5.11): the estimate, the four instalments and
 * their dates, and what the ledger says was paid (debits to 2280 Income tax
 * payable from tax payments), allocated to the instalments in order.
 */
export async function provisionalTax(companyId: string, year: number, today = new Date(), db: Db = prisma) {
  const settings = await taxSettings(companyId, db);
  const instalments = provisionalInstalments(year, settings.provisional);
  const [row] = await db.$queryRaw<Array<{ paid: number }>>`
    SELECT COALESCE(SUM(l."debit" - l."credit"), 0)::float8 AS paid
    FROM "JournalLine" l
    JOIN "JournalEntry" j ON j."id" = l."entryId" AND j."companyId" = ${companyId} AND j."status" = 'POSTED'
      AND j."entryDate" >= ${new Date(Date.UTC(year, 0, 1))} AND j."entryDate" < ${new Date(Date.UTC(year + 1, 0, 1))}
      AND j."sourceType" = 'BANK_TRANSACTION'
    JOIN "ChartOfAccount" a ON a."id" = l."accountId" AND a."code" = '2280'`;
  const paid = round2(row?.paid ?? 0);
  let left = paid;
  const todayIso = iso(today);
  const rows = instalments.map((instalment) => {
    const due = instalment.amount ?? 0;
    const covered = round2(Math.min(left, due));
    left = round2(left - covered);
    return { ...instalment, paid: covered, outstanding: round2(due - covered), overdue: instalment.paymentDue < todayIso && covered + 0.005 < due };
  });
  const dueToDate = round2(rows.filter((instalment) => instalment.paymentDue <= todayIso).reduce((sum, instalment) => sum + (instalment.amount ?? 0), 0));
  return {
    year,
    estimate: settings.provisional.estimates[String(year)] ?? null,
    instalments: rows,
    paid,
    dueToDate,
    shortToDate: round2(Math.max(0, dueToDate - paid)),
    toConfirm: flagged(settings, "provisional.paymentDates"),
  };
}

/**
 * What's due between two dates (§5.10.1): VAT returns (10th) and payments
 * (15th) for the workspace's category; PAYE and withholding returns (5th) and
 * payments (10th) for the month before; the QPDs; the annual return
 * (ITF12C, 30 April). Sorted by date.
 */
export async function whatsDue(companyId: string, from: Date, to: Date, db: Db = prisma): Promise<DueItem[]> {
  const settings = await taxSettings(companyId, db);
  const items: DueItem[] = [];
  const fromIso = iso(from);
  const toIso = iso(to);
  const inWindow = (date: string) => date >= fromIso && date <= toIso;

  // Every month whose dues can fall in the window: from the month before `from` to the month of `to`.
  const months: Date[] = [];
  for (let cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - 2, 1)); cursor <= to; cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))) {
    months.push(cursor);
  }

  // VAT: each period ending in one of those months.
  const vatReturns = await db.vatReturn.findMany({ where: { companyId, status: { not: "VOIDED" } }, select: { periodStart: true, periodEnd: true, netTax: true } });
  const seen = new Set<string>();
  for (const month of months) {
    const period = vatPeriodFor(month, settings.vat);
    const key = iso(period.end);
    if (seen.has(key)) continue;
    seen.add(key);
    const dues = vatDueDates(period.end, settings.vat);
    const filed = vatReturns.find((ret) => iso(ret.periodStart) === iso(period.start) && iso(ret.periodEnd) === iso(period.end));
    const span = { start: iso(period.start), end: iso(period.end) };
    const words = periodWords(period.start, period.end);
    if (inWindow(dues.returnDue)) items.push({ date: dues.returnDue, kind: "VAT_RETURN", label: `VAT return for ${words}`, period: span, amount: filed ? round2(filed.netTax) : null, toConfirm: flagged(settings, "vat.returnDay") });
    if (inWindow(dues.paymentDue)) items.push({ date: dues.paymentDue, kind: "VAT_PAYMENT", label: `VAT for ${words}`, period: span, amount: filed ? round2(filed.netTax) : null, toConfirm: flagged(settings, "vat.paymentDay") });
  }

  // PAYE and withholding: the month before, from the ledger.
  for (const month of months) {
    const start = month;
    const end = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
    const span = { start: iso(start), end: iso(new Date(end.getTime() - 86_400_000)) };
    const words = monthWords(start);
    const y = start.getUTCFullYear();
    const m = start.getUTCMonth() + 1;
    const day = (n: number) => iso(new Date(Date.UTC(y, m, n)));
    const [paye, wht] = await Promise.all([movement(db, companyId, ["2110", "2130"], start, end), movement(db, companyId, ["2180", "2185"], start, end)]);
    if (paye !== 0) {
      if (inWindow(day(settings.paye.returnDay))) items.push({ date: day(settings.paye.returnDay), kind: "PAYE_RETURN", label: `PAYE return for ${words}`, period: span, amount: paye, toConfirm: false });
      if (inWindow(day(settings.paye.paymentDay))) items.push({ date: day(settings.paye.paymentDay), kind: "PAYE_PAYMENT", label: `PAYE for ${words}`, period: span, amount: paye, toConfirm: false });
    }
    if (wht !== 0) {
      if (inWindow(day(settings.withholding.returnDay))) items.push({ date: day(settings.withholding.returnDay), kind: "WHT_RETURN", label: `Withholding tax return for ${words}`, period: span, amount: wht, toConfirm: false });
      if (inWindow(day(settings.withholding.paymentDay))) items.push({ date: day(settings.withholding.paymentDay), kind: "WHT_PAYMENT", label: `Withholding tax for ${words}`, period: span, amount: wht, toConfirm: false });
    }
  }

  // QPDs and the annual return, for every year the window touches.
  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear(); year++) {
    for (const instalment of provisionalInstalments(year, settings.provisional)) {
      const ordinal = ["First", "Second", "Third", "Fourth"][instalment.number - 1];
      if (inWindow(instalment.returnDue)) items.push({ date: instalment.returnDue, kind: "QPD_RETURN", label: `${ordinal} QPD return for ${year}`, period: null, amount: instalment.amount, toConfirm: false });
      if (inWindow(instalment.paymentDue)) items.push({ date: instalment.paymentDue, kind: "QPD_PAYMENT", label: `${ordinal} QPD for ${year} (${instalment.share}%)`, period: null, amount: instalment.amount, toConfirm: flagged(settings, "provisional.paymentDates") });
    }
    const itf12c = `${year}-04-30`;
    if (inWindow(itf12c)) items.push({ date: itf12c, kind: "ITF12C", label: `Income tax return (ITF12C) for ${year - 1}`, period: null, amount: null, toConfirm: false });
  }

  return items.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
}
