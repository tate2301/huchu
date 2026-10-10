/**
 * Bundles' words (PRD-08), browser-safe: the kinds, the days they sell,
 * "Until", and what a bundle is made of as the list reads it.
 */

export type BundleKindWord = "FIXED_SET" | "BUY_MORE";
export type OnSaleDaysWord = "EVERY_DAY" | "WEEKENDS" | "CHOOSE";

export const BUNDLE_KIND_WORDS: Record<BundleKindWord, string> = { FIXED_SET: "Bundle", BUY_MORE: "Buy more, pay less" };

/** Monday 1 to Sunday 7. */
export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export const ON_SALE_WORDS: Record<OnSaleDaysWord, string> = { EVERY_DAY: "Every day", WEEKENDS: "Weekends", CHOOSE: "Choose days" };

/** "Every day", "Weekends", "Mon, Wed, Fri". */
export function daysWords(days: OnSaleDaysWord, daysOfWeek: number[]): string {
  if (days !== "CHOOSE") return ON_SALE_WORDS[days];
  return daysOfWeek.length ? daysOfWeek.map((day) => WEEKDAY_SHORT[day - 1]).join(", ") : "No days";
}

const LONG = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** "No end date", or "31 December 2026". */
export function untilWords(endsOn: string | null): string {
  return endsOn ? LONG.format(new Date(`${endsOn}T12:00:00Z`)) : "No end date";
}

export const UNTIL_MESSAGE = "Write the last day like 31 December 2026, or No end date.";

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/**
 * "Until" as typed: "No end date" (or nothing) is null; "31 December 2026",
 * "31 Dec 2026" or "2026-12-31" is that day; anything else is undefined.
 */
export function parseUntil(typed: string | null): string | null | undefined {
  const text = (typed ?? "").trim().toLowerCase();
  if (!text || text === "no end date") return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const words = /^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/.exec(text);
  let year: number;
  let month: number;
  let date: number;
  if (iso) {
    [year, month, date] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (words) {
    const typedMonth = words[2]!;
    const index = typedMonth.length >= 3 ? MONTHS.findIndex((name) => name.startsWith(typedMonth)) : -1;
    if (index < 0) return undefined;
    [year, month, date] = [Number(words[3]), index + 1, Number(words[1])];
  } else {
    return undefined;
  }
  const at = new Date(Date.UTC(year, month - 1, date));
  if (at.getUTCFullYear() !== year || at.getUTCMonth() !== month - 1 || at.getUTCDate() !== date) return undefined;
  return at.toISOString().slice(0, 10);
}

const PACK_WORDS = new Set(["bag", "bags", "can", "cans", "bottle", "bottles", "box", "pack", "packet", "crate"]);

/** "Ice 2kg bag" → "Ice 2kg": a name without the word for what it comes in. */
export function shortName(name: string): string {
  const words = name.split(/\s+/);
  const kept = words.filter((word, index) => index === 0 || !PACK_WORDS.has(word.toLowerCase()));
  return kept.join(" ");
}

/**
 * What a bundle is made of, as the list reads it: "6 × Castle Lager 340ml,
 * Ice 2kg, Charcoal 4kg"; a buy-more deal "3 from Savanna, Hunter’s,
 * Bernini", or "2 × Amarula Cream 750ml" over one product.
 */
export function madeOfWords(
  kind: BundleKindWord,
  buyQuantity: number | null,
  items: Array<{ name: string; quantity: number }>,
): string {
  if (kind === "BUY_MORE") {
    if (items.length === 1) return `${buyQuantity ?? 2} × ${items[0]!.name}`;
    return `${buyQuantity ?? 2} from ${items.map((item) => item.name.split(/\s+/)[0]).join(", ")}`;
  }
  return items.map((item) => (item.quantity > 1 ? `${item.quantity} × ${shortName(item.name)}` : shortName(item.name))).join(", ");
}
