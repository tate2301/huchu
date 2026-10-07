import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";

/** How long a cut stays struck through on the till. */
export const WAS_PRICE_DAYS = 60;

/**
 * "Was" on the till (PRD-03): for each product, the price before the last
 * change applied on the default list, when that change was a cut and came
 * within the last 60 days. The price history is the only source; nothing is
 * typed as a was-price any more.
 */
export async function wasPrices(
  companyId: string,
  current: ReadonlyMap<string, number>,
  now: Date = new Date(),
): Promise<Map<string, number>> {
  const was = new Map<string, number>();
  if (current.size === 0) return was;
  const list = await prisma.priceList.findFirst({
    where: { companyId, isDefault: true, archivedAt: null },
    select: { id: true },
  });
  if (!list) return was;
  const last = await prisma.productPriceChange.findMany({
    where: { companyId, priceListId: list.id, productId: { in: [...current.keys()] }, minQuantity: 1, appliedAt: { not: null } },
    orderBy: [{ productId: "asc" }, { appliedAt: "desc" }, { createdAt: "desc" }],
    distinct: ["productId"],
    select: { productId: true, fromPrice: true, appliedAt: true },
  });
  const since = now.getTime() - WAS_PRICE_DAYS * 86_400_000;
  for (const row of last) {
    if (!row.appliedAt || row.appliedAt.getTime() < since || row.fromPrice === null) continue;
    const from = toNumberOrZero(row.fromPrice);
    const price = current.get(row.productId);
    if (price !== undefined && from > price) was.set(row.productId, from);
  }
  return was;
}
