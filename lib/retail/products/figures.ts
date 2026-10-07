import { COVER_WINDOW_DAYS, daysOfCover, stockLevel, type StockLevel } from "@/lib/retail/stock/levels";
import { formatQuantity } from "@/lib/retail/words";

/**
 * What the Products list says about each product (20-products 3.2): its on
 * hand with the unit word, its 30 days of sales, how long the stock lasts at
 * that rate, and whether it is low. One function each, so the list, its
 * export and the record read the same arithmetic.
 *
 * "Low" is not decided here: STK-01's `stockLevel` is the only rule (C-34), so
 * Products' Low stock tab and Stock's "5 low" badge cannot disagree.
 */

/** The days a full Cover bar stands for. */
export const COVER_BAR_DAYS = 20;

/** Under this fill the Cover bar is drawn in the warning colour (under 7 days). */
export const COVER_WARN_PCT = 35;

/** The unit word for an amount: "bottles" for 13, "bottle" for 1, "kg" for weight. */
export function unitWord(onHand: number, unit: string | null | undefined): string {
  const words = formatQuantity(onHand, unit);
  const space = words.indexOf(" ");
  return space === -1 ? "" : words.slice(space + 1);
}

/** "13 bottles", "22 cases", "210 cartons". */
export function onHandLabel(onHand: number, unit: string | null | undefined): string {
  return formatQuantity(onHand, unit);
}

/** Sold, 30 days: units sold less units refunded, never below nothing. */
export function netSold(sold: number, refunded: number): number {
  return Math.max(0, sold - Math.abs(refunded));
}

/** Cover in whole days, or null when nothing sold in the window. */
export function coverDays(onHand: number, sold30: number): number | null {
  const days = daysOfCover(Math.max(0, onHand), sold30, COVER_WINDOW_DAYS);
  return days === null ? null : Math.round(days);
}

/** "6 days", "1 day", or null when nothing sold. */
export function coverLabel(days: number | null): string | null {
  if (days === null) return null;
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/** The Cover bar's fill: days ÷ 20 × 100, at most 100. */
export function coverFill(days: number | null): number {
  if (days === null) return 0;
  return Math.min(100, Math.round((days / COVER_BAR_DAYS) * 100));
}

export type ProductStock = "Out" | "Low" | "In stock";

/** How the Products list reads a product's stock: Out, Low (STK-01's rule), or In stock. */
export function productStock(input: {
  onHand: number;
  reorderAt: number | null;
  sold30: number;
  archived: boolean;
}): ProductStock {
  const level: StockLevel = stockLevel({
    onHand: input.onHand,
    reorderAt: input.reorderAt,
    soldLast30: input.sold30,
    archived: input.archived,
  });
  if (level === "OUT") return "Out";
  if (level === "LOW") return "Low";
  return "In stock";
}

/** "15%", "0%": a VAT rate as the list prints it. */
export function vatLabel(rate: number): string {
  return `${Number.isInteger(rate) ? rate : Number(rate.toFixed(2))}%`;
}
