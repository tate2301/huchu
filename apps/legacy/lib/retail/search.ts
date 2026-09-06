/**
 * Retail's arm of global search.
 *
 * One arm, and it is the till receipt. A customer comes back with a printed slip
 * and a complaint, and the number on that slip is the only handle anybody has on
 * the sale — so `saleNo` is what gets typed, and the customer name and the
 * promotion code are searched beside it because the slip is sometimes lost.
 *
 * Deliberately one arm only. `RetailCatalogItem` is the catalogue, which the CRM
 * arm already searches as `PRODUCT` — two groups for the same tin of paint would
 * be the shared catalogue's whole point undone. Registers, shifts and purchase
 * orders are configuration and registers rather than records anybody hunts for by
 * name; a till is chosen from a list of four, not searched.
 */
import type { Prisma } from "@corelithzw/db";

import {
  facts,
  SEARCH_PER_TYPE_LIMIT,
  wordMatches,
  type SearchResult,
} from "@corelithzw/module-records/search-result";

type Tx = Prisma.TransactionClient;

/** The retail record types global search can return. */
export const RETAIL_SEARCH_TYPES = ["RETAIL_SALE"] as const;

export type RetailSearchType = (typeof RETAIL_SEARCH_TYPES)[number];

/** Which feature each arm needs. */
export const RETAIL_SEARCH_FEATURES: Record<RetailSearchType, string> = {
  RETAIL_SALE: "retail.pos",
};

export async function searchRetail(
  db: Tx,
  input: {
    companyId: string;
    query: string;
    limitPerType?: number;
    /** The arms the caller is entitled to run. Anything absent is not searched. */
    types: readonly RetailSearchType[];
  },
): Promise<SearchResult[]> {
  const query = input.query.trim();
  if (query.length < 2) return [];

  const take = input.limitPerType ?? SEARCH_PER_TYPE_LIMIT;
  const contains = { contains: query, mode: "insensitive" as const };
  if (!new Set(input.types).has("RETAIL_SALE")) return [];

  const rows = await db.retailSale.findMany({
    where: {
      companyId: input.companyId,
      OR: [
        { saleNo: contains },
        { promotionCode: contains },
        { AND: wordMatches(query, ["customerName"]) },
        { AND: wordMatches(query, ["cashierName"]) },
      ],
    },
    select: {
      id: true,
      saleNo: true,
      customerName: true,
      cashierName: true,
      saleType: true,
      status: true,
      totalAmount: true,
      promotionCode: true,
      postedAt: true,
      createdAt: true,
      _count: { select: { lines: true } },
    },
    // Posted-at is null on a sale that never went through, so the fallback keeps
    // an abandoned cart in date order rather than at the bottom of the list.
    orderBy: [{ postedAt: "desc" }, { createdAt: "desc" }],
    take,
  });

  return rows.map((row) => {
    const when = (row.postedAt ?? row.createdAt).toISOString().slice(0, 10);
    return {
      type: "RETAIL_SALE" as const,
      id: row.id,
      reference: row.saleNo,
      title: row.saleNo,
      // Total and status on the row: a refund and the sale it reverses have
      // consecutive numbers and nothing else to tell them apart.
      subtitle: [row.customerName, `USD ${row.totalAmount.toFixed(2)}`, row.status]
        .filter(Boolean)
        .join(" · "),
      facts: facts([
        ["Sale", row.saleNo],
        ["Rung up", when],
        ["Customer", row.customerName],
        ["Served by", row.cashierName],
        ["Items", String(row._count.lines)],
        ["Total", `USD ${row.totalAmount.toFixed(2)}`],
        ["Promotion", row.promotionCode],
        // SALE / REFUND — the difference between a receipt and a credit note.
        ["Type", row.saleType],
        ["Status", row.status],
      ]),
      href: `/retail/sales?saleId=${row.id}`,
    };
  });
}
