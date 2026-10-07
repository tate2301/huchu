import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import type { SoldLine } from "@/lib/retail/products/figures";

/**
 * A product's posted sale and refund lines since a moment, as the record's
 * figures read them (`saleFigures`): a refund's line is stored negative, so
 * adding them up nets it off. A voided sale is not posted and a VOID document
 * is neither, so neither counts.
 */
export async function loadSoldLines(companyId: string, productId: string, since: Date): Promise<SoldLine[]> {
  const rows = await prisma.retailSaleLine.findMany({
    where: {
      companyId,
      productId,
      sale: { companyId, status: "POSTED", saleType: { in: ["SALE", "REFUND"] }, postedAt: { gte: since } },
    },
    select: {
      quantity: true,
      lineTotal: true,
      sale: { select: { postedAt: true, saleType: true, register: { select: { name: true } } } },
    },
  });
  return rows.map((row) => ({
    at: row.sale.postedAt!,
    quantity: toNumberOrZero(row.quantity),
    total: toNumberOrZero(row.lineTotal),
    refund: row.sale.saleType === "REFUND",
    till: row.sale.register?.name ?? null,
  }));
}
