/**
 * The empties ledger: bottles brought back at the till, per supplier.
 *
 * A bottle store sends its empties back to the brewery that filled them and
 * gets the deposit back, so the bottles a customer swaps at the counter are
 * owed to a supplier. They are written with the sale, in its transaction, by
 * the product's supplier; a line whose product has no supplier writes
 * nothing. A void writes the same bottles negative.
 */

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

/** Bottles back per supplier on one sale, as the Paid screen says them. */
export type SaleEmpties = Array<{ supplierId: string; supplierName: string; quantity: number }>;

/**
 * Write a sale's empties back. `emptiesBack` is what counted against the line
 * (whole bottles, at most what it sold, on a returnable product at a shop
 * that takes deposits).
 */
export async function recordSaleEmpties(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    siteId: string;
    saleId: string;
    lines: ReadonlyArray<{ productId?: string | null; emptiesBack?: number }>;
  },
): Promise<void> {
  const back = input.lines.filter(
    (line): line is { productId: string; emptiesBack: number } => Boolean(line.productId) && (line.emptiesBack ?? 0) > 0,
  );
  if (back.length === 0) return;
  const products = await tx.product.findMany({
    where: { companyId: input.companyId, id: { in: [...new Set(back.map((line) => line.productId))] }, supplierId: { not: null } },
    select: { id: true, supplierId: true, depositAmount: true },
  });
  const byId = new Map(products.map((product) => [product.id, product]));
  const data = back.flatMap((line) => {
    const product = byId.get(line.productId);
    if (!product?.supplierId) return [];
    return [
      {
        companyId: input.companyId,
        siteId: input.siteId,
        supplierId: product.supplierId,
        saleId: input.saleId,
        productId: product.id,
        quantity: line.emptiesBack,
        depositAmount: product.depositAmount ?? 0,
      },
    ];
  });
  if (data.length > 0) await tx.retailEmptiesEntry.createMany({ data });
}

/** A void takes back the empties its sale wrote: the same bottles, negative, on the void. */
export async function reverseSaleEmpties(
  tx: Prisma.TransactionClient,
  input: { companyId: string; sourceSaleId: string; saleId: string },
): Promise<void> {
  const entries = await tx.retailEmptiesEntry.findMany({
    where: { companyId: input.companyId, saleId: input.sourceSaleId },
    select: { siteId: true, supplierId: true, productId: true, quantity: true, depositAmount: true },
  });
  if (entries.length === 0) return;
  await tx.retailEmptiesEntry.createMany({
    data: entries.map((entry) => ({
      ...entry,
      companyId: input.companyId,
      saleId: input.saleId,
      quantity: -entry.quantity,
    })),
  });
}

/** The bottles a sale took back, per supplier, by supplier name. Empty when none came back. */
export async function saleEmpties(db: Db, companyId: string, saleId: string): Promise<SaleEmpties> {
  const entries = await db.retailEmptiesEntry.findMany({
    where: { companyId, saleId },
    select: { supplierId: true, quantity: true, supplier: { select: { name: true } } },
  });
  const bySupplier = new Map<string, SaleEmpties[number]>();
  for (const entry of entries) {
    const row = bySupplier.get(entry.supplierId) ?? { supplierId: entry.supplierId, supplierName: entry.supplier.name, quantity: 0 };
    row.quantity += entry.quantity;
    bySupplier.set(entry.supplierId, row);
  }
  return [...bySupplier.values()].sort((a, b) => a.supplierName.localeCompare(b.supplierName));
}
