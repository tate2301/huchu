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
  // Before five is not yet the morning: a rate set at 00:52 was set "today".
  const hour = hourOf(at);
  const when = sameDay(at, now)
    ? hour >= 5 && hour < 12
      ? "this morning"
      : hour >= 12 && hour < 17
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

/** "0771 234 567", "+263 77 123 4567": the shop's EcoCash number, loosely — digits, spaces, a leading +. */
export function phoneProblem(text: string): string | null {
  const value = text.trim();
  if (value === "") return null;
  if (!/^\+?[0-9 ]+$/.test(value)) return "Use digits and spaces, and + at the start.";
  const digits = value.replace(/\D/g, "").length;
  if (digits < 9 || digits > 15) return "A phone number has 9 to 15 digits.";
  return null;
}

/** "Customers pay by": how a shop takes EcoCash (`RetailEcocashMethod`). */
export type EcocashMethod = "MERCHANT_CODE" | "PHONE_NUMBER" | "TERMINAL";

/** The stored way and its words on the Payments page, in the segmented field's order. */
export const ECOCASH_METHOD_WORDS: Record<EcocashMethod, string> = {
  MERCHANT_CODE: "Merchant code",
  PHONE_NUMBER: "Phone number",
  TERMINAL: "Terminal",
};

export const ECOCASH_METHOD_LABELS = ["Merchant code", "Phone number", "Terminal"] as const;

export function ecocashMethodOf(label: string): EcocashMethod | null {
  const found = (Object.entries(ECOCASH_METHOD_WORDS) as Array<[EcocashMethod, string]>).find(([, words]) => words === label);
  return found ? found[0] : null;
}

/**
 * How the till tells a customer to pay by EcoCash (`devices/me`): the shop's
 * merchant code, the number to send money to, or the terminal at the counter
 * (nothing to say but the amount). `name` is what EcoCash shows the customer.
 */
export type TillEcocash = {
  method: EcocashMethod;
  merchantCode: string | null;
  phone: string | null;
  name: string | null;
};

/** Change as it is handed back: whole US dollars, the ZiG notes, and what they are worth in US dollars. */
export type ChangeSplit = { usd: number; zig: number; value: number };

/**
 * The change a cashier hands back (W-05), worked out the same way at the till
 * and on the server: whole US dollars first, then ZiG for what is under US$1,
 * the ZiG rounded to the shop's nearest step. `value` is what that comes to in
 * US dollars, so the sale records what left the drawer, not what was owed:
 * 3.40 owed at 26.80, nearest 1 → US$3 and ZiG 11, worth US$3.41. With no
 * ZiG rule (the shop takes no ZiG, or has no rate) it is all US dollars.
 */
export function splitChange(change: number, zig: { rate: number; rounding: string } | null): ChangeSplit {
  const cents = Math.max(Math.round(change * 100), 0);
  if (!zig || !(zig.rate > 0) || cents === 0) return { usd: cents / 100, zig: 0, value: cents / 100 };
  const usd = Math.floor(cents / 100);
  const step = Number(zig.rounding) > 0 ? Number(zig.rounding) : 1;
  const owedInZig = ((cents - usd * 100) / 100) * zig.rate;
  const zigAmount = Number((Math.round(owedInZig / step + 1e-9) * step).toFixed(2));
  const value = Number((usd + Math.round((zigAmount / zig.rate) * 100) / 100).toFixed(2));
  return { usd, zig: zigAmount, value };
}

/** ZiG 11, ZiG 10.50: whole ZiG without decimals. */
export function zigWords(amount: number): string {
  return `ZiG ${Number.isInteger(amount) ? String(amount) : amount.toFixed(2)}`;
}

/** The till's change pill: "Change US$3.00 and ZiG 11", or "Change US$3.40" with no ZiG part. */
export function changeWords(change: Pick<ChangeSplit, "usd" | "zig">): string {
  const usd = `US$${change.usd.toFixed(2)}`;
  return change.zig > 0 ? `Change ${usd} and ${zigWords(change.zig)}` : `Change ${usd}`;
}
