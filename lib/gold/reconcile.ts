import type { Prisma, PrismaClient } from "@prisma/client";
import { toGramsOrZero, toUsd } from "@/lib/gold/decimal-utils";

type Db = PrismaClient | Prisma.TransactionClient;

export type VarianceReport = {
  scope: "company" | "site" | "leader" | "buyer";
  scopeId: string;
  periodStart: Date;
  periodEnd: Date;
  bookGrams: number;
  systemGrams: number;
  diffGrams: number;
  bookUsd: number | null;
  systemUsd: number | null;
  diffUsd: number | null;
};

export type RollForwardRow = {
  scope: "site" | "leader" | "buyer" | "employee";
  scopeId: string;
  scopeName: string;
  openingGrams: number;
  inGrams: number;
  outGrams: number;
  closingGrams: number;
};

/**
 * Variance: book (from import ledger entries) vs system (from posted GoldInventoryEvents).
 *
 * bookGrams = sum of gramsTotal from COMMITTED import ledger entries in the period.
 * systemGrams = sum IN - sum OUT from GoldInventoryEvent in the same period.
 * diffGrams = bookGrams - systemGrams (positive = book shows more than system recorded).
 */
export async function computeVariance(
  db: Db,
  args: {
    companyId: string;
    importId?: string;
    siteId?: string;
    periodStart: Date;
    periodEnd: Date;
  },
): Promise<VarianceReport[]> {
  const entryWhere: Prisma.GoldLedgerEntryWhereInput = {
    companyId: args.companyId,
    status: "CREATED",
    parsedDate: { gte: args.periodStart, lt: args.periodEnd },
    gramsTotal: { not: null },
  };
  if (args.importId) entryWhere.importId = args.importId;

  const eventWhere: Prisma.GoldInventoryEventWhereInput = {
    companyId: args.companyId,
    eventDate: { gte: args.periodStart, lt: args.periodEnd },
  };
  if (args.siteId) {
    eventWhere.siteId = args.siteId;
    entryWhere.import = { siteId: args.siteId };
  }

  const [bookAgg, eventAgg] = await Promise.all([
    (db as PrismaClient).goldLedgerEntry.aggregate({
      where: entryWhere,
      _sum: { gramsTotal: true, balGrams: true },
    }),
    (db as PrismaClient).goldInventoryEvent.groupBy({
      by: ["direction"],
      where: eventWhere,
      _sum: { grams: true, valueUsd: true },
    }),
  ]);

  const bookGrams = toGramsOrZero(bookAgg._sum.gramsTotal);
  const bookUsd = bookAgg._sum.balGrams != null ? null : null; // balGrams is sale-side, not USD

  let sysIn = 0;
  let sysOut = 0;
  let sysInUsd: number | null = null;
  let sysOutUsd: number | null = null;
  for (const row of eventAgg) {
    const g = toGramsOrZero(row._sum.grams);
    const u = toUsd(row._sum.valueUsd);
    if (row.direction === "IN") {
      sysIn += g;
      sysInUsd = (sysInUsd ?? 0) + (u ?? 0);
    } else {
      sysOut += g;
      sysOutUsd = (sysOutUsd ?? 0) + (u ?? 0);
    }
  }
  const systemGrams = +(sysIn - sysOut).toFixed(4);
  const systemUsd = sysInUsd !== null || sysOutUsd !== null
    ? +((sysInUsd ?? 0) - (sysOutUsd ?? 0)).toFixed(2)
    : null;

  const scopeId = args.siteId ?? args.companyId;
  const scope: VarianceReport["scope"] = args.siteId ? "site" : "company";

  return [
    {
      scope,
      scopeId,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      bookGrams: +bookGrams.toFixed(4),
      systemGrams,
      diffGrams: +(bookGrams - systemGrams).toFixed(4),
      bookUsd,
      systemUsd,
      diffUsd: bookUsd !== null && systemUsd !== null
        ? +((bookUsd) - (systemUsd)).toFixed(2)
        : null,
    },
  ];
}

/**
 * On-hand roll-forward: opening + IN - OUT = closing for the period.
 * Uses GoldInventoryEvent as source of truth (append-only).
 *
 * Groups by siteId and maps scopeName from the Site record.
 */
export async function computeRollForward(
  db: Db,
  args: {
    companyId: string;
    siteId?: string;
    periodStart: Date;
    periodEnd: Date;
    groupBy: "site" | "leader" | "buyer" | "employee";
  },
): Promise<RollForwardRow[]> {
  // For site groupBy we aggregate via GoldInventoryEvent grouped by siteId.
  // Other groupBy modes require different source tables; site is the primary
  // supported mode for this phase (P2.2). Others return empty with a note.
  if (args.groupBy !== "site") {
    return [];
  }

  const baseWhere: Prisma.GoldInventoryEventWhereInput = { companyId: args.companyId };
  if (args.siteId) baseWhere.siteId = args.siteId;

  const [openingAgg, periodAgg, sites] = await Promise.all([
    (db as PrismaClient).goldInventoryEvent.groupBy({
      by: ["siteId", "direction"],
      where: { ...baseWhere, eventDate: { lt: args.periodStart } },
      _sum: { grams: true },
    }),
    (db as PrismaClient).goldInventoryEvent.groupBy({
      by: ["siteId", "direction"],
      where: { ...baseWhere, eventDate: { gte: args.periodStart, lt: args.periodEnd } },
      _sum: { grams: true },
    }),
    (db as PrismaClient).site.findMany({
      where: { companyId: args.companyId, ...(args.siteId ? { id: args.siteId } : {}) },
      select: { id: true, name: true },
    }),
  ]);

  const siteNames = new Map(sites.map((s) => [s.id, s.name]));

  type Bucket = { open: { in: number; out: number }; period: { in: number; out: number } };
  const tally = new Map<string, Bucket>();

  const ensureBucket = (siteId: string): Bucket => {
    if (!tally.has(siteId)) tally.set(siteId, { open: { in: 0, out: 0 }, period: { in: 0, out: 0 } });
    return tally.get(siteId)!;
  };

  for (const row of openingAgg) {
    const b = ensureBucket(row.siteId);
    const g = toGramsOrZero(row._sum.grams);
    if (row.direction === "IN") b.open.in += g;
    else b.open.out += g;
  }
  for (const row of periodAgg) {
    const b = ensureBucket(row.siteId);
    const g = toGramsOrZero(row._sum.grams);
    if (row.direction === "IN") b.period.in += g;
    else b.period.out += g;
  }

  const rows: RollForwardRow[] = [];
  for (const [siteId, b] of tally.entries()) {
    const openingGrams = +(b.open.in - b.open.out).toFixed(4);
    const inGrams = +b.period.in.toFixed(4);
    const outGrams = +b.period.out.toFixed(4);
    const closingGrams = +(openingGrams + inGrams - outGrams).toFixed(4);
    rows.push({
      scope: "site",
      scopeId: siteId,
      scopeName: siteNames.get(siteId) ?? siteId,
      openingGrams,
      inGrams,
      outGrams,
      closingGrams,
    });
  }

  return rows.sort((a, b) => a.scopeName.localeCompare(b.scopeName));
}

/**
 * Pours with no BuyerReceiptBatch (and no legacy BuyerReceipt) — awaiting sale.
 * Mirrors the FIFO candidate query in fifo-link.ts.
 */
export async function findUnsoldPours(
  db: Db,
  args: {
    companyId: string;
    siteId?: string;
    asOf?: Date;
  },
): Promise<Array<{
  pourId: string;
  pourBarId: string;
  siteId: string;
  pourDate: Date;
  grams: number;
  valueUsd: number | null;
}>> {
  const where: Prisma.GoldPourWhereInput = {
    companyId: args.companyId,
    receiptBatches: { none: {} },
    receipts: { none: {} },
    NOT: {
      dispatches: {
        some: {
          OR: [
            { buyerReceipts: { some: { goldPourId: null } } },
            { receiptDispatches: { some: {} } },
          ],
        },
      },
    },
  };
  if (args.siteId) where.siteId = args.siteId;
  if (args.asOf) where.pourDate = { lte: args.asOf };

  const pours = await (db as PrismaClient).goldPour.findMany({
    where,
    orderBy: { pourDate: "asc" },
    select: {
      id: true,
      pourBarId: true,
      siteId: true,
      pourDate: true,
      grossWeight: true,
      valueUsd: true,
    },
  });

  return pours.map((p) => ({
    pourId: p.id,
    pourBarId: p.pourBarId,
    siteId: p.siteId,
    pourDate: p.pourDate,
    grams: Number(p.grossWeight),
    valueUsd: toUsd(p.valueUsd),
  }));
}

/**
 * Pours that have no GoldDispatch yet — awaiting dispatch.
 */
export async function findUndispatchedPours(
  db: Db,
  args: {
    companyId: string;
    siteId?: string;
    asOf?: Date;
  },
): Promise<Array<{
  pourId: string;
  pourBarId: string;
  siteId: string;
  pourDate: Date;
  grams: number;
}>> {
  const where: Prisma.GoldPourWhereInput = {
    companyId: args.companyId,
    dispatches: { none: {} },
  };
  if (args.siteId) where.siteId = args.siteId;
  if (args.asOf) where.pourDate = { lte: args.asOf };

  const pours = await (db as PrismaClient).goldPour.findMany({
    where,
    orderBy: { pourDate: "asc" },
    select: {
      id: true,
      pourBarId: true,
      siteId: true,
      pourDate: true,
      grossWeight: true,
    },
  });

  return pours.map((p) => ({
    pourId: p.id,
    pourBarId: p.pourBarId,
    siteId: p.siteId,
    pourDate: p.pourDate,
    grams: Number(p.grossWeight),
  }));
}

/**
 * PENDING AccountingIntegrationEvent rows — the accounting backlog.
 */
export async function findAccountingBacklog(
  db: Db,
  args: {
    companyId: string;
    asOf?: Date;
  },
): Promise<Array<{
  id: string;
  sourceType: string;
  sourceId: string | null;
  createdAt: Date;
  failedAttempts: number;
}>> {
  const where: Prisma.AccountingIntegrationEventWhereInput = {
    companyId: args.companyId,
    status: "PENDING",
  };
  if (args.asOf) where.createdAt = { lte: args.asOf };

  const events = await (db as PrismaClient).accountingIntegrationEvent.findMany({
    where,
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      sourceType: true,
      sourceId: true,
      createdAt: true,
      attemptCount: true,
    },
  });

  return events.map((e) => ({
    id: e.id,
    sourceType: e.sourceType ?? "UNKNOWN",
    sourceId: e.sourceId,
    createdAt: e.createdAt,
    failedAttempts: e.attemptCount,
  }));
}
