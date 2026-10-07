/**
 * Change reorder levels (30-stock 5.3, W-21): the level a line is reordered
 * at, worked out from what it sells. Enough for the days the shop wants to
 * keep, plus the supplier's lead time, rounded up to whole cases when asked.
 */

/** "Keep enough for" opens on two weeks. */
export const KEEP_DAYS = 14;

export type ReorderRounding = "SINGLES" | "CASES";

/**
 * ceil(per day × (keep + lead)), up to a whole number of cases when the
 * product comes in cases and the person asked for whole cases.
 */
export function suggestReorderLevel(input: {
  perDay: number;
  keepDays: number;
  leadDays: number;
  caseSize: number | null;
  round: ReorderRounding;
}): number {
  const days = Math.max(0, input.keepDays) + Math.max(0, input.leadDays);
  // A hair under, so 2.1 × 10 (21.000000000000004) is 21 and not 22.
  const level = Math.max(0, Math.ceil(input.perDay * days - 1e-9));
  if (input.round !== "CASES" || !input.caseSize || input.caseSize <= 1 || level === 0) return level;
  return Math.ceil(level / input.caseSize) * input.caseSize;
}

/** Units a day, from what sold over the window. */
export function perDayOf(sold: number, windowDays: number): number {
  return windowDays > 0 ? Math.max(0, sold) / windowDays : 0;
}

/** "Sells 2 a day", "Sells about 1 every 4 days", "Not sold in 30 days". */
export function sellsWords(perDay: number): string {
  if (perDay <= 0) return "Not sold in 30 days";
  if (perDay >= 1) return `Sells ${Math.round(perDay)} a day`;
  const every = Math.round(1 / perDay);
  return every <= 1 ? "Sells about 1 a day" : `Sells about 1 every ${every} days`;
}

/** A line's sub on the sheet: "Sells 2 a day · now 12", or "· now not set". */
export function reorderLineSub(perDay: number, reorderAt: number | null): string {
  return `${sellsWords(perDay)} · now ${reorderAt === null ? "not set" : String(reorderAt)}`;
}

/** "14", "14 days" or "14 days " → 14; anything else, or outside 1–120, null. */
export function parseKeepDays(typed: unknown): number | null {
  if (typeof typed !== "string" && typeof typed !== "number") return null;
  const match = /^\s*(\d+)\s*(days?)?\s*$/i.exec(String(typed));
  if (!match) return null;
  const days = Number(match[1]);
  return days >= 1 && days <= 120 ? days : null;
}
