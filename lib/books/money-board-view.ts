/**
 * Books → Money as the board draws it (design/core-modules/boards/view/BkMoney.html):
 * the shape the page renders, and the pure parts of reading it. No database here,
 * so the page's client code can import it.
 */
import { money, shortDay } from "./format";

/** How hard a Needs you row's button pulls: ink when money or a fine is held up today, plain when routine, quiet when it is only a look. */
export type Urgency = "urgent" | "routine" | "look";

export type MoneyNeed = {
  key: string;
  icon: string;
  lead: string;
  /** How many of it wait; 0 for a date. */
  count: number;
  detail: string;
  /** Who it is about (the people asking, the customer), their avatars before the detail. */
  people?: Array<{ name: string; image: string | null }>;
  urgency: Urgency;
  action: { label: string; icon: string; href: string };
};

export type MoneyShare = { key: string; icon: string; label: string; amount: number; share: number; bar: number };

export type MoneyAccountRow = { id: string; name: string; kind: string; currency: string; amount: number; /** In the base currency at today's rate; null when a rate is missing. */ inBase: number | null; reconciled: string | null };

/** One bucket of what is owed to you, by how late it is. */
export type MoneyAge = { key: string; label: string; amount: number; share: number };

/** One dated thing coming in or going out: positive is money in. */
export type MoneyUpcoming = { day: string; label: string; amount: number };

export type MoneyTaxTile = { label: string; value: string; note: string };

export type MoneyBoard = {
  currency: string;
  finding: { fact: string; rest: string | null };
  tax: MoneyTaxTile[];
  needs: MoneyNeed[];
  /** "1 to 18 October". */
  period: string;
  cameIn: { total: number; rows: MoneyShare[] };
  wentOut: { total: number; rows: MoneyShare[] };
  bank: {
    accounts: MoneyAccountRow[];
    /** The currencies the accounts are in, the base first: the table's money columns. */
    currencies: string[];
    totals: Record<string, number>;
    /** Every account in the base currency at today's rate; null when a rate is missing. */
    inBase: number | null;
    /** "ZWG at 27.00 to $1 (RBZ interbank, today 06:00)", when another currency is held. */
    rateNote: string | null;
  };
  owed: { total: number; notDue: number; overdue: number; onAccount: number };
  age: MoneyAge[];
  /** The next fortnight, in date order, and the day it runs to. */
  upcoming: { until: string; rows: MoneyUpcoming[] };
  owe: { total: number; suppliers: number; claims: number; vat: number; vatLabel: string };
};

const round = (n: number) => Math.round(n * 100) / 100;

/** "US$20,522.40 came in this month and US$6,716.86 went out. US$2,480.00 is overdue." */
export function moneyBoardFinding(cameIn: number, wentOut: number, overdue: number, currency: string): { fact: string; rest: string | null } {
  const fact =
    cameIn > 0 || wentOut > 0
      ? `${money(cameIn, currency)} came in this month and ${money(wentOut, currency)} went out.`
      : "Nothing has come in or gone out this month yet.";
  return { fact, rest: overdue > 0 ? `${money(overdue, currency)} is overdue.` : "Nothing is overdue." };
}

/** Each source's share of the whole, and its bar against the largest. */
export function shares(rows: Array<Omit<MoneyShare, "share" | "bar">>): MoneyShare[] {
  const total = rows.reduce((sum, row) => sum + Math.max(0, row.amount), 0);
  const largest = Math.max(0, ...rows.map((row) => row.amount));
  return rows.map((row) => ({
    ...row,
    amount: round(row.amount),
    share: total > 0 ? Math.round((Math.max(0, row.amount) / total) * 100) : 0,
    bar: largest > 0 ? (Math.max(0, row.amount) / largest) * 100 : 0,
  }));
}

/** The day a monthly tax is due in the month after `today`'s: "15 Nov". */
export function dueNextMonth(today: string, day: number): string {
  const [year, month] = today.split("-").map(Number);
  const next = new Date(Date.UTC(year, month, day));
  return shortDay(next.toISOString().slice(0, 10));
}

/** Zimbabwe's provisional tax (QPD) dates: 25 Mar, 25 Jun, 25 Sep, 20 Dec. The next one on or after today, and which it is. */
export function nextQpd(today: string): { day: string; ordinal: string } {
  const year = Number(today.slice(0, 4));
  const dates = [
    [`${year}-03-25`, "1st"],
    [`${year}-06-25`, "2nd"],
    [`${year}-09-25`, "3rd"],
    [`${year}-12-20`, "4th"],
    [`${year + 1}-03-25`, "1st"],
  ] as const;
  const [day, ordinal] = dates.find(([date]) => date >= today) ?? dates[4];
  return { day, ordinal };
}

/** The next tax date of the month: PAYE and withholding returns on the 5th, VAT on the 15th (books-final §3.3, What's due). */
export function nextTaxDate(today: string): { day: string; what: string } {
  const dayOfMonth = Number(today.slice(8, 10));
  const month = today.slice(0, 8);
  if (dayOfMonth <= 5) return { day: `${month}05`, what: "PAYE and withholding returns" };
  if (dayOfMonth <= 15) return { day: `${month}15`, what: "VAT return and payment" };
  const [year, m] = today.split("-").map(Number);
  const next = new Date(Date.UTC(year, m, 5)).toISOString().slice(0, 10);
  return { day: next, what: "PAYE and withholding returns" };
}


/** The age buckets of what is owed, with each one's share of the whole. */
export function ageBuckets(amounts: number[]): MoneyAge[] {
  const labels = ["Not due", "1 to 7 days", "8 to 30 days", "Over 30"];
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  return labels.map((label, index) => ({ key: `age-${index}`, label, amount: round(amounts[index] ?? 0), share: total > 0 ? Math.round(((amounts[index] ?? 0) / total) * 100) : 0 }));
}

/**
 * The finding: how the month stands, and the lowest the money accounts reach
 * across what is coming up. "Up US$8,139.90 this month. Cash stays above
 * US$7,985.93 to 3 Nov, lowest on 20 Oct."
 */
export function moneyFinding(net: number, low: { amount: number; day: string } | null, until: string, currency: string): { fact: string; rest: string | null } {
  const fact = net >= 0 ? `Up ${money(net, currency)} this month.` : `Down ${money(Math.abs(net), currency)} this month.`;
  if (!low) return { fact, rest: null };
  return { fact, rest: low.amount >= 0 ? `Cash stays above ${money(low.amount, currency)} to ${until}, lowest on ${low.day}.` : `Cash runs out by ${low.day}: ${money(low.amount, currency)}.` };
}

/** The running balance through the upcoming rows from `start`, and where it is lowest. */
export function lowestPoint(start: number, rows: MoneyUpcoming[]): { amount: number; day: string } | null {
  if (rows.length === 0) return null;
  let run = start;
  let low = { amount: start, day: shortDay(rows[0].day) };
  for (const row of rows) {
    run += row.amount;
    if (run < low.amount) low = { amount: round(run), day: shortDay(row.day) };
  }
  return { amount: round(low.amount), day: low.day };
}
