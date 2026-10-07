/**
 * How a stock line is doing: Out, Low, Too much or Fine.
 *
 * One rule, read by every screen that says a line is low — On hand and its
 * tabs, the Stock panel's "5 low" badge, the Overview's stock tile, Products'
 * Low stock tab and Insights › Stock health — so that no two of them can
 * disagree about the same bottle.
 *
 * The rule is measured against cover: how many days the line lasts at the rate
 * it sold over the last 30 days. A shop aims for two weeks (`COVER_AIM`); under
 * half of that it is running low even above its reorder level, and over four
 * times it is money sitting on the shelf.
 */

/** Days of stock a shop aims to hold. */
export const COVER_AIM = 14;

/** The window, in days, the rate of sale is measured over. */
export const COVER_WINDOW_DAYS = 30;

export type StockLevel = "OUT" | "LOW" | "TOO_MUCH" | "FINE";

/** The level as the On hand badge reads it. */
export const STOCK_LEVEL_LABEL: Record<StockLevel, string> = {
  OUT: "Out",
  LOW: "Low",
  TOO_MUCH: "Too much",
  FINE: "Fine",
};

/** The badge tone for each level (`StateBadge` tones). */
export const STOCK_LEVEL_TONE: Record<StockLevel, "bad" | "warn" | "info" | "hollow"> = {
  OUT: "bad",
  LOW: "warn",
  TOO_MUCH: "info",
  FINE: "hollow",
};

/**
 * How many days the stock lasts at the period's rate of sale.
 *
 * On hand ÷ (sold ÷ days). Null when nothing sold (net of refunds), because a
 * line that does not sell has no rate to last at.
 */
export function daysOfCover(onHand: number, soldInPeriod: number, days: number): number | null {
  if (soldInPeriod <= 0) return null;
  return onHand / (soldInPeriod / days);
}

export type StockLevelInput = {
  /** On hand at the site. */
  onHand: number;
  /** "Reorder at" (`InventoryItem.minStock`), or null when none is set. */
  reorderAt: number | null;
  /** Net units sold at the site over the last `COVER_WINDOW_DAYS` days. */
  soldLast30: number;
  /** An archived product is no longer bought, so it is never Low. */
  archived: boolean;
};

/**
 * The level of one stock line. Tested top to bottom; the first that holds wins.
 *
 * | Level    | Rule                                                                      |
 * |----------|---------------------------------------------------------------------------|
 * | Out      | on hand ≤ 0                                                               |
 * | Low      | not archived, and (on hand ≤ reorder at, or cover < half the aim)          |
 * | Too much | cover > four times the aim, or nothing sold in 30 days while on hand > 0  |
 * | Fine     | otherwise                                                                 |
 *
 * So a line at its reorder level that has also sold nothing is Low: the order
 * says it should be bought, and it is.
 */
export function stockLevel(line: StockLevelInput): StockLevel {
  if (line.onHand <= 0) return "OUT";

  const cover = daysOfCover(line.onHand, line.soldLast30, COVER_WINDOW_DAYS);
  const atReorder = line.reorderAt !== null && line.onHand <= line.reorderAt;
  if (!line.archived && (atReorder || (cover !== null && cover < COVER_AIM / 2))) return "LOW";

  if (cover === null || cover > COVER_AIM * 4) return "TOO_MUCH";
  return "FINE";
}
