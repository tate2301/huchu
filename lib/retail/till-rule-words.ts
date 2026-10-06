/**
 * Till rules in words (SET-06, board TillRules): how the page writes each
 * rule, how what is typed there is read back, and the sentences the till and
 * the server answer with. Browser-safe; the stored rules are
 * `lib/retail/till-rules.ts`.
 */

export type VoidPinRule = "ALWAYS" | "AFTER_5_MINUTES" | "NEVER";

/** "Voids need a manager PIN": the segment's labels, in the board's order. */
export const VOID_PIN_WORDS: Record<VoidPinRule, string> = {
  ALWAYS: "Always",
  AFTER_5_MINUTES: "After 5 minutes",
  NEVER: "Never",
};

export const VOID_PIN_LABELS = Object.values(VOID_PIN_WORDS) as [string, ...string[]];

export function voidPinRuleOf(label: string): VoidPinRule | null {
  const entry = (Object.entries(VOID_PIN_WORDS) as Array<[VoidPinRule, string]>).find(([, words]) => words === label);
  return entry?.[0] ?? null;
}

/** How long "After 5 minutes" waits before a void needs a PIN. */
export const VOID_FREE_MS = 5 * 60 * 1000;

/** The tenders "Card and EcoCash need a reference" covers. */
export const REFERENCE_TENDERS = ["CARD", "ECOCASH", "INNBUCKS"] as const;
export const MIN_REFERENCE_LENGTH = 4;

export const REASON_MAX_LENGTH = 40;
/** The longest a till may keep selling offline (W-64: 1–72 hours). */
export const OFFLINE_HOURS_MAX = 72;
/** The highest refund PIN limit and cash-drop prompt the page takes (W-64). */
export const REFUND_PIN_OVER_MAX = 100_000;
export const CASH_DROP_PROMPT_MAX = 1_000_000;
/** W-64: 1–20 reasons in each list. */
export const REASONS_MAX = 20;

/** "10%". */
export function percentWords(value: string | number): string {
  return `${trimNumber(value)}%`;
}

/** "24 hours", "1 hour". */
export function hoursWords(hours: number): string {
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

function trimNumber(value: string | number): string {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? String(Number(number.toFixed(2))) : String(value);
}

/** "10", "10%", "12.5 %" → 12.5; anything else null. */
export function parsePercent(text: string): number | null {
  const match = /^\s*(\d{1,3}(?:\.\d{1,2})?)\s*%?\s*$/.exec(text);
  return match ? Number(match[1]) : null;
}

/** "24", "24 hours", "1 hour", "48h" → whole hours; anything else null. */
export function parseHours(text: string): number | null {
  const match = /^\s*(\d{1,3})\s*(?:h|hr|hrs|hour|hours)?\s*$/i.exec(text);
  return match ? Number(match[1]) : null;
}

/** The sentence under "Largest discount a cashier can give" when it cannot be read. */
export function discountProblem(text: string): string | null {
  const value = parsePercent(text);
  if (value === null) return "Type a percentage, like 10%.";
  if (value > 100) return "A discount cannot be more than 100%.";
  return null;
}

export function offlineHoursProblem(text: string): string | null {
  const value = parseHours(text);
  if (value === null) return "Type a number of hours, like 24 hours.";
  if (value < 1) return "Allow at least 1 hour.";
  if (value > OFFLINE_HOURS_MAX) return `Keep it to ${OFFLINE_HOURS_MAX} hours or less.`;
  return null;
}

/** A reason list as typed: trimmed, no blanks. Repeats are refused by `reasonsProblem`, not dropped. */
export function cleanReasons(reasons: string[]): string[] {
  return reasons.map((reason) => reason.trim().replace(/\s+/g, " ")).filter(Boolean);
}

/** A list's reasons are unique case-blind: a second "changed mind" is refused, not dropped without a word. */
export const REASON_REPEATED = "That reason is already on the list.";

export function reasonsProblem(reasons: string[]): string | null {
  if (reasons.length === 0) return "Keep at least one reason.";
  if (reasons.length > REASONS_MAX) return `Keep it to ${REASONS_MAX} reasons.`;
  if (reasons.some((reason) => reason.length > REASON_MAX_LENGTH)) {
    return `Keep each reason to ${REASON_MAX_LENGTH} characters.`;
  }
  if (new Set(reasons.map((reason) => reason.toLowerCase())).size !== reasons.length) return REASON_REPEATED;
  return null;
}

/* ── What the till and the server answer with ─────────────────────────────── */

/** "Refunds over US$20.00 need a manager PIN.", in the shop's base currency. */
export function refundPinSentence(limit: string, currency = "US$"): string {
  return `Refunds over ${currency}${limit} need a manager PIN.`;
}

export function voidPinSentence(rule: VoidPinRule): string {
  return rule === "AFTER_5_MINUTES"
    ? "Voids after 5 minutes need a manager PIN."
    : "Voids need a manager PIN.";
}

/** "Discounts over 10% need a manager PIN." */
export function discountPinSentence(limitPercent: string | number): string {
  return `Discounts over ${percentWords(limitPercent)} need a manager PIN.`;
}

export const PRICE_UP_SENTENCE = "A price above the shelf price needs a manager PIN.";
export const DRAWER_PIN_SENTENCE = "Opening the drawer without a sale needs a manager PIN.";
export const REASON_NOT_LISTED = "Pick a reason from the list.";
export const ONE_TENDER_SENTENCE = "This shop takes one tender per sale. Split payments are off in Till rules.";

/** "Card needs its slip or confirmation number, 4 characters or more." */
export function referenceSentence(tenderLabel: string): string {
  return `${tenderLabel} needs its slip or confirmation number, ${MIN_REFERENCE_LENGTH} characters or more.`;
}

/** The review line on a sale sent in from a till offline longer than the rules allow (W-64's copy). */
export const OFFLINE_TOO_LONG_SENTENCE = "Sold offline longer than the till rules allow";

/** The review line on an offline refund or void the rules wanted a manager for, sent in without one. */
export function offlineReversalReview(kind: "refund" | "void", reason: string): string {
  return `${kind === "refund" ? "Refunded" : "Voided"} offline without the manager PIN it needed. ${reason}`;
}

/** The review line on a refund or void sent in late whose reason was taken off the list since. */
export const REASON_UNLISTED_REVIEW = "Reason no longer on the list.";

/**
 * The review line on a refund or void sent in late that the till dated before
 * the sale it reverses or before its shift opened: that date cannot be true,
 * so it goes in at the time it arrived.
 */
export const REPLAY_MISDATED_REVIEW = "Dated before its sale or its shift; entered when it arrived.";

/**
 * The review line on a sale, refund or void sent in late that the till dated
 * after it reached the server: the till's clock runs ahead, so it goes in at
 * the time it arrived (SET-08), and no receipt is dated in the future.
 */
export const REPLAY_AHEAD_REVIEW = "Dated after it reached the server, so the till's clock runs ahead; entered when it arrived.";

/** The review line on a card, EcoCash or InnBucks refund sent in late without its reference. */
export const OFFLINE_REFUND_NO_REFERENCE_REVIEW = "Refunded offline without a reference.";

/** The review line on an offline sale whose discount or price needed a manager the till could not ask. */
export function offlineDiscountReview(reason: string, limitPercent: string | number): string {
  return reason === PRICE_UP_SENTENCE
    ? "Sold above the shelf price while offline."
    : `Discount over ${percentWords(limitPercent)} given while offline.`;
}
