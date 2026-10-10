/**
 * Sales missed while a product is out of stock.
 *
 * Nobody records a sale that did not happen, so this is an estimate, and it
 * says so wherever it is shown. It is built from two facts the shop does keep:
 * when the shelf ran empty, read off the stock movements, and how fast the
 * product sold in the weeks before it did. Days empty times takings a day is
 * what the shelf would have taken.
 */

const DAY = 86_400_000;

/** How far back the rate of sale is read from, before the shelf ran out. */
export const RATE_LOOKBACK_DAYS = 28;

export type MovementForStock = {
  movementType: "RECEIPT" | "ISSUE" | "ADJUSTMENT" | "TRANSFER";
  /** As stored: a size for a receipt or an issue, signed for an adjustment. */
  quantity: number;
  at: Date;
};

/** What a movement did to the count on hand. A transfer moves stock, not the count. */
export function stockChange(movement: MovementForStock): number {
  if (movement.movementType === "RECEIPT") return Math.abs(movement.quantity);
  if (movement.movementType === "ISSUE") return -Math.abs(movement.quantity);
  if (movement.movementType === "ADJUSTMENT") return movement.quantity;
  return 0;
}

/**
 * When the shelf last ran empty.
 *
 * Walks back from what is on hand now through the movements, newest first,
 * and stops at the one that took the count from something to nothing. Null
 * when there is stock, or when the movements given never show it running out
 * — out for longer than they reach back, or never stocked at all.
 */
export function outSince(onHand: number, movements: readonly MovementForStock[]): Date | null {
  if (onHand > 0) return null;
  const newestFirst = [...movements].sort((left, right) => right.at.getTime() - left.at.getTime());
  let after = onHand;
  for (const movement of newestFirst) {
    const before = after - stockChange(movement);
    if (before > 0 && after <= 0) return movement.at;
    after = before;
  }
  return null;
}

export type SaleForRate = { quantity: number; takings: number; at: Date };

export type MissedSales = {
  /** Days the shelf has been empty inside the period. */
  daysOut: number;
  /** Units a day it sold while it was on the shelf. */
  perDay: number;
  /** Takings it would have made over `daysOut` at that rate. */
  missed: number;
};

/**
 * What an empty shelf cost in the period from `from` to `to`.
 *
 * The rate is read from the `RATE_LOOKBACK_DAYS` before it ran out — or from
 * the first time it was stocked, if that is later — so a product that sold
 * well and then ran dry is judged on how it sold, not on the empty weeks.
 */
export function missedSales(input: {
  outAt: Date;
  from: Date;
  to: Date;
  /** When the product was set up; the rate is not read from before then. */
  firstStockedAt: Date | null;
  sales: readonly SaleForRate[];
}): MissedSales {
  const lookbackStart = Math.max(
    input.outAt.getTime() - RATE_LOOKBACK_DAYS * DAY,
    input.firstStockedAt?.getTime() ?? -Infinity,
  );
  const window = Math.max((input.outAt.getTime() - lookbackStart) / DAY, 1);
  let quantity = 0;
  let takings = 0;
  for (const sale of input.sales) {
    const at = sale.at.getTime();
    if (at < lookbackStart || at >= input.outAt.getTime()) continue;
    quantity += sale.quantity;
    takings += sale.takings;
  }
  const daysOut = Math.max(
    (input.to.getTime() - Math.max(input.outAt.getTime(), input.from.getTime())) / DAY,
    0,
  );
  return {
    daysOut,
    perDay: quantity / window,
    missed: Math.round((takings / window) * daysOut * 100) / 100,
  };
}
