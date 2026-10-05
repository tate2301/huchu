import { formatCount, formatMoney } from "@/lib/workspace/format";

/**
 * The words of Setup › Sites (10-setup 5.4, W-03, W-66), kept apart from the
 * database so the sheets in the browser and the server say the same thing.
 */

export type SiteState = "DEFAULT" | "OPEN" | "CLOSED";

/** The State column's words. */
export const SITE_STATE_WORDS: Record<SiteState, string> = { DEFAULT: "Default", OPEN: "Open", CLOSED: "Closed" };

/** "Shop floor, back store, cold room": the first as written, the rest with a lower-case first letter. */
export function placesWords(names: readonly string[]): string {
  return names
    .map((name, index) => (index === 0 ? name : `${name.charAt(0).toLowerCase()}${name.slice(1)}`))
    .join(", ");
}

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** "one", "two" … "ten", then figures. */
export function countWord(n: number): string {
  return NUMBER_WORDS[n] ?? formatCount(n);
}

/** A short code is 2 to 6 of A–Z and 0–9. */
export const SITE_CODE_PATTERN = /^[A-Z0-9]{2,6}$/;

/** What a short code reads as, as typed: upper case, no spaces. */
export function cleanSiteCode(typed: string): string {
  return typed.replace(/\s+/g, "").toUpperCase();
}

/**
 * The short code a new site starts with: the first three letters of its name,
 * then a figure when another site has it ("AVO", "AVO2").
 */
export function suggestSiteCode(name: string, taken: readonly string[]): string {
  const base = name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
  if (base.length < 2) return "";
  const used = new Set(taken.map((code) => code.toUpperCase()));
  if (!used.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}${n}`.slice(0, 6);
    if (!used.has(candidate)) return candidate;
  }
  return "";
}

/**
 * A place's code from its name: the letters of its first word, upper case, at
 * most ten ("Shop floor" → SHOP, "Cold room" → COLD), then a figure when the
 * site already has it.
 */
export function placeCode(name: string, taken: readonly string[]): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  const base = (first.toUpperCase().replace(/[^A-Z]/g, "") || name.toUpperCase().replace(/[^A-Z]/g, "") || "PLACE").slice(0, 10);
  const used = new Set(taken.map((code) => code.toUpperCase()));
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base.slice(0, 10 - String(n).length)}${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

/**
 * A Zimbabwean number in one shape: "+263 24 270 5521", "+263 77 412 0098".
 * Takes "+263…", "263…" or "0…"; null when it is not a landline or mobile.
 */
export function zimbabwePhone(typed: string): string | null {
  const digits = typed.replace(/[\s()-]/g, "");
  const local = /^\+?263(\d{9})$/.exec(digits)?.[1] ?? /^0(\d{9})$/.exec(digits)?.[1] ?? null;
  if (!local || !/^[2-8]/.test(local)) return null;
  return `+263 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`;
}

/** "3 tills", "1 till". */
export function tillWords(n: number): string {
  return `${formatCount(n)} ${n === 1 ? "till" : "tills"}`;
}

/**
 * The edit sheet's sub: "Default site · 3 tills · US$41,280.00 in stock"; a
 * site that is not the default drops the first part, and someone who may not
 * see cost the money part.
 */
export function siteSub(input: { isDefault: boolean; tills: number; stockValue: number | null; closed?: boolean }): string {
  return [
    input.closed ? "Closed" : input.isDefault ? "Default site" : null,
    tillWords(input.tills),
    input.stockValue === null ? null : `${formatMoney(input.stockValue)} in stock`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The plan as the note reads it: "Grow". */
export type PlanRoom = { name: string; maxSites: number | null; openSites: number };

/** How many more open sites the plan allows; null without a limit. */
export function sitesLeft(plan: PlanRoom): number | null {
  return plan.maxSites === null ? null : Math.max(0, plan.maxSites - plan.openSites);
}

/** "Your Grow plan has no room for another site." — the refusal and the full note. */
export function noRoomSentence(planName: string): string {
  return `Your ${planName} plan has no room for another site.`;
}

/**
 * Add a site's footer note: "Then pair its tills. Your Grow plan has room for
 * one more site."; with no room, the refusal; with no limit, the first part.
 */
export function siteNewNote(plan: PlanRoom | null): string {
  if (!plan) return "Then pair its tills.";
  const left = sitesLeft(plan);
  if (left === null) return "Then pair its tills.";
  if (left === 0) return noRoomSentence(plan.name);
  return `Then pair its tills. Your ${plan.name} plan has room for ${countWord(left)} more ${left === 1 ? "site" : "sites"}.`;
}

/** "Move some from Harare Main Branch". */
export function moveFromWords(siteName: string): string {
  return `Move some from ${siteName}`;
}
