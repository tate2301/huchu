/**
 * Books → Money as the board draws it (design/books/html/bk-money.html): the
 * shape the page renders, and the pure parts of reading it. No database here,
 * so the page's client code can import it.
 */
import { money, shortDay } from "./format";

/** A "Needs you" row: what waits, how many, its amount or one fact, and its Books address. */
export type MoneyNeed = {
  key: "overdue" | "approve" | "bill-limit" | "bank" | "posting" | "fdms" | "itf263" | "cash" | "claims";
  label: string;
  count: number;
  /** The money waiting, when it is money. */
  amount: number | null;
  /** Otherwise one fact: an invoice number, a supplier, a reason. */
  fact: string | null;
  tone: "warn" | "bad" | null;
  href: string;
};

export type MoneyAccountKind = "BANK" | "MOBILE" | "CASH";

export type MoneyAccountRow = {
  id: string;
  name: string;
  kind: MoneyAccountKind;
  currency: string;
  /** "30 Sep", or null when it was never reconciled. */
  reconciled: string | null;
  /** In the base currency at today's rate; null when a rate is missing. */
  balance: number | null;
  /** In the account's own currency (the phone shows ZWG as ZWG). */
  native: number;
};

/** A dated line in Coming up: money due in (+) or out (−) on a day. */
export type MoneyUpcoming = { day: string; when: string; label: string; amount: number | null; state: string | null };

export type MoneyShare = { key: string; label: string; fact: string | null; amount: number };

export type MoneyBoard = {
  currency: string;
  finding: { fact: string; rest: string };
  needs: MoneyNeed[];
  bank: {
    total: number | null;
    accounts: MoneyAccountRow[];
    /** "ZWG at 26.80, RBZ interbank, today 06:00", when another currency is held. */
    rate: { code: string; rate: number; source: string; when: string } | null;
  };
  comingUp: {
    /** "20 Oct". */
    until: string;
    /** The last day of the coming week (`YYYY-MM-DD`): the phone's "This week". */
    weekEnd: string;
    lines: MoneyUpcoming[];
    /** The accounts that pay bills ("CBZ and EcoCash"), what they hold now and after every line lands. */
    payers: { names: string; now: number; after: number } | null;
  };
  /** "1 to 6 Oct". */
  period: string;
  cameIn: { total: number; rows: MoneyShare[] };
  wentOut: { total: number; rows: MoneyShare[] };
  owed: { total: number; overdue: number; ages: Array<{ label: string; amount: number }> };
  owe: { total: number; rows: Array<{ label: string; amount: number }> };
};

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * "$10,228.40 came in this month and $2,088.50 went out." then
 * "$5,724.22 is owed to you, $2,480.00 of it late. You owe $6,703.49."
 */
export function moneyBoardFinding(cameIn: number, wentOut: number, owed: number, late: number, youOwe: number, currency: string): MoneyBoard["finding"] {
  const fact = cameIn > 0 || wentOut > 0 ? `${money(cameIn, currency)} came in this month and ${money(wentOut, currency)} went out.` : "Nothing has come in or gone out this month yet.";
  const owedPart = owed > 0 ? `${money(owed, currency)} is owed to you${late > 0 ? `, ${money(late, currency)} of it late` : ", none of it late"}.` : "Nobody owes you anything.";
  const owePart = youOwe > 0 ? ` You owe ${money(youOwe, currency)}.` : " You owe nothing.";
  return { fact, rest: `${owedPart}${owePart}` };
}

/** "1 to 6 Oct", "1 Oct" on the first. */
export function shortMonthSoFar(today: string): string {
  const day = Number(today.slice(8, 10));
  return day === 1 ? shortDay(today) : `1 to ${shortDay(today)}`;
}

/** The age buckets the board draws: not due, 1 to 7 days, 8 to 30 days, over 30. */
export const MONEY_AGES = ["Not due", "1 to 7 days", "8 to 30 days", "Over 30"] as const;

export function moneyAge(daysOverdue: number): number {
  if (daysOverdue <= 0) return 0;
  if (daysOverdue <= 7) return 1;
  if (daysOverdue <= 30) return 2;
  return 3;
}

/** What the paying accounts hold once every line has landed. */
export function afterComingUp(now: number, lines: readonly MoneyUpcoming[]): number {
  return round(lines.reduce((sum, line) => sum + (line.amount ?? 0), now));
}

/** "CBZ and EcoCash", "CBZ, EcoCash and Steward". */
export function names(list: readonly string[]): string {
  const unique = [...new Set(list)];
  if (unique.length <= 1) return unique[0] ?? "";
  return `${unique.slice(0, -1).join(", ")} and ${unique.at(-1)}`;
}
