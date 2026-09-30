/**
 * The words the stock screens say things in.
 *
 * The overview used to call every movement that was not an issue "Received",
 * transfers and adjustments included, and the category filter wrote the
 * stored constant straight onto the screen. A value a person reads goes
 * through here, so a movement reads the same on the overview, the log and the
 * fuel log.
 */

const MOVEMENT_TYPE: Record<string, string> = {
  RECEIPT: "Received",
  ISSUE: "Issued",
  TRANSFER: "Transferred",
  ADJUSTMENT: "Adjusted",
};

/** "Received", "Issued", "Transferred", "Adjusted". */
export function movementTypeLabel(type: string): string {
  return MOVEMENT_TYPE[type] ?? type.charAt(0) + type.slice(1).toLowerCase();
}

/**
 * Which way a movement moved the stock: a receipt adds, an issue or a transfer
 * out takes away, and an adjustment carries its own sign.
 */
export function movementDelta(type: string, quantity: number): number {
  if (type === "ISSUE" || type === "TRANSFER") return -Math.abs(quantity);
  if (type === "RECEIPT") return Math.abs(quantity);
  return quantity;
}

/** The stock categories, in the order a picker lists them. */
export const STOCK_CATEGORIES = new Map([
  ["CONSUMABLES", "Consumables"],
  ["SPARES", "Spares"],
  ["FUEL", "Fuel"],
  ["PPE", "PPE"],
  ["REAGENTS", "Reagents"],
  ["OTHER", "Other"],
]);

export function stockCategoryLabel(category: string | null | undefined): string {
  if (!category) return "";
  return STOCK_CATEGORIES.get(category) ?? category.charAt(0) + category.slice(1).toLowerCase();
}

/**
 * A stock item that has run out, or is at or under its minimum. Healthy stock
 * draws nothing, so this is null for it.
 */
export function stockLevelLabel(item: {
  currentStock: number;
  minStock?: number | null;
}): "Out" | "Low" | null {
  if (item.currentStock <= 0) return "Out";
  if (item.minStock !== null && item.minStock !== undefined && item.currentStock <= item.minStock) {
    return "Low";
  }
  return null;
}
