import { formatMoney } from "@/lib/workspace/format";

/**
 * Promotions' words (PRD-09), browser-safe: the kinds as the sheet's
 * segment and the list say them, a promotion's value, what it applies to,
 * the word for one of its units, and the code a name suggests.
 */

export type PromotionKind = "PERCENT" | "AMOUNT" | "BUY_X_PAY" | "FIXED_PRICE";
export type PromotionScope = "EVERYTHING" | "CATEGORIES" | "PRODUCTS";
export type PromotionAudience = "EVERYONE" | "LOYALTY_MEMBERS" | "STAFF";

/** The list's Type column. */
export const KIND_WORDS: Record<PromotionKind, string> = {
  PERCENT: "Percent off",
  AMOUNT: "Amount off",
  BUY_X_PAY: "Buy X, pay less",
  FIXED_PRICE: "Fixed price",
};

/** The sheet's Kind segment, in order. */
export const KIND_SEG: Array<[string, PromotionKind]> = [
  ["% off", "PERCENT"],
  ["Amount off", "AMOUNT"],
  ["Buy X, pay less", "BUY_X_PAY"],
  ["Bundle price", "FIXED_PRICE"],
];

export const SCOPE_SEG: Array<[string, PromotionScope]> = [
  ["Everything", "EVERYTHING"],
  ["Some categories", "CATEGORIES"],
  ["Some products", "PRODUCTS"],
];

export const AUDIENCE_SEG: Array<[string, PromotionAudience]> = [
  ["Everyone", "EVERYONE"],
  ["Loyalty members", "LOYALTY_MEMBERS"],
  ["Staff", "STAFF"],
];

export const AUDIENCE_WORDS: Record<PromotionAudience, string> = { EVERYONE: "Everyone", LOYALTY_MEMBERS: "Loyalty members", STAFF: "Staff" };

export const STACKS_WORDS = { yes: "With other promotions", no: "Not with other promotions" } as const;

/** "US$2.00", "10%", "2 for US$5.00", "US$24.00". */
export function valueWords(kind: PromotionKind, value: number, buyQuantity: number | null): string {
  if (kind === "PERCENT") return `${Number(value.toFixed(2))}%`;
  if (kind === "BUY_X_PAY") return `${buyQuantity ?? 2} for ${formatMoney(value)}`;
  return formatMoney(value);
}

const UNIT_WORDS: Array<[RegExp, string]> = [
  [/\bcan\b/i, "can"],
  [/\bbag\b|\d\s?kg\b/i, "bag"],
  [/\bcase\b/i, "case"],
  [/\d\s?ml\b|\d\s?l\b/i, "bottle"],
];

/** The word for one unit of these products ("bottle"), when they all share it; null otherwise. */
export function unitWordOf(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  const words = names.map((name) => UNIT_WORDS.find(([pattern]) => pattern.test(name))?.[1] ?? null);
  return words.every((word) => word !== null && word === words[0]) ? words[0]! : null;
}

/**
 * What it applies to. `long` for the record ("Spirits, 12 products"), short
 * for the list ("Spirits, 12"); "Staff, all items"; "1 product"; "Basket over US$20.00".
 */
export function appliesToWords(input: {
  scope: PromotionScope;
  audience: PromotionAudience;
  minBasket: number | null;
  categories: string[];
  products: number;
  long?: boolean;
}): string {
  const count = (n: number) => `${n} ${n === 1 ? "product" : "products"}`;
  if (input.scope === "CATEGORIES") {
    const names = input.categories.join(", ") || "No categories";
    return input.long ? `${names}, ${count(input.products)}` : `${names}, ${input.products}`;
  }
  if (input.scope === "PRODUCTS") return count(input.products);
  if (input.minBasket !== null) return `Basket over ${formatMoney(input.minBasket)}`;
  if (input.audience !== "EVERYONE") return `${AUDIENCE_WORDS[input.audience]}, all items`;
  return "All items";
}

/** The code a name suggests: "Month-end two for US$5 ciders" → "MONTH-END-TWO-FOR-US-5-CIDERS", at most 30. */
export function codeFromName(name: string): string {
  const code = name
    .toUpperCase()
    .replace(/[’']/g, "")
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "");
  return code.length >= 3 ? code : code ? `PROMO-${code}` : "";
}

export const CODE_PATTERN = /^[A-Z0-9-]{3,30}$/;
export const CODE_MESSAGE = "A code is 3 to 30 letters, figures and dashes.";

/** "Every day, all day", "Weekends, all day", "Mon, Fri, 17:00 to 19:00". */
const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export function daysWords(daysOfWeek: number[], fromTime: string | null, toTime: string | null): string {
  const sorted = [...daysOfWeek].sort();
  const days =
    sorted.length === 0 || sorted.length === 7
      ? "Every day"
      : sorted.join() === "6,7"
        ? "Weekends"
        : sorted.join() === "1,2,3,4,5"
          ? "Weekdays"
          : sorted.map((day) => WEEKDAY_SHORT[day - 1]).join(", ");
  const hours = fromTime && toTime ? `${fromTime} to ${toTime}` : "all day";
  return `${days}, ${hours}`;
}

/** The rail's Days segment. */
export const DAYS_SEG: Array<[string, number[]]> = [
  ["Every day", []],
  ["Weekdays", [1, 2, 3, 4, 5]],
  ["Weekends", [6, 7]],
];
