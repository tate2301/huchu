import { Prisma, type PrismaClient } from "@prisma/client";

/**
 * The figures beside Books' panel rows (design/core-modules, BooksInvoices):
 * only where the board draws one and a count is one indexed query.
 *
 * - Invoices: invoices sent and not yet paid.
 * - Bank: statement lines in an open reconciliation that match nothing yet.
 * - Takings: tills closed on a day that has not been closed and banked.
 *
 * Keyed by the row's address, as the shell's badges are. A zero is left out.
 */

type Db = Pick<PrismaClient, "salesInvoice" | "bankStatementLine" | "$queryRaw">;

export const BOOKS_COUNT_HREFS = {
  invoices: "/books/invoices",
  bank: "/books/bank",
  takings: "/retail/end-of-day",
} as const;

export type BooksCounts = { invoices: number; bank: number; takings: number };

/** The badges the panel draws: a figure per row, none for a zero. */
export function booksBadges(counts: BooksCounts): Record<string, string> {
  const badges: Record<string, string> = {};
  for (const key of Object.keys(BOOKS_COUNT_HREFS) as Array<keyof BooksCounts>) {
    if (counts[key] > 0) badges[BOOKS_COUNT_HREFS[key]] = String(counts[key]);
  }
  return badges;
}

export async function readBooksCounts(
  db: Db,
  companyId: string,
  { takings = true }: { takings?: boolean } = {},
): Promise<BooksCounts> {
  const [invoices, bank, unbanked] = await Promise.all([
    db.salesInvoice.count({ where: { companyId, status: "ISSUED" } }),
    db.bankStatementLine.count({ where: { matchedTransactionId: null, reconciliation: { companyId, status: "OPEN" } } }),
    takings
      ? db.$queryRaw<Array<{ count: number }>>(Prisma.sql`
          SELECT count(*)::int AS count
          FROM "RetailShift" s
          WHERE s."companyId" = ${companyId}
            AND s."status" = 'CLOSED'
            AND NOT EXISTS (
              SELECT 1 FROM "RetailDayClose" d
              WHERE d."companyId" = s."companyId"
                AND d."siteId" = s."siteId"
                AND d."businessDate" = ((s."openedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Harare')::date
            )`)
      : Promise.resolve([{ count: 0 }]),
  ]);
  return { invoices, bank, takings: unbanked[0]?.count ?? 0 };
}
