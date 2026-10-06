import { Prisma } from "@prisma/client";

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
