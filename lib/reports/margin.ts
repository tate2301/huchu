/**
 * A margin and its tone (20-products 4.4): one rule for the worksheet's
 * loader and for ListFrame's live margin as a price is typed (`derive`), so
 * the pill a person sees while typing is the pill the saved row comes back with.
 */

/** (price − cost) ÷ price as a percentage, one decimal; null without a cost or a price. */
export function marginOf(price: number | null, cost: number | null): number | null {
  if (price === null || cost === null || !(price > 0)) return null;
  return Math.round(((price - cost) / price) * 1000) / 10;
}

/**
 * Margin tone against the category's target: plain at or over it, warn under
 * it, bad more than five points under it or below cost.
 */
export function marginTone(margin: number | null, target: number | null, belowCost: boolean): "warn" | "bad" | null {
  if (belowCost) return "bad";
  if (margin === null || target === null) return null;
  if (margin >= target) return null;
  return target - margin > 5 ? "bad" : "warn";
}
