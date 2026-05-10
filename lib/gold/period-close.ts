import type { PrismaClient, Prisma } from "@prisma/client"

export class PeriodClosedError extends Error {
  constructor(
    public readonly businessDate: Date,
    public readonly periodCloseId: string,
  ) {
    super(
      `Cannot post to closed period (date=${businessDate.toISOString().slice(0, 10)}, periodCloseId=${periodCloseId})`,
    )
    this.name = "PeriodClosedError"
  }
}

/**
 * Throws PeriodClosedError if the given businessDate falls inside a closed,
 * non-overridden period for the company+site.
 *
 * A null siteId on the period close record means company-wide.
 * A null siteId in args means "no specific site" — matches company-wide closes only.
 */
export async function assertPeriodOpen(
  db: PrismaClient | Prisma.TransactionClient,
  args: { companyId: string; siteId: string | null; businessDate: Date },
): Promise<void> {
  const closed = await (db as PrismaClient).goldPeriodClose.findFirst({
    where: {
      companyId: args.companyId,
      OR: [{ siteId: args.siteId }, { siteId: null }],
      periodStart: { lte: args.businessDate },
      periodEnd: { gt: args.businessDate },
      overrideAt: null,
    },
  })
  if (closed) {
    throw new PeriodClosedError(args.businessDate, closed.id)
  }
}
