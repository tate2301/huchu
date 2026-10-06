import type { Prisma } from "@prisma/client";

import { recordStockMovement } from "@/lib/inventory/stock-movements";
import { money, multiplyMoney } from "@/lib/money";
import type { RetailAuditActor } from "@/lib/retail/audit";

/**
 * Opening stock (PRD-03): what was already on the shelf when a product was
 * added. One RECEIPT movement, reason OPENING, reference "Opening", at the
 * cost given. The books are posted after the commit by the caller
 * (`RETAIL_OPENING_STOCK`, Dr Stock / Cr Opening balances): `amount` is what
 * to post, quantity × cost to the cent, or null when no cost was given — then
 * the movement alone, and nothing in the books.
 */
export async function recordOpeningStock(
  tx: Prisma.TransactionClient,
  input: {
    actor: RetailAuditActor;
    itemId: string;
    quantity: Prisma.Decimal.Value;
    unitCost: Prisma.Decimal.Value | null;
  },
): Promise<{ amount: Prisma.Decimal | null; balanceAfter: Prisma.Decimal }> {
  const item = await tx.inventoryItem.findUniqueOrThrow({
    where: { id: input.itemId },
    select: { unit: true, productId: true },
  });
  const { nextStock } = await recordStockMovement({
    tx,
    companyId: input.actor.companyId,
    userId: input.actor.userId,
    itemId: input.itemId,
    movementType: "RECEIPT",
    quantity: input.quantity,
    unit: item.unit,
    ...(input.unitCost === null ? {} : { unitCost: input.unitCost }),
    reason: "OPENING",
    reference: "Opening",
    sourceType: "RETAIL_OPENING_STOCK",
    sourceId: item.productId,
  });
  return {
    amount: input.unitCost === null ? null : money(multiplyMoney(input.quantity, input.unitCost)),
    balanceAfter: nextStock,
  };
}
