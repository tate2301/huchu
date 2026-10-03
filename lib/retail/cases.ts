import { z } from "zod";

import { money, quantity, toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { recordStockMovement } from "@/lib/inventory/stock-movements";

/**
 * Cases and singles.
 *
 * A bottle store buys Castle Lager by the case of 24 and sells it both ways:
 * a case over the counter, or singles out of the fridge. Each is its own
 * product with its own price and its own stock line; the case knows which
 * single it holds and how many (`Product.packOfId`, `packSize`).
 *
 * When the singles run low, somebody opens a case. That is the one thing that
 * moves stock between the two: one case out, twenty-four singles in, at the
 * same branch, in one transaction. The value does not change — it is the same
 * beer, on the same inventory account — so nothing posts to the ledger; the
 * singles come in at the case's cost shared over the bottles.
 */

export const breakCaseInput = z.object({
  siteId: z.string().uuid(),
  cases: z.number().int().min(1).max(500).default(1),
});

export type BreakCaseResult = {
  cases: number;
  singles: number;
  caseStock: number;
  singleStock: number;
};

export class CaseBreakRefused extends Error {}

export async function breakCase(input: {
  companyId: string;
  userId: string;
  caseProductId: string;
  siteId: string;
  cases: number;
}): Promise<BreakCaseResult> {
  const pack = await prisma.product.findFirst({
    where: { id: input.caseProductId, companyId: input.companyId, archivedAt: null },
    select: {
      name: true,
      packSize: true,
      packOf: { select: { id: true, name: true, archivedAt: true } },
    },
  });
  if (!pack) throw new CaseBreakRefused("That product is not this shop's.");
  if (!pack.packOf || !pack.packSize || pack.packOf.archivedAt) {
    throw new CaseBreakRefused(`${pack.name} is not set up as a case of singles.`);
  }

  const [caseLine, singleLine] = await Promise.all([
    prisma.inventoryItem.findFirst({
      where: { productId: input.caseProductId, siteId: input.siteId, site: { companyId: input.companyId } },
      select: { id: true, unit: true, unitCost: true, currentStock: true },
    }),
    prisma.inventoryItem.findFirst({
      where: { productId: pack.packOf.id, siteId: input.siteId, site: { companyId: input.companyId } },
      select: { id: true, unit: true },
    }),
  ]);
  if (!caseLine) throw new CaseBreakRefused(`There is no ${pack.name} in stock at this branch.`);
  if (!singleLine) {
    throw new CaseBreakRefused(`${pack.packOf.name} has no stock line at this branch to put the singles on.`);
  }
  if (caseLine.currentStock.lessThan(input.cases)) {
    throw new CaseBreakRefused(
      `There ${toNumberOrZero(caseLine.currentStock) === 1 ? "is" : "are"} only ${toNumberOrZero(caseLine.currentStock)} of ${pack.name} to open.`,
    );
  }

  const singles = input.cases * pack.packSize;
  const singleCost =
    caseLine.unitCost === null ? undefined : money(caseLine.unitCost).dividedBy(pack.packSize).toDecimalPlaces(2);
  const notes = `Opened ${input.cases} × ${pack.name} into ${singles} × ${pack.packOf.name}`;

  return prisma.$transaction(async (tx) => {
    const out = await recordStockMovement({
      tx,
      companyId: input.companyId,
      userId: input.userId,
      itemId: caseLine.id,
      movementType: "ISSUE",
      quantity: quantity(input.cases),
      unit: caseLine.unit,
      notes,
      sourceType: "RETAIL_STOCK_ADJUSTMENT",
      sourceId: input.caseProductId,
    });
    const into = await recordStockMovement({
      tx,
      companyId: input.companyId,
      userId: input.userId,
      itemId: singleLine.id,
      movementType: "RECEIPT",
      quantity: quantity(singles),
      unit: singleLine.unit,
      ...(singleCost ? { unitCost: singleCost } : {}),
      notes,
      sourceType: "RETAIL_STOCK_ADJUSTMENT",
      sourceId: input.caseProductId,
    });
    return {
      cases: input.cases,
      singles,
      caseStock: toNumberOrZero(out.nextStock),
      singleStock: toNumberOrZero(into.nextStock),
    };
  });
}
