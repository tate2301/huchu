import { Prisma } from "@prisma/client";

/**
 * Takings (50-floor decision 10): the one definition every floor page sums.
 *
 * A till's takings are every sale document it rang — sales, refunds and voids,
 * whatever their status — in the base currency. A voided sale stays in and
 * its VOID document, a negative row beside it, nets it to nothing; a refund
 * is negative and subtracts. Deposits (`depositAmount`) and vouchers sold are
 * never in `baseAmount`, so never in takings.
 *
 * Overview, a shift's record, End of day and Past days read this; nothing
 * else adds up a till.
 */

export type TakingsScope = {
  companyId: string;
  siteId?: string | null;
  /** `postedAt` in [from, to). */
  from?: Date;
  to?: Date;
  /** Instead of dates: the sales rung on these shifts. */
  shiftIds?: string[];
};

export function takingsWhere(scope: TakingsScope): Prisma.RetailSaleWhereInput {
  const where: Prisma.RetailSaleWhereInput = {
    companyId: scope.companyId,
    saleType: { in: ["SALE", "REFUND", "VOID"] },
  };
  if (scope.siteId) where.siteId = scope.siteId;
  if (scope.shiftIds) where.shiftId = { in: scope.shiftIds };
  if (scope.from || scope.to) {
    where.postedAt = { ...(scope.from ? { gte: scope.from } : {}), ...(scope.to ? { lt: scope.to } : {}) };
  }
  return where;
}

/** Σ `baseAmount`, exactly: a sale and its void come to 0.00. */
export function sumTakings(rows: ReadonlyArray<{ baseAmount: Prisma.Decimal.Value }>): Prisma.Decimal {
  return rows.reduce<Prisma.Decimal>((total, row) => total.plus(new Prisma.Decimal(row.baseAmount)), new Prisma.Decimal(0));
}
