import { Prisma } from "@prisma/client";

import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { coverDays } from "@/lib/retail/products/figures";
import { COVER_WINDOW_DAYS, stockLevel, type StockLevel } from "@/lib/retail/stock/levels";

/**
 * A stock line's levels (PRD-03; STK-02 adds its PATCH route on this): when
 * to reorder ("Reorder at", `minStock`) and how many ("Reorder",
 * `reorderQty`). Undefined leaves a level alone; null clears it.
 */
export async function setStockLineLevels(
  tx: Prisma.TransactionClient,
  lineId: string,
  levels: { reorderAt?: Prisma.Decimal.Value | null; reorderQty?: Prisma.Decimal.Value | null },
): Promise<void> {
  const data: Prisma.InventoryItemUpdateInput = {
    ...(levels.reorderAt === undefined
      ? {}
      : { minStock: levels.reorderAt === null ? null : new Prisma.Decimal(levels.reorderAt) }),
    ...(levels.reorderQty === undefined
      ? {}
      : { reorderQty: levels.reorderQty === null ? null : new Prisma.Decimal(levels.reorderQty) }),
  };
  if (Object.keys(data).length === 0) return;
  await tx.inventoryItem.update({ where: { id: lineId }, data });
}

export type StockLineView = {
  id: string;
  site: { id: string; name: string };
  place: { id: string; name: string } | null;
  product: { id: string; name: string; code: string; packOf: { id: string; name: string } | null; packSize: number | null };
  unit: string;
  onHand: number;
  reorderAt: number | null;
  reorderQty: number | null;
  shelf: string | null;
  /** What one cost, for roles that may see cost; absent for the rest. */
  unitCost?: number | null;
  /** Net units sold a day over the last 30. */
  perDay: number;
  coverDays: number | null;
  level: StockLevel;
  /** The case products of this single, with their line at this site. */
  cases: Array<{ productId: string; name: string; packSize: number; lineId: string | null; onHand: number }>;
};

/** Sales less refunds and voids: what leaves a line by the till. */
const SOLD_REASONS = ["SALE", "REFUND", "VOID"] as const;

/**
 * Stock lines as the adjust sheet, On hand and the product record read them
 * (30-stock 4.2): one per product per site, by product, site or ids, the
 * shop's own only. Cost only for roles holding `retail.catalog:view-cost`.
 */
export async function readStockLines(
  companyId: string,
  filter: { productId?: string | null; siteId?: string | null; lineIds?: string[] | null },
  role: string | null | undefined,
): Promise<StockLineView[]> {
  const lines = await prisma.inventoryItem.findMany({
    where: {
      site: { companyId },
      productId: filter.productId ? filter.productId : { not: null },
      ...(filter.siteId ? { siteId: filter.siteId } : {}),
      ...(filter.lineIds ? { id: { in: filter.lineIds } } : {}),
    },
    orderBy: [{ site: { name: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      siteId: true,
      unit: true,
      currentStock: true,
      minStock: true,
      reorderQty: true,
      shelf: true,
      unitCost: true,
      site: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
      product: {
        select: {
          id: true,
          name: true,
          code: true,
          isActive: true,
          packSize: true,
          packOf: { select: { id: true, name: true } },
          packs: {
            where: { archivedAt: null },
            orderBy: { packSize: "asc" },
            select: { id: true, name: true, packSize: true, inventoryItems: { select: { id: true, siteId: true, currentStock: true } } },
          },
        },
      },
    },
  });
  if (lines.length === 0) return [];

  const since = new Date(Date.now() - COVER_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const sold = await prisma.stockMovement.groupBy({
    by: ["itemId"],
    where: { itemId: { in: lines.map((line) => line.id) }, reason: { in: [...SOLD_REASONS] }, createdAt: { gte: since } },
    _sum: { change: true },
  });
  const soldBy = new Map(sold.map((row) => [row.itemId, Math.max(0, -toNumberOrZero(row._sum.change ?? 0))]));
  const seeCost = canRetailRoleDo(role, "retail.catalog", "view-cost");

  return lines.map((line): StockLineView => {
    const product = line.product!;
    const onHand = toNumberOrZero(line.currentStock);
    const reorderAt = line.minStock === null ? null : toNumberOrZero(line.minStock);
    const sold30 = soldBy.get(line.id) ?? 0;
    return {
      id: line.id,
      site: line.site,
      place: line.location ? { id: line.location.id, name: line.location.name } : null,
      product: {
        id: product.id,
        name: product.name,
        code: product.code,
        packOf: product.packOf,
        packSize: product.packOf ? product.packSize : null,
      },
      unit: line.unit,
      onHand,
      reorderAt,
      reorderQty: line.reorderQty === null ? null : toNumberOrZero(line.reorderQty),
      shelf: line.shelf,
      ...(seeCost ? { unitCost: line.unitCost === null ? null : toNumberOrZero(line.unitCost) } : {}),
      perDay: Math.round((sold30 / COVER_WINDOW_DAYS) * 100) / 100,
      coverDays: coverDays(onHand, sold30),
      level: stockLevel({ onHand, reorderAt, soldLast30: sold30, archived: !product.isActive }),
      cases: product.packs.map((pack) => {
        const caseLine = pack.inventoryItems.find((item) => item.siteId === line.siteId) ?? null;
        return {
          productId: pack.id,
          name: pack.name,
          packSize: pack.packSize ?? 0,
          lineId: caseLine?.id ?? null,
          onHand: caseLine ? toNumberOrZero(caseLine.currentStock) : 0,
        };
      }),
    };
  });
}
