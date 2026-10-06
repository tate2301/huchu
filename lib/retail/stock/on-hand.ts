import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { coverDays } from "@/lib/retail/products/figures";
import { COVER_WINDOW_DAYS, stockLevel, type StockLevel } from "@/lib/retail/stock/levels";

/**
 * What is on the shelf, line by line (30-stock 4.1, STK-02): every stock line
 * of a product that is not in the bin, at the shop's open sites, with what it
 * sold over the last 30 days and the level STK-01's rule gives it.
 *
 * On hand's list, its tabs and the Stock panel's "5 low" badge all read this
 * one function, so the badge and the Low and Out tabs cannot disagree.
 *
 * What a line sold is read off its own ledger — its sales less its refunds and
 * voids — so it is that site's figure, never the company's.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Sales less refunds and voids: what leaves a line by the till. */
export const SOLD_REASONS = ["SALE", "REFUND", "VOID"] as const;

/** Net units each line sold since a moment, by its ledger; a line that sold nothing is absent. */
export async function netSoldByLine(lineIds: string[], since: Date): Promise<Map<string, number>> {
  if (lineIds.length === 0) return new Map();
  const sold = await prisma.stockMovement.groupBy({
    by: ["itemId"],
    where: { itemId: { in: lineIds }, reason: { in: [...SOLD_REASONS] }, createdAt: { gte: since } },
    _sum: { change: true },
  });
  return new Map(sold.map((row) => [row.itemId, Math.max(0, -toNumberOrZero(row._sum.change ?? 0))]));
}

/** The start of the window the rate of sale is measured over. */
export const coverWindowStart = (now = Date.now()) => new Date(now - COVER_WINDOW_DAYS * DAY_MS);

export type OnHandLine = {
  id: string;
  productId: string;
  product: string;
  code: string;
  barcode: string | null;
  archived: boolean;
  categoryId: string | null;
  siteId: string;
  site: string;
  placeId: string;
  place: string;
  unit: string;
  onHand: number;
  reorderAt: number | null;
  unitCost: number | null;
  /** Net units sold at this line's site over the last 30 days. */
  sold30: number;
  /** Whole days the stock lasts at that rate; null when nothing sold. */
  coverDays: number | null;
  level: StockLevel;
};

/** Every stock line on the shelf, or those of `lineIds`, the shop's own only. */
export async function loadOnHand(companyId: string, filter: { lineIds?: string[] } = {}): Promise<OnHandLine[]> {
  const lines = await prisma.inventoryItem.findMany({
    where: {
      site: { companyId, isActive: true },
      product: { is: { companyId, archivedAt: null } },
      ...(filter.lineIds ? { id: { in: filter.lineIds } } : {}),
    },
    select: {
      id: true,
      unit: true,
      currentStock: true,
      minStock: true,
      unitCost: true,
      site: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
      product: { select: { id: true, name: true, code: true, barcode: true, isActive: true, categoryId: true } },
    },
    orderBy: [{ name: "asc" }],
  });
  const sold = await netSoldByLine(
    lines.map((line) => line.id),
    coverWindowStart(),
  );

  return lines.map((line): OnHandLine => {
    const product = line.product!;
    const onHand = toNumberOrZero(line.currentStock);
    const reorderAt = line.minStock === null ? null : toNumberOrZero(line.minStock);
    const sold30 = sold.get(line.id) ?? 0;
    const archived = !product.isActive;
    return {
      id: line.id,
      productId: product.id,
      product: product.name,
      code: product.code,
      barcode: product.barcode,
      archived,
      categoryId: product.categoryId,
      siteId: line.site.id,
      site: line.site.name,
      placeId: line.location.id,
      place: `${line.site.name} · ${line.location.name}`,
      unit: line.unit,
      onHand,
      reorderAt,
      unitCost: line.unitCost === null ? null : toNumberOrZero(line.unitCost),
      sold30,
      coverDays: coverDays(onHand, sold30),
      level: stockLevel({ onHand, reorderAt, soldLast30: sold30, archived }),
    };
  });
}

/** The lines running low or out: the Stock panel's badge. */
export async function countLowLines(companyId: string): Promise<number> {
  const lines = await loadOnHand(companyId);
  return lines.filter((line) => line.level === "LOW" || line.level === "OUT").length;
}
