import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";

/**
 * Cases and singles at the till.
 *
 * A case is its own product holding a single (`Product.packOfId`, `packSize`;
 * see `lib/retail/stock/cases.ts`). The till's shelf says, for a single, which case
 * can be opened for it and how many of those are in this branch; and, for a
 * case, which single it holds. When a sale needs more singles than the shelf
 * has, the till offers to open enough cases where the line is: only a case
 * set to "Break cases at the till" (`Product.breakAtTill`).
 */

/** The case a single comes in, and how many of them this branch holds. */
export type OpenableCase = { productId: string; name: string; unitsPerCase: number; casesOnHand: number };
/** When the product is a case: the single it holds, and how many. */
export type CaseOf = { productId: string; name: string; unitsPerCase: number };

export type CaseLinks = Map<string, { openableCase: OpenableCase | null; caseOf: CaseOf | null }>;

export type CaseOpening = {
  /** Singles the sale needs that the shelf does not hold. */
  short: number;
  /** Cases to open to cover them. */
  casesToOpen: number;
  /** Singles put on the shelf by opening them. */
  singlesAdded: number;
};

/**
 * How many cases to open so a sale of `wanted` singles can go through. Null
 * when the singles on hand already cover it, or when there are not enough cases.
 */
export function caseOpening(input: {
  wanted: number;
  singlesOnHand: number;
  casesOnHand: number;
  unitsPerCase: number;
}): CaseOpening | null {
  const { wanted, singlesOnHand, casesOnHand, unitsPerCase } = input;
  const short = wanted - Math.max(0, singlesOnHand);
  if (short <= 0 || unitsPerCase <= 0) return null;
  const casesToOpen = Math.ceil(short / unitsPerCase);
  if (casesToOpen > casesOnHand) return null;
  return { short, casesToOpen, singlesAdded: casesToOpen * unitsPerCase };
}

/** The case to open for a single: the smallest live one linked to it that breaks at the till. */
export function caseForSingle(companyId: string, singleProductId: string) {
  return prisma.product.findFirst({
    where: { companyId, packOfId: singleProductId, packSize: { gt: 0 }, breakAtTill: true, isActive: true, archivedAt: null },
    orderBy: [{ packSize: "asc" }, { name: "asc" }],
    select: { id: true, name: true, packSize: true },
  });
}

/**
 * For each product on the till's shelf: the case it can be opened from (with
 * the cases this branch holds), and, when it is a case, the single it holds.
 */
export async function tillCaseLinks(
  companyId: string,
  siteId: string,
  productIds: readonly string[],
): Promise<CaseLinks> {
  const links: CaseLinks = new Map();
  if (productIds.length === 0) return links;

  const products = await prisma.product.findMany({
    where: { companyId, id: { in: [...productIds] } },
    select: {
      id: true,
      packSize: true,
      packOf: { select: { id: true, name: true, archivedAt: true } },
      packs: {
        where: { packSize: { gt: 0 }, breakAtTill: true, isActive: true, archivedAt: null },
        orderBy: [{ packSize: "asc" }, { name: "asc" }],
        take: 1,
        select: { id: true, name: true, packSize: true },
      },
    },
  });

  const caseIds = products.flatMap((product) => product.packs.map((pack) => pack.id));
  const caseStock = new Map<string, number>();
  if (caseIds.length > 0) {
    const rows = await prisma.inventoryItem.findMany({
      where: { siteId, site: { companyId }, productId: { in: caseIds } },
      select: { productId: true, currentStock: true },
    });
    for (const row of rows) {
      if (row.productId) caseStock.set(row.productId, (caseStock.get(row.productId) ?? 0) + toNumberOrZero(row.currentStock));
    }
  }

  for (const product of products) {
    const pack = product.packs[0];
    links.set(product.id, {
      openableCase: pack
        ? { productId: pack.id, name: pack.name, unitsPerCase: pack.packSize ?? 0, casesOnHand: caseStock.get(pack.id) ?? 0 }
        : null,
      caseOf:
        product.packOf && !product.packOf.archivedAt && product.packSize
          ? { productId: product.packOf.id, name: product.packOf.name, unitsPerCase: product.packSize }
          : null,
    });
  }
  return links;
}
