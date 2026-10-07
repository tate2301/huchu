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

/* ──────────────────────────────────────────────────────────────────────────
   The product record's figures (20-products 3.2, PRD-04)
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Margin on the price the customer pays, VAT included, to one decimal, and
 * what each unit leaves: US$18.25 against US$13.03 is 28.6%, US$5.22 a
 * bottle. Null without a cost (or a price).
 */
export function marginOn(price: number, cost: number | null): { percent: number; perUnit: number } | null {
  if (cost === null || !(price > 0)) return null;
  const perUnit = Math.round((price - cost) * 100) / 100;
  return { percent: Math.round(((price - cost) / price) * 1000) / 10, perUnit };
}

/** The change on the 30 days before, in whole percent; null when those days had nothing to compare with. */
export function changeOn(now: number, before: number): number | null {
  if (!(before > 0)) return null;
  return Math.round(((now - before) / before) * 100);
}

/** "+12%", "−8%", "0%"; "—" with nothing to compare. */
export function changeWords(change: number | null): string {
  if (change === null) return "—";
  return `${change > 0 ? "+" : change < 0 ? "−" : ""}${Math.abs(change)}%`;
}

/** Up is good, down is bad, nothing to compare is plain. */
export function changeTone(change: number | null): "ok" | "bad" | "plain" {
  if (change === null || change === 0) return "plain";
  return change > 0 ? "ok" : "bad";
}

/** One posted sale or refund line of the product: refunds carry a negative quantity and total. */
export type SoldLine = { at: Date; quantity: number; total: number; refund: boolean; till: string | null };

export type SaleFigures = {
  sold30: number;
  soldPrev30: number;
  takings30: number;
  takingsPrev30: number;
  /** Units a day over the last 30. */
  perDay: number;
  soldToday: number;
  /** The newest sale today and its till; null before the first. */
  lastSale: { at: string; till: string | null } | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const cents = (value: number) => Math.round(value * 100) / 100;

/**
 * Sold and taken over the 30 days ending now and the 30 before them, net of
 * refunds; and today, from midnight in the shop's zone (Africa/Harare), with
 * the last sale's time and till.
 */
export function saleFigures(lines: SoldLine[], now: Date, todayStart: Date): SaleFigures {
  const since = now.getTime() - COVER_WINDOW_DAYS * DAY_MS;
  const before = since - COVER_WINDOW_DAYS * DAY_MS;
  let units30 = 0;
  let unitsPrev = 0;
  let takings30 = 0;
  let takingsPrev = 0;
  let unitsToday = 0;
  let last: SoldLine | null = null;
  for (const line of lines) {
    const at = line.at.getTime();
    if (at > now.getTime() || at < before) continue;
    if (at >= since) {
      units30 += line.quantity;
      takings30 += line.total;
    } else {
      unitsPrev += line.quantity;
      takingsPrev += line.total;
    }
    if (at >= todayStart.getTime()) {
      unitsToday += line.quantity;
      if (!line.refund && (!last || at > last.at.getTime())) last = line;
    }
  }
  const sold30 = Math.max(0, units30);
  return {
    sold30,
    soldPrev30: Math.max(0, unitsPrev),
    takings30: cents(takings30),
    takingsPrev30: cents(takingsPrev),
    perDay: sold30 / COVER_WINDOW_DAYS,
    soldToday: Math.max(0, unitsToday),
    lastSale: last ? { at: last.at.toISOString(), till: last.till } : null,
  };
}
