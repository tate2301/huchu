/**
 * Stock awareness for quoting.
 *
 * Most of what a services business quotes is never held in stock — labour, an
 * installation, a survey. Some of it is: a panel, a length of cable, a pump
 * sitting in a store. This module is what lets one catalogue hold both without
 * the never-stocked majority paying for the stocked minority's machinery.
 *
 * The rule throughout is **warn, never block**. A quote is a promise about the
 * future; refusing to quote for something we'd order in next week would be
 * wrong, and would only teach people to type the line by hand instead.
 */

/** A catalogue item is stock-tracked only if somebody linked it to one. */
export function isStockTracked(item: { inventoryItemId?: string | null }): boolean {
  return Boolean(item.inventoryItemId);
}

export type StockStatus = "NOT_TRACKED" | "IN_STOCK" | "LOW" | "SHORT" | "OUT";

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  NOT_TRACKED: "Not stocked",
  IN_STOCK: "In stock",
  LOW: "Running low",
  SHORT: "Not enough",
  OUT: "None on hand",
};

export type StockSnapshot = {
  /** Null when nothing is linked — the item is simply never stocked. */
  onHand: number | null;
  minStock?: number | null;
  unit?: string | null;
  siteName?: string | null;
  /** Same item code across other sites, when there is stock elsewhere. */
  otherSitesOnHand?: number | null;
};

/**
 * Where a line stands against stock.
 *
 * "Not tracked" is a first-class answer, not a failure: it is the correct and
 * common state for a service, and must never read as a problem.
 */
export function stockStatus(snapshot: StockSnapshot, quantityWanted: number): StockStatus {
  if (snapshot.onHand === null || snapshot.onHand === undefined) return "NOT_TRACKED";

  const onHand = snapshot.onHand;
  if (onHand <= 0) return "OUT";
  if (quantityWanted > onHand) return "SHORT";

  // "Low" means this line would take it below the reorder point somebody set,
  // which is the moment worth mentioning — not an arbitrary percentage.
  const min = snapshot.minStock;
  if (min !== null && min !== undefined && onHand - quantityWanted < min) return "LOW";

  return "IN_STOCK";
}

export function shortfall(snapshot: StockSnapshot, quantityWanted: number): number {
  if (snapshot.onHand === null || snapshot.onHand === undefined) return 0;
  return Math.max(0, quantityWanted - snapshot.onHand);
}

/**
 * The sentence to show beside a quote line. Null means say nothing — silence
 * is right for an untracked service and for a line comfortably in stock.
 */
export function stockWarning(snapshot: StockSnapshot, quantityWanted: number): string | null {
  const status = stockStatus(snapshot, quantityWanted);
  const unit = snapshot.unit ? ` ${snapshot.unit}` : "";

  switch (status) {
    case "NOT_TRACKED":
    case "IN_STOCK":
      return null;
    case "OUT": {
      const elsewhere = snapshot.otherSitesOnHand ?? 0;
      return elsewhere > 0
        ? `None at ${snapshot.siteName ?? "this store"}, ${elsewhere}${unit} at another site`
        : "None on hand — this will need ordering in";
    }
    case "SHORT": {
      const short = shortfall(snapshot, quantityWanted);
      const elsewhere = snapshot.otherSitesOnHand ?? 0;
      const base = `Only ${snapshot.onHand}${unit} on hand, ${short}${unit} short`;
      return elsewhere > 0 ? `${base} — ${elsewhere}${unit} at another site` : base;
    }
    case "LOW":
      return `Leaves ${(snapshot.onHand ?? 0) - quantityWanted}${unit}, below the reorder point`;
  }
}

/**
 * Whether a quote as a whole has anything worth a second look before it goes
 * out. Used to show one summary line rather than making somebody read every
 * row.
 */
export function quoteStockConcerns(
  lines: { description: string; quantity: number; stock?: StockSnapshot | null }[],
): { description: string; message: string }[] {
  const concerns: { description: string; message: string }[] = [];
  for (const line of lines) {
    if (!line.stock) continue;
    const message = stockWarning(line.stock, line.quantity);
    if (message) concerns.push({ description: line.description, message });
  }
  return concerns;
}
