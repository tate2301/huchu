import { z } from "zod";

import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { updateRetailCategory } from "@/lib/retail/categories";
import { restoreShelfListing } from "@/lib/retail/shelf-listing";

/**
 * The shop's bin: what was removed, and the way back.
 *
 * Nothing a shop removes is deleted. A product has sale lines pointing at it,
 * a promotion has receipts that name it, a category has products filed under
 * it; each goes in the bin instead — off every list and off the till — and
 * stays restorable by whoever may remove it in the first place.
 */

export const BIN_KINDS = ["product", "promotion", "category"] as const;
export type BinKind = (typeof BIN_KINDS)[number];

export type BinEntry = {
  kind: BinKind;
  id: string;
  name: string;
  detail: string | null;
  removedAt: string;
};

export async function listBin(companyId: string): Promise<BinEntry[]> {
  const [products, promotions, categories] = await Promise.all([
    prisma.product.findMany({
      where: { companyId, archivedAt: { not: null } },
      select: { id: true, name: true, code: true, standardPrice: true, archivedAt: true },
    }),
    prisma.retailPromotion.findMany({
      where: { companyId, archivedAt: { not: null } },
      select: { id: true, name: true, promoCode: true, archivedAt: true },
    }),
    prisma.retailCategory.findMany({
      where: { companyId, archivedAt: { not: null } },
      select: { id: true, name: true, archivedAt: true, _count: { select: { products: true } } },
    }),
  ]);

  const entries: BinEntry[] = [
    ...products.map((row) => ({
      kind: "product" as const,
      id: row.id,
      name: row.name,
      detail: `${row.code} · last priced ${toNumberOrZero(row.standardPrice).toFixed(2)}`,
      removedAt: row.archivedAt!.toISOString(),
    })),
    ...promotions.map((row) => ({
      kind: "promotion" as const,
      id: row.id,
      name: row.name,
      detail: row.promoCode,
      removedAt: row.archivedAt!.toISOString(),
    })),
    ...categories.map((row) => ({
      kind: "category" as const,
      id: row.id,
      name: row.name,
      detail: `${row._count.products} ${row._count.products === 1 ? "product" : "products"} filed under it`,
      removedAt: row.archivedAt!.toISOString(),
    })),
  ];
  return entries.sort((left, right) => right.removedAt.localeCompare(left.removedAt));
}

export const restoreInput = z.object({ kind: z.enum(BIN_KINDS), id: z.string().uuid() });

/** Take one thing back out of the bin. False when it is not this company's, or not in the bin. */
export async function restoreFromBin(companyId: string, input: z.infer<typeof restoreInput>): Promise<boolean> {
  switch (input.kind) {
    case "product":
      return restoreShelfListing({ companyId, productId: input.id });
    case "promotion": {
      // Back as inactive: whether it should run again, and when, is the owner's call.
      const result = await prisma.retailPromotion.updateMany({
        where: { id: input.id, companyId, archivedAt: { not: null } },
        data: { archivedAt: null, status: "INACTIVE" },
      });
      return result.count === 1;
    }
    case "category": {
      const found = await prisma.retailCategory.findFirst({
        where: { id: input.id, companyId, archivedAt: { not: null } },
        select: { id: true },
      });
      if (!found) return false;
      return (await updateRetailCategory(companyId, input.id, { archived: false })) !== null;
    }
  }
}
