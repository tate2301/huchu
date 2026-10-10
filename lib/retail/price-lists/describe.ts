import { betweenWords, hoursWords } from "./hours";

/**
 * A price list in words (PRD-05, `PriceLists.png`): when the till uses it,
 * what its prices are, the header's sub, and the sentence New price list
 * toasts. Pure.
 */

export type DescribedList = {
  name: string;
  isDefault: boolean;
  state: "DRAFT" | "ON" | "PAUSED";
  audience: "EVERYONE" | "ACCOUNT_CUSTOMERS" | "LOYALTY_MEMBERS" | "STAFF";
  whenKind: "ALWAYS" | "DAYS_AND_HOURS" | "BETWEEN_DATES";
  daysOfWeek: number[];
  fromTime: string | null;
  toTime: string | null;
  /** `YYYY-MM-DD`. */
  startsOn: string | null;
  endsOn: string | null;
  minQuantity: number;
  basis: "OWN" | "LIST" | "COST";
  /** −8 "less 8%", +5 "plus 5%". */
  adjustPercent: number | null;
};

const AUDIENCE: Record<Exclude<DescribedList["audience"], "EVERYONE">, string> = {
  ACCOUNT_CUSTOMERS: "Customer on a wholesale account",
  LOYALTY_MEMBERS: "Loyalty members",
  STAFF: "Staff accounts",
};

const lower = (words: string) => words.charAt(0).toLowerCase() + words.slice(1);

/** "beer", "beer and ciders and coolers", "beer, wine and spirits". */
export function categoryWords(names: string[]): string {
  const words = names.map((name) => name.toLowerCase());
  return words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** "8%", "7.5%". */
export function percentWords(value: number): string {
  return `${Number(Math.abs(value).toFixed(2))}%`;
}

function whenWords(list: DescribedList, today: string): string | null {
  if (list.whenKind === "DAYS_AND_HOURS" && list.fromTime && list.toTime) {
    return hoursWords({ daysOfWeek: list.daysOfWeek, fromTime: list.fromTime, toTime: list.toTime });
  }
  if (list.whenKind === "BETWEEN_DATES" && list.startsOn && list.endsOn) {
    return betweenWords({ startsOn: list.startsOn, endsOn: list.endsOn }, today);
  }
  return null;
}

/**
 * "Always, at every till"; "Customer on a wholesale account, 6 or more";
 * "Fridays 17:00 to 19:00"; "Staff accounts"; "At Borrowdale, once it is
 * switched on". `siteName` is the list's site, when it has one.
 */
export function usedWhen(list: DescribedList, siteName: string | null, today: string): string {
  const parts: string[] = [];
  if (list.audience !== "EVERYONE") parts.push(AUDIENCE[list.audience]);
  const when = whenWords(list, today);
  if (when) parts.push(when);
  if (list.minQuantity > 1) parts.push(`${list.minQuantity} or more`);
  if (siteName) parts.push(parts.length ? `at ${siteName}` : `At ${siteName}`);
  if (parts.length === 0) parts.push("Always, at every till");
  if (list.state === "DRAFT") parts.push("once it is switched on");
  return parts.join(", ");
}

/**
 * "Set for each product"; "Retail less 8%"; "Retail plus 5%"; "Same as
 * Retail"; "Retail less 10% on beer"; "Cost plus 5%".
 */
export function pricesRule(list: DescribedList, baseName: string | null, categories: string[]): string {
  if (list.basis === "OWN") return "Set for each product";
  const base = list.basis === "COST" ? "Cost" : (baseName ?? "Its base list");
  const adjust = list.adjustPercent ?? 0;
  const rule =
    adjust === 0
      ? list.basis === "COST"
        ? "At cost"
        : `Same as ${base}`
      : `${base} ${adjust < 0 ? "less" : "plus"} ${percentWords(adjust)}`;
  return categories.length ? `${rule} on ${categoryWords(categories)}` : rule;
}

/** "Default price list · all tills · all sites"; "Wholesale price list · 96 products". */
export function listSub(list: { name: string; isDefault: boolean }, products: number): string {
  if (list.isDefault) return "Default price list · all tills · all sites";
  return `${list.name} price list · ${products} ${products === 1 ? "product" : "products"}`;
}

/**
 * New price list's toast: "Happy hour is on: 10% off beer and ciders, Fridays
 * 17:00 to 19:00." A draft: "Happy hour saved. Switch it on when it is ready."
 */
export function createdSentence(list: DescribedList, baseName: string | null, categories: string[], siteName: string | null, today: string): string {
  if (list.state !== "ON") return `${list.name} saved. Switch it on when it is ready.`;
  const adjust = list.adjustPercent ?? 0;
  const what = categories.length ? categoryWords(categories) : "everything";
  let price: string;
  if (list.basis === "COST") price = `cost ${adjust < 0 ? "less" : "plus"} ${percentWords(adjust)} on ${what}`;
  else if (adjust < 0) price = `${percentWords(adjust)} off ${what}`;
  else if (adjust > 0) price = `${percentWords(adjust)} more on ${what}`;
  else price = `${baseName ?? "the base list"}'s prices on ${what}`;
  const parts = [price];
  if (list.audience !== "EVERYONE") parts.push(`for ${lower(AUDIENCE[list.audience])}`);
  const when = whenWords(list, today);
  if (when) parts.push(when);
  if (siteName) parts.push(`at ${siteName}`);
  return `${list.name} is on: ${parts.join(", ")}.`;
}
