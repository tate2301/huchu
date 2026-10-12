import { formatCount, formatMoney } from "@/lib/workspace/format";

import { pointsValue } from "./spend";

/**
 * Loyalty's words for points (CUS-01): browser-safe, read by the settings
 * page, the till and the customer's ledger.
 */

const MINUS = "−";

/** "+32", "−500", "0". */
export function signedPoints(points: number): string {
  if (points === 0) return "0";
  return points > 0 ? `+${formatCount(points)}` : `${MINUS}${formatCount(-points)}`;
}

/** "1 point", "3,021 points". */
export function pointsWords(points: number): string {
  return `${formatCount(points)} ${Math.abs(points) === 1 ? "point" : "points"}`;
}

/** What points are worth at the shop's rate: "US$5.00". */
export function pointsWorth(points: number, pointValue: number): string {
  return formatMoney(pointsValue(points, pointValue));
}

/** "1", "1.5", "0.25": a rate as typed, without trailing zeros. */
export function rateWords(rate: number): string {
  return String(Number(rate.toFixed(2)));
}

/** "1 point for each US$1", "1.5 points for each US$1". */
export function earnWords(rate: number): string {
  return `${rateWords(rate)} ${rate === 1 ? "point" : "points"} for each US$1`;
}

/** "0.01", "0.0125": what a point is worth, two decimals at least. */
export function pointValueWords(value: number): string {
  const fixed = value.toFixed(4).replace(/0{1,2}$/, "");
  return fixed;
}
