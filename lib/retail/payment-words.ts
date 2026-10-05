import { formatDay, formatTime } from "@/lib/workspace/format";

/**
 * Payments in words (SET-05, board PaymentsSettings): the tenders a shop can
 * take, in the order the till lists them, and how the ZiG rate and its change
 * rule read. Browser-safe: the Payments page, the till and the server share it.
 */

export type TenderKey =
  | "cashUsd"
  | "cashZig"
  | "card"
  | "ecocash"
  | "innbucks"
  | "bankTransfer"
  | "onAccount"
  | "vouchers";

export type TenderCurrency = "USD" | "ZWG";

export type TenderOption = {
  key: TenderKey;
  /** The stored `RetailTenderType`. */
  tender: "CASH" | "CARD" | "ECOCASH" | "INNBUCKS" | "TRANSFER" | "ON_ACCOUNT" | "VOUCHER";
  /** Cash is told apart by its currency; every other tender is in the sale's. */
  currency: TenderCurrency | null;
  /** "Cash, US dollars": the Payments page's toggle. */
  label: string;
  /** "Cash US$": the till's tender button. */
  tillLabel: string;
};

/** A tender as the till lists it (`devices/me`): what it sends, and its button's words. */
export type TillTender = { tender: TenderOption["tender"]; currency: TenderCurrency | null; label: string };

/** Every tender, in the board's order — the order the till's payment screen shows them. */
export const TENDER_OPTIONS: readonly TenderOption[] = [
  { key: "cashUsd", tender: "CASH", currency: "USD", label: "Cash, US dollars", tillLabel: "Cash US$" },
  { key: "cashZig", tender: "CASH", currency: "ZWG", label: "Cash, ZiG", tillLabel: "Cash ZiG" },
  { key: "card", tender: "CARD", currency: null, label: "Card", tillLabel: "Card" },
  { key: "ecocash", tender: "ECOCASH", currency: null, label: "EcoCash", tillLabel: "EcoCash" },
  { key: "innbucks", tender: "INNBUCKS", currency: null, label: "InnBucks", tillLabel: "InnBucks" },
  { key: "bankTransfer", tender: "TRANSFER", currency: null, label: "Bank transfer", tillLabel: "Bank transfer" },
  { key: "onAccount", tender: "ON_ACCOUNT", currency: null, label: "On account", tillLabel: "On account" },
  { key: "vouchers", tender: "VOUCHER", currency: null, label: "Vouchers", tillLabel: "Voucher" },
];

/**
 * Which of the page's tenders a payment is: cash by its currency (anything
 * not ZiG is the US dollar drawer), every other tender by its type.
 */
export function tenderKeyOf(tender: string, currency: string | null | undefined): TenderKey | null {
  if (tender === "CASH") return (currency ?? "").toUpperCase() === "ZWG" ? "cashZig" : "cashUsd";
  return TENDER_OPTIONS.find((option) => option.tender === tender)?.key ?? null;
}

/** "Round ZiG change to": the stored step and its words. */
export const ZIG_ROUNDING = [
  { step: "0.50", label: "Nearest 0.50" },
  { step: "1", label: "Nearest 1" },
  { step: "5", label: "Nearest 5" },
] as const;

export type ZigRoundingStep = (typeof ZIG_ROUNDING)[number]["step"];

/** "0.5" or "0.50" → "0.50"; "1.00" → "1". Anything else is null. */
export function roundingStep(value: string | number): ZigRoundingStep | null {
  const n = Number(value);
  return ZIG_ROUNDING.find((option) => Number(option.step) === n)?.step ?? null;
}

/** "Updated": by hand, or the RBZ's daily rate. */
export const RATE_BY_HAND = "By hand";
export const RATE_RBZ_DAILY = "Daily, RBZ rate";

/** 26.8 → "26.80", 26.8125 → "26.8125": two decimals at least, four at most. */
export function formatZigRate(value: number | string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  const four = n.toFixed(4);
  const trimmed = four.replace(/0{1,2}$/, "");
  return trimmed.endsWith(".") ? n.toFixed(2) : trimmed;
}

/** A rate as typed: more than nothing, at most 100000, at most four decimals. */
export function zigRateProblem(text: string): string | null {
  const value = text.trim();
  if (!/^\d+(\.\d{1,4})?$/.test(value)) return "Write the rate as a number, up to four decimals.";
  const n = Number(value);
  if (n <= 0) return "The rate must be more than nothing.";
  if (n > 100000) return "That rate is too high. Check it.";
  return null;
}

/** Hour 0–23 on the shop's clock. */
function hourOf(at: Date): number {
  return Number(formatTime(at).slice(0, 2));
}

function sameDay(a: Date, b: Date): boolean {
  return formatDay(a) === formatDay(b);
}

/** "2 October" this year, "2 October 2025" before it. */
function dayWithoutThisYear(at: Date, now: Date): string {
  const day = formatDay(at);
  const year = formatDay(now).split(" ").pop()!;
  return day.endsWith(` ${year}`) ? day.slice(0, -(year.length + 1)) : day;
}

/**
 * The hint under the rate: "Set this morning at 07:30 by Tendai Mhlanga."
 * (afternoon, "today" in the evening, "on 2 October" before today). A rate
 * the RBZ feed brought is "by the RBZ".
 */
export function rateSetHint(setAt: string | null, setBy: string | null, now: Date): string {
  if (!setAt) return "No rate set yet.";
  const at = new Date(setAt);
  const when = sameDay(at, now)
    ? hourOf(at) < 12
      ? "this morning"
      : hourOf(at) < 17
        ? "this afternoon"
        : "today"
    : `on ${dayWithoutThisYear(at, now)}`;
  return `Set ${when} at ${formatTime(at)} by ${setBy ?? "the RBZ"}.`;
}

/** The save bar's line when the rate's change is the latest: "Rate changed by Tafara Nyathi today at 07:30." */
export function rateChangedLine(by: string, at: string, now: Date): string {
  const when = new Date(at);
  return sameDay(when, now)
    ? `Rate changed by ${by} today at ${formatTime(when)}.`
    : `Rate changed by ${by}, ${dayWithoutThisYear(when, now)}.`;
}

/** "0921 774", "HARARE BOTTLE": EcoCash's merchant code and the name customers see. */
export function merchantCodeProblem(text: string): string | null {
  const value = text.trim();
  if (value === "") return null;
  if (!/^[0-9 ]+$/.test(value)) return "Use digits and spaces only.";
  if (value.length > 20) return "Keep it to 20 characters.";
  return null;
}

/**
 * The ZiG part of change a cashier hands back (W-05): change is given in US
 * dollars, then ZiG for anything under US$1, the ZiG rounded to the shop's
 * step. 3.40 change at 26.80, nearest 1 → US$3 and ZiG 11.
 */
export function splitChange(
  change: number,
  zig: { rate: number; rounding: string } | null,
): { usd: number; zig: number } {
  if (!zig || !(zig.rate > 0) || change <= 0) return { usd: Math.max(change, 0), zig: 0 };
  const usd = Math.floor(change + 1e-9);
  const step = Number(zig.rounding) > 0 ? Number(zig.rounding) : 1;
  const zigAmount = Math.round(((change - usd) * zig.rate) / step) * step;
  return { usd, zig: Number(zigAmount.toFixed(2)) };
}
